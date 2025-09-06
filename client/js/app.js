// Main Application Controller for WakeSafe Client
class WakeSafeApp {
    constructor() {
        this.isInitialized = false;
        this.initializationPromise = null;
        
        this.initialize();
    }

    async initialize() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.performInitialization();
        return this.initializationPromise;
    }

    async performInitialization() {
        try {
            console.log('🚀 Initializing WakeSafe Client...');
            
            // Show loading screen
            this.showLoadingScreen();
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Initialize core modules
            await this.initializeCoreModules();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Setup service worker (if available)
            this.setupServiceWorker();
            
            // Initialize UI
            this.initializeUI();
            
            // Check authentication status
            this.checkAuthentication();
            
            console.log('✅ WakeSafe Client initialized successfully');
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Failed to initialize WakeSafe Client:', error);
            this.handleInitializationError(error);
        }
    }

    async initializeCoreModules() {
        // Ensure all modules are loaded
        const modules = [
            'CONFIG',
            'authManager',
            'apiManager',
            'wsManager',
            'uploadManager',
            'dashboardManager'
        ];

        for (const module of modules) {
            if (!window[module]) {
                throw new Error(`Required module ${module} not found`);
            }
        }

        // Update API manager token
        if (window.authManager && window.apiManager) {
            window.apiManager.setToken(window.authManager.token);
        }

        console.log('✅ Core modules initialized');
    }

    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.handleError(event.error);
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleError(event.reason);
        });

        // Network error handling
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.handleNetworkChange(true);
        });

        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.handleNetworkChange(false);
        });
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }

    initializeUI() {
        // Setup responsive design
        this.setupResponsiveDesign();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Setup theme handling
        this.setupThemeHandling();
        
        console.log('✅ UI initialized');
    }

    setupResponsiveDesign() {
        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });

        // Initial resize check
        this.handleResize();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when not in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (event.key) {
                case 'Escape':
                    this.handleEscapeKey();
                    break;
                case 'F5':
                    event.preventDefault();
                    this.refreshData();
                    break;
                case 's':
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        this.toggleSession();
                    }
                    break;
            }
        });
    }

    setupThemeHandling() {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem('wakesafe_theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                if (!localStorage.getItem('wakesafe_theme')) {
                    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    checkAuthentication() {
        if (window.authManager) {
            if (window.authManager.isAuthenticated) {
                this.showApp();
                this.connectWebSocket();
            } else {
                this.showAuth();
            }
        }
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }

    showAuth() {
        this.hideLoadingScreen();
        const authContainer = document.getElementById('authContainer');
        const appContainer = document.getElementById('appContainer');
        
        if (authContainer) authContainer.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('hidden');
    }

    showApp() {
        this.hideLoadingScreen();
        const authContainer = document.getElementById('authContainer');
        const appContainer = document.getElementById('appContainer');
        
        if (authContainer) authContainer.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
    }

    connectWebSocket() {
        if (window.wsManager && window.authManager?.isAuthenticated) {
            window.wsManager.connect();
        }
    }

    handleError(error) {
        console.error('Application error:', error);
        
        // Show user-friendly error message
        if (window.authManager) {
            let message = 'An unexpected error occurred';
            
            if (error.message) {
                message = error.message;
            } else if (typeof error === 'string') {
                message = error;
            }
            
            window.authManager.showError(message);
        }
    }

    handleInitializationError(error) {
        console.error('Initialization error:', error);
        
        // Show error screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-exclamation-triangle" style="color: var(--danger-color);"></i>
                    <p>Failed to initialize application</p>
                    <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
                        <i class="fas fa-refresh"></i>
                        Retry
                    </button>
                </div>
            `;
        }
    }

    handleNetworkChange(isOnline) {
        if (window.authManager) {
            const message = isOnline ? 'Connection restored' : 'Connection lost';
            const type = isOnline ? 'success' : 'warning';
            window.authManager.showNotification(message, type);
        }

        // Reconnect WebSocket if online
        if (isOnline && window.wsManager) {
            window.wsManager.connect();
        }
    }

    handleResize() {
        // Update UI elements based on screen size
        const isMobile = window.innerWidth < 768;
        document.body.classList.toggle('mobile', isMobile);
        
        // Update dashboard layout
        if (window.dashboardManager) {
            // Trigger any responsive updates
            window.dashboardManager.handleResize?.();
        }
    }

    handleEscapeKey() {
        // Close any open modals or dropdowns
        const dropdowns = document.querySelectorAll('.dropdown:not(.hidden)');
        dropdowns.forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
    }

    async refreshData() {
        if (window.dashboardManager) {
            await window.dashboardManager.loadCurrentSession();
            await window.dashboardManager.loadUserProfile();
        }
        
        if (window.authManager) {
            window.authManager.showSuccess('Data refreshed');
        }
    }

    toggleSession() {
        if (window.dashboardManager) {
            const currentSession = window.dashboardManager.getCurrentSession();
            if (currentSession) {
                window.dashboardManager.endSession();
            } else {
                window.dashboardManager.startSession();
            }
        }
    }

    // Public API methods
    getVersion() {
        return '1.0.0';
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            authenticated: window.authManager?.isAuthenticated || false,
            websocketConnected: window.wsManager?.isConnected || false,
            currentSession: window.dashboardManager?.getCurrentSession() || null
        };
    }

    // Utility methods
    formatDate(date) {
        return new Date(date).toLocaleString();
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.wakeSafeApp = new WakeSafeApp();
});

// Make app available globally for debugging
window.WakeSafeApp = WakeSafeApp;
