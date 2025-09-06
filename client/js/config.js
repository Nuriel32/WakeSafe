// Configuration for WakeSafe Client
const CONFIG = {
    // API Configuration
    API_BASE_URL: 'http://localhost:8080/api',
    WS_URL: 'http://localhost:8080',
    
    // Authentication
    TOKEN_KEY: 'wakesafe_token',
    USER_KEY: 'wakesafe_user',
    
    // Upload Configuration
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES_PER_UPLOAD: 10,
    
    // WebSocket Configuration
    WS_RECONNECT_INTERVAL: 5000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    
    // UI Configuration
    NOTIFICATION_DURATION: 5000,
    SESSION_UPDATE_INTERVAL: 1000,
    
    // Validation Rules
    VALIDATION: {
        EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        PHONE_REGEX: /^05\d{8}$/,
        CAR_NUMBER_REGEX: /^\d{7,8}$/,
        PASSWORD_MIN_LENGTH: 6
    },
    
    // Error Messages
    ERRORS: {
        NETWORK: 'Network error. Please check your connection.',
        UNAUTHORIZED: 'Session expired. Please login again.',
        VALIDATION: 'Please check your input and try again.',
        UPLOAD: 'Upload failed. Please try again.',
        WEBSOCKET: 'Connection lost. Attempting to reconnect...',
        GENERIC: 'Something went wrong. Please try again.'
    },
    
    // Success Messages
    SUCCESS: {
        LOGIN: 'Welcome back!',
        REGISTER: 'Account created successfully!',
        LOGOUT: 'Logged out successfully',
        UPLOAD: 'Photos uploaded successfully!',
        SESSION_START: 'Session started successfully!',
        SESSION_END: 'Session ended successfully!'
    }
};

// Environment-specific configuration
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Development environment
    CONFIG.API_BASE_URL = 'http://localhost:8080/api';
    CONFIG.WS_URL = 'http://localhost:8080';
} else {
    // Production environment - update these URLs for your production server
    CONFIG.API_BASE_URL = 'https://your-domain.com/api';
    CONFIG.WS_URL = 'https://your-domain.com';
}

// Export for use in other modules
window.CONFIG = CONFIG;
