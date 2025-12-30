// 3DForge Frontend Application
// Complete client-side application with authentication, video generation, and payments

class ThreeDForgeApp {
    constructor() {
        this.apiUrl = 'http://localhost:5000/api'; // Change to your backend URL in production
        this.user = null;
        this.token = localStorage.getItem('token');
        this.isGenerating = false;
        
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.initEventListeners();
        this.initHeroAnimations();
        this.init3DPreview();
        this.initParticleBackground();
        this.initScrollAnimations();
    }

    // ===== AUTHENTICATION =====
    checkAuthStatus() {
        if (this.token) {
            this.fetchUserProfile();
        }
    }

    async fetchUserProfile() {
        try {
            const response = await fetch(`${this.apiUrl}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.updateUIForLoggedInUser();
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('Failed to fetch user profile:', error);
            this.logout();
        }
    }

    updateUIForLoggedInUser() {
        const userSection = document.getElementById('user-section');
        if (userSection && this.user) {
            userSection.innerHTML = `
                <div class="flex items-center space-x-4">
                    <div class="credits-badge">
                        ${this.user.credits} Credits
                    </div>
                    <div class="relative">
                        <button id="user-menu-btn" class="flex items-center space-x-2 text-white hover:text-cyan-400 transition-colors">
                            <span>${this.user.name}</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                        <div id="user-menu" class="user-menu">
                            <a href="dashboard.html" class="block px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded">Dashboard</a>
                            <a href="my-videos.html" class="block px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded">My Videos</a>
                            <a href="billing.html" class="block px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded">Billing</a>
                            <button id="logout-btn" class="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded">Logout</button>
                        </div>
                    </div>
                </div>
            `;

            // Add user menu event listener
            document.getElementById('user-menu-btn')?.addEventListener('click', () => {
                document.getElementById('user-menu').classList.toggle('active');
            });

            document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
        }
    }

    initEventListeners() {
        // Auth modal
        document.getElementById('login-btn')?.addEventListener('click', () => this.showAuthModal('login'));
        document.getElementById('signup-btn')?.addEventListener('click', () => this.showAuthModal('signup'));
        document.getElementById('cta-signup')?.addEventListener('click', () => this.showAuthModal('signup'));
        document.getElementById('start-creating')?.addEventListener('click', () => this.showAuthModal('signup'));
        document.getElementById('close-auth-modal')?.addEventListener('click', () => this.hideAuthModal());
        document.getElementById('auth-switch')?.addEventListener('click', () => this.toggleAuthMode());
        document.getElementById('auth-form')?.addEventListener('submit', (e) => this.handleAuthSubmit(e));

        // Video generation
        document.getElementById('generate-btn')?.addEventListener('click', () => this.startGeneration());
        document.getElementById('prompt-input')?.addEventListener('input', (e) => this.updateCharCount(e));
        document.getElementById('image-upload')?.addEventListener('click', () => this.openImageUpload());
        document.getElementById('image-upload')?.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.getElementById('image-upload')?.addEventListener('drop', (e) => this.handleImageDrop(e));

        // Style presets
        document.querySelectorAll('.style-card').forEach(card => {
            card.addEventListener('click', () => this.selectStyle(card));
        });

        // Intensity slider
        document.getElementById('style-intensity')?.addEventListener('input', (e) => this.updateStyleIntensity(e));

        // Close modal on outside click
        document.getElementById('auth-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal') this.hideAuthModal();
        });

        // Close user menu on outside click
        document.addEventListener('click', (e) => {
            const userMenu = document.getElementById('user-menu');
            const userMenuBtn = document.getElementById('user-menu-btn');
            if (userMenu && !userMenu.contains(e.target) && !userMenuBtn?.contains(e.target)) {
                userMenu.classList.remove('active');
            }
        });
    }

    showAuthModal(mode = 'signup') {
        const modal = document.getElementById('auth-modal');
        const title = document.getElementById('auth-title');
        const submitBtn = document.getElementById('auth-submit');
        const switchText = document.getElementById('auth-switch-text');
        const switchBtn = document.getElementById('auth-switch');
        const nameField = document.getElementById('name-field');

        if (mode === 'login') {
            title.textContent = 'Login';
            submitBtn.textContent = 'Login';
            switchText.textContent = "Don't have an account?";
            switchBtn.textContent = 'Sign Up';
            nameField.style.display = 'none';
        } else {
            title.textContent = 'Sign Up';
            submitBtn.textContent = 'Sign Up';
            switchText.textContent = 'Already have an account?';
            switchBtn.textContent = 'Login';
            nameField.style.display = 'block';
        }

        this.authMode = mode;
        modal.classList.add('active');
    }

    hideAuthModal() {
        document.getElementById('auth-modal').classList.remove('active');
        this.clearAuthForm();
    }

    toggleAuthMode() {
        const newMode = this.authMode === 'login' ? 'signup' : 'login';
        this.showAuthModal(newMode);
    }

    clearAuthForm() {
        document.getElementById('auth-form').reset();
    }

    async handleAuthSubmit(e) {
        e.preventDefault();

        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;

        if (this.authMode === 'signup') {
            await this.register(email, password, name);
        } else {
            await this.login(email, password);
        }
    }

    async register(email, password, name) {
        try {
            const response = await fetch(`${this.apiUrl}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, name })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                this.hideAuthModal();
                this.updateUIForLoggedInUser();
                this.showNotification('Account created successfully!', 'success');
            } else {
                this.showNotification(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                this.hideAuthModal();
                this.updateUIForLoggedInUser();
                this.showNotification('Login successful!', 'success');
            } else {
                this.showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('token');
        
        // Reset UI
        const userSection = document.getElementById('user-section');
        userSection.innerHTML = `
            <button id="login-btn" class="text-white hover:text-cyan-400 transition-colors">Login</button>
            <button id="signup-btn" class="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all duration-300">
                Sign Up
            </button>
        `;
        
        // Re-attach event listeners
        document.getElementById('login-btn')?.addEventListener('click', () => this.showAuthModal('login'));
        document.getElementById('signup-btn')?.addEventListener('click', () => this.showAuthModal('signup'));
        
        this.showNotification('Logged out successfully', 'info');
    }

    // ===== VIDEO GENERATION =====
    async startGeneration() {
        if (!this.user) {
            this.showAuthModal('signup');
            return;
        }

        if (this.isGenerating) return;

        const promptInput = document.getElementById('prompt-input');
        const progressContainer = document.getElementById('progress-container');
        const generateBtn = document.getElementById('generate-btn');

        if (!promptInput || !promptInput.value.trim()) {
            this.showNotification('Please enter a description for your 3D video', 'error');
            return;
        }

        // Check credits
        const duration = parseInt(document.getElementById('duration-select').value);
        const resolution = document.getElementById('resolution-select').value;
        const creditsRequired = this.getCreditsRequired(duration, resolution);

        if (this.user.credits < creditsRequired) {
            this.showNotification(`Insufficient credits. You need ${creditsRequired} credits. Please upgrade your plan.`, 'error');
            return;
        }

        this.isGenerating = true;
        generateBtn.textContent = 'Generating...';
        generateBtn.disabled = true;
        progressContainer.style.display = 'block';

        try {
            const response = await fetch(`${this.apiUrl}/generate/video`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: promptInput.value,
                    duration: duration,
                    resolution: resolution,
                    style: document.querySelector('.style-card.active')?.dataset.style || 'realistic'
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.simulateGeneration();
                this.updateUserCredits();
            } else if (response.status === 402) {
                this.showNotification('Insufficient credits. Please upgrade your plan.', 'error');
                this.resetGenerationUI();
            } else {
                this.showNotification(data.error || 'Generation failed', 'error');
                this.resetGenerationUI();
            }
        } catch (error) {
            console.error('Generation error:', error);
            this.showNotification('Network error. Please try again.', 'error');
            this.resetGenerationUI();
        }
    }

    simulateGeneration() {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const generateBtn = document.getElementById('generate-btn');
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 100) progress = 100;
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    this.completeGeneration();
                }, 500);
            }
        }, 200);
    }

    completeGeneration() {
        const progressContainer = document.getElementById('progress-container');
        const generateBtn = document.getElementById('generate-btn');
        
        generateBtn.textContent = 'Generate 3D Video';
        generateBtn.disabled = false;
        progressContainer.style.display = 'none';
        
        this.isGenerating = false;
        this.showNotification('3D video generated successfully!', 'success');
        this.updatePreviewToComplete();
    }

    resetGenerationUI() {
        const progressContainer = document.getElementById('progress-container');
        const generateBtn = document.getElementById('generate-btn');
        
        generateBtn.textContent = 'Generate 3D Video';
        generateBtn.disabled = false;
        progressContainer.style.display = 'none';
        this.isGenerating = false;
    }

    async updateUserCredits() {
        if (this.user) {
            const response = await fetch(`${this.apiUrl}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.updateUIForLoggedInUser();
            }
        }
    }

    // ===== 3D PREVIEW =====
    init3DPreview() {
        const container = document.getElementById('three-container');
        if (!container) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        this.renderer.setSize(container.offsetWidth, container.offsetHeight);
        this.renderer.setClearColor(0x000000, 0.3);
        container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0x00d4ff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        this.createPlaceholderObject();
        this.animate();

        window.addEventListener('resize', () => this.handleResize());
    }

    createPlaceholderObject() {
        const geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00d4ff,
            emissive: 0x00d4ff,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        
        this.placeholderMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.placeholderMesh);
        
        this.camera.position.z = 5;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.placeholderMesh) {
            this.placeholderMesh.rotation.x += 0.01;
            this.placeholderMesh.rotation.y += 0.01;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        const container = document.getElementById('three-container');
        if (!container || !this.camera || !this.renderer) return;
        
        this.camera.aspect = container.offsetWidth / container.offsetHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.offsetWidth, container.offsetHeight);
    }

    updatePreviewToComplete() {
        if (this.placeholderMesh) {
            this.placeholderMesh.material.color.setHex(0x10b981);
            this.placeholderMesh.material.emissive.setHex(0x10b981);
            this.placeholderMesh.material.emissiveIntensity = 0.5;
            
            anime({
                targets: this.placeholderMesh.scale,
                x: [1, 1.2, 1],
                y: [1, 1.2, 1],
                z: [1, 1.2, 1],
                duration: 1000,
                easing: 'easeInOutQuad'
            });
        }
    }

    // ===== UI HELPERS =====
    updateCharCount(e) {
        const count = e.target.value.length;
        document.getElementById('char-count').textContent = `${count}/500`;
    }

    selectStyle(card) {
        document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.updatePreviewStyle(card.dataset.style);
    }

    updatePreviewStyle(style) {
        if (!this.placeholderMesh) return;
        
        const colors = {
            realistic: 0x00d4ff,
            cartoon: 0xffd700,
            cyberpunk: 0xff0080,
            steampunk: 0xff6b35,
            fantasy: 0x8b5cf6,
            abstract: 0x10b981
        };
        
        const color = colors[style] || 0x00d4ff;
        this.placeholderMesh.material.color.setHex(color);
        this.placeholderMesh.material.emissive.setHex(color);
    }

    updateStyleIntensity(e) {
        if (!this.placeholderMesh) return;
        const intensity = e.target.value / 10;
        this.placeholderMesh.material.emissiveIntensity = intensity * 0.5;
    }

    getCreditsRequired(duration, resolution) {
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

    // ===== FILE UPLOAD =====
    openImageUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => this.handleImageUpload(e);
        input.click();
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.processImageFile(file);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.style.borderColor = '#00d4ff';
    }

    handleImageDrop(event) {
        event.preventDefault();
        event.currentTarget.style.borderColor = '#6b7280';
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.processImageFile(files[0]);
        }
    }

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please upload a valid image file', 'error');
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            this.showNotification('Image file must be smaller than 10MB', 'error');
            return;
        }
        
        const imageUpload = document.getElementById('image-upload');
        if (imageUpload) {
            imageUpload.innerHTML = `
                <div class="text-center">
                    <svg class="w-8 h-8 text-green-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <p class="text-green-400 font-medium">${file.name}</p>
                    <p class="text-xs text-gray-500 mt-1">Image uploaded successfully</p>
                </div>
            `;
        }
        
        this.showNotification('Image uploaded successfully!', 'success');
    }

    // ===== ANIMATIONS =====
    initHeroAnimations() {
        if (document.getElementById('typed-text')) {
            new Typed('#typed-text', {
                strings: [
                    'Create 3D Videos',
                    'Generate Animations',
                    'Build 3D Worlds',
                    'Design Characters'
                ],
                typeSpeed: 80,
                backSpeed: 60,
                backDelay: 2000,
                loop: true,
                showCursor: true,
                cursorChar: '|'
            });
        }

        this.observeElements();
    }

    initParticleBackground() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;

        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: 2px;
                height: 2px;
                background: rgba(0, 212, 255, 0.6);
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: float ${3 + Math.random() * 4}s ease-in-out infinite;
                animation-delay: ${Math.random() * 2}s;
            `;
            particlesContainer.appendChild(particle);
        }
    }

    initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        document.querySelectorAll('.hover-lift, .floating-element').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    observeElements() {
        const elements = document.querySelectorAll('.floating-element');
        
        elements.forEach((el, index) => {
            anime({
                targets: el,
                translateY: [-20, 0, -20],
                duration: 3000 + (index * 200),
                loop: true,
                easing: 'easeInOutSine',
                delay: index * 200
            });
        });
    }

    // ===== NOTIFICATIONS =====
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-20 right-6 z-50 p-4 rounded-lg shadow-lg max-w-sm transform translate-x-full transition-transform duration-300`;
        
        const bgColor = type === 'success' ? 'bg-green-500' : 
                       type === 'error' ? 'bg-red-500' : 'bg-blue-500';
        
        notification.classList.add(bgColor);
        notification.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="text-white">
                    <p class="font-medium">${type === 'success' ? 'Success!' : type === 'error' ? 'Error!' : 'Info'}</p>
                    <p class="text-sm opacity-90">${message}</p>
                </div>
                <button class="text-white opacity-70 hover:opacity-100" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-20px) rotate(180deg); }
    }
`;
document.head.appendChild(style);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ThreeDForgeApp();
});