import { useState, useEffect } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';
import { ConnectionState } from '../utils/constants';

/**
 * Returns true only when the WebSocket is fully connected and streaming.
 * Data hooks should pause subscriptions, intervals, and reset state when false.
 */
export function useWebSocketConnection(): boolean {
  const [isConnected, setIsConnected] = useState(
    () => defaultWebSocketService.getConnectionState() === ConnectionState.CONNECTED
  );

  useEffect(() => {
    return defaultWebSocketService.addStateListener((state) => {
      setIsConnected(state === ConnectionState.CONNECTED);
    });
  }, []);

  return isConnected;
}
