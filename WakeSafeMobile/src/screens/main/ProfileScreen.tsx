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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useSession } from '../../hooks/useSession';
import { CONFIG } from '../../config';

export const ProfileScreen: React.FC = () => {
  const { user, logout, token } = useAuth();
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

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return false;
    }
    if (!formData.lastName.trim()) {
      Alert.alert('Error', 'Last name is required');
      return false;
    }
    if (!CONFIG.VALIDATION.EMAIL_REGEX.test(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }
    if (!CONFIG.VALIDATION.PHONE_REGEX.test(formData.phone)) {
      Alert.alert('Error', 'Please enter a valid Israeli phone number');
      return false;
    }
    if (!CONFIG.VALIDATION.CAR_NUMBER_REGEX.test(formData.carNumber)) {
      Alert.alert('Error', 'Please enter a valid Israeli car number');
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
        Alert.alert('Success', 'Profile updated successfully');
        setEditing(false);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update profile');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
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
});
