import { useState, useEffect } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';

import type { TConnectionState } from '../utils/constants';
import { ConnectionState as ConnectionStateConstants } from '../utils/constants';

export function ConnectionStatus() {
  const [state, setState] = useState<TConnectionState>(defaultWebSocketService.getConnectionState());

  useEffect(() => {
    const unsubscribe = defaultWebSocketService.addStateListener((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  const stateClass = state.toLowerCase();
  
  let label = 'Disconnected';
  if (state === ConnectionStateConstants.CONNECTED) label = 'Connected';
  else if (state === ConnectionStateConstants.CONNECTING) label = 'Connecting';
  else if (state === ConnectionStateConstants.RECONNECTING) label = 'Reconnecting';

  return (
    <div className={`connection-status-bar ${stateClass}`}>
      <div className={`status-dot ${stateClass}`} />
      <span className={`status-text ${stateClass}`}>{label}</span>
      <span>· 8 channels · ws://localhost:8080</span>
      <span className="status-details">
        {state === ConnectionStateConstants.CONNECTED ? 'Active Stream: 6 Tickers + 1 Orderbook + 1 Trades' : 'Stream Paused'}
      </span>
    </div>
  );
}
export default ConnectionStatus;
