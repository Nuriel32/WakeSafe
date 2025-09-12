// Configuration for WakeSafe Mobile App
// Environment-based configuration for local development and production

import { getEnvironmentConfig, isLocalDevelopment } from './environment';

// Get current environment configuration
const envConfig = getEnvironmentConfig();

export const CONFIG = {
  // API Configuration
  // Automatically switches between local and production based on environment
  API_BASE_URL: envConfig.API_BASE_URL,
  WS_URL: envConfig.WS_URL,
  
  // Storage Keys
  TOKEN_KEY: 'wakesafe_token',
  USER_KEY: 'wakesafe_user',
  
  // Upload Configuration (from environment variables)
  MAX_FILE_SIZE: envConfig.MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES: envConfig.ALLOWED_FILE_TYPES,
  MAX_FILES_PER_UPLOAD: envConfig.MAX_FILES_PER_UPLOAD,
  
  // WebSocket Configuration (from environment variables)
  WS_RECONNECT_INTERVAL: envConfig.WS_RECONNECT_INTERVAL,
  WS_MAX_RECONNECT_ATTEMPTS: envConfig.WS_MAX_RECONNECT_ATTEMPTS,
  
  // UI Configuration (from environment variables)
  NOTIFICATION_DURATION: envConfig.NOTIFICATION_DURATION,
  SESSION_UPDATE_INTERVAL: envConfig.SESSION_UPDATE_INTERVAL,
  
  // Development Configuration (from environment variables)
  DEBUG: envConfig.DEBUG,
  LOG_LEVEL: envConfig.LOG_LEVEL,
  NODE_ENV: envConfig.NODE_ENV,
  
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
