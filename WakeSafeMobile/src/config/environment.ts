// Environment configuration for WakeSafe Mobile App
// This file helps manage different environments (local, staging, production)

export type Environment = 'development' | 'local' | 'staging' | 'production';

export interface EnvironmentConfig {
  API_BASE_URL: string;
  WS_URL: string;
  DEBUG: boolean;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  NODE_ENV: string;
  MAX_FILE_SIZE: number;
  ALLOWED_FILE_TYPES: string[];
  MAX_FILES_PER_UPLOAD: number;
  WS_RECONNECT_INTERVAL: number;
  WS_MAX_RECONNECT_ATTEMPTS: number;
  NOTIFICATION_DURATION: number;
  SESSION_UPDATE_INTERVAL: number;
}

// Simple environment configuration without external dependencies
// For now, we'll use hardcoded values that can be easily switched

// Environment configurations
const environments: Record<Environment, EnvironmentConfig> = {
  development: {
    API_BASE_URL: 'https://wakesafe-api-227831302277.us-central1.run.app/api',
    WS_URL: 'https://wakesafe-api-227831302277.us-central1.run.app',
    DEBUG: true,
    LOG_LEVEL: 'debug',
    NODE_ENV: 'development',
    MAX_FILE_SIZE: 10485760,
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES_PER_UPLOAD: 10,
    WS_RECONNECT_INTERVAL: 5000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    NOTIFICATION_DURATION: 5000,
    SESSION_UPDATE_INTERVAL: 1000,
  },
  local: {
    API_BASE_URL: 'http://192.168.1.133:5000/api',
    WS_URL: 'http://192.168.1.133:5000',
    DEBUG: true,
    LOG_LEVEL: 'debug',
    NODE_ENV: 'development',
    MAX_FILE_SIZE: 10485760,
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES_PER_UPLOAD: 10,
    WS_RECONNECT_INTERVAL: 5000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    NOTIFICATION_DURATION: 5000,
    SESSION_UPDATE_INTERVAL: 1000,
  },
  staging: {
    API_BASE_URL: 'https://wakesafe-api-staging-227831302277.us-central1.run.app/api',
    WS_URL: 'https://wakesafe-api-staging-227831302277.us-central1.run.app',
    DEBUG: true,
    LOG_LEVEL: 'info',
    NODE_ENV: 'staging',
    MAX_FILE_SIZE: 10485760,
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES_PER_UPLOAD: 10,
    WS_RECONNECT_INTERVAL: 5000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    NOTIFICATION_DURATION: 5000,
    SESSION_UPDATE_INTERVAL: 1000,
  },
  production: {
    API_BASE_URL: 'https://wakesafe-api-227831302277.us-central1.run.app/api',
    WS_URL: 'https://wakesafe-api-227831302277.us-central1.run.app',
    DEBUG: false,
    LOG_LEVEL: 'error',
    NODE_ENV: 'production',
    MAX_FILE_SIZE: 10485760,
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES_PER_UPLOAD: 10,
    WS_RECONNECT_INTERVAL: 5000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    NOTIFICATION_DURATION: 5000,
    SESSION_UPDATE_INTERVAL: 1000,
  },
};

// Get current environment
export const getCurrentEnvironment = (): Environment => {
  if (__DEV__) {
    return 'development';
  }
  // You can add logic here to detect staging vs production
  // For now, default to production when not in development
  return 'production';
};

// Get environment configuration
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = getCurrentEnvironment();
  return environments[env];
};

// Helper to check if running locally
export const isLocalDevelopment = (): boolean => {
  return getCurrentEnvironment() === 'development';
};

// Helper to get API base URL
export const getApiBaseUrl = (): string => {
  return getEnvironmentConfig().API_BASE_URL;
};

// Helper to get WebSocket URL
export const getWebSocketUrl = (): string => {
  return getEnvironmentConfig().WS_URL;
};

export default getEnvironmentConfig;
