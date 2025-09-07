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

  private async performUpload(photo: SessionPhotoData, token: string): Promise<UploadResult> {
    try {
      // Step 1: Get presigned URL from backend
      console.log('Getting presigned URL for upload...');
      const presignedResponse = await fetch(`${CONFIG.API_BASE_URL}/upload/presigned`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: `photo_${photo.sequenceNumber.toString().padStart(6, '0')}_${photo.timestamp}.jpg`,
          sessionId: photo.sessionId,
          sequenceNumber: photo.sequenceNumber,
          timestamp: photo.timestamp,
          location: await this.getCurrentLocation(),
          clientMeta: {
            userAgent: 'WakeSafe Mobile App',
            timestamp: Date.now(),
            captureType: 'continuous',
            sequenceNumber: photo.sequenceNumber,
          }
        })
      });

      if (!presignedResponse.ok) {
        throw new Error(`Failed to get presigned URL: ${presignedResponse.status}`);
      }

      const presignedData = await presignedResponse.json();
      console.log('Presigned URL received:', presignedData.presignedUrl);

      // Step 2: Upload directly to GCS using presigned URL
      console.log('Uploading to GCS...');
      const uploadResponse = await this.uploadToGCS(photo.uri, presignedData, token);

      if (uploadResponse.success) {
        // Step 3: Confirm upload with backend
        console.log('Confirming upload with backend...');
        const confirmResponse = await fetch(`${CONFIG.API_BASE_URL}/upload/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            photoId: presignedData.photoId,
            uploadSuccess: true
          })
        });

        if (confirmResponse.ok) {
          const confirmData = await confirmResponse.json();
          console.log('Upload confirmed, AI processing queued:', confirmData.aiProcessingQueued);
        }
      }

      return uploadResponse;
    } catch (error) {
      console.error('Upload process failed:', error);
      return {
        success: false,
        error: `Upload failed: ${error}`,
        sequenceNumber: photo.sequenceNumber,
      };
    }
  }

  private async uploadToGCS(uri: string, presignedData: any, token: string): Promise<UploadResult> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          console.log(`GCS Upload progress: ${progress.toFixed(1)}%`);
          this.onProgress?.({
            totalPhotos: 1,
            uploadedPhotos: 0,
            failedPhotos: 0,
            currentPhoto: progress
          });
        }
      });

      xhr.addEventListener('load', () => {
        try {
          if (xhr.status === 200 || xhr.status === 201) {
            resolve({
              success: true,
              photoId: presignedData.photoId,
              gcsPath: presignedData.gcsPath,
              sequenceNumber: presignedData.uploadInfo.sequenceNumber,
            });
          } else {
            resolve({
              success: false,
              error: `GCS upload failed with status: ${xhr.status}`,
              sequenceNumber: presignedData.uploadInfo.sequenceNumber,
            });
          }
        } catch (error) {
          resolve({
            success: false,
            error: `Failed to parse GCS response: ${error}`,
            sequenceNumber: presignedData.uploadInfo.sequenceNumber,
          });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during GCS upload',
          sequenceNumber: presignedData.uploadInfo.sequenceNumber,
        });
      });

      xhr.addEventListener('timeout', () => {
        resolve({
          success: false,
          error: 'GCS upload timeout',
          sequenceNumber: presignedData.uploadInfo.sequenceNumber,
        });
      });

      // Create FormData for GCS upload
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        type: presignedData.contentType,
        name: presignedData.fileName,
      } as any);

      xhr.open('PUT', presignedData.presignedUrl);
      xhr.setRequestHeader('Content-Type', presignedData.contentType);
      xhr.timeout = 60000; // 60 second timeout for GCS
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
