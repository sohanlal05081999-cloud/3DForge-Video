// 3DForge Backend API with Razorpay (Indian Payments)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const crypto = require('crypto'); // For webhook verification
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// AI Service Integrations
const { LumaAI } = require('lumaai');

// Initialize Express App
const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', apiLimiter);

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/3dforge', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Database Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    subscriptionType: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
    razorpayCustomerId: String,
    credits: { type: Number, default: 3 }, // Free credits for new users
    totalVideosGenerated: { type: Number, default: 0 },
    storageUsed: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const videoSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    prompt: String,
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    generationId: String,
    videoUrl: String,
    duration: Number,
    resolution: String,
    style: String,
    creditsUsed: Number,
    createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    razorpayOrderId: { type: String, required: true },
    plan: { type: String, enum: ['basic', 'pro', 'enterprise'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
    creditsToAdd: Number,
    createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    razorpayPaymentId: String,
    razorpayOrderId: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    method: String, // card, upi, netbanking, wallet
    status: { type: String, enum: ['captured', 'failed'], default: 'captured' },
    createdAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Video = mongoose.model('Video', videoSchema);
const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// AI Service Initialization
const lumaClient = new LumaAI({
    authToken: process.env.LUMAAI_API_KEY
});

// Razorpay Initialization
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// ===== AUTHENTICATION ROUTES =====
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Create Razorpay customer
        const customer = await razorpay.customers.create({
            email: email,
            name: name,
            notes: { userId: email }
        });

        const user = new User({
            email,
            password: hashedPassword,
            name,
            razorpayCustomerId: customer.id
        });

        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                subscriptionType: user.subscriptionType,
                credits: user.credits
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                subscriptionType: user.subscriptionType,
                credits: user.credits
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== VIDEO GENERATION ROUTES =====
app.post('/api/generate/video', authenticateToken, upload.single('referenceImage'), async (req, res) => {
    try {
        const { prompt, duration = 10, resolution = '1080p', style = 'realistic' } = req.body;
        const userId = req.user._id;

        const creditsRequired = getCreditsRequired(duration, resolution);
        if (req.user.credits < creditsRequired) {
            return res.status(402).json({ 
                error: 'Insufficient credits', 
                required: creditsRequired, 
                available: req.user.credits 
            });
        }

        const video = new Video({
            userId,
            title: prompt.substring(0, 50) + '...',
            description: prompt,
            prompt,
            duration: parseInt(duration),
            resolution,
            style,
            creditsUsed: creditsRequired,
            status: 'pending'
        });

        await video.save();
        generateVideoWithAI(video, req.file?.path);

        await User.findByIdAndUpdate(userId, { 
            $inc: { credits: -creditsRequired }
        });

        res.status(201).json({
            message: 'Video generation started',
            videoId: video._id,
            creditsRemaining: req.user.credits - creditsRequired
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({ error: 'Failed to start video generation' });
    }
});

app.get('/api/videos', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        const videos = await Video.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const total = await Video.countDocuments({ userId });

        res.json({
            videos,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });

    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== RAZORPAY PAYMENT ROUTES =====
app.post('/api/payments/create-order', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        const user = req.user;

        const planDetails = {
            basic: { amount: 149900, credits: 15, description: 'Basic Plan - 15 Videos' }, // ₹1,499
            pro: { amount: 399900, credits: 50, description: 'Pro Plan - 50 Videos' },     // ₹3,999
            enterprise: { amount: 999900, credits: 999, description: 'Enterprise Plan' }   // ₹9,999
        };

        if (!planDetails[plan]) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        const { amount, credits, description } = planDetails[plan];

        // Create Razorpay Order
        const order = await razorpay.orders.create({
            amount: amount,
            currency: 'INR',
            receipt: `order_rcpt_${user._id}_${Date.now()}`,
            notes: {
                userId: user._id.toString(),
                plan: plan,
                credits: credits
            }
        });

        // Save order to database
        const orderRecord = new Order({
            userId: user._id,
            razorpayOrderId: order.id,
            plan: plan,
            amount: amount / 100,
            creditsToAdd: credits
        });
        await orderRecord.save();

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

app.post('/api/payments/verify-payment', authenticateToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.user._id;

        // Verify signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // Fetch payment details
        const payment = await razorpay.payments.fetch(razorpay_payment_id);

        // Fetch order details
        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, userId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update order status
        order.status = 'paid';
        await order.save();

        // Create payment record
        const paymentRecord = new Payment({
            userId: userId,
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            amount: payment.amount / 100,
            currency: payment.currency,
            method: payment.method
        });
        await paymentRecord.save();

        // Update user credits and plan
        const userUpdate = {
            $inc: { credits: order.creditsToAdd },
            subscriptionType: order.plan,
            updatedAt: new Date()
        };

        await User.findByIdAndUpdate(userId, userUpdate);

        res.json({
            success: true,
            message: 'Payment verified and credits added',
            creditsAdded: order.creditsToAdd,
            plan: order.plan
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// Razorpay Webhook Handler
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const body = req.body;

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).send('Invalid webhook signature');
        }

        const { event, payload } = body;

        if (event === 'payment.captured') {
            const payment = payload.payment;
            console.log('Payment captured:', payment.id);
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Webhook handling failed');
    }
});

// ===== UTILITY FUNCTIONS =====
async function generateVideoWithAI(videoRecord, referenceImagePath) {
    try {
        await Video.findByIdAndUpdate(videoRecord._id, { status: 'processing' });

        let generationConfig = {
            prompt: videoRecord.prompt,
            model: 'ray-2',
            duration: `${videoRecord.duration}s`,
            resolution: videoRecord.resolution
        };

        if (referenceImagePath) {
            const imageUrl = await uploadToCloudStorage(referenceImagePath);
            generationConfig.keyframes = {
                frame0: { type: 'image', url: imageUrl }
            };
        }

        const generation = await lumaClient.generations.create(generationConfig);
        await Video.findByIdAndUpdate(videoRecord._id, { generationId: generation.id });
        await pollVideoGeneration(videoRecord._id, generation.id);

    } catch (error) {
        console.error('Video generation error:', error);
        await Video.findByIdAndUpdate(videoRecord._id, { status: 'failed' });
    }
}

async function pollVideoGeneration(videoId, generationId) {
    // ... (same as before)
}

function getCreditsRequired(duration, resolution) {
    const baseCredits = 1;
    const durationMultiplier = duration / 10;
    const resolutionMultiplier = {
        '720': 1,
        '1080': 1.5,
        '1440': 2.5,
        '2160': 4
    };
    return Math.ceil(baseCredits * durationMultiplier * (resolutionMultiplier[resolution] || 1));
}

// Cloud Storage Functions
async function uploadToCloudStorage(filePath) {
    return `https://storage.example.com/${path.basename(filePath)}`;
}

// Error Handling
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`3DForge API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Razorpay Mode: ${process.env.NODE_ENV === 'production' ? 'Live' : 'Test'}`);
});

module.exports = app;
