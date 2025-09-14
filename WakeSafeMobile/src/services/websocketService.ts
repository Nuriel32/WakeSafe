import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';

export interface FatigueAlert {
  sessionId: string;
  fatigueLevel: 'alert' | 'drowsy' | 'sleeping' | 'unknown';
  confidence: number;
  photoId?: string;
  aiResults?: any;
  timestamp: number;
  alert: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    actionRequired: boolean;
  };
}

export interface PhotoCaptureEvent {
  sequenceNumber: number;
  timestamp: number;
  sessionId: string;
}

export interface SessionUpdate {
  sessionId: string;
  status: 'active' | 'ended';
  timestamp: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connectionPromise: Promise<boolean> | null = null;

  // Event handlers
  private onFatigueAlert?: (alert: FatigueAlert) => void;
  private onPhotoCaptureConfirmed?: (event: PhotoCaptureEvent) => void;
  private onSessionUpdate?: (update: SessionUpdate) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private onError?: (error: string) => void;
  private onUploadNotification?: (data: any) => void;
  private onUploadProgress?: (data: any) => void;
  private onUploadCompleted?: (data: any) => void;
  private onUploadFailed?: (data: any) => void;
  private onAIProcessingComplete?: (data: any) => void;

  connect(token: string): Promise<boolean> {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to WebSocket server...');
        console.log('WebSocket URL:', CONFIG.WS_URL);
        console.log('Token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'NO TOKEN');
        
        // Disconnect existing connection if any
        if (this.socket) {
          this.socket.disconnect();
        }
        
        this.socket = io(CONFIG.WS_URL, {
          auth: { token },
          query: { token },
          extraHeaders: { Authorization: `Bearer ${token}` },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
          forceNew: true,
          upgrade: true,
          rememberUpgrade: false
        });

        // Connection successful
        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected successfully!');
          console.log('Socket ID:', this.socket?.id);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
          resolve(true);
        });

        // Connection failed
        this.socket.on('connect_error', (error) => {
          console.error('❌ WebSocket connection error:', error);
          console.error('Error details:', {
            message: error.message,
            description: error.description,
            context: error.context,
            type: error.type,
            stack: error.stack
          });
          console.error('Connection URL:', CONFIG.WS_URL);
          console.error('Token available:', !!token);
          this.isConnected = false;
          this.onConnectionChange?.(false);
          this.onError?.(`Connection failed: ${error.message}`);
          this.connectionPromise = null;
          reject(error);
        });

        // Disconnected
        this.socket.on('disconnect', (reason) => {
          console.log('👋 WebSocket disconnected:', reason);
          this.isConnected = false;
          this.onConnectionChange?.(false);
        });

        // Reconnected
        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
        });

        // Reconnect attempt
        this.socket.on('reconnect_attempt', (attemptNumber) => {
          console.log(`🔄 WebSocket reconnect attempt ${attemptNumber}`);
          this.reconnectAttempts = attemptNumber;
        });

        // Reconnect failed
        this.socket.on('reconnect_failed', () => {
          console.error('❌ WebSocket reconnection failed');
          this.isConnected = false;
          this.onConnectionChange?.(false);
          this.onError?.('Failed to reconnect to server');
        });

        // Server welcome message
        this.socket.on('connected', (data) => {
          console.log('🎉 Server welcome message:', data);
        });

        // ---- Event Handlers ----
        
        // Fatigue detection
        this.socket.on('fatigue_detection', (data: FatigueAlert) => {
          console.log('🚨 Received fatigue detection:', data);
          this.onFatigueAlert?.(data);
        });

        // Photo capture confirmation
        this.socket.on('photo_capture_confirmed', (data: PhotoCaptureEvent) => {
          console.log('📷 Photo capture confirmed:', data);
          this.onPhotoCaptureConfirmed?.(data);
        });

        // Session updates
        this.socket.on('session_update', (data: SessionUpdate) => {
          console.log('📊 Session update received:', data);
          this.onSessionUpdate?.(data);
        });

        // Session started
        this.socket.on('session_started', (data) => {
          console.log('🚀 Session started:', data);
        });

        // Session ended
        this.socket.on('session_ended', (data) => {
          console.log('🛑 Session ended:', data);
        });

        // Continuous capture started
        this.socket.on('continuous_capture_started', (data) => {
          console.log('📸 Continuous capture started:', data);
        });

        // Continuous capture stopped
        this.socket.on('continuous_capture_stopped', (data) => {
          console.log('⏹️ Continuous capture stopped:', data);
        });

        // AI processing complete
        this.socket.on('ai_processing_complete', (data) => {
          console.log('🤖 AI processing complete:', data);
          this.onAIProcessingComplete?.(data);
        });

        // Upload notifications
        this.socket.on('upload_notification', (data) => {
          console.log('📤 Upload notification:', data);
          this.onUploadNotification?.(data);
        });

        this.socket.on('upload_progress', (data) => {
          console.log('📊 Upload progress:', data);
          this.onUploadProgress?.(data);
        });

        this.socket.on('upload_completed', (data) => {
          console.log('✅ Upload completed:', data);
          this.onUploadCompleted?.(data);
        });

        this.socket.on('upload_failed', (data) => {
          console.log('❌ Upload failed:', data);
          this.onUploadFailed?.(data);
        });

        // Ping/Pong
        this.socket.on('pong', (data) => {
          console.log('🏓 Pong received:', data);
        });

        // Notifications
        this.socket.on('notification', (data) => {
          console.log('📢 Notification received:', data);
        });

      } catch (error) {
        console.error('💥 Error connecting to WebSocket:', error);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    if (this.socket) {
      console.log('👋 Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.connectionPromise = null;
      this.onConnectionChange?.(false);
    }
  }

  // ---- Event Emission Methods ----
  
  emitContinuousCaptureStart(sessionId: string): void {
    if (this.socket && this.isConnected) {
      console.log('📸 Emitting continuous_capture_start for session:', sessionId);
      this.socket.emit('continuous_capture_start', { sessionId });
    } else {
      console.warn('⚠️ Cannot emit continuous_capture_start - not connected');
    }
  }

  emitContinuousCaptureStop(sessionId: string): void {
    if (this.socket && this.isConnected) {
      console.log('⏹️ Emitting continuous_capture_stop for session:', sessionId);
      this.socket.emit('continuous_capture_stop', { sessionId });
    } else {
      console.warn('⚠️ Cannot emit continuous_capture_stop - not connected');
    }
  }

  emitPhotoCaptured(data: { sequenceNumber: number; timestamp: number; sessionId: string }): void {
    if (this.socket && this.isConnected) {
      console.log('📷 Emitting photo_captured:', data);
      this.socket.emit('photo_captured', data);
    } else {
      console.warn('⚠️ Cannot emit photo_captured - not connected');
    }
  }

  emitSessionStart(sessionId: string): void {
    if (this.socket && this.isConnected) {
      console.log('🚀 Emitting session_start for session:', sessionId);
      this.socket.emit('session_start', { sessionId });
    } else {
      console.warn('⚠️ Cannot emit session_start - not connected');
    }
  }

  emitSessionEnd(sessionId: string): void {
    if (this.socket && this.isConnected) {
      console.log('🛑 Emitting session_end for session:', sessionId);
      this.socket.emit('session_end', { sessionId });
    } else {
      console.warn('⚠️ Cannot emit session_end - not connected');
    }
  }

  emitLocationUpdate(location: any): void {
    if (this.socket && this.isConnected) {
      console.log('📍 Emitting location_update:', location);
      this.socket.emit('location_update', { location });
    } else {
      console.warn('⚠️ Cannot emit location_update - not connected');
    }
  }

  emitPing(): void {
    if (this.socket && this.isConnected) {
      console.log('🏓 Emitting ping');
      this.socket.emit('ping');
    } else {
      console.warn('⚠️ Cannot emit ping - not connected');
    }
  }

  // ---- Event Listener Setters ----
  
  setOnFatigueAlert(handler: (alert: FatigueAlert) => void): void {
    this.onFatigueAlert = handler;
  }

  setOnPhotoCaptureConfirmed(handler: (event: PhotoCaptureEvent) => void): void {
    this.onPhotoCaptureConfirmed = handler;
  }

  setOnSessionUpdate(handler: (update: SessionUpdate) => void): void {
    this.onSessionUpdate = handler;
  }

  setOnConnectionChange(handler: (connected: boolean) => void): void {
    this.onConnectionChange = handler;
  }

  setOnError(handler: (error: string) => void): void {
    this.onError = handler;
  }

  setOnUploadNotification(handler: (data: any) => void): void {
    this.onUploadNotification = handler;
  }

  setOnUploadProgress(handler: (data: any) => void): void {
    this.onUploadProgress = handler;
  }

  setOnUploadCompleted(handler: (data: any) => void): void {
    this.onUploadCompleted = handler;
  }

  setOnUploadFailed(handler: (data: any) => void): void {
    this.onUploadFailed = handler;
  }

  setOnAIProcessingComplete(handler: (data: any) => void): void {
    this.onAIProcessingComplete = handler;
  }

  // ---- Getters ----
  
  get connected(): boolean {
    return this.isConnected;
  }

  get socketId(): string | undefined {
    return this.socket?.id;
  }
}

export const websocketService = new WebSocketService();