import { useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from './ToastProvider';
import { websocketService } from '../../services/websocketService';

const OFFLINE_TOAST_MESSAGE = 'Connection to server lost';
const OFFLINE_TOAST_DURATION_MS = 3000;
const FORCED_LOGOUT_TOAST_MESSAGE = 'Could not reconnect. Please sign in again.';

/**
 * Renders nothing. Owns the global rules around the live socket connection:
 *
 *  - Surfaces an "offline" toast ONLY when the connection transitions from
 *    a previously-online state to offline. Initial loads, first-attempt
 *    failures, and reconnect retries that never reached `connected` first
 *    stay quiet.
 *  - When socket.io exhausts its automatic reconnect budget, forces a
 *    logout so the user is bounced back to the login screen instead of
 *    being trapped in a half-broken authenticated shell.
 */
export const WebSocketStatusGate: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const { showToast } = useToast();
  const hasBeenConnectedRef = useRef(false);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      // Reset between sessions: a fresh login should not inherit the
      // "previously online" flag from a prior account.
      hasBeenConnectedRef.current = false;
      loggingOutRef.current = false;
      return;
    }

    const unsubscribeConnection = websocketService.addConnectionChangeListener((connected) => {
      if (connected) {
        hasBeenConnectedRef.current = true;
        return;
      }

      // Only notify on a real online -> offline transition.
      if (!hasBeenConnectedRef.current) return;

      // Suppress the toast when the user (or the app shell) intentionally
      // disconnected — e.g. logout, or unmounting from a controlled flow.
      if (websocketService.wasIntentionalDisconnect()) return;

      showToast(OFFLINE_TOAST_MESSAGE, 'error', OFFLINE_TOAST_DURATION_MS);
    });

    const unsubscribeFailure = websocketService.addReconnectFailedListener(() => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      showToast(FORCED_LOGOUT_TOAST_MESSAGE, 'error', OFFLINE_TOAST_DURATION_MS);
      // Clean up the socket and clear auth state. The auth context flip
      // will switch the navigator over to the login stack automatically.
      try {
        websocketService.disconnect();
      } catch (error) {
        console.warn('Forced-logout socket teardown failed:', error);
      }
      logout().catch((error) => {
        console.warn('Forced logout failed:', error);
      });
    });

    return () => {
      unsubscribeConnection();
      unsubscribeFailure();
    };
  }, [isAuthenticated, logout, showToast]);

  return null;
};
