import * as ImagePicker from 'expo-image-picker';
import { CONFIG } from '../config';

export interface PhotoCaptureResult {
  success: boolean;
  uri?: string;
  error?: string;
  timestamp: number;
}

export interface SessionPhotoData {
  uri: string;
  timestamp: number;
  sessionId: string;
  userId: string;
  sequenceNumber: number;
}

class CameraService {
  private isCapturing = false;
  private captureInterval: NodeJS.Timeout | null = null;
  private sequenceNumber = 0;
  private onPhotoCaptured?: (photo: SessionPhotoData) => void;
  private onError?: (error: string) => void;

  async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  async startContinuousCapture(
    sessionId: string,
    userId: string,
    onPhotoCaptured: (photo: SessionPhotoData) => void,
    onError: (error: string) => void
  ): Promise<boolean> {
    if (this.isCapturing) {
      console.warn('Camera capture is already running');
      return false;
    }

    const hasPermission = await this.requestCameraPermissions();
    if (!hasPermission) {
      onError('Camera permission not granted');
      return false;
    }

    this.isCapturing = true;
    this.sequenceNumber = 0;
    this.onPhotoCaptured = onPhotoCaptured;
    this.onError = onError;

    console.log('Starting continuous camera capture - 1 photo per second');

    // Start capturing immediately
    this.capturePhoto(sessionId, userId);

    // Set up interval for 1 photo per second (1000ms)
    this.captureInterval = setInterval(() => {
      this.capturePhoto(sessionId, userId);
    }, 1000);

    return true;
  }

  stopContinuousCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    console.log('Stopping continuous camera capture');
    this.isCapturing = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    this.onPhotoCaptured = undefined;
    this.onError = undefined;
  }

  private async capturePhoto(sessionId: string, userId: string): Promise<void> {
    if (!this.isCapturing) {
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7, // Reduced quality for faster processing
        maxWidth: 1280, // Reduced resolution for faster uploads
        maxHeight: 720,
        exif: false,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photo: SessionPhotoData = {
          uri: result.assets[0].uri,
          timestamp: Date.now(),
          sessionId,
          userId,
          sequenceNumber: this.sequenceNumber++,
        };

        console.log(`Photo captured: sequence ${photo.sequenceNumber}, timestamp: ${photo.timestamp}`);
        this.onPhotoCaptured?.(photo);
      } else {
        console.warn('Camera capture was canceled or failed');
        this.onError?.('Camera capture failed');
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      this.onError?.(`Camera error: ${error}`);
    }
  }

  isCurrentlyCapturing(): boolean {
    return this.isCapturing;
  }

  getSequenceNumber(): number {
    return this.sequenceNumber;
  }
}

export const cameraService = new CameraService();
