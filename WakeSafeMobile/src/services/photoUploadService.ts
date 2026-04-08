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

      if (this.isLocalApi()) {
        await this.uploadDirectToBackend(photo, sessionId, token, location);
      } else {
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
      }

      console.log(`Photo #${photo.sequenceNumber} uploaded successfully`);

    } catch (error) {
      console.error(`Upload failed for photo #${photo.sequenceNumber}:`, error);
      this.onUploadFailed?.(photo.sequenceNumber.toString(), error instanceof Error ? error.message : 'Upload failed');
    }
  }

  private isLocalApi(): boolean {
    const url = CONFIG.API_BASE_URL || '';
    return /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url);
  }

  private async uploadDirectToBackend(
    photo: PhotoCaptureResult,
    sessionId: string,
    token: string,
    location?: { latitude: number; longitude: number }
  ): Promise<void> {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('sequenceNumber', String(photo.sequenceNumber));
    formData.append('timestamp', String(photo.timestamp));
    if (location) {
      formData.append('location', JSON.stringify(location));
    }
    formData.append(
      'clientMeta',
      JSON.stringify({
        deviceType: 'mobile',
        appVersion: '1.0.0',
        platform: 'react-native',
      })
    );
    formData.append('folderType', 'before-ai');
    formData.append('photo', {
      uri: photo.uri,
      name: `photo_${photo.sequenceNumber}.jpg`,
      type: 'image/jpeg',
    } as any);

    const response = await fetch(`${CONFIG.API_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Local upload failed');
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      console.log(`📡 Requesting presigned URL for photo #${sequenceNumber}:`, {
        fileName,
        sessionId,
        sequenceNumber,
        timestamp,
        hasLocation: !!location,
        hasToken: !!token
      });

      const requestBody = {
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
      };
      let response: Response | null = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        response = await fetch(`${CONFIG.API_BASE_URL}/upload/presigned`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.status !== 429) break;

        let retryAfterSec = 2;
        try {
          const retryPayload = await response.clone().json();
          retryAfterSec = Number(retryPayload?.retryAfter || retryAfterSec);
        } catch {}

        if (attempt < maxAttempts) {
          console.warn(`Presigned URL throttled (429). Retrying in ${retryAfterSec}s (attempt ${attempt}/${maxAttempts})`);
          await this.sleep(retryAfterSec * 1000);
        }
      }

      console.log(`📡 Presigned URL response status: ${response?.status}`);

      if (!response || !response.ok) {
        const errorData = response ? await response.json() : { error: 'No response from server' };
        console.error(`❌ Presigned URL request failed:`, errorData);
        throw new Error(errorData.error || 'Failed to get presigned URL');
      }

      const data = await response.json();
      console.log(`✅ Received presigned URL for photo #${sequenceNumber}:`, {
        photoId: data.photoId,
        fileName: data.fileName,
        gcsPath: data.gcsPath,
        expiresIn: data.expiresIn,
        hasPresignedUrl: !!data.presignedUrl
      });
      
      return data;
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
      console.log(`🚀 Starting GCS upload for photo #${sequenceNumber}:`, {
        photoUri: photoUri.substring(0, 50) + '...',
        gcsPath: presignedData.gcsPath,
        contentType: presignedData.contentType,
        presignedUrl: presignedData.presignedUrl.substring(0, 100) + '...'
      });

      // Create abort controller for this upload
      const abortController = new AbortController();
      this.activeUploads.set(sequenceNumber.toString(), abortController);

      // Read photo as blob
      console.log(`📖 Reading photo file as blob...`);
      const response = await fetch(photoUri);
      const blob = await response.blob();
      console.log(`📦 Photo blob size: ${blob.size} bytes`);

      // Upload to GCS
      console.log(`☁️ Uploading to GCS...`);
      const uploadResponse = await fetch(presignedData.presignedUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': presignedData.contentType,
        },
        signal: abortController.signal,
      });

      console.log(`☁️ GCS upload response status: ${uploadResponse.status}`);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`❌ GCS upload failed:`, {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          error: errorText
        });
        throw new Error(`GCS upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      console.log(`✅ Photo #${sequenceNumber} uploaded to GCS successfully!`);
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
      console.log(`📤 Confirming upload to server:`, {
        photoId,
        success,
        hasToken: !!token
      });

      let response: Response | null = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        response = await fetch(`${CONFIG.API_BASE_URL}/upload/confirm`, {
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

        if (response.status !== 429) break;

        let retryAfterSec = 2;
        try {
          const retryPayload = await response.clone().json();
          retryAfterSec = Number(retryPayload?.retryAfter || retryAfterSec);
        } catch {}

        if (attempt < maxAttempts) {
          console.warn(`Upload confirm throttled (429). Retrying in ${retryAfterSec}s (attempt ${attempt}/${maxAttempts})`);
          await this.sleep(retryAfterSec * 1000);
        }
      }

      console.log(`📤 Upload confirmation response status: ${response?.status}`);

      if (!response || !response.ok) {
        const errorData = response ? await response.json() : { error: 'No response from server' };
        console.error(`❌ Upload confirmation failed:`, errorData);
        throw new Error(errorData.error || 'Failed to confirm upload');
      }

      const result = await response.json();
      console.log(`✅ Upload confirmed successfully:`, result);

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
