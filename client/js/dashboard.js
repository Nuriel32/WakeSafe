// Dashboard Manager for WakeSafe Client
class DashboardManager {
    constructor() {
        this.currentSession = null;
        this.sessionTimer = null;
        this.sessionStartTime = null;
        this.fatigueLevel = 100;
        this.alertnessLevel = 100;
        
        this.initializeEventListeners();
        this.initializeDashboard();
    }

    initializeEventListeners() {
        // Session controls
        const startSessionBtn = document.getElementById('startSessionBtn');
        const endSessionBtn = document.getElementById('endSessionBtn');
        
        if (startSessionBtn) {
            startSessionBtn.addEventListener('click', () => this.startSession());
        }
        
        if (endSessionBtn) {
            endSessionBtn.addEventListener('click', () => this.endSession());
        }

        // Navigation
        const backToDashboard = document.getElementById('backToDashboard');
        if (backToDashboard) {
            backToDashboard.addEventListener('click', () => this.showDashboard());
        }

        // WebSocket events
        if (window.wsManager) {
            window.wsManager.on('session_update', (data) => this.handleSessionUpdate(data));
            window.wsManager.on('fatigue_detection', (data) => this.handleFatigueDetection(data));
            window.wsManager.on('ai_processing_complete', (data) => this.handleAIProcessingComplete(data));
        }
    }

    async initializeDashboard() {
        try {
            // Load current session if exists
            await this.loadCurrentSession();
            
            // Load user profile
            await this.loadUserProfile();
            
            // Start periodic updates
            this.startPeriodicUpdates();
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            window.authManager?.showError('Failed to initialize dashboard');
        }
    }

    async loadCurrentSession() {
        try {
            const session = await window.apiManager.getCurrentSession();
            if (session && session.status === 'active') {
                this.currentSession = session;
                this.sessionStartTime = new Date(session.startTime);
                this.updateSessionUI();
                this.startSessionTimer();
            } else {
                this.updateSessionUI();
            }
        } catch (error) {
            console.error('Failed to load current session:', error);
        }
    }

    async loadUserProfile() {
        try {
            const profile = await window.apiManager.getUserProfile();
            if (profile) {
                this.updateUserInfo(profile);
            }
        } catch (error) {
            console.error('Failed to load user profile:', error);
        }
    }

    async startSession() {
        try {
            const session = await window.apiManager.startSession();
            this.currentSession = session;
            this.sessionStartTime = new Date();
            
            this.updateSessionUI();
            this.startSessionTimer();
            
            // Notify WebSocket
            if (window.wsManager) {
                window.wsManager.sendSessionStart(session._id);
            }
            
            window.authManager?.showSuccess(CONFIG.SUCCESS.SESSION_START);
            this.addActivityLog('Session started successfully', 'success');
            
        } catch (error) {
            console.error('Failed to start session:', error);
            window.authManager?.showError('Failed to start session');
        }
    }

    async endSession() {
        if (!this.currentSession) return;
        
        try {
            await window.apiManager.endSession(this.currentSession._id);
            
            // Notify WebSocket
            if (window.wsManager) {
                window.wsManager.sendSessionEnd(this.currentSession._id);
            }
            
            this.currentSession = null;
            this.sessionStartTime = null;
            this.stopSessionTimer();
            this.updateSessionUI();
            
            window.authManager?.showSuccess(CONFIG.SUCCESS.SESSION_END);
            this.addActivityLog('Session ended successfully', 'success');
            
        } catch (error) {
            console.error('Failed to end session:', error);
            window.authManager?.showError('Failed to end session');
        }
    }

    startSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
        }
        
        this.sessionTimer = setInterval(() => {
            this.updateSessionDuration();
        }, 1000);
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
    }

    updateSessionDuration() {
        if (!this.sessionStartTime) return;
        
        const now = new Date();
        const duration = now - this.sessionStartTime;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        
        const durationElement = document.getElementById('sessionDuration');
        if (durationElement) {
            durationElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    updateSessionUI() {
        const sessionStatus = document.getElementById('sessionStatus');
        const startBtn = document.getElementById('startSessionBtn');
        const endBtn = document.getElementById('endSessionBtn');
        
        if (this.currentSession && this.currentSession.status === 'active') {
            // Active session
            if (sessionStatus) {
                sessionStatus.innerHTML = `
                    <span class="status-dot active"></span>
                    <span>Active Session</span>
                `;
            }
            
            if (startBtn) startBtn.classList.add('hidden');
            if (endBtn) endBtn.classList.remove('hidden');
            
        } else {
            // No active session
            if (sessionStatus) {
                sessionStatus.innerHTML = `
                    <span class="status-dot inactive"></span>
                    <span>No Active Session</span>
                `;
            }
            
            if (startBtn) startBtn.classList.remove('hidden');
            if (endBtn) endBtn.classList.add('hidden');
            
            // Reset duration display
            const durationElement = document.getElementById('sessionDuration');
            if (durationElement) {
                durationElement.textContent = '00:00:00';
            }
        }
    }

    updateFatigueStatus(fatigueLevel, confidence) {
        this.fatigueLevel = fatigueLevel;
        this.alertnessLevel = 100 - fatigueLevel;
        
        const alertnessBar = document.getElementById('alertnessBar');
        const alertnessPercent = document.getElementById('alertnessPercent');
        
        if (alertnessBar) {
            alertnessBar.style.width = `${this.alertnessLevel}%`;
        }
        
        if (alertnessPercent) {
            alertnessPercent.textContent = `${Math.round(this.alertnessLevel)}%`;
        }
        
        // Update color based on alertness level
        if (alertnessBar) {
            if (this.alertnessLevel >= 80) {
                alertnessBar.style.background = 'linear-gradient(90deg, var(--success-color), #22c55e)';
            } else if (this.alertnessLevel >= 60) {
                alertnessBar.style.background = 'linear-gradient(90deg, var(--warning-color), #f59e0b)';
            } else {
                alertnessBar.style.background = 'linear-gradient(90deg, var(--danger-color), #ef4444)';
            }
        }
        
        // Add activity log for significant changes
        if (this.alertnessLevel < 60) {
            this.addActivityLog(`Low alertness detected: ${Math.round(this.alertnessLevel)}%`, 'warning');
        }
    }

    updateUserInfo(profile) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement && profile.firstName) {
            userNameElement.textContent = profile.firstName;
        }
    }

    addActivityLog(message, type = 'info') {
        const activityLog = document.getElementById('activityLog');
        if (!activityLog) return;
        
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        const icon = this.getActivityIcon(type);
        const color = this.getActivityColor(type);
        
        activityItem.innerHTML = `
            <i class="${icon}" style="color: ${color};"></i>
            <span>${message}</span>
            <small>Just now</small>
        `;
        
        activityLog.insertBefore(activityItem, activityLog.firstChild);
        
        // Keep only last 10 items
        const items = activityLog.querySelectorAll('.activity-item');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    getActivityIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    getActivityColor(type) {
        const colors = {
            success: 'var(--success-color)',
            error: 'var(--danger-color)',
            warning: 'var(--warning-color)',
            info: 'var(--primary-color)'
        };
        return colors[type] || colors.info;
    }

    showDashboard() {
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('photoGallery').classList.add('hidden');
    }

    showPhotoGallery() {
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('photoGallery').classList.remove('hidden');
        this.loadSessionPhotos();
    }

    async loadSessionPhotos() {
        if (!this.currentSession) return;
        
        try {
            const photos = await window.apiManager.getSessionPhotos(this.currentSession._id);
            this.displayPhotos(photos);
        } catch (error) {
            console.error('Failed to load session photos:', error);
            window.authManager?.showError('Failed to load photos');
        }
    }

    displayPhotos(photos) {
        const photoGrid = document.getElementById('photoGrid');
        if (!photoGrid) return;
        
        photoGrid.innerHTML = '';
        
        photos.forEach(photo => {
            const photoItem = document.createElement('div');
            photoItem.className = 'photo-item';
            
            const statusClass = this.getPhotoStatusClass(photo.aiProcessingStatus);
            const statusText = this.getPhotoStatusText(photo.aiProcessingStatus);
            
            photoItem.innerHTML = `
                <img src="${photo.gcsPath}" alt="${photo.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDIwMCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTUwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04NSA2MEgxMTVWNzBIODVWNjBaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik04NSA4MEgxMTVWOTBIODVWODBaIiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo='">
                <div class="photo-info">
                    <h4>${photo.name}</h4>
                    <div class="photo-meta">
                        <span>${new Date(photo.createdAt).toLocaleString()}</span>
                        <span class="photo-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
            
            photoGrid.appendChild(photoItem);
        });
    }

    getPhotoStatusClass(status) {
        const statusMap = {
            'pending': 'pending',
            'processing': 'pending',
            'completed': 'processed',
            'error': 'error'
        };
        return statusMap[status] || 'pending';
    }

    getPhotoStatusText(status) {
        const statusMap = {
            'pending': 'Processing',
            'processing': 'Processing',
            'completed': 'Processed',
            'error': 'Error'
        };
        return statusMap[status] || 'Unknown';
    }

    startPeriodicUpdates() {
        // Update session duration every second
        setInterval(() => {
            if (this.currentSession) {
                this.updateSessionDuration();
            }
        }, 1000);
        
        // Check for session updates every 30 seconds
        setInterval(async () => {
            if (this.currentSession) {
                await this.loadCurrentSession();
            }
        }, 30000);
    }

    // WebSocket event handlers
    handleSessionUpdate(data) {
        const { sessionId, status, duration, photosCount } = data;
        
        if (this.currentSession && this.currentSession._id === sessionId) {
            this.currentSession.status = status;
            this.updateSessionUI();
            
            if (status === 'ended') {
                this.currentSession = null;
                this.sessionStartTime = null;
                this.stopSessionTimer();
            }
        }
        
        this.addActivityLog(`Session ${status}: ${photosCount || 0} photos`, 'info');
    }

    handleFatigueDetection(data) {
        const { sessionId, fatigueLevel, confidence, timestamp } = data;
        
        if (this.currentSession && this.currentSession._id === sessionId) {
            this.updateFatigueStatus(fatigueLevel, confidence);
        }
    }

    handleAIProcessingComplete(data) {
        const { photoId, results, processingTime } = data;
        
        this.addActivityLog(`AI processing completed for photo ${photoId}`, 'success');
        
        // Refresh photo gallery if it's currently displayed
        if (!document.getElementById('photoGallery').classList.contains('hidden')) {
            this.loadSessionPhotos();
        }
    }

    updatePhotoAIResults(photoId, results) {
        // Update specific photo in the gallery
        const photoItems = document.querySelectorAll('.photo-item');
        photoItems.forEach(item => {
            const img = item.querySelector('img');
            if (img && img.alt.includes(photoId)) {
                const statusElement = item.querySelector('.photo-status');
                if (statusElement) {
                    statusElement.textContent = 'Processed';
                    statusElement.className = 'photo-status processed';
                }
            }
        });
    }

    // Public methods
    getCurrentSession() {
        return this.currentSession;
    }

    getSessionDuration() {
        if (!this.sessionStartTime) return 0;
        return Date.now() - this.sessionStartTime.getTime();
    }

    getFatigueLevel() {
        return this.fatigueLevel;
    }

    getAlertnessLevel() {
        return this.alertnessLevel;
    }
}

// Initialize dashboard manager
window.dashboardManager = new DashboardManager();
