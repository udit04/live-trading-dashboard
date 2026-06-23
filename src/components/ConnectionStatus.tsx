import { useState, useEffect } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';
import { usePageVisible } from '../hooks/usePageVisible';

import type { TConnectionState } from '../utils/constants';
import { ConnectionState as ConnectionStateConstants } from '../utils/constants';

export function ConnectionStatus() {
  const [state, setState] = useState<TConnectionState>(defaultWebSocketService.getConnectionState());
  const isPageVisible = usePageVisible();

  useEffect(() => {
    const unsubscribe = defaultWebSocketService.addStateListener((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  const isPaused = !isPageVisible && state === ConnectionStateConstants.CONNECTED;
  const isStreaming = state === ConnectionStateConstants.CONNECTED && isPageVisible;

  const stateClass = isPaused ? 'paused' : state.toLowerCase();

  let label = 'Disconnected';
  if (isPaused) label = 'Paused';
  else if (state === ConnectionStateConstants.CONNECTED) label = 'Connected';
  else if (state === ConnectionStateConstants.CONNECTING) label = 'Connecting';
  else if (state === ConnectionStateConstants.RECONNECTING) label = 'Reconnecting';

  let details = 'Stream Paused';
  if (isStreaming) {
    details = 'Active Stream: 6 Tickers + 1 Orderbook + 1 Trades';
  } else if (isPaused) {
    details = 'Tab hidden — stream paused';
  }

  return (
    <div className={`connection-status-bar ${stateClass}`}>
      <div className={`status-dot ${stateClass}`} />
      <span className={`status-text ${stateClass}`}>{label}</span>
      <span>· 8 channels · ws://localhost:8080</span>
      <span className="status-details">{details}</span>
    </div>
  );
}
export default ConnectionStatus;
