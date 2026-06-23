import { useWebSocketConnection } from './useWebSocketConnection';
import { usePageVisible } from './usePageVisible';

/**
 * True only when the WebSocket is connected and the tab is visible.
 * Data hooks should gate subscriptions, intervals, and processing on this flag.
 */
export function useStreaming(): boolean {
  const isConnected = useWebSocketConnection();
  const isPageVisible = usePageVisible();
  return isConnected && isPageVisible;
}
