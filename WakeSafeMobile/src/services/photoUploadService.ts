import { CONFIG } from '../config';
import { PhotoCaptureResult } from './cameraService';

export interface PresignedUrlResponse {
  presignedUrl: string;
  photoId: string;
  gcsPath: string;
  fileName: string;
  contentType: string;
  uploadInfo: {
    sequenceNumber: number;
    captureTimestamp: number;
    folderType: string;
  };
  expiresIn: number;
}

export interface UploadProgress {
  photoId: string;
  progress: number;
  status: 'uploading' | 'completed' | 'failed';
  error?: string;
}

class PhotoUploadService {
  private uploadQueue: Map<string, PhotoCaptureResult> = new Map();
  private activeUploads: Map<string, AbortController> = new Map();
  private uploadProgress: Map<string, UploadProgress> = new Map();

  // Callbacks
  private onUploadProgress?: (progress: UploadProgress) => void;
  private onUploadCompleted?: (photoId: string, gcsPath: string) => void;
  private onUploadFailed?: (photoId: string, error: string) => void;

  setCallbacks(callbacks: {
    onUploadProgress?: (progress: UploadProgress) => void;
    onUploadCompleted?: (photoId: string, gcsPath: string) => void;
    onUploadFailed?: (photoId: string, error: string) => void;
  }) {
    this.onUploadProgress = callbacks.onUploadProgress;
    this.onUploadCompleted = callbacks.onUploadCompleted;
    this.onUploadFailed = callbacks.onUploadFailed;
  }

  async uploadPhoto(
    photo: PhotoCaptureResult,
    sessionId: string,
    token: string,
    location?: { latitude: number; longitude: number }
  ): Promise<void> {
    try {
      console.log(`Starting upload for photo #${photo.sequenceNumber}`);

      // Generate unique filename
      const timestamp = photo.timestamp;
      const sequenceNumber = photo.sequenceNumber;
      const random = Math.random().toString(36).substring(2, 8);
      const fileName = `photo_${sequenceNumber.toString().padStart(6, '0')}_${timestamp}_${random}.jpg`;

      // Request presigned URL
      const presignedData = await this.getPresignedUrl(
        fileName,
        sessionId,
        sequenceNumber,
        timestamp,
        location,
        token
      );

      console.log(`Presigned URL received for photo #${photo.sequenceNumber}`);

      // Upload photo to GCS using presigned URL
      await this.uploadToGCS(photo.uri, presignedData, photo.sequenceNumber);

      // Confirm upload to server
      await this.confirmUpload(presignedData.photoId, true, token);

      console.log(`Photo #${photo.sequenceNumber} uploaded successfully`);

    } catch (error) {
      console.error(`Upload failed for photo #${photo.sequenceNumber}:`, error);
      this.onUploadFailed?.(photo.sequenceNumber.toString(), error instanceof Error ? error.message : 'Upload failed');
    }
  }

  private async getPresignedUrl(
    fileName: string,
    sessionId: string,
    sequenceNumber: number,
    timestamp: number,
    location?: { latitude: number; longitude: number },
    token?: string
  ): Promise<PresignedUrlResponse> {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/upload/presigned`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          sessionId,
          sequenceNumber,
          timestamp,
          location: location ? JSON.stringify(location) : null,
          clientMeta: JSON.stringify({
            deviceType: 'mobile',
            appVersion: '1.0.0',
            platform: 'react-native',
          }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get presigned URL');
      }

      return await response.json();
    } catch (error) {
      console.error('Presigned URL request failed:', error);
      throw error;
    }
  }

  private async uploadToGCS(
    photoUri: string,
    presignedData: PresignedUrlResponse,
    sequenceNumber: number
  ): Promise<void> {
    try {
      // Create abort controller for this upload
      const abortController = new AbortController();
      this.activeUploads.set(sequenceNumber.toString(), abortController);

      // Read photo as blob
      const response = await fetch(photoUri);
      const blob = await response.blob();

      // Upload to GCS
      const uploadResponse = await fetch(presignedData.presignedUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': presignedData.contentType,
        },
        signal: abortController.signal,
      });

      if (!uploadResponse.ok) {
        throw new Error(`GCS upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      console.log(`Photo #${sequenceNumber} uploaded to GCS successfully`);
      this.activeUploads.delete(sequenceNumber.toString());

    } catch (error) {
      this.activeUploads.delete(sequenceNumber.toString());
      throw error;
    }
  }

  private async confirmUpload(
    photoId: string,
    success: boolean,
    token?: string
  ): Promise<void> {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/upload/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photoId,
          uploadSuccess: success,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm upload');
      }

      const result = await response.json();
      console.log('Upload confirmed:', result);

    } catch (error) {
      console.error('Upload confirmation failed:', error);
      throw error;
    }
  }

  cancelUpload(sequenceNumber: number) {
    const abortController = this.activeUploads.get(sequenceNumber.toString());
    if (abortController) {
      abortController.abort();
      this.activeUploads.delete(sequenceNumber.toString());
    }
  }

  cancelAllUploads() {
    this.activeUploads.forEach((controller) => {
      controller.abort();
    });
    this.activeUploads.clear();
  }

  getUploadStatus(sequenceNumber: number): UploadProgress | undefined {
    return this.uploadProgress.get(sequenceNumber.toString());
  }

  getAllUploadStatuses(): UploadProgress[] {
    return Array.from(this.uploadProgress.values());
  }

  reset() {
    this.uploadQueue.clear();
    this.cancelAllUploads();
    this.uploadProgress.clear();
    console.log('Photo upload service reset');
  }
}

export const photoUploadService = new PhotoUploadService();