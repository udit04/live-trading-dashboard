import { useState, useEffect, useRef } from 'react';
import { defaultWebSocketService } from '../socket/WebSocketService';

export interface PriceLevel {
  price: number;
  size: number;
  cumulative: number;
  flash: 'up' | 'down' | null;
}

export interface OrderBookState {
  bids: PriceLevel[];
  asks: PriceLevel[];
  midPrice: number;
  spread: number;
  spreadBps: number;
  imbalance: number;
  isLoading: boolean;
}

export const SYMBOL_CONFIGS: Record<string, { precision: number; groupingOptions: number[] }> = {
  BTCUSD: { precision: 1, groupingOptions: [1, 5, 10, 50, 100, 500] },
  ETHUSD: { precision: 2, groupingOptions: [0.50, 1, 5, 10, 50] },
  XRPUSD: { precision: 4, groupingOptions: [0.0001, 0.001, 0.01, 0.1] },
  SOLUSD: { precision: 4, groupingOptions: [0.0001, 0.001, 0.01, 0.1] },
  PAXGUSD: { precision: 2, groupingOptions: [0.50, 1, 5, 10, 50] },
  DOGEUSD: { precision: 6, groupingOptions: [0.000001, 0.00001, 0.0001, 0.001, 0.01] },
};

const DEFAULT_CONFIG = { precision: 2, groupingOptions: [0.01, 0.1, 1, 5, 10] };

/**
 * useOrderBook Hook
 * Subscribes to the 'l2_orderbook' channel for a focused symbol.
 * Manages raw L2 orderbook aggregation, grouping, and spread calculations.
 * Features throttled state updates to maintain UI fluidness and prevent browser freeze under stress.
 */
export function useOrderBook(symbol: string, groupingInterval: number) {
  const config = SYMBOL_CONFIGS[symbol] || DEFAULT_CONFIG;
  const precision = config.precision;

  const [state, setState] = useState<OrderBookState>({
    bids: [],
    asks: [],
    midPrice: 0,
    spread: 0,
    spreadBps: 0,
    imbalance: 1.0,
    isLoading: true,
  });

  // Track latest message and timeout ref for throttling
  const latestMessageRef = useRef<any>(null);
  const throttleTimeoutRef = useRef<any>(null);
  const prevBidsMapRef = useRef<Map<number, number>>(new Map());
  const prevAsksMapRef = useRef<Map<number, number>>(new Map());

  // Reset state when symbol changes
  useEffect(() => {
    setState({
      bids: [],
      asks: [],
      midPrice: 0,
      spread: 0,
      spreadBps: 0,
      imbalance: 1.0,
      isLoading: true,
    });
    prevBidsMapRef.current.clear();
    prevAsksMapRef.current.clear();
    latestMessageRef.current = null;
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }
  }, [symbol]);

  useEffect(() => {
    const processOrderBook = (msg: any) => {
      if (!msg || msg.symbol !== symbol) return;

      const rawBids: [string, string][] = msg.bids || [];
      const rawAsks: [string, string][] = msg.asks || [];

      // 1. Group bids and asks using integer scaling to avoid floating-point bugs
      const factor = Math.pow(10, precision);
      const scaledInterval = Math.round(groupingInterval * factor);

      // Aggregate bids (round down)
      const bidGroups = new Map<number, number>();
      rawBids.forEach(([priceStr, sizeStr]) => {
        const price = parseFloat(priceStr);
        const size = parseFloat(sizeStr);
        const scaledPrice = Math.round(price * factor);
        const scaledGroup = Math.floor(scaledPrice / scaledInterval) * scaledInterval;
        const roundedPrice = scaledGroup / factor;
        bidGroups.set(roundedPrice, (bidGroups.get(roundedPrice) || 0) + size);
      });

      // Aggregate asks (round up)
      const askGroups = new Map<number, number>();
      rawAsks.forEach(([priceStr, sizeStr]) => {
        const price = parseFloat(priceStr);
        const size = parseFloat(sizeStr);
        const scaledPrice = Math.round(price * factor);
        const scaledGroup = Math.ceil(scaledPrice / scaledInterval) * scaledInterval;
        const roundedPrice = scaledGroup / factor;
        askGroups.set(roundedPrice, (askGroups.get(roundedPrice) || 0) + size);
      });

      // 2. Sort Bids (descending), Asks (ascending)
      const sortedBids = Array.from(bidGroups.entries()).sort((a, b) => b[0] - a[0]);
      const sortedAsks = Array.from(askGroups.entries()).sort((a, b) => a[0] - b[0]);

      // 3. Compute spread metrics
      const bestBid = sortedBids[0]?.[0] || 0;
      const bestAsk = sortedAsks[0]?.[0] || 0;
      const midPrice = (bestBid + bestAsk) / 2;
      const spread = Math.max(0, bestAsk - bestBid);
      const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

      // 4. Calculate cumulative sizes and apply flash detection (>10% change)
      const maxLevels = 20;
      let bidCumulative = 0;
      const newBidsMap = new Map<number, number>();

      const bidsPayload: PriceLevel[] = sortedBids.slice(0, maxLevels).map(([price, size]) => {
        bidCumulative += size;
        newBidsMap.set(price, size);

        // Check size change relative to previous grouped bids
        const prevSize = prevBidsMapRef.current.get(price);
        let flash: 'up' | 'down' | null = null;
        if (prevSize !== undefined) {
          if (size > prevSize * 1.10) flash = 'up';
          else if (size < prevSize * 0.90) flash = 'down';
        }

        return {
          price,
          size,
          cumulative: bidCumulative,
          flash,
        };
      });

      let askCumulative = 0;
      const newAsksMap = new Map<number, number>();

      const asksPayload: PriceLevel[] = sortedAsks.slice(0, maxLevels).map(([price, size]) => {
        askCumulative += size;
        newAsksMap.set(price, size);

        // Check size change relative to previous grouped asks
        const prevSize = prevAsksMapRef.current.get(price);
        let flash: 'up' | 'down' | null = null;
        if (prevSize !== undefined) {
          if (size > prevSize * 1.10) flash = 'up';
          else if (size < prevSize * 0.90) flash = 'down';
        }

        return {
          price,
          size,
          cumulative: askCumulative,
          flash,
        };
      });

      // Update refs for next flash comparison
      prevBidsMapRef.current = newBidsMap;
      prevAsksMapRef.current = newAsksMap;

      // 5. Imbalance (bid volume vs ask volume of visible levels)
      const totalVisibleBidVol = bidsPayload.reduce((acc, b) => acc + b.size, 0);
      const totalVisibleAskVol = asksPayload.reduce((acc, a) => acc + a.size, 0);
      const imbalance = totalVisibleAskVol > 0 ? totalVisibleBidVol / totalVisibleAskVol : 1.0;

      setState({
        bids: bidsPayload,
        asks: asksPayload,
        midPrice,
        spread,
        spreadBps,
        imbalance,
        isLoading: false,
      });
    };

    // WebSocket message receiver with throttling to 50ms intervals
    const onMessage = (msg: any) => {
      if (!msg || msg.type !== 'l2_orderbook' || msg.symbol !== symbol) return;

      latestMessageRef.current = msg;

      if (!throttleTimeoutRef.current) {
        throttleTimeoutRef.current = setTimeout(() => {
          throttleTimeoutRef.current = null;
          if (latestMessageRef.current) {
            processOrderBook(latestMessageRef.current);
          }
        }, 50); // Throttle recalculations to at most 20 updates per second
      }
    };

    // Subscribe to WebSocket
    const unsubscribe = defaultWebSocketService.subscribe<any>(
      'l2_orderbook',
      [symbol],
      onMessage
    );

    return () => {
      unsubscribe();
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [symbol, groupingInterval, precision]);

  return state;
}
