import { useState, useEffect } from 'react';
import './App.css';
import { defaultWebSocketService } from './socket/WebSocketService';
import ConnectionStatus from './components/ConnectionStatus';
import TickerBar from './components/TickerBar';
import OrderBook from './components/OrderBook';

function App() {
  // 1. Manage state for focus and trade configuration (grouping is now local to OrderBook)
  const [focusedSymbol, setFocusedSymbol] = useState<string>(() => {
    return localStorage.getItem('focusedSymbol') || 'BTCUSD';
  });

  // 2. Connect to the WebSocket service when App mounts and disconnect when it unmounts
  useEffect(() => {
    defaultWebSocketService.connect();
    return () => {
      defaultWebSocketService.disconnect();
    };
  }, []);

  // 3. Handle changing the focused ticker
  const handleFocusSymbol = (symbol: string) => {
    setFocusedSymbol(symbol);
    localStorage.setItem('focusedSymbol', symbol);
  };

  console.log('render--->');

  return (
    <div className="dashboard-container">
      {/* Top 1: Connection Status indicator */}
      <ConnectionStatus />

      {/* Top 2: Ticker Card strip */}
      <TickerBar
        focusedSymbol={focusedSymbol}
        onFocusSymbol={handleFocusSymbol}
      />

      <div className="main-content-layout">
        <OrderBook symbol={focusedSymbol} />
      </div>

      {/* Responsive Help Legend Footer */}
      <div className="help-sections-footer">
        <div className="help-box">
          <ul className="help-list">
            <li>
              <div className="bullet-dot red" />
              <span>Flash red on size decrease ≥ 10%</span>
            </li>
            <li>
              <div className="bullet-dot green" />
              <span>Flash green on size increase ≥ 10%</span>
            </li>
            <li>
              <div className="bullet-square" />
              <span>Depth bars scale to max cumulative volume in view</span>
            </li>
          </ul>
        </div>

        <div className="help-box">
          <ul className="help-list">
            <li>
              <span className="bullet-emoji">📦</span>
              <span>"(3)" = aggregated trades at same price within 100ms</span>
            </li>
            <li>
              <span className="bullet-emoji">🔥</span>
              <span>Bold + left border = large trade above threshold</span>
            </li>
            <li>
              <span className="bullet-emoji">📊</span>
              <span>Rolling stats update every 1s</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;

