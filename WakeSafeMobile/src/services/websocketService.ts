import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import { alertAudioService } from './alertAudioService';

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

export interface DriverFatigueAlertEvent {
  type: 'fatigue_alert';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  tripId: string;
  sessionId: string;
  timestamp: string;
  confidenceScore: number;
  fatigueLevel: number;
  source: string;
  recommendation?: string;
  metrics?: any;
  photoId?: string;
}

export interface FatigueSafeStopEvent {
  type: 'fatigue_safe_stop';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  tripId: string;
  sessionId: string;
  timestamp: string;
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  googleMapsUrl: string;
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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAckAt = 0;
  private seenEventIds = new Set<string>();
  private readonly seenEventIdsMax = 300;

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
  private onFatigueSafeStop?: (data: FatigueSafeStopEvent) => void;
  private onNotification?: (data: any) => void;

  private safeInvoke<T>(handler: ((payload: T) => void) | undefined, payload: T, label: string): void {
    if (!handler) return;
    try {
      handler(payload);
    } catch (error) {
      console.error(`WebSocket handler "${label}" failed:`, error);
    }
  }

  connect(token: string): Promise<boolean> {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to WebSocket server...');
        console.log('WebSocket URL:', CONFIG.WS_URL);
        
        // Disconnect existing connection if any
        if (this.socket) {
          this.socket.disconnect();
        }
        
        this.socket = io(CONFIG.WS_URL, {
          auth: { token },
          query: {},
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: 0,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 10000,
          randomizationFactor: 0.5,
          forceNew: false,
          upgrade: true,
          rememberUpgrade: false
        });

        // Connection successful
        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected successfully!');
          console.log('Socket ID:', this.socket?.id);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.safeInvoke(this.onConnectionChange, true, 'onConnectionChange');
          this.startHeartbeat();
          resolve(true);
        });

        // Connection failed
        this.socket.on('connect_error', (error) => {
          const socketError = error as Error & {
            description?: unknown;
            context?: unknown;
            type?: string;
          };
          console.error('❌ WebSocket connection error:', error);
          console.error('Error details:', {
            message: socketError.message,
            description: socketError.description,
            context: socketError.context,
            type: socketError.type,
            stack: socketError.stack
          });
          console.error('Connection URL:', CONFIG.WS_URL);
          console.error('Token available:', !!token);
          this.isConnected = false;
          this.safeInvoke(this.onConnectionChange, false, 'onConnectionChange');
          this.stopHeartbeat();
          this.safeInvoke(this.onError, `Connection failed: ${socketError.message}`, 'onError');
          this.connectionPromise = null;
          reject(error);
        });

        // Disconnected
        this.socket.on('disconnect', (reason) => {
          console.log('👋 WebSocket disconnected:', reason);
          this.isConnected = false;
          this.safeInvoke(this.onConnectionChange, false, 'onConnectionChange');
          this.stopHeartbeat();
        });

        // Reconnected
        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.safeInvoke(this.onConnectionChange, true, 'onConnectionChange');
          this.startHeartbeat();
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
          this.safeInvoke(this.onConnectionChange, false, 'onConnectionChange');
          this.safeInvoke(this.onError, 'Failed to reconnect to server', 'onError');
        });

        // Server welcome message
        this.socket.on('connected', (data) => {
          console.log('🎉 Server welcome message:', data);
        });

        // ---- Event Handlers ----
        
        // Fatigue detection
        this.socket.on('fatigue_detection', (data: FatigueAlert) => {
          console.log('🚨 Received fatigue detection:', data);
          this.safeInvoke(this.onFatigueAlert, data, 'onFatigueAlert');
        });

        // New dedicated fatigue alert event
        this.socket.on('driver_fatigue_alert', (data: DriverFatigueAlertEvent) => {
          if (this.isDuplicateEvent((data as any)?.eventId)) return;
          console.log('🚨 Received driver_fatigue_alert:', data);
          alertAudioService.playFatigueAlert().catch((error) => {
            console.warn('Failed to play fatigue alert sound:', error);
          });
          const normalized: FatigueAlert = {
            sessionId: data.sessionId,
            fatigueLevel: data.severity === 'critical' ? 'sleeping' : 'drowsy',
            confidence: data.confidenceScore,
            photoId: data.photoId,
            aiResults: data.metrics,
            timestamp: Date.parse(data.timestamp) || Date.now(),
            alert: {
              type: data.type,
              severity: data.severity === 'critical' ? 'high' : data.severity === 'warning' ? 'medium' : 'low',
              message: data.message,
              actionRequired: data.severity === 'critical'
            }
          };
          this.safeInvoke(this.onFatigueAlert, normalized, 'onFatigueAlert');
        });

        this.socket.on('fatigue_safe_stop', (data: FatigueSafeStopEvent) => {
          if (this.isDuplicateEvent((data as any)?.eventId)) return;
          console.log('🛑 Received fatigue_safe_stop:', data);
          this.safeInvoke(this.onFatigueSafeStop, data, 'onFatigueSafeStop');
        });

        // Photo capture confirmation
        this.socket.on('photo_capture_confirmed', (data: PhotoCaptureEvent) => {
          console.log('📷 Photo capture confirmed:', data);
          this.safeInvoke(this.onPhotoCaptureConfirmed, data, 'onPhotoCaptureConfirmed');
        });

        // Session updates
        this.socket.on('session_update', (data: SessionUpdate) => {
          console.log('📊 Session update received:', data);
          this.safeInvoke(this.onSessionUpdate, data, 'onSessionUpdate');
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
          if (this.isDuplicateEvent((data as any)?.eventId)) return;
          console.log('🤖 AI processing complete:', data);
          // Fatigue alerts are handled by dedicated "driver_fatigue_alert" event
          // to avoid duplicate notifications/sounds.
          this.safeInvoke(this.onAIProcessingComplete, data, 'onAIProcessingComplete');
        });

        // Upload notifications
        this.socket.on('upload_notification', (data) => {
          console.log('📤 Upload notification:', data);
          this.safeInvoke(this.onUploadNotification, data, 'onUploadNotification');
        });

        this.socket.on('upload_progress', (data) => {
          console.log('📊 Upload progress:', data);
          this.safeInvoke(this.onUploadProgress, data, 'onUploadProgress');
        });

        this.socket.on('upload_completed', (data) => {
          console.log('✅ Upload completed:', data);
          this.safeInvoke(this.onUploadCompleted, data, 'onUploadCompleted');
        });

        this.socket.on('upload_failed', (data) => {
          console.log('❌ Upload failed:', data);
          this.safeInvoke(this.onUploadFailed, data, 'onUploadFailed');
        });

        // Ping/Pong
        this.socket.on('pong', (data) => {
          console.log('🏓 Pong received:', data);
        });

        this.socket.on('heartbeat_ack', (data) => {
          this.lastHeartbeatAckAt = Date.now();
          console.log('💓 Heartbeat ack:', data);
        });

        // Notifications
        this.socket.on('notification', (data) => {
          console.log('📢 Notification received:', data);
          if ((data?.type === 'warning' || data?.type === 'error') && /fatigue|wake/i.test(String(data?.message || ''))) {
            alertAudioService.playFatigueAlert().catch((error) => {
              console.warn('Failed to play notification alert sound:', error);
            });
          }
          this.safeInvoke(this.onNotification, data, 'onNotification');
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
      this.stopHeartbeat();
      this.safeInvoke(this.onConnectionChange, false, 'onConnectionChange');
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

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeatAckAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || !this.isConnected) return;
      const now = Date.now();
      if (this.lastHeartbeatAckAt > 0 && now - this.lastHeartbeatAckAt > 70000) {
        console.warn('⚠️ Heartbeat stale, forcing reconnect');
        this.socket.disconnect();
        this.socket.connect();
        return;
      }
      this.socket.emit('heartbeat', { timestamp: now });
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private isDuplicateEvent(eventId?: string): boolean {
    if (!eventId) return false;
    if (this.seenEventIds.has(eventId)) return true;
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > this.seenEventIdsMax) {
      const first = this.seenEventIds.values().next().value;
      if (first) this.seenEventIds.delete(first);
    }
    return false;
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

  setOnFatigueSafeStop(handler: (data: FatigueSafeStopEvent) => void): void {
    this.onFatigueSafeStop = handler;
  }

  setOnNotification(handler: (data: any) => void): void {
    this.onNotification = handler;
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