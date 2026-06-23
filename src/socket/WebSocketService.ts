import { ConnectionState, WEBSOCKET_URL } from "../utils/constants";

import type { TChannelName, ChannelMessageMap, WebSocketChannelMessage, TConnectionState } from "../utils/types";

export interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  payload: {
    channels: Array<{
      name: TChannelName
      symbols?: string[];
    }>;
  };
}

/**
 * WebSocketService
 * A generic, robust, and highly-performant service to manage a single WebSocket
 * connection to the trading backend. Features automatic reconnection with exponential backoff
 * and randomized jitter, multiplexing of subscriptions, and reference-counted channel management.
 */
export class WebSocketService {
  private url: string;
  private ws: WebSocket | null = null;
  private connectionState: TConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectDelay = 30000; // 30 seconds
  private baseReconnectDelay = 1000; // 1 second

  // Active subscriptions tracked for resubscription on reconnect (ChannelName -> Set of Symbols)
  private activeSubscriptions = new Map<TChannelName, Set<string>>();

  // Registered listeners (ChannelName -> Map<Symbol, Set<Callback>>)
  private listeners = new Map<TChannelName, Map<string, Set<(data: WebSocketChannelMessage) => void>>>();

  // Global listeners
  private stateListeners = new Set<(state: TConnectionState) => void>();
  private globalMessageListeners = new Set<(message: WebSocketChannelMessage) => void>();

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Returns the current connection state.
   */
  public getConnectionState(): TConnectionState {
    return this.connectionState;
  }

  /**
   * Connects to the WebSocket server.
   */
  public connect(): void {
    if (this.connectionState === ConnectionState.CONNECTED || this.connectionState === ConnectionState.CONNECTING) {
      return;
    }

    this.setConnectionState(this.ws ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);
    this.clearReconnectTimeout();

    try {
      this.ws = new WebSocket(this.url);
      this.registerSocketEvents();
    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Disconnects from the WebSocket server and stops reconnection attempts.
   */
  public disconnect(): void {
    this.clearReconnectTimeout();
    if (this.ws) {
      // Remove event listeners before closing to prevent reconnection loops
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.reconnectAttempts = 0;
  }

  /**
   * Registers a callback for a specific channel and symbols.
   * Employs reference counting: it triggers a WebSocket subscribe if the symbol
   * is not currently subscribed, and returns a cleanup function to unsubscribe.
   *
   * @param channel The channel name.
   * @param symbols An array of trading symbols (e.g. ['BTCUSD', 'ETHUSD']).
   * @param callback The callback invoked when a matching message arrives.
   * @returns A cleanup function to unsubscribe this specific listener.
   */
  public subscribe<C extends TChannelName>(
    channel: C,
    symbols: string[],
    callback: (data: ChannelMessageMap[C]) => void
  ): () => void {
    const routedCallback = callback as (data: WebSocketChannelMessage) => void;
    symbols.forEach((symbol) => {
      // 1. Add to listeners structure
      if (!this.listeners.has(channel)) {
        this.listeners.set(channel, new Map());
      }
      const symbolMap = this.listeners.get(channel)!;
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, new Set());
      }
      symbolMap.get(symbol)!.add(routedCallback);

      // 2. Manage subscription status
      if (!this.activeSubscriptions.has(channel)) {
        this.activeSubscriptions.set(channel, new Set());
      }
      const activeSymbols = this.activeSubscriptions.get(channel)!;

      // If this symbol is not yet active on the WebSocket, register it
      if (!activeSymbols.has(symbol)) {
        activeSymbols.add(symbol);

        // Send subscribe message to WebSocket immediately if connected
        if (this.connectionState === ConnectionState.CONNECTED) {
          this.sendSubscribeRequest(channel, [symbol]);
        }
      }
    });

    // Return the cleanup function for unsubscribing
    return () => {
      this.unsubscribe(channel, symbols, routedCallback);
    };
  }

  /**
   * Unsubscribes a callback from the specified channel and symbols.
   * If no callbacks remain for a symbol/channel, sends an unsubscribe request.
   */
  private unsubscribe(
    channel: TChannelName,
    symbols: string[],
    callback: (data: WebSocketChannelMessage) => void
  ): void {
    symbols.forEach((symbol) => {
      const symbolMap = this.listeners.get(channel);
      if (!symbolMap) return;

      const callbacks = symbolMap.get(symbol);
      if (!callbacks) return;

      callbacks.delete(callback);

      // If no callbacks are left for this symbol, clear subscription
      if (callbacks.size === 0) {
        symbolMap.delete(symbol);

        const activeSymbols = this.activeSubscriptions.get(channel);
        if (activeSymbols) {
          activeSymbols.delete(symbol);

          if (this.connectionState === ConnectionState.CONNECTED) {
            this.sendUnsubscribeRequest(channel, [symbol]);
          }

          if (activeSymbols.size === 0) {
            this.activeSubscriptions.delete(channel);
          }
        }
      }

      if (symbolMap.size === 0) {
        this.listeners.delete(channel);
      }
    });
  }

  /**
   * Registers a listener for connection state changes (e.g. CONNECTING, CONNECTED, etc.)
   */
  public addStateListener(cb: (state: TConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    // Trigger immediately with current state
    cb(this.connectionState);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  /**
   * Registers a global listener for all raw messages received from the socket.
   */
  public addGlobalMessageListener(cb: (message: WebSocketChannelMessage) => void): () => void {
    this.globalMessageListeners.add(cb);
    return () => {
      this.globalMessageListeners.delete(cb);
    };
  }

  /**
   * Low-level socket event bindings.
   */
  private registerSocketEvents(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.setConnectionState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.resubscribeAll();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const rawData = JSON.parse(event.data) as WebSocketChannelMessage;

        // Dispatch to global listeners
        this.globalMessageListeners.forEach((cb) => cb(rawData));

        // Route to specific subscribers based on channel type and symbol
        const channelName = rawData.type as TChannelName;
        const symbol = rawData.symbol;

        if (channelName && symbol) {
          const symbolMap = this.listeners.get(channelName);
          if (symbolMap) {
            const callbacks = symbolMap.get(symbol);
            if (callbacks) {
              callbacks.forEach((cb) => cb(rawData));
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse or route incoming WebSocket message:', err);
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error('WebSocket error encountered:', error);
      // Let onclose handle the reconnection logic
      this.ws?.close();
    };

    this.ws.onclose = () => {
      this.handleDisconnect();
    };
  }

  /**
   * Triggers reconnection attempts with exponential backoff & randomized jitter.
   */
  private handleDisconnect(): void {
    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.clearReconnectTimeout();

    // Exponential Backoff calculation: base * 2^attempts (capped at max delay) + Jitter
    const rawDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    const delayWithJitter = Math.min(this.maxReconnectDelay, rawDelay) + Math.random() * 1000;

    this.reconnectAttempts++;
    // max reconnect attempts is 10
    if (this.reconnectAttempts > 10) {
      console.error('WebSocket disconnected. Max reconnect attempts reached.');
      this.disconnect();
      return;
    }
    console.warn(`WebSocket disconnected. Retrying in ${Math.round(delayWithJitter)}ms (Attempt ${this.reconnectAttempts})...`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delayWithJitter);
  }

  /**
   * Sends subscribe requests for all currently tracked active subscriptions.
   * Useful when restoring connection after a disconnect.
   */
  private resubscribeAll(): void {
    if (this.activeSubscriptions.size === 0) return;

    const channelsToSubscribe: Array<{ name: TChannelName; symbols: string[] }> = [];

    this.activeSubscriptions.forEach((symbols, channel) => {
      if (symbols.size > 0) {
        channelsToSubscribe.push({
          name: channel,
          symbols: Array.from(symbols),
        });
      }
    });

    if (channelsToSubscribe.length === 0) return;

    this.sendRaw({
      type: 'subscribe',
      payload: { channels: channelsToSubscribe },
    });
  }

  private sendSubscribeRequest(channel: TChannelName, symbols: string[]): void {
    this.sendRaw({
      type: 'subscribe',
      payload: {
        channels: [{ name: channel, symbols }],
      },
    });
  }

  private sendUnsubscribeRequest(channel: TChannelName, symbols: string[]): void {
    this.sendRaw({
      type: 'unsubscribe',
      payload: {
        channels: [{ name: channel, symbols }],
      },
    });
  }

  /**
   * Core send function with connection readyState guard.
   */
  private sendRaw(msg: SubscriptionMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.error('Failed to send raw message over WebSocket:', err);
      }
    }
  }

  private setConnectionState(state: TConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.stateListeners.forEach((cb) => cb(state));
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
}

// Create and export a default workspace instance (connecting to localhost by default)
export const defaultWebSocketService = new WebSocketService(WEBSOCKET_URL);
