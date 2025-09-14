import { CameraView, Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';

export interface PhotoCaptureResult {
  uri: string;
  width: number;
  height: number;
  timestamp: number;
  sequenceNumber: number;
}

export interface CameraServiceConfig {
  quality: number;
  intervalMs: number;
  maxWidth: number;
  maxHeight: number;
}

class CameraService {
  private cameraRef: CameraView | null = null;
  private isCapturing = false;
  private captureInterval: NodeJS.Timeout | null = null;
  private sequenceNumber = 0;
  private config: CameraServiceConfig = {
    quality: 0.8,
    intervalMs: 5000, // 5 seconds
    maxWidth: 1920,
    maxHeight: 1080,
  };

  // Callbacks
  private onPhotoCaptured?: (photo: PhotoCaptureResult) => void;
  private onError?: (error: string) => void;
  private onStatusChange?: (isCapturing: boolean) => void;

  setCameraRef(ref: CameraView | null) {
    console.log('CameraService: Setting camera ref:', ref);
    this.cameraRef = ref;
  }

  setConfig(config: Partial<CameraServiceConfig>) {
    this.config = { ...this.config, ...config };
  }

  setCallbacks(callbacks: {
    onPhotoCaptured?: (photo: PhotoCaptureResult) => void;
    onError?: (error: string) => void;
    onStatusChange?: (isCapturing: boolean) => void;
  }) {
    this.onPhotoCaptured = callbacks.onPhotoCaptured;
    this.onError = callbacks.onError;
    this.onStatusChange = callbacks.onStatusChange;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      console.log('CameraService: Requesting camera permissions...');
      const { status } = await Camera.requestCameraPermissionsAsync();
      const granted = status === 'granted';
      console.log('CameraService: Permission request result:', { status, granted });
      
      if (!granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please grant camera permissions to start the session and capture photos for fatigue detection.'
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      this.onError?.('Failed to request camera permissions');
      return false;
    }
  }

  async startCapturing(): Promise<boolean> {
    try {
      console.log('CameraService: startCapturing called');
      console.log('CameraService: isCapturing:', this.isCapturing);
      console.log('CameraService: cameraRef:', this.cameraRef);
      
      if (this.isCapturing) {
        console.log('CameraService: Camera is already capturing');
        return true;
      }

      if (!this.cameraRef) {
        console.log('CameraService: Camera not initialized');
        this.onError?.('Camera not initialized');
        return false;
      }

      console.log('CameraService: Requesting permissions...');
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('CameraService: Permission denied');
        return false;
      }

      console.log('CameraService: Setting up capture state...');
      this.isCapturing = true;
      this.sequenceNumber = 0;
      this.onStatusChange?.(true);

      console.log('CameraService: Starting continuous photo capture...');
      console.log(`CameraService: Capture interval: ${this.config.intervalMs}ms`);

      // Start capturing immediately
      console.log('CameraService: Taking first photo...');
      await this.capturePhoto();

      // Set up interval for continuous capture
      console.log('CameraService: Setting up capture interval...');
      this.captureInterval = setInterval(async () => {
        if (this.isCapturing) {
          await this.capturePhoto();
        }
      }, this.config.intervalMs);

      console.log('CameraService: Capture started successfully');
      return true;
    } catch (error) {
      console.error('CameraService: Start capturing error:', error);
      this.onError?.('Failed to start photo capture');
      this.isCapturing = false;
      this.onStatusChange?.(false);
      return false;
    }
  }

  stopCapturing() {
    console.log('Stopping continuous photo capture...');
    
    this.isCapturing = false;
    this.onStatusChange?.(false);

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    console.log('Photo capture stopped');
  }

  private async capturePhoto(): Promise<void> {
    console.log('CameraService: capturePhoto called');
    console.log('CameraService: cameraRef:', !!this.cameraRef);
    console.log('CameraService: isCapturing:', this.isCapturing);
    
    if (!this.cameraRef || !this.isCapturing) {
      console.log('CameraService: Skipping capture - no ref or not capturing');
      return;
    }

    try {
      this.sequenceNumber++;
      const timestamp = Date.now();

      console.log(`CameraService: Capturing photo #${this.sequenceNumber} at ${new Date(timestamp).toISOString()}`);

      // Take photo
      console.log('CameraService: Calling takePictureAsync...');
      const photo = await this.cameraRef.takePictureAsync({
        quality: this.config.quality,
        base64: false,
        skipProcessing: false,
      });

      console.log('CameraService: Photo taken, processing...');
      // Resize and optimize the photo
      const manipulatedPhoto = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          {
            resize: {
              width: this.config.maxWidth,
              height: this.config.maxHeight,
            },
          },
        ],
        {
          compress: this.config.quality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const result: PhotoCaptureResult = {
        uri: manipulatedPhoto.uri,
        width: manipulatedPhoto.width,
        height: manipulatedPhoto.height,
        timestamp,
        sequenceNumber: this.sequenceNumber,
      };

      console.log(`CameraService: Photo captured successfully: ${result.uri}`);
      this.onPhotoCaptured?.(result);

    } catch (error) {
      console.error('CameraService: Photo capture error:', error);
      this.onError?.(`Failed to capture photo #${this.sequenceNumber}`);
    }
  }

  getStatus() {
    return {
      isCapturing: this.isCapturing,
      sequenceNumber: this.sequenceNumber,
      config: this.config,
    };
  }
}

export const cameraService = new CameraService();
