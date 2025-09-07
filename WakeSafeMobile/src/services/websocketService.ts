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

  // Event handlers
  private onFatigueAlert?: (alert: FatigueAlert) => void;
  private onPhotoCaptureConfirmed?: (event: PhotoCaptureEvent) => void;
  private onSessionUpdate?: (update: SessionUpdate) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private onError?: (error: string) => void;

  connect(token: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Connecting to WebSocket server...');
        
        this.socket = io(CONFIG.WS_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
        });

        this.socket.on('connect', () => {
          console.log('WebSocket connected successfully');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
          resolve(true);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
          this.isConnected = false;
          this.onConnectionChange?.(false);
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          this.isConnected = false;
          this.onConnectionChange?.(false);
          this.onError?.(`Connection failed: ${error.message}`);
          reject(error);
        });

        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
          console.log(`WebSocket reconnect attempt ${attemptNumber}`);
          this.reconnectAttempts = attemptNumber;
        });

        this.socket.on('reconnect_failed', () => {
          console.error('WebSocket reconnection failed');
          this.isConnected = false;
          this.onConnectionChange?.(false);
          this.onError?.('Failed to reconnect to server');
        });

        // Event handlers
        this.socket.on('fatigue_detection', (data: FatigueAlert) => {
          console.log('Received fatigue detection:', data);
          this.onFatigueAlert?.(data);
        });

        this.socket.on('photo_capture_confirmed', (data: PhotoCaptureEvent) => {
          console.log('Photo capture confirmed:', data);
          this.onPhotoCaptureConfirmed?.(data);
        });

        this.socket.on('session_update', (data: SessionUpdate) => {
          console.log('Session update received:', data);
          this.onSessionUpdate?.(data);
        });

        this.socket.on('continuous_capture_started', (data) => {
          console.log('Continuous capture started:', data);
        });

        this.socket.on('continuous_capture_stopped', (data) => {
          console.log('Continuous capture stopped:', data);
        });

        this.socket.on('ai_processing_complete', (data) => {
          console.log('AI processing complete:', data);
        });

      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.onConnectionChange?.(false);
    }
  }

  // Event emission methods
  emitContinuousCaptureStart(sessionId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('continuous_capture_start', { sessionId });
    }
  }

  emitContinuousCaptureStop(sessionId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('continuous_capture_stop', { sessionId });
    }
  }

  emitPhotoCaptured(data: { sequenceNumber: number; timestamp: number; sessionId: string }): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('photo_captured', data);
    }
  }

  emitSessionStart(sessionId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('session_start', { sessionId });
    }
  }

  emitSessionEnd(sessionId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('session_end', { sessionId });
    }
  }

  emitLocationUpdate(location: any): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('location_update', { location });
    }
  }

  // Event listener setters
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

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get socketId(): string | undefined {
    return this.socket?.id;
  }
}

export const websocketService = new WebSocketService();
