import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useSession } from '../../hooks/useSession';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';

export const UploadScreen: React.FC = () => {
  const { currentSession } = useSession();
  const { token } = useAuth();
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload photos.');
      return false;
    }
    return true;
  };

  const pickImages = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1080,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...newImages]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1080,
    });

    if (!result.canceled) {
      setSelectedImages(prev => [...prev, result.assets[0].uri]);
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
          <Text style={styles.title}>Photo Upload</Text>
          <Text style={styles.subtitle}>
            {currentSession ? 'Active Session' : 'No Active Session'}
          </Text>
        </View>

        {/* Upload Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={pickImages}>
            <Text style={styles.actionIcon}>📁</Text>
            <Text style={styles.actionText}>Choose Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <Text style={styles.actionIcon}>📸</Text>
            <Text style={styles.actionText}>Take Photo</Text>
          </TouchableOpacity>
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
});
