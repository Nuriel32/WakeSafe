import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { CONFIG } from '../config';
import { Session } from '../types';
import { requestJson, toUserMessage } from '../utils/network';

interface SessionState {
  currentSession: Session | null;
  sessionHistory: Session[];
  loading: boolean;
  error: string | null;
}

type SessionContextType = SessionState & {
  startSession: () => Promise<any>;
  endSession: (sessionId: string) => Promise<any>;
  loadCurrentSession: () => Promise<void>;
  loadSessionHistory: (opts?: { includePhotos?: boolean }) => Promise<void>;
  clearError: () => void;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const unwrapApiData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
};

export const SessionProvider: React.FC<PropsWithChildren> = ({ children }) => {
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(`${CONFIG.API_BASE_URL}/sessions/current`, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (response.status === 404) {
        setSessionState(prev => ({
          ...prev,
          currentSession: null,
          error: null,
        }));
        return;
      }
      const raw = await response.json();
      if (!response.ok) {
        throw new Error(raw?.message || 'Failed to load current session');
      }
      const session = unwrapApiData<Session | null>(raw);
      setSessionState(prev => ({
        ...prev,
        currentSession: session,
        error: null,
      }));
    } catch (error: any) {
      const message = toUserMessage(error, CONFIG.ERRORS.NETWORK);
      setSessionState(prev => ({
        ...prev,
        error: message,
      }));
    }
  }, [token, getAuthHeaders]);

  const startSession = useCallback(async () => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    setSessionState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const raw = await requestJson(`${CONFIG.API_BASE_URL}/sessions/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
        timeoutMs: 12000,
        fallbackMessage: 'Failed to start session',
      });
      const session = unwrapApiData<Session>(raw);

      setSessionState(prev => ({
        ...prev,
        currentSession: session,
        loading: false,
        error: null,
      }));

      return session;
    } catch (error: any) {
      const message = toUserMessage(error, CONFIG.ERRORS.NETWORK);
      setSessionState(prev => ({
        ...prev,
        loading: false,
        error: message,
      }));
      throw new Error(message);
    }
  }, [token, getAuthHeaders]);

  const endSession = useCallback(async (sessionId: string) => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    setSessionState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await requestJson(`${CONFIG.API_BASE_URL}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'ended' }),
        timeoutMs: 12000,
        fallbackMessage: 'Failed to end session',
      });

      setSessionState(prev => ({
        ...prev,
        currentSession: null,
        loading: false,
        error: null,
      }));

      return data;
    } catch (error: any) {
      const message = toUserMessage(error, CONFIG.ERRORS.NETWORK);
      setSessionState(prev => ({
        ...prev,
        loading: false,
        error: message,
      }));
      console.log('useSession.endSession -> Error', message);
      throw new Error(message);
    }
  }, [token, getAuthHeaders]);

  const loadSessionHistory = useCallback(async (opts?: { includePhotos?: boolean }) => {
    if (!token) return;

    try {
      const includePhotos = opts?.includePhotos ? 'true' : 'false';
      const raw = await requestJson(`${CONFIG.API_BASE_URL}/sessions?includePhotos=${includePhotos}`, {
        headers: getAuthHeaders(),
        timeoutMs: 12000,
        fallbackMessage: 'Failed to load session history',
      });
      const sessions = unwrapApiData<Session[]>(raw);
      setSessionState(prev => ({
        ...prev,
        sessionHistory: sessions,
        error: null,
      }));
    } catch (error: any) {
      const message = toUserMessage(error, CONFIG.ERRORS.NETWORK);
      setSessionState(prev => ({
        ...prev,
        error: message,
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

  const value: SessionContextType = useMemo(() => ({
    ...sessionState,
    startSession,
    endSession,
    loadCurrentSession,
    loadSessionHistory,
    clearError,
  }), [
    sessionState,
    startSession,
    endSession,
    loadCurrentSession,
    loadSessionHistory,
    clearError,
  ]);

  return React.createElement(SessionContext.Provider, { value }, children as any);
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
};
