import { useState, useEffect, useRef } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';
import { useStreaming } from './useStreaming';
import { ChannelName } from '../utils/constants';
import type { AllTradesMessage } from '../utils/types';

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
const INITIAL_STATS: RollingStats = {
  buyVolume: 0,
  sellVolume: 0,
  tradeCount: 0,
  avgSize: 0,
};

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
  const isStreaming = useStreaming();
  const [trades, setTrades] = useState<AggregatedTrade[]>([]);
  const [stats, setStats] = useState<RollingStats>(INITIAL_STATS);

  // Queues and caching variables using useRef to prevent trigger-loops
  const rawTradesQueueRef = useRef<AllTradesMessage[]>([]);
  const aggregatedTradesRef = useRef<AggregatedTrade[]>([]);

  // High-performance rolling statistics structures
  // Array of { timestamp, size, side } for trades in the last 60 seconds
  const statsWindowRef = useRef<Array<{ timestamp: number; size: number; side: 'buy' | 'sell' }>>([]);
  const runningBuyVolumeRef = useRef<number>(0);
  const runningSellVolumeRef = useRef<number>(0);
  const runningTradeCountRef = useRef<number>(0);

  // Reset state on symbol change or when streaming stops (disconnect or tab hidden)
  useEffect(() => {
    setTrades([]);
    setStats(INITIAL_STATS);
    rawTradesQueueRef.current = [];
    aggregatedTradesRef.current = [];
    statsWindowRef.current = [];
    runningBuyVolumeRef.current = 0;
    runningSellVolumeRef.current = 0;
    runningTradeCountRef.current = 0;
  }, [symbol, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;

    // 1. WebSocket message listener: buffers raw trades to avoid rendering on every tick
    const onMessage = (msg: AllTradesMessage) => {
      if (msg.symbol !== symbol) return;
      rawTradesQueueRef.current.push(msg);
    };

    const unsubscribe = defaultWebSocketService.subscribe(
      ChannelName.ALL_TRADES,
      [symbol],
      onMessage
    );

    const publishStatsIfChanged = () => {
      const buyVolume = Number(runningBuyVolumeRef.current.toFixed(4));
      const sellVolume = Number(runningSellVolumeRef.current.toFixed(4));
      const tradeCount = runningTradeCountRef.current;
      const totalVol = buyVolume + sellVolume;
      const avgSize = tradeCount > 0 ? Math.round(totalVol / tradeCount) : 0;

      setStats((prev) => {
        if (
          prev.buyVolume === buyVolume &&
          prev.sellVolume === sellVolume &&
          prev.tradeCount === tradeCount &&
          prev.avgSize === avgSize
        ) {
          return prev;
        }
        return { buyVolume, sellVolume, tradeCount, avgSize };
      });
    };

    const pruneStatsWindow = (now: number) => {
      const cutoff = now - 60000;
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
      }

      if (pruneIndex > 0) {
        statsWindowRef.current = statsWindow.slice(pruneIndex);
      }
    };

    // 2. Trade batch processor running every 100ms
    const tradesIntervalId = setInterval(() => {
      const rawQueue = rawTradesQueueRef.current;
      rawTradesQueueRef.current = [];

      if (rawQueue.length === 0) return;

      let updatedTrades = [...aggregatedTradesRef.current];

      rawQueue.forEach((raw) => {
        const timestampMs = Math.floor(raw.timestamp / 1000); // Server is microsecond
        const price = parseFloat(raw.price);
        const size = raw.size;
        const side: 'buy' | 'sell' = raw.buyer_role === 'taker' ? 'buy' : 'sell';
        const notional = price * size;
        const isLarge = notional >= largeTradeThreshold;

        statsWindowRef.current.push({ timestamp: timestampMs, size, side });
        if (side === 'buy') {
          runningBuyVolumeRef.current += size;
        } else {
          runningSellVolumeRef.current += size;
        }
        runningTradeCountRef.current += 1;

        const lastAggr = updatedTrades[0];
        if (
          lastAggr &&
          lastAggr.price === price &&
          lastAggr.side === side &&
          Math.abs(timestampMs - lastAggr.timestamp) <= 100
        ) {
          const newSize = lastAggr.size + size;
          const newNotional = price * newSize;
          lastAggr.size = newSize;
          lastAggr.count += 1;
          lastAggr.notional = newNotional;
          lastAggr.isLarge = newNotional >= largeTradeThreshold;
        } else {
          updatedTrades.unshift({
            id: `${raw.symbol}-${timestampMs}-${Math.random()}`,
            timestamp: timestampMs,
            timeStr: formatTime(timestampMs),
            price,
            size,
            side,
            count: 1,
            notional,
            isLarge,
          });
        }
      });

      if (updatedTrades.length > MAX_DISPLAY_TRADES) {
        updatedTrades = updatedTrades.slice(0, MAX_DISPLAY_TRADES);
      }

      aggregatedTradesRef.current = updatedTrades;
      setTrades(updatedTrades);
    }, 100);

    // 3. Rolling stats processor running every second
    const statsIntervalId = setInterval(() => {
      pruneStatsWindow(Date.now());
      publishStatsIfChanged();
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(tradesIntervalId);
      clearInterval(statsIntervalId);
    };
  }, [symbol, largeTradeThreshold, isStreaming]);

  return { trades, stats };
}
