import { CONFIG } from '../config';
import { SessionPhotoData } from './cameraService';

export interface UploadResult {
  success: boolean;
  photoId?: string;
  gcsPath?: string;
  error?: string;
  sequenceNumber: number;
}

export interface UploadProgress {
  totalPhotos: number;
  uploadedPhotos: number;
  failedPhotos: number;
  currentPhoto?: number;
}

class PhotoUploadService {
  private uploadQueue: SessionPhotoData[] = [];
  private isUploading = false;
  private uploadProgress: UploadProgress = {
    totalPhotos: 0,
    uploadedPhotos: 0,
    failedPhotos: 0,
  };
  private onProgress?: (progress: UploadProgress) => void;
  private onUploadComplete?: (result: UploadResult) => void;
  private onUploadError?: (error: string) => void;

  async uploadPhoto(
    photo: SessionPhotoData,
    token: string,
    onProgress?: (progress: UploadProgress) => void,
    onComplete?: (result: UploadResult) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    this.onProgress = onProgress;
    this.onUploadComplete = onComplete;
    this.onUploadError = onError;

    try {
      console.log(`Uploading photo sequence ${photo.sequenceNumber}...`);

      const formData = new FormData();
      
      // Create file object with proper naming
      const fileName = `photo_${photo.sequenceNumber.toString().padStart(6, '0')}_${photo.timestamp}.jpg`;
      const file = {
        uri: photo.uri,
        type: 'image/jpeg',
        name: fileName,
      } as any;

      formData.append('photo', file);
      formData.append('sessionId', photo.sessionId);
      formData.append('userId', photo.userId);
      formData.append('sequenceNumber', photo.sequenceNumber.toString());
      formData.append('timestamp', photo.timestamp.toString());
      formData.append('folderType', 'before-ai'); // Photos go to before-ai folder initially

      // Add location if available
      try {
        const location = await this.getCurrentLocation();
        if (location) {
          formData.append('location', JSON.stringify(location));
        }
      } catch (error) {
        console.warn('Failed to get location:', error);
      }

      // Add client metadata
      formData.append('clientMeta', JSON.stringify({
        userAgent: 'WakeSafe Mobile App',
        timestamp: Date.now(),
        captureType: 'continuous',
        sequenceNumber: photo.sequenceNumber,
      }));

      const result = await this.performUpload(formData, token);
      
      if (result.success) {
        this.uploadProgress.uploadedPhotos++;
        console.log(`Photo ${photo.sequenceNumber} uploaded successfully: ${result.gcsPath}`);
        this.onUploadComplete?.(result);
      } else {
        this.uploadProgress.failedPhotos++;
        console.error(`Photo ${photo.sequenceNumber} upload failed: ${result.error}`);
        this.onUploadError?.(result.error || 'Upload failed');
      }

      this.updateProgress();
    } catch (error) {
      this.uploadProgress.failedPhotos++;
      const errorMessage = `Upload error for photo ${photo.sequenceNumber}: ${error}`;
      console.error(errorMessage);
      this.onUploadError?.(errorMessage);
      this.updateProgress();
    }
  }

  private async performUpload(formData: FormData, token: string): Promise<UploadResult> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          console.log(`Upload progress: ${progress.toFixed(1)}%`);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          if (xhr.status === 200 || xhr.status === 201) {
            const response = JSON.parse(xhr.responseText);
            resolve({
              success: true,
              photoId: response.photoId,
              gcsPath: response.gcsPath,
              sequenceNumber: parseInt(formData.get('sequenceNumber') as string),
            });
          } else {
            const errorResponse = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            resolve({
              success: false,
              error: errorResponse.message || `Upload failed with status: ${xhr.status}`,
              sequenceNumber: parseInt(formData.get('sequenceNumber') as string),
            });
          }
        } catch (error) {
          resolve({
            success: false,
            error: `Failed to parse response: ${error}`,
            sequenceNumber: parseInt(formData.get('sequenceNumber') as string),
          });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during upload',
          sequenceNumber: parseInt(formData.get('sequenceNumber') as string),
        });
      });

      xhr.addEventListener('timeout', () => {
        resolve({
          success: false,
          error: 'Upload timeout',
          sequenceNumber: parseInt(formData.get('sequenceNumber') as string),
        });
      });

      xhr.open('POST', `${CONFIG.API_BASE_URL}/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 30000; // 30 second timeout
      xhr.send(formData);
    });
  }

  private async getCurrentLocation(): Promise<any> {
    try {
      // This is a simplified location request
      // In a real app, you'd use expo-location
      return {
        latitude: 32.0853,
        longitude: 34.7818,
        accuracy: 10,
        timestamp: Date.now(),
      };
    } catch (error) {
      return null;
    }
  }

  private updateProgress(): void {
    this.onProgress?.(this.uploadProgress);
  }

  setTotalPhotos(total: number): void {
    this.uploadProgress.totalPhotos = total;
    this.uploadProgress.uploadedPhotos = 0;
    this.uploadProgress.failedPhotos = 0;
  }

  getProgress(): UploadProgress {
    return { ...this.uploadProgress };
  }

  reset(): void {
    this.uploadProgress = {
      totalPhotos: 0,
      uploadedPhotos: 0,
      failedPhotos: 0,
    };
  }
}

export const photoUploadService = new PhotoUploadService();
