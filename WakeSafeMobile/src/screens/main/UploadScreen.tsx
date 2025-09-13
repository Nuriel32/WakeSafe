import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSession } from '../../hooks/useSession';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { cameraService, PhotoCaptureResult } from '../../services/cameraService';
import { photoUploadService, UploadProgress } from '../../services/photoUploadService';
import { websocketService, PhotoCaptureEvent } from '../../services/websocketService';

export const UploadScreen: React.FC = () => {
  const { currentSession, startSession, endSession, loading: sessionLoading } = useSession();
  const { token, user } = useAuth();
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  
  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<PhotoCaptureResult[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<Map<string, UploadProgress>>(new Map());
  
  // Camera ref
  const cameraRef = useRef<Camera>(null);
  const { width, height } = Dimensions.get('window');

  // Initialize camera service and WebSocket
  useEffect(() => {
    console.log('UploadScreen: Initializing camera service and WebSocket...');
    
    // Set camera ref when component mounts
    if (cameraRef.current) {
      console.log('UploadScreen: Camera ref found, setting in service');
      cameraService.setCameraRef(cameraRef.current);
    } else {
      console.log('UploadScreen: Camera ref not found yet');
    }
    
    cameraService.setCallbacks({
      onPhotoCaptured: handlePhotoCaptured,
      onError: handleCameraError,
      onStatusChange: setIsCapturing,
    });

    photoUploadService.setCallbacks({
      onUploadProgress: handleUploadProgress,
      onUploadCompleted: handleUploadCompleted,
      onUploadFailed: handleUploadFailed,
    });

    // Set up WebSocket handlers
    websocketService.setOnPhotoCaptureConfirmed(handlePhotoCaptureConfirmed);
    websocketService.setOnUploadNotification(handleUploadNotification);
    websocketService.setOnUploadProgress(handleWebSocketUploadProgress);
    websocketService.setOnUploadCompleted(handleWebSocketUploadCompleted);
    websocketService.setOnUploadFailed(handleWebSocketUploadFailed);

    return () => {
      console.log('UploadScreen: Cleaning up camera service...');
      cameraService.stopCapturing();
      photoUploadService.cancelAllUploads();
    };
  }, []);

  // Update camera ref when camera component mounts
  useEffect(() => {
    console.log('UploadScreen: Camera ref effect triggered, ref:', cameraRef.current);
    if (cameraRef.current) {
      console.log('UploadScreen: Setting camera ref in service');
      cameraService.setCameraRef(cameraRef.current);
    }
  }, [cameraRef.current]);

  // Check for existing session on mount and start camera if needed
  useEffect(() => {
    console.log('UploadScreen: Session effect triggered, currentSession:', currentSession);
    if (currentSession) {
      console.log('UploadScreen: Session found, setting active and starting camera');
      setIsSessionActive(true);
      // Start camera capture if session is active
      if (cameraRef.current) {
        console.log('UploadScreen: Camera ref available, starting capture');
        cameraService.startCapturing().then((started) => {
          if (started) {
            console.log('UploadScreen: Camera capture started for existing session');
          } else {
            console.log('UploadScreen: Failed to start camera capture for existing session');
          }
        });
      } else {
        console.log('UploadScreen: Camera ref not available yet');
      }
    } else {
      console.log('UploadScreen: No current session');
    }
  }, [currentSession]);

  const handlePhotoCaptured = async (photo: PhotoCaptureResult) => {
    console.log(`UploadScreen: Photo captured: #${photo.sequenceNumber}`);
    setCapturedPhotos(prev => [...prev, photo]);

    if (currentSession && token) {
      try {
        // Emit photo captured event via WebSocket
        console.log(`UploadScreen: Emitting photo_captured via WebSocket for photo #${photo.sequenceNumber}`);
        websocketService.emitPhotoCaptured({
          sequenceNumber: photo.sequenceNumber,
          timestamp: photo.timestamp,
          sessionId: currentSession.id,
        });

        // Upload photo to GCS
        console.log(`UploadScreen: Starting photo upload for photo #${photo.sequenceNumber}`);
        await photoUploadService.uploadPhoto(photo, currentSession.id, token);
      } catch (error) {
        console.error('UploadScreen: Photo upload failed:', error);
      }
    } else {
      console.log('UploadScreen: No session or token available for photo upload');
    }
  };

  const handleCameraError = (error: string) => {
    console.error('Camera error:', error);
    Alert.alert('Camera Error', error);
  };

  const handleUploadProgress = (progress: UploadProgress) => {
    setUploadStatuses(prev => new Map(prev.set(progress.photoId, progress)));
  };

  const handleUploadCompleted = (photoId: string, gcsPath: string) => {
    console.log(`Upload completed: ${photoId}`);
    setUploadStatuses(prev => {
      const newMap = new Map(prev);
      newMap.set(photoId, { photoId, progress: 100, status: 'completed' });
      return newMap;
    });
  };

  const handleUploadFailed = (photoId: string, error: string) => {
    console.error(`Upload failed: ${photoId} - ${error}`);
    setUploadStatuses(prev => {
      const newMap = new Map(prev);
      newMap.set(photoId, { photoId, progress: 0, status: 'failed', error });
      return newMap;
    });
  };

  // WebSocket event handlers
  const handlePhotoCaptureConfirmed = (event: PhotoCaptureEvent) => {
    console.log('UploadScreen: Photo capture confirmed via WebSocket:', event);
    // Update UI to show confirmation
  };

  const handleUploadNotification = (data: any) => {
    console.log('UploadScreen: Upload notification via WebSocket:', data);
    // Handle upload notifications from server
  };

  const handleWebSocketUploadProgress = (data: any) => {
    console.log('UploadScreen: Upload progress via WebSocket:', data);
    // Update upload progress from server
  };

  const handleWebSocketUploadCompleted = (data: any) => {
    console.log('UploadScreen: Upload completed via WebSocket:', data);
    // Handle upload completion from server
  };

  const handleWebSocketUploadFailed = (data: any) => {
    console.log('UploadScreen: Upload failed via WebSocket:', data);
    // Handle upload failure from server
  };

  const handleStartSession = async () => {
    try {
      console.log('UploadScreen: Starting new session...');
      const session = await startSession();
      
      if (session) {
        console.log('UploadScreen: Session started:', session.id);
        setIsSessionActive(true);
        
        // Connect WebSocket if not already connected
        if (token) {
          console.log('UploadScreen: Connecting WebSocket...');
          const connected = await websocketService.connect(token);
          if (connected) {
            console.log('UploadScreen: WebSocket connected successfully');
          } else {
            console.log('UploadScreen: WebSocket connection failed');
          }
        }
        
        // Check if camera ref is available
        if (cameraRef.current) {
          console.log('UploadScreen: Camera ref available, starting capture');
          const started = await cameraService.startCapturing();
          if (started) {
            console.log('UploadScreen: Camera capture started');
          } else {
            console.log('UploadScreen: Failed to start camera capture');
            Alert.alert('Error', 'Failed to start camera capture');
          }
        } else {
          console.log('UploadScreen: Camera ref not available, cannot start capture');
          Alert.alert('Error', 'Camera not ready. Please try again.');
        }
      }
    } catch (error) {
      console.error('UploadScreen: Failed to start session:', error);
      Alert.alert('Error', 'Failed to start session. Please try again.');
    }
  };

  const handleEndSession = async () => {
    try {
      if (currentSession) {
        console.log('Ending session:', currentSession.id);
        await endSession(currentSession.id);
        setIsSessionActive(false);
        cameraService.stopCapturing();
        setCapturedPhotos([]);
        setUploadStatuses(new Map());
        console.log('Session ended');
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      Alert.alert('Error', 'Failed to end session. Please try again.');
    }
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload photos.');
      return false;
    }
    return true;
  };

  const pickImages = async () => {
    try {
      console.log('Requesting media library permissions...');
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      console.log('Launching image library...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1080,
      });

      console.log('Image library result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = result.assets.map(asset => asset.uri);
        console.log('Images selected:', newImages);
        setSelectedImages(prev => [...prev, ...newImages]);
      } else {
        console.log('Image selection was canceled or no assets returned');
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Image Picker Error', 'Failed to pick images. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      console.log('Requesting camera permissions...');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      console.log('Camera permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
        return;
      }

      console.log('Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1080,
        allowsEditing: false,
        exif: false,
      });

      console.log('Camera result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log('Photo taken successfully:', result.assets[0].uri);
        setSelectedImages(prev => [...prev, result.assets[0].uri]);
      } else {
        console.log('Camera was canceled or no assets returned');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Camera Error', 'Failed to take photo. Please try again.');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async () => {
    if (!currentSession) {
      Alert.alert('No Active Session', 'Please start a session before uploading photos.');
      return;
    }

    if (selectedImages.length === 0) {
      Alert.alert('No Images', 'Please select images to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress({});

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const imageUri = selectedImages[i];
        await uploadSingleImage(imageUri, i);
      }

      Alert.alert('Success', 'All images uploaded successfully!');
      setSelectedImages([]);
      setUploadProgress({});
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const uploadSingleImage = async (imageUri: string, index: number) => {
    const formData = new FormData();
    
    // Create file object
    const file = {
      uri: imageUri,
      type: 'image/jpeg',
      name: `photo_${Date.now()}_${index}.jpg`,
    } as any;

    formData.append('photo', file);
    formData.append('sessionId', currentSession!._id);

    // Add location if available
    try {
      const location = await getCurrentLocation();
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
      fileSize: 0, // Will be set by the server
    }));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress(prev => ({ ...prev, [index]: progress }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', `${CONFIG.API_BASE_URL}/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await ImagePicker.requestLocationPermissionsAsync();
      if (status !== 'granted') {
        return null;
      }

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
  };

  const getTotalProgress = () => {
    if (selectedImages.length === 0) return 0;
    const totalProgress = Object.values(uploadProgress).reduce((sum, progress) => sum + progress, 0);
    return totalProgress / selectedImages.length;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Driver Session</Text>
          <Text style={styles.subtitle}>
            {isSessionActive ? 'Session Active - Monitoring' : 'No Active Session'}
          </Text>
        </View>

        {/* Session Status */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusIndicator, { backgroundColor: isSessionActive ? '#10b981' : '#ef4444' }]}>
            <Text style={styles.statusText}>
              {isSessionActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}
            </Text>
          </View>
          
          {isCapturing && (
            <View style={styles.captureIndicator}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.captureText}>Capturing photos every second...</Text>
            </View>
          )}
        </View>

        {/* Session Actions */}
        <View style={styles.actionsContainer}>
          {!isSessionActive ? (
            <TouchableOpacity 
              style={[styles.primaryButton, sessionLoading && styles.buttonDisabled]} 
              onPress={handleStartSession}
              disabled={sessionLoading}
            >
              {sessionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonIcon}>🚗</Text>
                  <Text style={styles.buttonText}>Start Session</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.dangerButton, sessionLoading && styles.buttonDisabled]} 
              onPress={handleEndSession}
              disabled={sessionLoading}
            >
              {sessionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonIcon}>⏹️</Text>
                  <Text style={styles.buttonText}>End Session</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Camera Preview */}
        {isSessionActive && (
          <View style={styles.cameraContainer}>
            <Text style={styles.cameraTitle}>Live Camera Feed</Text>
            <View style={styles.cameraWrapper}>
              <Camera
                ref={cameraRef}
                style={styles.camera}
                type={Camera.Constants.Type.front}
                ratio="16:9"
              />
            </View>
          </View>
        )}

        {/* Session Stats */}
        {isSessionActive && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>Session Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{capturedPhotos.length}</Text>
                <Text style={styles.statLabel}>Photos Captured</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {Array.from(uploadStatuses.values()).filter(s => s.status === 'completed').length}
                </Text>
                <Text style={styles.statLabel}>Uploaded</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {Array.from(uploadStatuses.values()).filter(s => s.status === 'failed').length}
                </Text>
                <Text style={styles.statLabel}>Failed</Text>
              </View>
            </View>
          </View>
        )}

        {/* Legacy Upload Actions (for testing) */}
        <View style={styles.legacyContainer}>
          <Text style={styles.legacyTitle}>Manual Upload (Testing)</Text>
          <View style={styles.legacyActions}>
            <TouchableOpacity style={styles.actionButton} onPress={pickImages}>
              <Text style={styles.actionIcon}>📁</Text>
              <Text style={styles.actionText}>Choose Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
              <Text style={styles.actionIcon}>📸</Text>
              <Text style={styles.actionText}>Take Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Images */}
        {selectedImages.length > 0 && (
          <View style={styles.imagesContainer}>
            <Text style={styles.imagesTitle}>Selected Images ({selectedImages.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selectedImages.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.selectedImage} />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(index)}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                  {uploadProgress[index] !== undefined && (
                    <View style={styles.progressOverlay}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${uploadProgress[index]}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.round(uploadProgress[index])}%
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Upload Progress */}
        {uploading && (
          <View style={styles.uploadProgressContainer}>
            <Text style={styles.uploadProgressTitle}>Uploading...</Text>
            <View style={styles.uploadProgressBar}>
              <View
                style={[
                  styles.uploadProgressFill,
                  { width: `${getTotalProgress()}%` },
                ]}
              />
            </View>
            <Text style={styles.uploadProgressText}>
              {Math.round(getTotalProgress())}% Complete
            </Text>
          </View>
        )}

        {/* Upload Button */}
        {selectedImages.length > 0 && !uploading && (
          <TouchableOpacity
            style={[
              styles.uploadButton,
              !currentSession && styles.uploadButtonDisabled,
            ]}
            onPress={uploadImages}
            disabled={!currentSession}
          >
            <Text style={styles.uploadButtonText}>
              Upload {selectedImages.length} Photo{selectedImages.length > 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}

        {/* Uploading State */}
        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.uploadingText}>Uploading photos...</Text>
          </View>
        )}

        {/* No Session Warning */}
        {!currentSession && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              Please start a session from the Dashboard to upload photos.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 120,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  imagesContainer: {
    marginBottom: 30,
  },
  imagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 15,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 15,
  },
  selectedImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 5,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
  },
  progressText: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
  },
  uploadProgressContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  uploadProgressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  uploadProgressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginBottom: 10,
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  uploadProgressText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  uploadButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  uploadingText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 15,
  },
  warningContainer: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
  },
  // New session styles
  statusContainer: {
    marginBottom: 20,
  },
  statusIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  captureIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  captureText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cameraContainer: {
    marginBottom: 20,
  },
  cameraTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  cameraWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  camera: {
    width: '100%',
    height: 200,
  },
  statsContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  legacyContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  legacyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 12,
  },
  legacyActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
