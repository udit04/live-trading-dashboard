import { useState, useEffect } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';
import { useWebSocketConnection } from './useWebSocketConnection';

export interface TickerData {
  symbol: string;
  lastPrice: number;
  change24h: number; // Percentage change (e.g. +1.25 or -0.5)
  open: number;
  high: number;
  low: number;
  volume: number;
}

const ALL_SYMBOLS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'PAXGUSD', 'DOGEUSD'];

/**
 * useTickers Hook
 * Subscribes to the 'v2/ticker' channel for all symbols and manages the tickers state.
 * To optimize rendering performance, individual Ticker cards should be memoized using React.memo,
 * so they only re-render when their specific TickerData changes.
 */
export function useTickers() {
  const isConnected = useWebSocketConnection();
  const [tickers, setTickers] = useState<Record<string, TickerData>>({});

  useEffect(() => {
    if (!isConnected) {
      setTickers({});
      return;
    }

    // Subscribe to all symbols simultaneously on the v2/ticker channel
    const unsubscribe = defaultWebSocketService.subscribe(
      'v2/ticker',
      ALL_SYMBOLS,
      (msg) => {
        if (!msg || !msg.symbol) return;

        const change24h = msg.ltp_change_24h
          ? (parseFloat(msg.ltp_change_24h) - 1) * 100
          : 0;

        const tickerUpdate: TickerData = {
          symbol: msg.symbol,
          lastPrice: msg.close ?? 0,
          change24h,
          open: msg.open ?? 0,
          high: msg.high ?? 0,
          low: msg.low ?? 0,
          volume: msg.volume ?? 0,
        };

        setTickers((prev) => ({
          ...prev,
          [msg.symbol]: tickerUpdate,
        }));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isConnected]);

  return tickers;
}
