import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useSession } from '../../hooks/useSession';
import { CONFIG } from '../../config';
import { spotifyService } from '../../services/spotifyService';
import { useToast } from '../../components/feedback/ToastProvider';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Skeleton } from '../../components/feedback/Skeleton';

export const ProfileScreen: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { showToast } = useToast();
  const { sessionHistory } = useSession();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    carNumber: user?.carNumber || '',
  });
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyProfile, setSpotifyProfile] = useState<any>(null);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<any[]>([]);
  const [currentPlayback, setCurrentPlayback] = useState<any>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        carNumber: user.carNumber,
      });
    }
  }, [user]);

  const loadSpotifyData = async () => {
    if (!token) return;
    setSpotifyLoading(true);
    try {
      const status = await spotifyService.getStatus(token);
      setSpotifyConnected(status.isConnected);
      if (!status.isConnected) {
        setSpotifyProfile(null);
        setPlaylists([]);
        setCurrentPlayback(null);
        return;
      }
      const [profile, playlistsRes, playback] = await Promise.all([
        spotifyService.getMe(token),
        spotifyService.getPlaylists(token),
        spotifyService.getCurrentPlayback(token)
      ]);
      setSpotifyProfile(profile);
      setPlaylists(playlistsRes.items || []);
      setCurrentPlayback(playback || null);
    } catch (error: any) {
      showToast(error.message || 'Failed to load Spotify data', 'error');
    } finally {
      setSpotifyLoading(false);
    }
  };

  useEffect(() => {
    loadSpotifyData();
  }, [token]);

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.firstName.trim()) {
      showToast('First name is required', 'error');
      return false;
    }
    if (!formData.lastName.trim()) {
      showToast('Last name is required', 'error');
      return false;
    }
    if (!CONFIG.VALIDATION.EMAIL_REGEX.test(formData.email)) {
      showToast('Please enter a valid email address', 'error');
      return false;
    }
    if (!CONFIG.VALIDATION.PHONE_REGEX.test(formData.phone)) {
      showToast('Please enter a valid Israeli phone number', 'error');
      return false;
    }
    if (!CONFIG.VALIDATION.CAR_NUMBER_REGEX.test(formData.carNumber)) {
      showToast('Please enter a valid Israeli car number', 'error');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showToast('Profile updated successfully', 'success');
        setEditing(false);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update profile');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleSpotifyConnect = async () => {
    if (!token) return;
    try {
      await spotifyService.connect(token);
      showToast('Finish Spotify login in browser, then tap Refresh', 'info');
    } catch (error: any) {
      showToast(error.message || 'Failed to start Spotify login', 'error');
    }
  };

  const handleLoadPlaylistTracks = async (playlistId: string) => {
    if (!token) return;
    try {
      const data = await spotifyService.getPlaylistTracks(token, playlistId);
      setSelectedPlaylistId(playlistId);
      setPlaylistTracks((data.items || []).map((item: any) => item.track).filter(Boolean));
    } catch (error: any) {
      showToast(error.message || 'Failed to load tracks', 'error');
    }
  };

  const handlePlaybackAction = async (action: 'play' | 'pause' | 'next' | 'previous') => {
    if (!token) return;
    try {
      if (action === 'play') await spotifyService.play(token);
      if (action === 'pause') await spotifyService.pause(token);
      if (action === 'next') await spotifyService.next(token);
      if (action === 'previous') await spotifyService.previous(token);
      await loadSpotifyData();
    } catch (error: any) {
      showToast(error.message || 'Playback action failed', 'error');
    }
  };

  const getTotalSessions = () => {
    return sessionHistory.length;
  };

  const getTotalPhotos = () => {
    return sessionHistory.reduce((total, session) => total + session.totalImagesUploaded, 0);
  };

  const getTotalDriveTime = () => {
    return sessionHistory.reduce((total, session) => {
      if (session.duration) {
        return total + session.duration;
      }
      return total;
    }, 0);
  };

  const formatDuration = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditing(!editing)}
          >
            <Text style={styles.editButtonText}>
              {editing ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* User Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Information</Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>First Name</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.firstName}
                onChangeText={(value) => updateFormData('firstName', value)}
                placeholder="First name"
                editable={!loading}
              />
            ) : (
              <Text style={styles.value}>{user?.firstName}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Last Name</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.lastName}
                onChangeText={(value) => updateFormData('lastName', value)}
                placeholder="Last name"
                editable={!loading}
              />
            ) : (
              <Text style={styles.value}>{user?.lastName}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(value) => updateFormData('email', value)}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            ) : (
              <Text style={styles.value}>{user?.email}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(value) => updateFormData('phone', value)}
                placeholder="05XXXXXXXX"
                keyboardType="phone-pad"
                maxLength={10}
                editable={!loading}
              />
            ) : (
              <Text style={styles.value}>{user?.phone}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Car Number</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={formData.carNumber}
                onChangeText={(value) => updateFormData('carNumber', value)}
                placeholder="1234567"
                keyboardType="numeric"
                maxLength={8}
                editable={!loading}
              />
            ) : (
              <Text style={styles.value}>{user?.carNumber}</Text>
            )}
          </View>

          {editing && (
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Statistics Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Driving Statistics</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{getTotalSessions()}</Text>
              <Text style={styles.statLabel}>Total Sessions</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{getTotalPhotos()}</Text>
              <Text style={styles.statLabel}>Photos Uploaded</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(getTotalDriveTime())}</Text>
              <Text style={styles.statLabel}>Drive Time</Text>
            </View>
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Account Actions</Text>
          </View>

          <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
            <Text style={styles.actionButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Spotify</Text>
          </View>
          {spotifyLoading ? (
            <View style={styles.spotifySkeletonWrap}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="100%" height={42} radius={10} />
              <Skeleton width="100%" height={62} radius={10} />
              <Skeleton width="100%" height={62} radius={10} />
            </View>
          ) : (
            <>
              <View style={styles.spotifyRow}>
                <Text style={styles.infoLabel}>Connection</Text>
                <Text style={[styles.infoValue, { color: spotifyConnected ? '#10b981' : '#ef4444' }]}>
                  {spotifyConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>

              {!spotifyConnected ? (
                <TouchableOpacity style={styles.editButton} onPress={handleSpotifyConnect}>
                  <Text style={styles.editButtonText}>Connect Spotify</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.editButton} onPress={loadSpotifyData}>
                    <Text style={styles.editButtonText}>Refresh</Text>
                  </TouchableOpacity>

                  {spotifyProfile && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Spotify User</Text>
                      <Text style={styles.infoValue}>{spotifyProfile.display_name || spotifyProfile.id}</Text>
                    </View>
                  )}

                  <Text style={styles.sectionSubtitle}>Playlists</Text>
                  {playlists.length === 0 ? (
                    <EmptyState
                      icon="🎵"
                      title="No playlists found"
                      description="Create a playlist in Spotify and refresh."
                    />
                  ) : (
                    playlists.slice(0, 8).map((playlist) => (
                      <TouchableOpacity
                        key={playlist.id}
                        style={[styles.playlistItem, selectedPlaylistId === playlist.id && styles.playlistItemSelected]}
                        onPress={() => handleLoadPlaylistTracks(playlist.id)}
                      >
                        <View style={styles.playlistRow}>
                          {playlist.images?.[0]?.url ? (
                            <Image source={{ uri: playlist.images[0].url }} style={styles.playlistImage} />
                          ) : null}
                          <View style={styles.playlistTextWrap}>
                            <Text style={styles.playlistName}>{playlist.name}</Text>
                            <Text style={styles.playlistMeta}>{playlist.tracks?.total || 0} tracks</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}

                  <Text style={styles.sectionSubtitle}>Player</Text>
                  <View style={styles.playerRow}>
                    <TouchableOpacity style={styles.playerBtn} onPress={() => handlePlaybackAction('previous')}>
                      <Text style={styles.playerBtnText}>Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.playerBtn} onPress={() => handlePlaybackAction('play')}>
                      <Text style={styles.playerBtnText}>Play</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.playerBtn} onPress={() => handlePlaybackAction('pause')}>
                      <Text style={styles.playerBtnText}>Pause</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.playerBtn} onPress={() => handlePlaybackAction('next')}>
                      <Text style={styles.playerBtnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.mutedText}>
                    {currentPlayback?.item
                      ? `${currentPlayback.item.name} - ${currentPlayback.item.artists?.map((a: any) => a.name).join(', ')}`
                      : 'No active playback device. Open Spotify on a Premium account device.'}
                  </Text>
                  {currentPlayback?.item?.album?.images?.[0]?.url ? (
                    <Image source={{ uri: currentPlayback.item.album.images[0].url }} style={styles.currentTrackImage} />
                  ) : null}

                  <Text style={styles.sectionSubtitle}>Tracks</Text>
                  {playlistTracks.length === 0 ? (
                    <EmptyState
                      icon="🎧"
                      title="No tracks selected"
                      description="Pick a playlist to browse tracks."
                    />
                  ) : (
                    playlistTracks.slice(0, 10).map((track) => (
                      <View key={track.id} style={styles.trackItem}>
                        <Text style={styles.trackTitle}>{track.name}</Text>
                        <Text style={styles.trackMeta}>{track.artists?.map((a: any) => a.name).join(', ')}</Text>
                      </View>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* App Info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>App Information</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>2024.01.01</Text>
          </View>
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#1e293b',
  },
  value: {
    fontSize: 16,
    color: '#1e293b',
    paddingVertical: 12,
  },
  saveButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 5,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  spotifyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionSubtitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  mutedText: {
    color: '#64748b',
    fontSize: 13,
  },
  playlistItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  playlistItemSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  playlistName: {
    color: '#0f172a',
    fontWeight: '600',
  },
  playlistMeta: {
    color: '#64748b',
    marginTop: 2,
    fontSize: 12,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
  },
  playlistTextWrap: {
    flex: 1,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    marginRight: 8,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  playerBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  currentTrackImage: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginTop: 8,
  },
  trackItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
  },
  trackTitle: {
    color: '#0f172a',
    fontWeight: '600',
  },
  trackMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  spotifySkeletonWrap: {
    gap: 10,
  },
});
