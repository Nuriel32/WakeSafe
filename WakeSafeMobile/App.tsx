import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { DashboardScreen } from './src/screens/main/DashboardScreen';
import { UploadScreen } from './src/screens/main/UploadScreen';
import { GalleryScreen } from './src/screens/main/GalleryScreen';
import { ProfileScreen } from './src/screens/main/ProfileScreen';

// Hooks
import { useAuth, AuthProvider } from './src/hooks/useAuth';

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
      tabBarStyle: {
        backgroundColor: '#fff',
        borderTopColor: '#e2e8f0',
        borderTopWidth: 1,
        paddingBottom: 5,
        paddingTop: 5,
        height: 60,
      },
      tabBarActiveTintColor: '#2563eb',
      tabBarInactiveTintColor: '#64748b',
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '500',
      },
    }}
  >
    <MainTab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <View style={[styles.tabIcon, { backgroundColor: color }]} />
        ),
      }}
    />
    <MainTab.Screen
      name="Upload"
      component={UploadScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <View style={[styles.tabIcon, { backgroundColor: color }]} />
        ),
      }}
    />
    <MainTab.Screen
      name="Gallery"
      component={GalleryScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <View style={[styles.tabIcon, { backgroundColor: color }]} />
        ),
      }}
    />
    <MainTab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <View style={[styles.tabIcon, { backgroundColor: color }]} />
        ),
      }}
    />
  </MainTab.Navigator>
);

function AppInner() {
  const { isAuthenticated, loading, user, token, renderKey, forceUpdate } = useAuth();
  
  // Force re-render state
  const [forceRender, setForceRender] = React.useState(0);
  const [appState, setAppState] = React.useState({ isAuthenticated, loading, user, token });

  console.log('App render - Auth state:', { 
    isAuthenticated, 
    loading, 
    hasUser: !!user, 
    hasToken: !!token,
    userEmail: user?.email,
    renderKey,
    forceRender
  });
  
  console.log('Navigation decision:', appState.isAuthenticated ? 'Main Navigator' : 'Auth Navigator');
  
  // Update appState whenever auth state changes
  React.useEffect(() => {
    console.log('App useEffect - Auth state changed:', { 
      isAuthenticated, 
      loading, 
      hasUser: !!user, 
      hasToken: !!token,
      renderKey
    });
    
    // Update appState to force re-render
    setAppState({ isAuthenticated, loading, user, token });
    
    // Force a re-render when auth state changes
    setForceRender(prev => prev + 1);
  }, [isAuthenticated, loading, user, token, renderKey]);

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
          {appState.isAuthenticated ? (
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
      <AppInner />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  tabIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
