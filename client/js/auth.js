// Authentication Module
class AuthManager {
    constructor() {
        this.token = localStorage.getItem(CONFIG.TOKEN_KEY);
        this.user = JSON.parse(localStorage.getItem(CONFIG.USER_KEY) || 'null');
        this.isAuthenticated = !!this.token;
        
        this.initializeEventListeners();
        this.checkAuthStatus();
    }

    initializeEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form
        const registerForm = document.getElementById('registerFormElement');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Form switching
        const showRegister = document.getElementById('showRegister');
        const showLogin = document.getElementById('showLogin');
        
        if (showRegister) {
            showRegister.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }
        
        if (showLogin) {
            showLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        // User menu
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', () => {
                userDropdown.classList.toggle('hidden');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                    userDropdown.classList.add('hidden');
                }
            });
        }
    }

    checkAuthStatus() {
        if (this.isAuthenticated) {
            this.showApp();
            this.updateUserInfo();
        } else {
            this.showAuth();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const form = e.target;
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        // Validate input
        if (!this.validateEmail(email)) {
            this.showError('Please enter a valid email address');
            return;
        }

        if (!password) {
            this.showError('Please enter your password');
            return;
        }

        try {
            this.setFormLoading(form, true);
            
            const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.isAuthenticated = true;
                
                // Store token
                localStorage.setItem(CONFIG.TOKEN_KEY, this.token);
                
                // Get user info from token (decode JWT)
                this.user = this.decodeJWT(this.token);
                localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(this.user));
                
                this.showSuccess(CONFIG.SUCCESS.LOGIN);
                this.showApp();
                this.updateUserInfo();
                
                // Initialize WebSocket connection
                if (window.wsManager) {
                    window.wsManager.connect();
                }
            } else {
                this.showError(data.message || CONFIG.ERRORS.UNAUTHORIZED);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError(CONFIG.ERRORS.NETWORK);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = this.getFormData(form);

        // Validate input
        const validation = this.validateRegistrationData(formData);
        if (!validation.isValid) {
            this.showError(validation.message);
            return;
        }

        try {
            this.setFormLoading(form, true);
            
            const response = await fetch(`${CONFIG.API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.isAuthenticated = true;
                
                // Store token
                localStorage.setItem(CONFIG.TOKEN_KEY, this.token);
                
                // Get user info from token
                this.user = this.decodeJWT(this.token);
                localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(this.user));
                
                this.showSuccess(CONFIG.SUCCESS.REGISTER);
                this.showApp();
                this.updateUserInfo();
                
                // Initialize WebSocket connection
                if (window.wsManager) {
                    window.wsManager.connect();
                }
            } else {
                this.showError(data.message || CONFIG.ERRORS.VALIDATION);
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError(CONFIG.ERRORS.NETWORK);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    async handleLogout() {
        try {
            if (this.token) {
                await fetch(`${CONFIG.API_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local data regardless of API response
            this.clearAuthData();
            this.showSuccess(CONFIG.SUCCESS.LOGOUT);
            this.showAuth();
            
            // Disconnect WebSocket
            if (window.wsManager) {
                window.wsManager.disconnect();
            }
        }
    }

    clearAuthData() {
        this.token = null;
        this.user = null;
        this.isAuthenticated = false;
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
    }

    showAuth() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
    }

    showApp() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
    }

    showLoginForm() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('registerForm').classList.add('hidden');
    }

    showRegisterForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }

    updateUserInfo() {
        if (this.user) {
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = this.user.firstName || 'User';
            }
        }
    }

    getFormData(form) {
        const formData = {};
        const inputs = form.querySelectorAll('input');
        
        inputs.forEach(input => {
            if (input.type !== 'submit') {
                formData[input.id] = input.value.trim();
            }
        });
        
        return formData;
    }

    validateEmail(email) {
        return CONFIG.VALIDATION.EMAIL_REGEX.test(email);
    }

    validatePhone(phone) {
        return CONFIG.VALIDATION.PHONE_REGEX.test(phone);
    }

    validateCarNumber(carNumber) {
        return CONFIG.VALIDATION.CAR_NUMBER_REGEX.test(carNumber);
    }

    validatePassword(password) {
        return password.length >= CONFIG.VALIDATION.PASSWORD_MIN_LENGTH;
    }

    validateRegistrationData(data) {
        if (!data.firstName || !data.lastName) {
            return { isValid: false, message: 'First name and last name are required' };
        }

        if (!this.validateEmail(data.registerEmail)) {
            return { isValid: false, message: 'Please enter a valid email address' };
        }

        if (!this.validatePassword(data.registerPassword)) {
            return { isValid: false, message: `Password must be at least ${CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters long` };
        }

        if (!this.validatePhone(data.phone)) {
            return { isValid: false, message: 'Please enter a valid Israeli phone number (05XXXXXXXX)' };
        }

        if (!this.validateCarNumber(data.carNumber)) {
            return { isValid: false, message: 'Please enter a valid Israeli car number (7-8 digits)' };
        }

        return { isValid: true };
    }

    setFormLoading(form, loading) {
        if (loading) {
            form.classList.add('loading');
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
            }
        } else {
            form.classList.remove('loading');
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        }
    }

    decodeJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('JWT decode error:', error);
            return null;
        }
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <i class="${icon}"></i>
            <span>${message}</span>
        `;

        container.appendChild(notification);

        // Auto remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, CONFIG.NOTIFICATION_DURATION);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }
}

// Initialize authentication manager
window.authManager = new AuthManager();
