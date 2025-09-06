// Upload Manager for WakeSafe Client
class UploadManager {
    constructor() {
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.maxConcurrentUploads = 3;
        this.usePresignedUrls = true; // Use smart upload by default
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File input change
        const photoInput = document.getElementById('photoInput');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Drag and drop
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea) {
            uploadArea.addEventListener('click', () => photoInput.click());
            uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // WebSocket events
        if (window.wsManager) {
            window.wsManager.on('upload_progress', (data) => this.handleWebSocketProgress(data));
            window.wsManager.on('upload_complete', (data) => this.handleWebSocketComplete(data));
            window.wsManager.on('upload_error', (data) => this.handleWebSocketError(data));
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.processFiles(files);
    }

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('dragover');
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('dragover');
    }

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('dragover');
        
        const files = Array.from(event.dataTransfer.files);
        this.processFiles(files);
    }

    processFiles(files) {
        // Filter and validate files
        const validFiles = files.filter(file => this.validateFile(file));
        
        if (validFiles.length === 0) {
            window.authManager?.showError('No valid image files selected');
            return;
        }

        if (validFiles.length > CONFIG.MAX_FILES_PER_UPLOAD) {
            window.authManager?.showError(`Maximum ${CONFIG.MAX_FILES_PER_UPLOAD} files allowed per upload`);
            return;
        }

        // Add to upload queue
        validFiles.forEach(file => {
            this.uploadQueue.push({
                file,
                id: this.generateUploadId(),
                status: 'queued',
                progress: 0,
                error: null
            });
        });

        this.updateUploadUI();
        this.processQueue();
    }

    validateFile(file) {
        // Check file type
        if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
            window.authManager?.showError(`File ${file.name} is not a supported image format`);
            return false;
        }

        // Check file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            window.authManager?.showError(`File ${file.name} is too large (max ${this.formatFileSize(CONFIG.MAX_FILE_SIZE)})`);
            return false;
        }

        return true;
    }

    async processQueue() {
        while (this.uploadQueue.length > 0 && this.activeUploads.size < this.maxConcurrentUploads) {
            const uploadItem = this.uploadQueue.shift();
            this.activeUploads.set(uploadItem.id, uploadItem);
            this.uploadFile(uploadItem);
        }
    }

    async uploadFile(uploadItem) {
        const { file, id } = uploadItem;
        
        try {
            // Get current session
            const session = await this.getCurrentSession();
            if (!session) {
                throw new Error('No active session found');
            }

            // Notify WebSocket of upload start
            if (window.wsManager) {
                window.wsManager.sendPhotoUploadStart(file.name, file.size, session._id);
            }

            uploadItem.status = 'uploading';
            this.updateUploadProgress(id, 0, file.name);

            if (this.usePresignedUrls) {
                await this.uploadWithPresignedUrl(uploadItem, session);
            } else {
                await this.uploadWithAPI(uploadItem, session);
            }

            uploadItem.status = 'completed';
            uploadItem.progress = 100;
            this.updateUploadProgress(id, 100, file.name);

            // Notify WebSocket of completion
            if (window.wsManager) {
                window.wsManager.send('photo_upload_complete', {
                    photoId: uploadItem.photoId,
                    fileName: file.name,
                    gcsPath: uploadItem.gcsPath,
                    metadata: uploadItem.metadata
                });
            }

            window.authManager?.showSuccess(`Photo ${file.name} uploaded successfully!`);

        } catch (error) {
            console.error('Upload error:', error);
            uploadItem.status = 'error';
            uploadItem.error = error.message;
            this.updateUploadProgress(id, 0, file.name, error.message);

            // Notify WebSocket of error
            if (window.wsManager) {
                window.wsManager.send('photo_upload_error', {
                    photoId: uploadItem.photoId,
                    fileName: file.name,
                    error: error.message
                });
            }

            window.authManager?.showError(`Upload failed: ${error.message}`);
        } finally {
            this.activeUploads.delete(id);
            this.processQueue(); // Process next item in queue
        }
    }

    async uploadWithPresignedUrl(uploadItem, session) {
        const { file, id } = uploadItem;

        // Get presigned URL
        const response = await window.apiManager.request('/upload/presigned', {
            method: 'POST',
            body: JSON.stringify({
                fileName: file.name,
                sessionId: session._id,
                metadata: {
                    location: await this.getCurrentLocation(),
                    clientMeta: {
                        userAgent: navigator.userAgent,
                        timestamp: Date.now(),
                        fileSize: file.size
                    }
                }
            })
        });

        uploadItem.photoId = response.photoId;
        uploadItem.gcsPath = response.gcsPath;

        // Upload to cloud storage
        const uploadResponse = await fetch(response.presignedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadResponse.ok) {
            throw new Error('Cloud upload failed');
        }

        // Update photo status in database
        await window.apiManager.request(`/photos/${response.photoId}`, {
            method: 'PUT',
            body: JSON.stringify({
                uploadStatus: 'completed',
                uploadedAt: new Date().toISOString()
            })
        });

        uploadItem.metadata = {
            photoId: response.photoId,
            gcsPath: response.gcsPath,
            uploadedAt: new Date().toISOString()
        };
    }

    async uploadWithAPI(uploadItem, session) {
        const { file, id } = uploadItem;

        // Simulate progress for API upload
        const progressInterval = setInterval(() => {
            if (uploadItem.progress < 90) {
                uploadItem.progress += Math.random() * 10;
                this.updateUploadProgress(id, uploadItem.progress, file.name);
            }
        }, 200);

        try {
            const result = await window.apiManager.uploadPhoto(file, session._id, {
                location: await this.getCurrentLocation(),
                clientMeta: {
                    userAgent: navigator.userAgent,
                    timestamp: Date.now(),
                    fileSize: file.size
                }
            });

            clearInterval(progressInterval);
            uploadItem.photoId = result.photoId;
            uploadItem.gcsPath = result.gcsPath;
            uploadItem.metadata = result;

        } catch (error) {
            clearInterval(progressInterval);
            throw error;
        }
    }

    async getCurrentSession() {
        try {
            return await window.apiManager.getCurrentSession();
        } catch (error) {
            console.error('Failed to get current session:', error);
            return null;
        }
    }

    async getCurrentLocation() {
        return new Promise((resolve) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            timestamp: position.timestamp
                        });
                    },
                    (error) => {
                        console.warn('Geolocation error:', error);
                        resolve(null);
                    },
                    { timeout: 5000, enableHighAccuracy: false }
                );
            } else {
                resolve(null);
            }
        });
    }

    updateUploadUI() {
        const uploadProgress = document.getElementById('uploadProgress');
        if (!uploadProgress) return;

        const totalUploads = this.uploadQueue.length + this.activeUploads.size;
        
        if (totalUploads > 0) {
            uploadProgress.classList.remove('hidden');
            
            const completedUploads = Array.from(this.activeUploads.values())
                .filter(item => item.status === 'completed').length;
            
            const progress = totalUploads > 0 ? (completedUploads / totalUploads) * 100 : 0;
            
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            
            if (progressFill) progressFill.style.width = `${progress}%`;
            if (progressText) progressText.textContent = `${Math.round(progress)}%`;
        } else {
            uploadProgress.classList.add('hidden');
        }
    }

    updateUploadProgress(uploadId, progress, fileName, error = null) {
        const uploadItem = this.activeUploads.get(uploadId);
        if (uploadItem) {
            uploadItem.progress = progress;
            if (error) {
                uploadItem.error = error;
            }
        }

        this.updateUploadUI();
        this.updateActivityLog(fileName, progress, error);
    }

    updateActivityLog(fileName, progress, error = null) {
        const activityLog = document.getElementById('activityLog');
        if (!activityLog) return;

        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        if (error) {
            activityItem.innerHTML = `
                <i class="fas fa-exclamation-circle" style="color: var(--danger-color);"></i>
                <span>Upload failed: ${fileName} - ${error}</span>
                <small>Just now</small>
            `;
        } else if (progress === 100) {
            activityItem.innerHTML = `
                <i class="fas fa-check-circle" style="color: var(--success-color);"></i>
                <span>Photo uploaded successfully: ${fileName}</span>
                <small>Just now</small>
            `;
        } else {
            activityItem.innerHTML = `
                <i class="fas fa-upload" style="color: var(--primary-color);"></i>
                <span>Uploading: ${fileName} (${Math.round(progress)}%)</span>
                <small>Just now</small>
            `;
        }

        activityLog.insertBefore(activityItem, activityLog.firstChild);

        // Keep only last 10 items
        const items = activityLog.querySelectorAll('.activity-item');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    // WebSocket event handlers
    handleWebSocketProgress(data) {
        const { photoId, progress, fileName } = data;
        // Find upload item by photoId and update progress
        for (const [id, item] of this.activeUploads) {
            if (item.photoId === photoId) {
                this.updateUploadProgress(id, progress, fileName);
                break;
            }
        }
    }

    handleWebSocketComplete(data) {
        const { photoId, fileName, gcsPath, metadata } = data;
        // Find upload item by photoId and mark as complete
        for (const [id, item] of this.activeUploads) {
            if (item.photoId === photoId) {
                item.status = 'completed';
                item.progress = 100;
                this.updateUploadProgress(id, 100, fileName);
                break;
            }
        }
    }

    handleWebSocketError(data) {
        const { photoId, fileName, error } = data;
        // Find upload item by photoId and mark as error
        for (const [id, item] of this.activeUploads) {
            if (item.photoId === photoId) {
                item.status = 'error';
                item.error = error;
                this.updateUploadProgress(id, 0, fileName, error);
                break;
            }
        }
    }

    // Utility methods
    generateUploadId() {
        return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Public methods
    clearQueue() {
        this.uploadQueue = [];
        this.activeUploads.clear();
        this.updateUploadUI();
    }

    getQueueStatus() {
        return {
            queued: this.uploadQueue.length,
            active: this.activeUploads.size,
            total: this.uploadQueue.length + this.activeUploads.size
        };
    }

    setUploadMethod(usePresignedUrls) {
        this.usePresignedUrls = usePresignedUrls;
    }
}

// Initialize upload manager
window.uploadManager = new UploadManager();
