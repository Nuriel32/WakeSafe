// Socket.IO manager for WakeSafe client (matches server/server.js Socket.IO API)
class WebSocketManager {
    constructor() {
        this.io = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = CONFIG.WS_MAX_RECONNECT_ATTEMPTS;
        this.reconnectInterval = CONFIG.WS_RECONNECT_INTERVAL;
        this.eventHandlers = new Map();
        this.connectionStatus = 'disconnected';

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.isConnected && window.authManager?.token) {
                this.connect();
            }
        });

        window.addEventListener('online', () => {
            this.connect();
        });

        window.addEventListener('offline', () => {
            this.disconnect();
        });
    }

    connect() {
        if (typeof io === 'undefined') {
            console.error('Socket.IO client (io) is not loaded. Include socket.io.min.js before websocket.js.');
            return;
        }

        if (!window.authManager || !window.authManager.token) {
            console.log('No auth token available for Socket.IO connection');
            return;
        }

        if (this.io) {
            if (!this.io.connected) {
                this.io.auth = { token: window.authManager.token };
                this.io.connect();
            }
            return;
        }

        try {
            this.io = io(CONFIG.WS_URL, {
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                auth: { token: window.authManager.token },
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectInterval,
                reconnectionDelayMax: 30000,
            });
            this.bindSocketEvents(this.io);
            this.updateConnectionStatus('connecting');
        } catch (error) {
            console.error('Socket.IO connection error:', error);
            this.handleConnectionError();
        }
    }

    bindSocketEvents(socket) {
        socket.on('connect', () => {
            console.log('Socket.IO connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected');
            this.emit('connected');
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket.IO disconnected:', reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            this.emit('disconnected', { reason });
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO connect_error:', error?.message || error);
            this.reconnectAttempts++;
            this.updateConnectionStatus('error');
            this.emit('connection_error', { message: error?.message });
        });

        socket.io.on('reconnect_attempt', (attempt) => {
            this.reconnectAttempts = attempt;
            this.updateConnectionStatus('reconnecting');
        });

        socket.on('connected', (payload) => {
            this.emit('server_welcome', payload);
        });

        socket.on('session_started', (payload) => {
            this.emit('session_update', {
                sessionId: payload.sessionId,
                status: 'active',
                duration: 0,
                photosCount: 0,
                timestamp: payload.timestamp,
            });
        });

        socket.on('session_ended', (payload) => {
            this.emit('session_update', {
                sessionId: payload.sessionId,
                status: 'ended',
                duration: 0,
                photosCount: 0,
                timestamp: payload.timestamp,
            });
        });

        socket.on('fatigue_detection', (payload) => {
            this.handleFatigueDetection(payload);
        });

        socket.on('driver_fatigue_alert', (payload) => {
            this.emit('driver_fatigue_alert', payload);
        });

        socket.on('fatigue_safe_stop', (payload) => {
            this.emit('fatigue_safe_stop', payload);
        });

        socket.on('upload_progress', (payload) => {
            this.emit('upload_progress', payload);
        });

        socket.on('upload_completed', (payload) => {
            this.emit('upload_complete', {
                photoId: payload.photoId,
                fileName: payload.fileName,
                gcsPath: payload.gcsPath,
                metadata: payload.metadata || {},
            });
        });

        socket.on('upload_failed', (payload) => {
            this.emit('upload_error', {
                photoId: payload.photoId,
                fileName: payload.fileName,
                error: payload.error || 'Upload failed',
            });
        });

        socket.on('photo_capture_confirmed', (payload) => {
            this.emit('photo_capture_confirmed', payload);
        });

        socket.on('heartbeat_ack', (payload) => {
            this.emit('heartbeat_ack', payload);
        });
    }

    disconnect() {
        if (this.io) {
            this.io.removeAllListeners();
            this.io.disconnect();
            this.io = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus('disconnected');
    }

    handleFatigueDetection(payload) {
        const sessionId = payload.sessionId;
        let fatigueLevel = payload.fatigueLevel;
        const confidence =
            typeof payload.confidence === 'number'
                ? payload.confidence
                : Number(payload.confidenceScore) || 0;
        const timestamp = payload.timestamp || Date.now();

        if (typeof fatigueLevel === 'string') {
            const map = { sleeping: 92, drowsy: 72, alert: 15, unknown: 45 };
            fatigueLevel = map[fatigueLevel] ?? 50;
        }

        this.emit('fatigue_detection', {
            sessionId,
            fatigueLevel,
            confidence,
            timestamp,
            raw: payload,
        });
    }

    updateConnectionStatus(status) {
        this.connectionStatus = status;

        const statusElement = document.getElementById('connectionStatus');
        const iconElement = document.getElementById('connectionIcon');
        const container = document.querySelector('.connection-status');

        if (statusElement && iconElement && container) {
            const statusConfig = {
                connected: { text: 'Connected', icon: 'fa-wifi', class: 'connected' },
                connecting: { text: 'Connecting...', icon: 'fa-wifi', class: 'connecting' },
                reconnecting: { text: 'Reconnecting...', icon: 'fa-wifi', class: 'reconnecting' },
                disconnected: { text: 'Disconnected', icon: 'fa-wifi', class: 'disconnected' },
                error: { text: 'Connection Error', icon: 'fa-exclamation-triangle', class: 'error' },
            };

            const config = statusConfig[status] || statusConfig.disconnected;

            statusElement.textContent = config.text;
            iconElement.className = `fas ${config.icon}`;
            container.className = `connection-status ${config.class}`;
        }
    }

    handleConnectionError() {
        this.updateConnectionStatus('error');
        this.emit('connection_error');
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach((handler) => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in WebSocket event handler for ${event}:`, error);
                }
            });
        }
    }

    send(eventName, payload) {
        if (!this.isConnected || !this.io) {
            console.warn('Socket.IO not connected, cannot emit', eventName);
            return false;
        }
        try {
            this.io.emit(eventName, payload || {});
            return true;
        } catch (error) {
            console.error('Error emitting Socket.IO event:', error);
            return false;
        }
    }

    sendPhotoUploadStart(fileName, fileSize, sessionId) {
        return this.send('photo_upload_start', {
            fileName,
            fileSize,
            sessionId,
            timestamp: Date.now(),
        });
    }

    sendPhotoUploadChunk(photoId, chunkIndex, totalChunks, data) {
        return this.send('photo_upload_chunk', {
            photoId,
            chunkIndex,
            totalChunks,
            data,
            timestamp: Date.now(),
        });
    }

    sendSessionStart(sessionId) {
        return this.send('session_start', {
            sessionId,
            timestamp: Date.now(),
        });
    }

    sendSessionEnd(sessionId) {
        return this.send('session_end', {
            sessionId,
            timestamp: Date.now(),
        });
    }

    sendLocationUpdate(location) {
        return this.send('location_update', {
            location,
            timestamp: Date.now(),
        });
    }

    isConnectionHealthy() {
        return Boolean(this.isConnected && this.io && this.io.connected);
    }

    getConnectionInfo() {
        return {
            isConnected: this.isConnected,
            status: this.connectionStatus,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
        };
    }
}

window.wsManager = new WebSocketManager();
