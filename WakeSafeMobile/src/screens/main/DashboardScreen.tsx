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

export const DashboardScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const { currentSession, startSession, endSession, loading } = useSession();
  const [sessionDuration, setSessionDuration] = useState('00:00:00');

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

  const handleStartSession = async () => {
    try {
      await startSession();
      Alert.alert('Success', CONFIG.SUCCESS.SESSION_START);
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
              <Text style={styles.statValue}>{currentSession?.totalImagesUploaded || 0}</Text>
              <Text style={styles.statLabel}>Photos Uploaded</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{currentSession?.photos?.length || 0}</Text>
              <Text style={styles.statLabel}>Total Photos</Text>
            </View>
          </View>
        </View>

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
