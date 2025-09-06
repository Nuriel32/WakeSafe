import { useState, useEffect, useCallback } from 'react';
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

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null,
  });

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
      const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || CONFIG.ERRORS.UNAUTHORIZED);
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
    try {
      if (authState.token) {
        // Call logout API
        await fetch(`${CONFIG.API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authState.token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear local storage regardless of API response
      await AsyncStorage.removeItem(CONFIG.TOKEN_KEY);
      await AsyncStorage.removeItem(CONFIG.USER_KEY);

      setAuthState({
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
      });
    }
  }, [authState.token]);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const decodeJWT = (token: string): User => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const decoded = JSON.parse(jsonPayload);
      return {
        id: decoded.id,
        firstName: decoded.firstName || 'User',
        lastName: decoded.lastName || '',
        email: decoded.email || '',
        phone: decoded.phone || '',
        carNumber: decoded.carNumber || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('JWT decode error:', error);
      throw new Error('Invalid token');
    }
  };

  return {
    ...authState,
    login,
    register,
    logout,
    clearError,
  };
};
