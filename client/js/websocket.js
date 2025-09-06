// WebSocket Manager for WakeSafe Client
class WebSocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = CONFIG.WS_MAX_RECONNECT_ATTEMPTS;
        this.reconnectInterval = CONFIG.WS_RECONNECT_INTERVAL;
        this.eventHandlers = new Map();
        this.connectionStatus = 'disconnected';
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Listen for page visibility changes to reconnect when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.isConnected) {
                this.connect();
            }
        });

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.connect();
        });

        window.addEventListener('offline', () => {
            this.disconnect();
        });
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return;
        }

        if (!window.authManager || !window.authManager.token) {
            console.log('No auth token available for WebSocket connection');
            return;
        }

        try {
            const wsUrl = `${CONFIG.WS_URL.replace('http', 'ws')}?token=${window.authManager.token}`;
            this.socket = new WebSocket(wsUrl);
            
            this.setupEventHandlers();
            this.updateConnectionStatus('connecting');
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.handleConnectionError();
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus('disconnected');
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected');
            this.emit('connected');
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('WebSocket message parse error:', error);
            }
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            this.emit('disconnected', { code: event.code, reason: event.reason });
            
            // Attempt to reconnect if not a manual disconnect
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleConnectionError();
        };
    }

    handleMessage(data) {
        const { type, payload } = data;
        
        switch (type) {
            case 'photo_upload_progress':
                this.handlePhotoUploadProgress(payload);
                break;
            case 'photo_upload_complete':
                this.handlePhotoUploadComplete(payload);
                break;
            case 'photo_upload_error':
                this.handlePhotoUploadError(payload);
                break;
            case 'fatigue_detection':
                this.handleFatigueDetection(payload);
                break;
            case 'session_update':
                this.handleSessionUpdate(payload);
                break;
            case 'ai_processing_complete':
                this.handleAIProcessingComplete(payload);
                break;
            case 'notification':
                this.handleNotification(payload);
                break;
            case 'error':
                this.handleError(payload);
                break;
            default:
                console.log('Unknown WebSocket message type:', type, payload);
        }
        
        // Emit generic message event
        this.emit('message', { type, payload });
    }

    handlePhotoUploadProgress(payload) {
        const { photoId, progress, fileName } = payload;
        this.emit('upload_progress', { photoId, progress, fileName });
        
        // Update UI if upload manager exists
        if (window.uploadManager) {
            window.uploadManager.updateUploadProgress(photoId, progress, fileName);
        }
    }

    handlePhotoUploadComplete(payload) {
        const { photoId, fileName, gcsPath, metadata } = payload;
        this.emit('upload_complete', { photoId, fileName, gcsPath, metadata });
        
        // Update UI if upload manager exists
        if (window.uploadManager) {
            window.uploadManager.handleUploadComplete(photoId, fileName, gcsPath, metadata);
        }
    }

    handlePhotoUploadError(payload) {
        const { photoId, fileName, error } = payload;
        this.emit('upload_error', { photoId, fileName, error });
        
        // Update UI if upload manager exists
        if (window.uploadManager) {
            window.uploadManager.handleUploadError(photoId, fileName, error);
        }
    }

    handleFatigueDetection(payload) {
        const { sessionId, fatigueLevel, confidence, timestamp } = payload;
        this.emit('fatigue_detection', { sessionId, fatigueLevel, confidence, timestamp });
        
        // Update dashboard if it exists
        if (window.dashboardManager) {
            window.dashboardManager.updateFatigueStatus(fatigueLevel, confidence);
        }
    }

    handleSessionUpdate(payload) {
        const { sessionId, status, duration, photosCount } = payload;
        this.emit('session_update', { sessionId, status, duration, photosCount });
        
        // Update dashboard if it exists
        if (window.dashboardManager) {
            window.dashboardManager.updateSessionStatus(payload);
        }
    }

    handleAIProcessingComplete(payload) {
        const { photoId, results, processingTime } = payload;
        this.emit('ai_processing_complete', { photoId, results, processingTime });
        
        // Update photo gallery if it exists
        if (window.dashboardManager) {
            window.dashboardManager.updatePhotoAIResults(photoId, results);
        }
    }

    handleNotification(payload) {
        const { message, type, duration } = payload;
        this.emit('notification', { message, type, duration });
        
        // Show notification if auth manager exists
        if (window.authManager) {
            window.authManager.showNotification(message, type);
        }
    }

    handleError(payload) {
        const { message, code, details } = payload;
        this.emit('error', { message, code, details });
        
        // Show error notification
        if (window.authManager) {
            window.authManager.showError(message);
        }
    }

    handleConnectionError() {
        this.updateConnectionStatus('error');
        this.emit('connection_error');
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        } else {
            console.error('Max reconnection attempts reached');
            this.emit('max_reconnect_attempts_reached');
        }
    }

    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        this.updateConnectionStatus('reconnecting');
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
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
                error: { text: 'Connection Error', icon: 'fa-exclamation-triangle', class: 'error' }
            };
            
            const config = statusConfig[status] || statusConfig.disconnected;
            
            statusElement.textContent = config.text;
            iconElement.className = `fas ${config.icon}`;
            container.className = `connection-status ${config.class}`;
        }
    }

    // Event system
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
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in WebSocket event handler for ${event}:`, error);
                }
            });
        }
    }

    // Message sending
    send(type, payload) {
        if (!this.isConnected || !this.socket) {
            console.warn('WebSocket not connected, cannot send message');
            return false;
        }

        try {
            const message = JSON.stringify({ type, payload });
            this.socket.send(message);
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    // Specific message types
    sendPhotoUploadStart(fileName, fileSize, sessionId) {
        return this.send('photo_upload_start', {
            fileName,
            fileSize,
            sessionId,
            timestamp: Date.now()
        });
    }

    sendPhotoUploadChunk(photoId, chunkIndex, totalChunks, data) {
        return this.send('photo_upload_chunk', {
            photoId,
            chunkIndex,
            totalChunks,
            data,
            timestamp: Date.now()
        });
    }

    sendSessionStart(sessionId) {
        return this.send('session_start', {
            sessionId,
            timestamp: Date.now()
        });
    }

    sendSessionEnd(sessionId) {
        return this.send('session_end', {
            sessionId,
            timestamp: Date.now()
        });
    }

    sendLocationUpdate(location) {
        return this.send('location_update', {
            location,
            timestamp: Date.now()
        });
    }

    // Utility methods
    isConnectionHealthy() {
        return this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getConnectionInfo() {
        return {
            isConnected: this.isConnected,
            status: this.connectionStatus,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts
        };
    }
}

// Initialize WebSocket manager
window.wsManager = new WebSocketManager();
