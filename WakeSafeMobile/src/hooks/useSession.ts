import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { CONFIG } from '../config';
import { Session } from '../types';

interface SessionState {
  currentSession: Session | null;
  sessionHistory: Session[];
  loading: boolean;
  error: string | null;
}

export const useSession = () => {
  const { token } = useAuth();
  const [sessionState, setSessionState] = useState<SessionState>({
    currentSession: null,
    sessionHistory: [],
    loading: false,
    error: null,
  });

  const getAuthHeaders = useCallback(() => {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [token]);

  const loadCurrentSession = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/sessions/current`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const session = await response.json();
        setSessionState(prev => ({
          ...prev,
          currentSession: session,
          error: null,
        }));
      } else if (response.status === 404) {
        // No current session
        setSessionState(prev => ({
          ...prev,
          currentSession: null,
          error: null,
        }));
      } else {
        throw new Error('Failed to load current session');
      }
    } catch (error: any) {
      setSessionState(prev => ({
        ...prev,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
    }
  }, [token, getAuthHeaders]);

  const startSession = useCallback(async () => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    setSessionState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to start session');
      }

      setSessionState(prev => ({
        ...prev,
        currentSession: data,
        loading: false,
        error: null,
      }));

      return data;
    } catch (error: any) {
      setSessionState(prev => ({
        ...prev,
        loading: false,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
      throw error;
    }
  }, [token, getAuthHeaders]);

  const endSession = useCallback(async (sessionId: string) => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    setSessionState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'ended' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to end session');
      }

      setSessionState(prev => ({
        ...prev,
        currentSession: null,
        loading: false,
        error: null,
      }));

      return data;
    } catch (error: any) {
      setSessionState(prev => ({
        ...prev,
        loading: false,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
      throw error;
    }
  }, [token, getAuthHeaders]);

  const loadSessionHistory = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/sessions`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const sessions = await response.json();
        setSessionState(prev => ({
          ...prev,
          sessionHistory: sessions,
          error: null,
        }));
      } else {
        throw new Error('Failed to load session history');
      }
    } catch (error: any) {
      setSessionState(prev => ({
        ...prev,
        error: error.message || CONFIG.ERRORS.NETWORK,
      }));
    }
  }, [token, getAuthHeaders]);

  const clearError = useCallback(() => {
    setSessionState(prev => ({ ...prev, error: null }));
  }, []);

  // Load current session when token changes
  useEffect(() => {
    if (token) {
      loadCurrentSession();
      loadSessionHistory();
    } else {
      setSessionState({
        currentSession: null,
        sessionHistory: [],
        loading: false,
        error: null,
      });
    }
  }, [token, loadCurrentSession, loadSessionHistory]);

  return {
    ...sessionState,
    startSession,
    endSession,
    loadCurrentSession,
    loadSessionHistory,
    clearError,
  };
};
