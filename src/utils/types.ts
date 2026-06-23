import type { ChannelName, ConnectionState, SYMBOLS } from "./constants";

export type TSymbol = (typeof SYMBOLS)[number];

/** Raw L2 price/size pair as received from the WebSocket ([price, size] strings). */
export type OrderBookLevelTuple = [price: string, size: string];

export interface AllTradesMessage {
  type: typeof ChannelName.ALL_TRADES;
  symbol: string;
  timestamp: number;
  price: string;
  size: number;
  buyer_role: string;
}

export interface L2OrderbookMessage {
  type: typeof ChannelName.L2_ORDERBOOK;
  symbol: string;
  bids: OrderBookLevelTuple[];
  asks: OrderBookLevelTuple[];
}

export interface V2TickerMessage {
  type: typeof ChannelName.V2_TICKER;
  symbol: string;
  close?: number;
  ltp_change_24h?: string;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface TickerMessage {
  type: typeof ChannelName.TICKER;
  symbol: string;
  close?: number;
  ltp_change_24h?: string;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export type ChannelMessageMap = {
  [ChannelName.ALL_TRADES]: AllTradesMessage;
  [ChannelName.L2_ORDERBOOK]: L2OrderbookMessage;
  [ChannelName.V2_TICKER]: V2TickerMessage;
  [ChannelName.TICKER]: TickerMessage;
};

export type TChannelName = typeof ChannelName[keyof typeof ChannelName];

/** Discriminated union of all inbound WebSocket channel payloads. */
export type WebSocketChannelMessage = ChannelMessageMap[TChannelName];

export type TConnectionState = typeof ConnectionState[keyof typeof ConnectionState];