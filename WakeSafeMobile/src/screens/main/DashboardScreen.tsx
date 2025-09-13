import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useSession } from '../../hooks/useSession';
import { CONFIG } from '../../config';
import { cameraService, SessionPhotoData } from '../../services/cameraService';
import { photoUploadService, UploadProgress } from '../../services/photoUploadService';
import { websocketService, FatigueAlert } from '../../services/websocketService';

export const DashboardScreen: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { currentSession, startSession, endSession, loading } = useSession();
  const [sessionDuration, setSessionDuration] = useState('00:00:00');
  const [isCapturing, setIsCapturing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    totalPhotos: 0,
    uploadedPhotos: 0,
    failedPhotos: 0,
  });
  const [photosCaptured, setPhotosCaptured] = useState(0);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [fatigueAlerts, setFatigueAlerts] = useState<FatigueAlert[]>([]);
  const [lastFatigueAlert, setLastFatigueAlert] = useState<FatigueAlert | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (currentSession && currentSession.status === 'active') {
      interval = setInterval(() => {
        const startTime = new Date(currentSession.startTime).getTime();
        const now = Date.now();
        const duration = now - startTime;
        
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        
        setSessionDuration(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    } else {
      setSessionDuration('00:00:00');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentSession]);

  // WebSocket connection and event handling
  useEffect(() => {
    if (token && user) {
      // Set up WebSocket event handlers
      websocketService.setOnFatigueAlert(handleFatigueAlert);
      websocketService.setOnConnectionChange(setIsWebSocketConnected);
      websocketService.setOnError((error) => {
        console.error('WebSocket error:', error);
        Alert.alert('Connection Error', error);
      });

      // Connect to WebSocket
      websocketService.connect(token).catch((error) => {
        console.error('Failed to connect to WebSocket:', error);
        Alert.alert('Connection Failed', 'Unable to connect to real-time updates');
      });

      return () => {
        websocketService.disconnect();
      };
    }
  }, [token, user]);

  const handleFatigueAlert = (alert: FatigueAlert) => {
    console.log('Fatigue alert received:', alert);
    setLastFatigueAlert(alert);
    setFatigueAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts

    // Show alert based on severity
    if (alert.alert.actionRequired) {
      Alert.alert(
        '⚠️ FATIGUE ALERT',
        alert.alert.message,
        [
          { text: 'OK', style: 'default' },
          { text: 'End Session', style: 'destructive', onPress: () => handleEndSession() }
        ],
        { cancelable: false }
      );
    } else if (alert.alert.severity === 'medium') {
      Alert.alert('⚠️ Drowsiness Detected', alert.alert.message);
    }
  };

  const handleStartSession = async () => {
    try {
      const session = await startSession();
      Alert.alert('Success', CONFIG.SUCCESS.SESSION_START);
      
      // Emit WebSocket events
      if (session && user && token) {
        websocketService.emitSessionStart(session._id);
        websocketService.emitContinuousCaptureStart(session._id);
      }
      
      // Navigate to UploadScreen to start camera capture
      Alert.alert(
        'Session Started', 
        'Session started successfully! Navigate to Upload tab to start camera capture.',
        [
          {
            text: 'Go to Upload',
            onPress: () => {
              // Navigation will be handled by the tab navigator
              console.log('User should navigate to Upload tab');
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start session');
    }
  };

  const handleEndSession = async () => {
    if (!currentSession) return;
    
    Alert.alert(
      'End Session',
      'Are you sure you want to end the current session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop continuous photo capture
              stopContinuousCapture();
              
              // Emit WebSocket events
              websocketService.emitContinuousCaptureStop(currentSession._id);
              websocketService.emitSessionEnd(currentSession._id);
              
              await endSession(currentSession._id);
              Alert.alert('Success', CONFIG.SUCCESS.SESSION_END);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to end session');
            }
          },
        },
      ]
    );
  };

  const startContinuousCapture = async (sessionId: string, userId: string) => {
    if (!token) {
      Alert.alert('Error', 'Authentication token not available');
      return;
    }

    try {
      // Camera capture is handled in UploadScreen
      // This function just sets up the session state
      setIsCapturing(true);
      setPhotosCaptured(0);
      photoUploadService.reset();
      console.log('Session started - camera capture will begin in UploadScreen');
    } catch (error) {
      console.error('Error starting session:', error);
      Alert.alert('Error', 'Failed to start session');
    }
  };

  const stopContinuousCapture = () => {
    // Camera capture is handled in UploadScreen
    setIsCapturing(false);
    console.log('Session stopped - camera capture will stop in UploadScreen');
  };

  const handlePhotoCaptured = async (photo: SessionPhotoData) => {
    console.log(`Photo captured: sequence ${photo.sequenceNumber}`);
    setPhotosCaptured(prev => prev + 1);
    
    // Emit WebSocket event
    websocketService.emitPhotoCaptured({
      sequenceNumber: photo.sequenceNumber,
      timestamp: photo.timestamp,
      sessionId: photo.sessionId
    });
    
    // Upload photo immediately
    await photoUploadService.uploadPhoto(
      photo,
      token!,
      handleUploadProgress,
      handleUploadComplete,
      handleUploadError
    );
  };

  const handleCaptureError = (error: string) => {
    console.error('Camera capture error:', error);
    Alert.alert('Camera Error', error);
  };

  const handleUploadProgress = (progress: UploadProgress) => {
    setUploadProgress(progress);
  };

  const handleUploadComplete = (result: any) => {
    console.log(`Photo ${result.sequenceNumber} uploaded successfully`);
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.logo}>🚗</Text>
            <View>
              <Text style={styles.title}>WakeSafe</Text>
              <Text style={styles.subtitle}>Welcome back, {user?.firstName}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Session Status Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Session Status</Text>
            <View style={[
              styles.statusDot,
              { backgroundColor: currentSession?.status === 'active' ? '#10b981' : '#64748b' }
            ]} />
          </View>
          
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionStatus}>
              {currentSession?.status === 'active' ? 'Active Session' : 'No Active Session'}
            </Text>
            <Text style={styles.sessionDuration}>{sessionDuration}</Text>
          </View>

          <View style={styles.sessionActions}>
            {currentSession?.status === 'active' ? (
              <TouchableOpacity
                style={[styles.button, styles.endButton]}
                onPress={handleEndSession}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>End Session</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.startButton]}
                onPress={handleStartSession}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Start Session</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Fatigue Detection Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Fatigue Detection</Text>
            <Text style={styles.cardSubtitle}>Alertness Level</Text>
          </View>
          
          <View style={styles.fatigueIndicator}>
            <View style={styles.alertnessBar}>
              <View style={[styles.alertnessFill, { width: '85%' }]} />
            </View>
            <Text style={styles.alertnessText}>85% Alert</Text>
          </View>
        </View>

        {/* Statistics Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Session Statistics</Text>
          </View>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{photosCaptured}</Text>
              <Text style={styles.statLabel}>Photos Captured</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{uploadProgress.uploadedPhotos}</Text>
              <Text style={styles.statLabel}>Photos Uploaded</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{uploadProgress.failedPhotos}</Text>
              <Text style={styles.statLabel}>Upload Failed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: isCapturing ? '#10b981' : '#64748b' }]}>
                {isCapturing ? '●' : '○'}
              </Text>
              <Text style={styles.statLabel}>Camera Status</Text>
            </View>
          </View>
        </View>

        {/* WebSocket Connection Status */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Connection Status</Text>
          </View>
          <View style={styles.connectionStatus}>
            <View style={[styles.statusIndicator, { backgroundColor: isWebSocketConnected ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {isWebSocketConnected ? 'Connected to Server' : 'Disconnected'}
            </Text>
          </View>
        </View>

        {/* Fatigue Alerts */}
        {lastFatigueAlert && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Latest Fatigue Detection</Text>
            </View>
            <View style={[styles.alertContainer, { 
              backgroundColor: lastFatigueAlert.alert.severity === 'high' ? '#fef2f2' : 
                             lastFatigueAlert.alert.severity === 'medium' ? '#fffbeb' : '#f0f9ff'
            }]}>
              <Text style={[styles.alertText, {
                color: lastFatigueAlert.alert.severity === 'high' ? '#dc2626' : 
                       lastFatigueAlert.alert.severity === 'medium' ? '#d97706' : '#2563eb'
              }]}>
                {lastFatigueAlert.alert.message}
              </Text>
              <Text style={styles.alertConfidence}>
                Confidence: {Math.round(lastFatigueAlert.confidence * 100)}%
              </Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Quick Actions</Text>
          </View>
          
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionButton}>
              <Text style={styles.quickActionIcon}>📸</Text>
              <Text style={styles.quickActionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton}>
              <Text style={styles.quickActionIcon}>📊</Text>
              <Text style={styles.quickActionText}>View Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton}>
              <Text style={styles.quickActionIcon}>⚙️</Text>
              <Text style={styles.quickActionText}>Settings</Text>
            </TouchableOpacity>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: 40,
    marginRight: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  alertContainer: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  alertText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  alertConfidence: {
    fontSize: 14,
    color: '#6b7280',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sessionInfo: {
    marginBottom: 20,
  },
  sessionStatus: {
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 5,
  },
  sessionDuration: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  sessionActions: {
    marginTop: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#10b981',
  },
  endButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fatigueIndicator: {
    alignItems: 'center',
  },
  alertnessBar: {
    width: '100%',
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    marginBottom: 10,
  },
  alertnessFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 6,
  },
  alertnessText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
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
    fontSize: 14,
    color: '#64748b',
    marginTop: 5,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickActionButton: {
    alignItems: 'center',
    padding: 15,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
});
