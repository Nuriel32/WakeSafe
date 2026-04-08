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
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { Photo } from '../../types';
import { useToast } from '../../components/feedback/ToastProvider';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Skeleton } from '../../components/feedback/Skeleton';
import { colors } from '../../theme/tokens';

interface SleepingRide {
  ride: {
    _id: string;
    sessionId?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
    isActive?: boolean;
  };
  sleepingPhotoCount: number;
  photos: Array<Photo & { fileUrl?: string }>;
}

interface DateFolder {
  dateKey: string;
  displayDate: string;
  photos: Array<Photo & { fileUrl?: string }>;
}

export const GalleryScreen: React.FC = () => {
  const { token } = useAuth();
  const [folders, setFolders] = useState<DateFolder[]>([]);
  const [totalSleepingPhotos, setTotalSleepingPhotos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();

  const toDateKey = (value?: string) => {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toDisplayDate = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const buildDateFolders = (sleepingRides: SleepingRide[]): DateFolder[] => {
    const grouped = new Map<string, Array<Photo & { fileUrl?: string }>>();
    for (const ride of sleepingRides) {
      for (const photo of ride.photos || []) {
        const dateKey = toDateKey(photo.createdAt);
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, []);
        }
        grouped.get(dateKey)?.push(photo);
      }
    }

    return Array.from(grouped.entries())
      .map(([dateKey, photos]) => ({
        dateKey,
        displayDate: toDisplayDate(dateKey),
        photos: photos.sort((a, b) => {
          const aTs = new Date(a.createdAt).getTime();
          const bTs = new Date(b.createdAt).getTime();
          return bTs - aTs;
        }),
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  };

  const loadSleepingGallery = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${CONFIG.API_BASE_URL}/photos/gallery/sleeping-rides?maxRides=30&maxPhotosPerRide=40`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const payload = await response.json();
        const nextRides = Array.isArray(payload?.rides) ? payload.rides : [];
        setFolders(buildDateFolders(nextRides));
        setTotalSleepingPhotos(Number(payload?.totalSleepingPhotos || 0));
      } else {
        throw new Error('Failed to load sleeping gallery');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to load sleeping gallery', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSleepingGallery();
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
      case 'sleeping':
        return '#ef4444';
      case 'drowsy':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const getPredictionText = (prediction: string) => {
    switch (prediction) {
      case 'sleeping':
        return 'Sleeping';
      case 'drowsy':
        return 'Drowsy';
      default:
        return 'Pending';
    }
  };

  const getLocationText = (item: Photo) => {
    const lat = item?.location && (item.location as any).lat != null
      ? Number((item.location as any).lat)
      : item?.location?.latitude;
    const lng = item?.location && (item.location as any).lng != null
      ? Number((item.location as any).lng)
      : item?.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    return null;
  };

  const renderPhotoItem = useCallback(({ item }: { item: Photo & { fileUrl?: string } }) => (
    <View style={styles.photoCard}>
      <View style={styles.photoContainer}>
        <Image
          source={{ uri: item.fileUrl || item.gcsPath }}
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

        {getLocationText(item) && (
          <View style={styles.locationContainer}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationText}>
              {getLocationText(item)}
            </Text>
          </View>
        )}
      </View>
    </View>
  ), []);

  const renderEmptyState = () => (
    <EmptyState
      icon="📸"
      title="No sleeping photos yet"
      description="Photos will appear here only when prediction is sleeping."
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

  const renderFolder = ({ item }: { item: DateFolder }) => (
    <View style={styles.rideSection}>
      <View style={styles.rideHeader}>
        <Text style={styles.rideTitle}>
          {item.displayDate}
        </Text>
        <Text style={styles.rideSubtitle}>
          {item.photos.length} sleeping photo{item.photos.length === 1 ? '' : 's'}
        </Text>
      </View>
      <FlatList
        horizontal
        data={item.photos}
        keyExtractor={(photo) => photo._id}
        renderItem={renderPhotoItem}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );

  useEffect(() => {
    loadSleepingGallery();
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Photo Gallery</Text>
        <Text style={styles.subtitle}>
          {folders.length > 0
            ? `${totalSleepingPhotos} sleeping photos in ${folders.length} date folders`
            : 'No sleeping captures found'}
        </Text>
      </View>

      {loading ? (
          renderLoadingState()
        ) : (
        <FlatList
          data={folders}
          renderItem={renderFolder}
          keyExtractor={(item) => item.dateKey}
          initialNumToRender={5}
          windowSize={7}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          contentContainerStyle={styles.photoList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
        )
      }
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
  rideSection: {
    marginBottom: 14,
  },
  rideHeader: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  rideTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  rideSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  photoCard: {
    width: 170,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginRight: 10,
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
    width: 170,
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
