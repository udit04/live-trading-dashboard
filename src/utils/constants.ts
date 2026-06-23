export const PRECISION_MAP_DATA: Record<string, number> = {
    BTCUSD: 1,
    ETHUSD: 2,
    XRPUSD: 4,
    SOLUSD: 4,
    PAXGUSD: 2,
    DOGEUSD: 6,
  };

  export const SYMBOL_CONFIGS: Record<string, { precision: number; groupingOptions: number[] }> = {
    BTCUSD: { precision: 1, groupingOptions: [1, 5, 10, 50, 100, 500] },
    ETHUSD: { precision: 2, groupingOptions: [0.50, 1, 5, 10, 50] },
    XRPUSD: { precision: 4, groupingOptions: [0.0001, 0.001, 0.01, 0.1] },
    SOLUSD: { precision: 4, groupingOptions: [0.0001, 0.001, 0.01, 0.1] },
    PAXGUSD: { precision: 2, groupingOptions: [0.50, 1, 5, 10, 50] },
    DOGEUSD: { precision: 6, groupingOptions: [0.000001, 0.00001, 0.0001, 0.001, 0.01] },
  };

  export const DEFAULT_CONFIG: { precision: number; groupingOptions: number[] } = { precision: 2, groupingOptions: [0.01, 0.1, 1, 5, 10] };

  export const ConnectionState = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    RECONNECTING: 'RECONNECTING',
  } as const;

  export type TConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

  export const ChannelName = {
    TICKER: 'ticker',
    L2_ORDERBOOK: 'l2_orderbook',
    ALL_TRADES: 'all_trades',
  } as const;

  export type TChannelName = typeof ChannelName[keyof typeof ChannelName];