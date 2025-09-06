// API Manager for WakeSafe Client
class APIManager {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: this.getHeaders(options.includeAuth !== false),
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            // Handle token expiration
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error('Unauthorized');
            }

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    handleUnauthorized() {
        // Clear auth data and redirect to login
        if (window.authManager) {
            window.authManager.clearAuthData();
            window.authManager.showAuth();
        }
    }

    // Authentication endpoints
    async login(email, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            includeAuth: false
        });
    }

    async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
            includeAuth: false
        });
    }

    async logout() {
        return this.request('/auth/logout', {
            method: 'POST'
        });
    }

    // Session management
    async startSession() {
        return this.request('/sessions', {
            method: 'POST'
        });
    }

    async endSession(sessionId) {
        return this.request(`/sessions/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'ended' })
        });
    }

    async getCurrentSession() {
        return this.request('/sessions/current');
    }

    async getSessionHistory() {
        return this.request('/sessions');
    }

    // Photo upload
    async uploadPhoto(file, sessionId, metadata = {}) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('sessionId', sessionId);
        
        if (metadata.location) {
            formData.append('location', JSON.stringify(metadata.location));
        }
        
        if (metadata.clientMeta) {
            formData.append('clientMeta', JSON.stringify(metadata.clientMeta));
        }

        const url = `${this.baseURL}/upload`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        return response.json();
    }

    // Get presigned URL for direct upload
    async getPresignedUrl(fileName, sessionId, metadata = {}) {
        return this.request('/upload/presigned', {
            method: 'POST',
            body: JSON.stringify({
                fileName,
                sessionId,
                metadata
            })
        });
    }

    // Direct upload to cloud storage using presigned URL
    async uploadToCloudStorage(presignedUrl, file, metadata = {}) {
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type,
                ...metadata
            }
        });

        if (!response.ok) {
            throw new Error('Cloud upload failed');
        }

        return response;
    }

    // Photo management
    async getSessionPhotos(sessionId) {
        return this.request(`/photos/session/${sessionId}`);
    }

    async deletePhoto(photoId) {
        return this.request(`/photos/${photoId}`, {
            method: 'DELETE'
        });
    }

    async deletePhotos(photoIds) {
        return this.request('/photos', {
            method: 'DELETE',
            body: JSON.stringify({ photoIds })
        });
    }

    // Fatigue detection
    async getFatigueLogs(sessionId) {
        return this.request(`/fatigue/session/${sessionId}`);
    }

    async getFatigueStats() {
        return this.request('/fatigue/stats');
    }

    // Location tracking
    async updateLocation(location) {
        return this.request('/location', {
            method: 'POST',
            body: JSON.stringify(location)
        });
    }

    // User management
    async getUserProfile() {
        return this.request('/users/profile');
    }

    async updateUserProfile(userData) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    }

    // Trip management
    async getTrips() {
        return this.request('/trips');
    }

    async getTrip(tripId) {
        return this.request(`/trips/${tripId}`);
    }

    async createTrip(tripData) {
        return this.request('/trips', {
            method: 'POST',
            body: JSON.stringify(tripData)
        });
    }

    async updateTrip(tripId, tripData) {
        return this.request(`/trips/${tripId}`, {
            method: 'PUT',
            body: JSON.stringify(tripData)
        });
    }

    async deleteTrip(tripId) {
        return this.request(`/trips/${tripId}`, {
            method: 'DELETE'
        });
    }

    // Utility methods
    async checkConnection() {
        try {
            await this.request('/health', { includeAuth: false });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Batch operations
    async batchUpload(files, sessionId, onProgress = null) {
        const results = [];
        const total = files.length;
        
        for (let i = 0; i < files.length; i++) {
            try {
                const file = files[i];
                const result = await this.uploadPhoto(file, sessionId);
                results.push({ success: true, file, result });
                
                if (onProgress) {
                    onProgress(i + 1, total, file.name);
                }
            } catch (error) {
                results.push({ success: false, file: files[i], error: error.message });
                
                if (onProgress) {
                    onProgress(i + 1, total, files[i].name, error.message);
                }
            }
        }
        
        return results;
    }

    // File validation
    validateFile(file) {
        const errors = [];
        
        // Check file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            errors.push(`File size must be less than ${this.formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
        }
        
        // Check file type
        if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
            errors.push(`File type not supported. Allowed types: ${CONFIG.ALLOWED_FILE_TYPES.join(', ')}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Error handling
    handleError(error, context = '') {
        console.error(`API Error ${context}:`, error);
        
        let message = CONFIG.ERRORS.GENERIC;
        
        if (error.message.includes('Network')) {
            message = CONFIG.ERRORS.NETWORK;
        } else if (error.message.includes('Unauthorized')) {
            message = CONFIG.ERRORS.UNAUTHORIZED;
        } else if (error.message) {
            message = error.message;
        }
        
        if (window.authManager) {
            window.authManager.showError(message);
        }
        
        return message;
    }
}

// Initialize API manager
window.apiManager = new APIManager();

// Update token when auth manager changes
if (window.authManager) {
    window.authManager.token = window.authManager.token;
    window.apiManager.setToken(window.authManager.token);
}
