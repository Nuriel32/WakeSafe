import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { Photo } from '../../types';
import { useToast } from '../../components/feedback/ToastProvider';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Skeleton } from '../../components/feedback/Skeleton';
import { colors } from '../../theme/tokens';

export const GalleryScreen: React.FC = () => {
  const { currentSession } = useSession();
  const { token } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();

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
        const payload = await response.json();
        const sessionPhotos = Array.isArray(payload) ? payload : (payload?.photos || []);
        setPhotos(sessionPhotos);
      } else {
        throw new Error('Failed to load photos');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to load photos', 'error');
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

  const renderPhotoItem = useCallback(({ item }: { item: Photo }) => (
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
  ), []);

  const renderEmptyState = () => (
    <EmptyState
      icon="📸"
      title="No photos yet"
      description={currentSession ? 'Start uploading photos to see them here.' : 'Start a session to begin.'}
    />
  );

  const renderLoadingState = () => (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonCard}>
          <Skeleton height={150} radius={12} />
          <View style={styles.skeletonContent}>
            <Skeleton width="70%" />
            <Skeleton width="45%" />
            <Skeleton width="55%" height={12} />
          </View>
        </View>
      ))}
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
        <EmptyState
          icon="🚗"
          title="No active session"
          description="Start a session from Dashboard to view uploaded photos."
        />
      ) : (
        loading ? (
          renderLoadingState()
        ) : (
        <FlatList
          data={photos}
          renderItem={renderPhotoItem}
          keyExtractor={(item) => item._id}
          initialNumToRender={8}
          windowSize={7}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          numColumns={2}
          contentContainerStyle={styles.photoList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
        )
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  skeletonCard: {
    width: '48%',
    margin: '1%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingBottom: 10,
  },
  skeletonContent: {
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
});
