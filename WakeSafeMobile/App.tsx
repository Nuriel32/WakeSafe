import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

// Screens
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { DashboardScreen } from './src/screens/main/DashboardScreen';
import { UploadScreen } from './src/screens/main/UploadScreen';
import { GalleryScreen } from './src/screens/main/GalleryScreen';
import { ProfileScreen } from './src/screens/main/ProfileScreen';

// Hooks
import { useAuth, AuthProvider } from './src/hooks/useAuth';
import { SessionProvider } from './src/hooks/useSession';
import { ToastProvider } from './src/components/feedback/ToastProvider';
import { colors } from './src/theme/tokens';

// Types
import { RootStackParamList, AuthStackParamList, MainTabParamList } from './src/types';

const Stack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
  </AuthStack.Navigator>
);

const MainNavigator = () => (
  <MainTab.Navigator
    screenOptions={{
      headerShown: false,
      lazy: true,
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
        backgroundColor: '#fff',
        borderTopColor: '#e2e8f0',
        borderTopWidth: 1,
        paddingBottom: 5,
        paddingTop: 5,
        height: 64,
      },
      tabBarActiveTintColor: '#2563eb',
      tabBarInactiveTintColor: '#64748b',
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
      },
      tabBarItemStyle: {
        borderRadius: 10,
        marginHorizontal: 2,
      },
    }}
  >
    <MainTab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{
        tabBarLabel: 'Home',
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
      }}
    />
    <MainTab.Screen
      name="Upload"
      component={UploadScreen}
      options={{
        tabBarLabel: 'Capture',
        tabBarIcon: ({ color, size }) => <Ionicons name="camera-outline" size={size} color={color} />,
      }}
    />
    <MainTab.Screen
      name="Gallery"
      component={GalleryScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Ionicons name="images-outline" size={size} color={color} />,
      }}
    />
    <MainTab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
      }}
    />
  </MainTab.Navigator>
);

function AppInner() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <Stack.Screen name="Main" component={MainNavigator} />
          ) : (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SessionProvider>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </SessionProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});
