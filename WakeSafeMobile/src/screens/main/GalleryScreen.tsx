import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { Photo } from '../../types';

export const GalleryScreen: React.FC = () => {
  const { currentSession } = useSession();
  const { token } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPhotos = async () => {
    if (!currentSession) {
      setPhotos([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${CONFIG.API_BASE_URL}/photos/session/${currentSession._id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const sessionPhotos = await response.json();
        setPhotos(sessionPhotos);
      } else {
        throw new Error('Failed to load photos');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'processing':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Processed';
      case 'processing':
        return 'Processing';
      case 'error':
        return 'Error';
      default:
        return 'Pending';
    }
  };

  const getPredictionColor = (prediction: string) => {
    switch (prediction) {
      case 'alert':
        return '#ef4444';
      case 'normal':
        return '#10b981';
      case 'error':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const getPredictionText = (prediction: string) => {
    switch (prediction) {
      case 'alert':
        return 'Fatigue Detected';
      case 'normal':
        return 'Normal';
      case 'error':
        return 'Analysis Error';
      default:
        return 'Pending';
    }
  };

  const renderPhotoItem = ({ item }: { item: Photo }) => (
    <View style={styles.photoCard}>
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: item.gcsPath }}
          style={styles.photo}
          onError={() => {
            // Handle image load error
          }}
        />
        <View style={styles.photoOverlay}>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.aiProcessingStatus) },
              ]}
            />
            <Text style={styles.statusText}>
              {getStatusText(item.aiProcessingStatus)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.photoInfo}>
        <Text style={styles.photoName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.photoDate}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>

        <View style={styles.predictionContainer}>
          <View
            style={[
              styles.predictionBadge,
              { backgroundColor: getPredictionColor(item.prediction) },
            ]}
          >
            <Text style={styles.predictionText}>
              {getPredictionText(item.prediction)}
            </Text>
          </View>
        </View>

        {item.location && (
          <View style={styles.locationContainer}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationText}>
              {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📸</Text>
      <Text style={styles.emptyTitle}>No Photos Yet</Text>
      <Text style={styles.emptyText}>
        {currentSession
          ? 'Start uploading photos to see them here'
          : 'Start a session and upload photos to see them here'}
      </Text>
    </View>
  );

  useEffect(() => {
    loadPhotos();
  }, [currentSession]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Photo Gallery</Text>
        <Text style={styles.subtitle}>
          {currentSession ? `${photos.length} photos in current session` : 'No active session'}
        </Text>
      </View>

      {!currentSession ? (
        <View style={styles.noSessionContainer}>
          <Text style={styles.noSessionIcon}>🚗</Text>
          <Text style={styles.noSessionTitle}>No Active Session</Text>
          <Text style={styles.noSessionText}>
            Start a session from the Dashboard to view and upload photos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhotoItem}
          keyExtractor={(item) => item._id}
          numColumns={2}
          contentContainerStyle={styles.photoList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
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
  photoList: {
    padding: 10,
    paddingBottom: 20,
  },
  photoCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  photoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  photoInfo: {
    padding: 12,
  },
  photoName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  photoDate: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  predictionContainer: {
    marginBottom: 8,
  },
  predictionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  predictionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  locationText: {
    fontSize: 10,
    color: '#64748b',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  noSessionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noSessionIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  noSessionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  noSessionText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
