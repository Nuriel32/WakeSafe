// Type definitions for WakeSafe Mobile App

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  carNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  _id: string;
  userId: string;
  status: 'active' | 'ended' | 'paused';
  startTime: string;
  endTime?: string;
  duration?: number;
  totalImagesUploaded: number;
  photos: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  _id: string;
  sessionId: string;
  userId: string;
  gcsPath: string;
  name: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  };
  clientMeta?: {
    userAgent: string;
    timestamp: number;
    fileSize: number;
  };
  prediction: 'pending' | 'alert' | 'normal' | 'error';
  aiProcessingStatus: 'pending' | 'processing' | 'completed' | 'error';
  uploadStatus: 'pending' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface FatigueDetection {
  sessionId: string;
  fatigueLevel: number;
  confidence: number;
  timestamp: number;
}

export interface UploadProgress {
  photoId: string;
  progress: number;
  fileName: string;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface SessionState {
  currentSession: Session | null;
  sessionHistory: Session[];
  loading: boolean;
  error: string | null;
}

export interface UploadState {
  uploadQueue: UploadProgress[];
  activeUploads: Map<string, UploadProgress>;
  usePresignedUrls: boolean;
  loading: boolean;
  error: string | null;
}

export interface WebSocketState {
  isConnected: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  reconnectAttempts: number;
  lastError: string | null;
}

export interface AppState {
  auth: AuthState;
  session: SessionState;
  upload: UploadState;
  websocket: WebSocketState;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Upload: undefined;
  Gallery: undefined;
  Profile: undefined;
};

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  token: string;
  user: User;
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  photoId: string;
  gcsPath: string;
  fileName: string;
  expiresIn: number;
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: number;
}

export interface PhotoUploadEvent {
  type: 'photo_upload_start' | 'photo_upload_progress' | 'photo_upload_complete' | 'photo_upload_error';
  payload: {
    photoId: string;
    fileName: string;
    progress?: number;
    error?: string;
    gcsPath?: string;
    metadata?: any;
  };
}

export interface FatigueDetectionEvent {
  type: 'fatigue_detection';
  payload: FatigueDetection;
}

export interface SessionUpdateEvent {
  type: 'session_update';
  payload: {
    sessionId: string;
    status: string;
    duration?: number;
    photosCount?: number;
    timestamp: number;
  };
}

export interface AIProcessingEvent {
  type: 'ai_processing_complete';
  payload: {
    photoId: string;
    results: any;
    processingTime: number;
    timestamp: number;
  };
}

export interface NotificationEvent {
  type: 'notification';
  payload: {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
    timestamp: number;
  };
}
