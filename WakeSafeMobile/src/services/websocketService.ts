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

// Cap the auto-reconnect attempts before we give up and force the user
// back to the login screen. Per product spec: 2-3 retries.
const MAX_RECONNECT_ATTEMPTS = 3;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 5000;

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
  private readonly reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private connectionPromise: Promise<boolean> | null = null;
  private intentionalDisconnect = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAckAt = 0;
  private seenEventIds = new Set<string>();
  private readonly seenEventIdsMax = 300;

  // Multi-listener slots (anyone can subscribe, returns unsubscribe fn).
  // Used for connection lifecycle events that more than one screen / the
  // app shell need to observe at the same time.
  private connectionChangeListeners = new Set<(connected: boolean) => void>();
  private errorListeners = new Set<(error: string) => void>();
  private reconnectFailedListeners = new Set<() => void>();

  // Per-stream single-handler slots (last writer wins). These are scoped
  // to a single owning screen so the existing behavior is preserved.
  private onFatigueAlert?: (alert: FatigueAlert) => void;
  private onPhotoCaptureConfirmed?: (event: PhotoCaptureEvent) => void;
  private onSessionUpdate?: (update: SessionUpdate) => void;
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
      console.warn(`WebSocket handler "${label}" failed:`, error);
    }
  }

  private notifyAll<T>(listeners: Set<(payload: T) => void>, payload: T, label: string): void {
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.warn(`WebSocket listener "${label}" failed:`, error);
      }
    });
  }

  private notifyConnectionChange(connected: boolean): void {
    this.notifyAll(this.connectionChangeListeners, connected, 'connectionChange');
  }

  private notifyError(message: string): void {
    this.notifyAll(this.errorListeners, message, 'error');
  }

  private notifyReconnectFailed(): void {
    this.reconnectFailedListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.warn('WebSocket listener "reconnectFailed" failed:', error);
      }
    });
  }

  connect(token: string): Promise<boolean> {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.intentionalDisconnect = false;

    this.connectionPromise = new Promise((resolve, reject) => {
      let settled = false;
      const settle = (ok: boolean, error?: unknown) => {
        if (settled) return;
        settled = true;
        if (ok) {
          resolve(true);
        } else {
          reject(error instanceof Error ? error : new Error(String(error || 'WebSocket connection failed')));
        }
      };

      try {
        console.log('🔌 Connecting to WebSocket server...');

        // Disconnect existing connection if any
        if (this.socket) {
          try {
            this.socket.removeAllListeners();
            this.socket.disconnect();
          } catch (cleanupError) {
            console.warn('WebSocket previous-socket cleanup failed:', cleanupError);
          }
          this.socket = null;
        }

        this.socket = io(CONFIG.WS_URL, {
          auth: { token },
          query: {},
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
          randomizationFactor: 0.5,
          forceNew: false,
          upgrade: true,
          rememberUpgrade: false
        });

        // Connection successful
        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected, id:', this.socket?.id);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionChange(true);
          this.startHeartbeat();
          settle(true);
        });

        // Connection failed (initial attempt or in-flight retry).
        // Socket.io will keep retrying until reconnectionAttempts is exhausted,
        // so we DO NOT reject the connect() promise here — that would surface
        // a recoverable hiccup to the user as a hard failure. We only log a
        // warning and let `reconnect_failed` close out the flow if it fires.
        this.socket.on('connect_error', (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('WebSocket connect_error:', message);
          this.isConnected = false;
          this.notifyConnectionChange(false);
          this.stopHeartbeat();
        });

        // Disconnected
        this.socket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
          this.isConnected = false;
          this.notifyConnectionChange(false);
          this.stopHeartbeat();
        });

        // Reconnected
        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.notifyConnectionChange(true);
          this.startHeartbeat();
        });

        // Reconnect attempt
        this.socket.on('reconnect_attempt', (attemptNumber) => {
          console.log(`WebSocket reconnect attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
          this.reconnectAttempts = attemptNumber;
        });

        // Reconnect failed — exhausted MAX_RECONNECT_ATTEMPTS.
        this.socket.on('reconnect_failed', () => {
          console.warn('WebSocket reconnection failed after', this.maxReconnectAttempts, 'attempts');
          this.isConnected = false;
          this.notifyConnectionChange(false);
          this.notifyError('Failed to reconnect to server');
          this.notifyReconnectFailed();
          // Tear down the socket so a fresh connect() (after re-login) starts
          // from a clean slate and doesn't re-fire stale events.
          this.teardownSocket();
          this.connectionPromise = null;
          settle(false, new Error('WebSocket reconnect failed'));
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
          const prediction = String(data?.results?.prediction || data?.results?.ml2?.driver_state || '').toLowerCase();
          const fatigued = Boolean(data?.results?.ml2?.fatigued);
          // Fallback alert should only run when backend explicitly marks that alert was emitted.
          const alertEmitted = Boolean(data?.results?.alertEmitted);
          if (alertEmitted && (fatigued || prediction === 'drowsy' || prediction === 'sleeping')) {
            alertAudioService.playFatigueAlert().catch((error) => {
              console.warn('Failed to play AI-processing fatigue alert sound:', error);
            });
            const normalized: FatigueAlert = {
              sessionId: data?.results?.ml2?.session_id || data?.results?.ml1?.session_id || '',
              fatigueLevel: prediction === 'sleeping' ? 'sleeping' : 'drowsy',
              confidence: Number(data?.results?.ml1?.frame_analysis?.confidence || 0),
              photoId: data?.photoId,
              aiResults: data?.results,
              timestamp: Number(data?.timestamp || Date.now()),
              alert: {
                type: 'fatigue_alert_fallback',
                severity: prediction === 'sleeping' ? 'high' : 'medium',
                message:
                  prediction === 'sleeping'
                    ? 'Critical fatigue detected (fallback). Stop driving immediately.'
                    : 'Drowsiness detected (fallback). Please take a short break.',
                actionRequired: prediction === 'sleeping',
              },
            };
            this.safeInvoke(this.onFatigueAlert, normalized, 'onFatigueAlert');
          }
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
        console.warn('Error initializing WebSocket:', error);
        this.connectionPromise = null;
        settle(false, error);
      }
    });

    return this.connectionPromise;
  }

  /** Quietly drop the underlying socket without notifying listeners. */
  private teardownSocket(): void {
    if (!this.socket) return;
    try {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    } catch (error) {
      console.warn('WebSocket teardown failed:', error);
    }
    this.socket = null;
    this.isConnected = false;
    this.stopHeartbeat();
  }

  /**
   * Caller-initiated disconnect (e.g. logout, screen unmount).
   * Suppresses the offline notification because the user is choosing this.
   */
  disconnect(): void {
    if (!this.socket) {
      this.connectionPromise = null;
      return;
    }
    console.log('Disconnecting WebSocket (intentional)');
    this.intentionalDisconnect = true;
    this.teardownSocket();
    this.connectionPromise = null;
    // Tell observers we're offline now so the UI status indicator updates,
    // but the central status gate uses `intentionalDisconnect` (via
    // wasIntentionalDisconnect()) to suppress the popup.
    this.notifyConnectionChange(false);
  }

  /** True if the most recent disconnect was triggered by disconnect(). */
  wasIntentionalDisconnect(): boolean {
    return this.intentionalDisconnect;
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

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function — call it from the effect cleanup so
   * listeners do not leak across screen mounts.
   */
  addConnectionChangeListener(listener: (connected: boolean) => void): () => void {
    this.connectionChangeListeners.add(listener);
    return () => {
      this.connectionChangeListeners.delete(listener);
    };
  }

  /**
   * Subscribe to non-fatal connection error messages.
   * Returns an unsubscribe function.
   */
  addErrorListener(listener: (error: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * Fires once after the configured number of reconnect attempts is exhausted.
   * Used by the app shell to force a logout and bounce the user to login.
   */
  addReconnectFailedListener(listener: () => void): () => void {
    this.reconnectFailedListeners.add(listener);
    return () => {
      this.reconnectFailedListeners.delete(listener);
    };
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