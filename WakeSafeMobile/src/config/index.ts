// Configuration for WakeSafe Mobile App
export const CONFIG = {
  // API Configuration
  // Force production server for now to test Cloud Run deployment
  API_BASE_URL: 'https://wakesafe-api-227831302277.us-central1.run.app/api',
  WS_URL: 'https://wakesafe-api-227831302277.us-central1.run.app',
  
  // Storage Keys
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

export default CONFIG;
