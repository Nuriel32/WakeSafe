import React, { useState, useEffect, useCallback, useContext, createContext, PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { User, LoginResponse, RegisterResponse } from '../types';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

type AuthContextType = AuthState & {
  login: (email: string, password: string) => Promise<any>;
  register: (userData: any) => Promise<any>;
  logout: () => Promise<void>;
  clearError: () => void;
  renderKey: number;
  forceUpdate: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null,
  });
  
  // Force re-render counter to ensure App component updates
  const [renderKey, setRenderKey] = useState(0);
  
  // Callback to force re-render from outside
  const forceUpdate = useCallback(() => {
    setRenderKey(prev => prev + 1);
  }, []);

  // Initialize auth state from storage
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const token = await AsyncStorage.getItem(CONFIG.TOKEN_KEY);
      const userData = await AsyncStorage.getItem(CONFIG.USER_KEY);

      if (token && userData) {
        const user = JSON.parse(userData);
        setAuthState({
          isAuthenticated: true,
          user,
          token,
          loading: false,
          error: null,
        });
      } else {
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setAuthState(prev => ({ ...prev, loading: false, error: 'Failed to initialize authentication' }));
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('Making login request to:', `${CONFIG.API_BASE_URL}/auth/login`);
      
      // Add timeout and retry logic
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('Login response status:', response.status);
      console.log('Login response ok:', response.ok);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || CONFIG.ERRORS.UNAUTHORIZED);
      }

      // Decode JWT to get user info
      console.log('About to decode JWT...');
      const user = decodeJWT(data.token);
      console.log('JWT decoded successfully, user:', user);

      // Store auth data
      console.log('Storing auth data in AsyncStorage...');
      await AsyncStorage.setItem(CONFIG.TOKEN_KEY, data.token);
      await AsyncStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
      console.log('Auth data stored successfully');

      console.log('Setting auth state...');
      const newAuthState = {
        isAuthenticated: true,
        user,
        token: data.token,
        loading: false,
        error: null,
      };
      console.log('New auth state:', newAuthState);
      
      // Use a more aggressive state update approach
      setAuthState(prevState => {
        console.log('Previous auth state:', prevState);
        console.log('Updating to new auth state:', newAuthState);
        return newAuthState;
      });
      
      // Force re-render by updating render key
      setRenderKey(prev => {
        const newKey = prev + 1;
        console.log('Updating render key from', prev, 'to', newKey);
        return newKey;
      });
      
      console.log('Auth state set successfully - forcing re-render');
      
      // Add a single delay to ensure state update is processed
      setTimeout(() => {
        console.log('Auth state update completed - checking if App re-renders...');
      }, 100);

      return data;
    } catch (error: any) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
      throw error;
    }
  }, []);

  const register = useCallback(async (userData: any) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || CONFIG.ERRORS.VALIDATION);
      }

      // Decode JWT to get user info
      const user = decodeJWT(data.token);

      // Store auth data
      await AsyncStorage.setItem(CONFIG.TOKEN_KEY, data.token);
      await AsyncStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));

      setAuthState({
        isAuthenticated: true,
        user,
        token: data.token,
        loading: false,
        error: null,
      });

      return data;
    } catch (error: any) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    console.log('🚪 Starting logout process...');
    try {
      if (authState.token) {
        console.log('📡 Calling logout API...');
        // Call logout API
        await fetch(`${CONFIG.API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authState.token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('✅ Logout API called successfully');
      }
    } catch (error) {
      console.error('❌ Logout API error:', error);
    } finally {
      console.log('🧹 Clearing local storage...');
      // Clear local storage regardless of API response
      await AsyncStorage.removeItem(CONFIG.TOKEN_KEY);
      await AsyncStorage.removeItem(CONFIG.USER_KEY);
      console.log('✅ Local storage cleared');

      console.log('🔄 Setting auth state to logged out...');
      const newAuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
      console.log('New logout auth state:', newAuthState);
      setAuthState(newAuthState);
      
      // Force re-render by updating render key
      setRenderKey(prev => prev + 1);
      console.log('✅ Auth state set to logged out - forcing re-render');
      
      // Add a small delay to ensure state update is processed
      setTimeout(() => {
        console.log('🚪 Logout process completed - checking if App re-renders...');
      }, 100);
    }
  }, [authState.token]);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const decodeJWT = (token: string): User => {
    try {
      console.log('Decoding JWT token...');
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      console.log('JWT payload:', jsonPayload);
      const decoded = JSON.parse(jsonPayload);
      console.log('Decoded JWT:', decoded);
      
      const user = {
        id: decoded.id,
        firstName: decoded.firstName || 'User',
        lastName: decoded.lastName || '',
        email: decoded.email || '',
        phone: decoded.phone || '',
        carNumber: decoded.carNumber || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      console.log('Created user object:', user);
      return user;
    } catch (error) {
      console.error('JWT decode error:', error);
      throw new Error('Invalid token');
    }
  };

  const value: AuthContextType = {
    ...authState,
    login,
    register,
    logout,
    clearError,
    renderKey,
    forceUpdate,
  };

  return React.createElement(AuthContext.Provider, { value }, children as any);
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
