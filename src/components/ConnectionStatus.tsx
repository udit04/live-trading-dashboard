import { useState, useEffect } from 'react';
import { defaultWebSocketService, ConnectionState } from '../socket/WebSocketService';

export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(defaultWebSocketService.getConnectionState());

  useEffect(() => {
    const unsubscribe = defaultWebSocketService.addStateListener((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  const stateClass = state.toLowerCase();
  
  let label = 'Disconnected';
  if (state === ConnectionState.CONNECTED) label = 'Connected';
  else if (state === ConnectionState.CONNECTING) label = 'Connecting';
  else if (state === ConnectionState.RECONNECTING) label = 'Reconnecting';

  return (
    <div className={`connection-status-bar ${stateClass}`}>
      <div className={`status-dot ${stateClass}`} />
      <span className={`status-text ${stateClass}`}>{label}</span>
      <span>· 8 channels · ws://localhost:8080</span>
      <span className="status-details">
        {state === ConnectionState.CONNECTED ? 'Active Stream: 6 Tickers + 1 Orderbook + 1 Trades' : 'Stream Paused'}
      </span>
    </div>
  );
}
export default ConnectionStatus;
