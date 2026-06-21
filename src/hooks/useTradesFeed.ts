import { useState, useEffect, useRef } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';

export interface AggregatedTrade {
  id: string;
  timestamp: number; // Milliseconds
  timeStr: string;   // HH:MM:SS.ms
  price: number;
  size: number;
  side: 'buy' | 'sell';
  count: number;     // Number of trades aggregated
  isLarge: boolean;  // Notional >= threshold
  notional: number;  // price * size
}

export interface RollingStats {
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  avgSize: number;
}

export interface TradesFeedState {
  trades: AggregatedTrade[];
  stats: RollingStats;
}

const MAX_DISPLAY_TRADES = 200;

/**
 * Format timestamp in milliseconds to HH:MM:SS.ms
 */
function formatTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * useTradesFeed Hook
 * Subscribes to the 'all_trades' channel for a focused symbol.
 * Handles high-frequency trades (200+/sec) by batching, aggregating trades at the same price
 * within a 100ms window, and maintaining rolling 60-second execution statistics.
 */
export function useTradesFeed(symbol: string, largeTradeThreshold: number) {
  const [state, setState] = useState<TradesFeedState>({
    trades: [],
    stats: { buyVolume: 0, sellVolume: 0, tradeCount: 0, avgSize: 0 },
  });

  // Queues and caching variables using useRef to prevent trigger-loops
  const rawTradesQueueRef = useRef<any[]>([]);
  const aggregatedTradesRef = useRef<AggregatedTrade[]>([]);
  
  // High-performance rolling statistics structures
  // Array of { timestamp, size, side } for trades in the last 60 seconds
  const statsWindowRef = useRef<Array<{ timestamp: number; size: number; side: 'buy' | 'sell' }>>([]);
  const runningBuyVolumeRef = useRef<number>(0);
  const runningSellVolumeRef = useRef<number>(0);
  const runningTradeCountRef = useRef<number>(0);

  // Reset state on symbol change
  useEffect(() => {
    setState({
      trades: [],
      stats: { buyVolume: 0, sellVolume: 0, tradeCount: 0, avgSize: 0 },
    });
    rawTradesQueueRef.current = [];
    aggregatedTradesRef.current = [];
    statsWindowRef.current = [];
    runningBuyVolumeRef.current = 0;
    runningSellVolumeRef.current = 0;
    runningTradeCountRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    // 1. WebSocket message listener: buffers raw trades to avoid rendering on every tick
    const onMessage = (msg: any) => {
      if (!msg || msg.type !== 'all_trades' || msg.symbol !== symbol) return;
      rawTradesQueueRef.current.push(msg);
    };

    const unsubscribe = defaultWebSocketService.subscribe<any>(
      'all_trades',
      [symbol],
      onMessage
    );

    // 2. Batch and stats processor loop running every 100ms
    const intervalId = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60000; // 60 seconds ago

      // Retrieve and flush the incoming raw queue
      const rawQueue = rawTradesQueueRef.current;
      rawTradesQueueRef.current = [];

      let hasNewTrades = rawQueue.length > 0;
      let statsUpdated = false;

      // Temporary copy of the aggregated trades list to build updates
      let updatedTrades = [...aggregatedTradesRef.current];

      // A. Process raw trades in chronological order
      rawQueue.forEach((raw) => {
        const timestampMs = Math.floor(raw.timestamp / 1000); // Server is microsecond
        const price = parseFloat(raw.price);
        const size = raw.size;
        const side: 'buy' | 'sell' = raw.buyer_role === 'taker' ? 'buy' : 'sell';
        const notional = price * size;
        const isLarge = notional >= largeTradeThreshold;

        // Add to statistics window
        statsWindowRef.current.push({ timestamp: timestampMs, size, side });
        if (side === 'buy') {
          runningBuyVolumeRef.current += size;
        } else {
          runningSellVolumeRef.current += size;
        }
        runningTradeCountRef.current += 1;
        statsUpdated = true;

        // Perform 100ms price aggregation:
        // If the last trade in our aggregated list matches:
        // - Same price
        // - Same side
        // - Within 100ms window of the FIRST trade in that group
        const lastAggr = updatedTrades[0]; // We prepend new trades so index 0 is latest
        if (
          lastAggr &&
          lastAggr.price === price &&
          lastAggr.side === side &&
          Math.abs(timestampMs - lastAggr.timestamp) <= 100
        ) {
          // Merge trade
          const newSize = lastAggr.size + size;
          const newNotional = price * newSize;
          lastAggr.size = newSize;
          lastAggr.count += 1;
          lastAggr.notional = newNotional;
          lastAggr.isLarge = newNotional >= largeTradeThreshold;
        } else {
          // Add new trade row
          const newTradeRow: AggregatedTrade = {
            id: `${raw.symbol}-${timestampMs}-${Math.random()}`,
            timestamp: timestampMs,
            timeStr: formatTime(timestampMs),
            price,
            size,
            side,
            count: 1,
            notional,
            isLarge,
          };
          // Prepend to make newest trades appear at the top of the feed
          updatedTrades.unshift(newTradeRow);
        }
      });

      // B. Cap trade array length to prevent memory consumption
      if (updatedTrades.length > MAX_DISPLAY_TRADES) {
        updatedTrades = updatedTrades.slice(0, MAX_DISPLAY_TRADES);
      }
      aggregatedTradesRef.current = updatedTrades;

      // C. Prune expired entries from the rolling stats window
      const statsWindow = statsWindowRef.current;
      let pruneIndex = 0;
      while (pruneIndex < statsWindow.length && statsWindow[pruneIndex].timestamp < cutoff) {
        const expired = statsWindow[pruneIndex];
        if (expired.side === 'buy') {
          runningBuyVolumeRef.current = Math.max(0, runningBuyVolumeRef.current - expired.size);
        } else {
          runningSellVolumeRef.current = Math.max(0, runningSellVolumeRef.current - expired.size);
        }
        runningTradeCountRef.current = Math.max(0, runningTradeCountRef.current - 1);
        pruneIndex++;
        statsUpdated = true;
      }

      // Slice the pruned elements off the front
      if (pruneIndex > 0) {
        statsWindowRef.current = statsWindow.slice(pruneIndex);
      }

      // D. Trigger state update if changes occurred
      if (hasNewTrades || statsUpdated) {
        const totalVol = runningBuyVolumeRef.current + runningSellVolumeRef.current;
        const avgSize = runningTradeCountRef.current > 0 
          ? totalVol / runningTradeCountRef.current 
          : 0;

        setState({
          trades: updatedTrades,
          stats: {
            buyVolume: Number(runningBuyVolumeRef.current.toFixed(4)),
            sellVolume: Number(runningSellVolumeRef.current.toFixed(4)),
            tradeCount: runningTradeCountRef.current,
            avgSize: Number(avgSize.toFixed(4)),
          },
        });
      }
    }, 100);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [symbol, largeTradeThreshold]);

  return state;
}
