- Implement WebSocketService in src/socket folder. The service should be generic and in typescript and readable with clear functions (ws related functions) It should use these type of 4 channels - 'v2/ticker' | 'ticker' | 'l2_orderbook' | 'all_trades'

Implement all hooks now.
- Their will be 3 hooks ideally. 
- 1st, useTickers.ts. This will register as a handler with WebSocketService for channel `v2/ticker` for all types of tickers available and will manage all state for Ticker component.
- 2nd, useOrderBook.ts This will register as a handler with WebSocketService for channel `l2_orderbook` and will manage all state for OrderBookPanel component.
- 3rd, useTradesFeed.ts. This will register as a handler with WebSocketService for channel `all_trades` and will manage all state for  TradesFeedPanel component

[Screenshot_2026-03-01_at_11.51.33_PM.png](file:///live-trading-dashboard/public/build/Screenshot_2026-03-01_at_11.51.33_PM.png) 
Remove everything from App.tsx. implement this dashboard skeleton UI from the screenshot attached.
- Include components in src/components.
- ConnectionStatus(top one).
- TickerBar(2nd top).
- OrderBook(left). It will have Name, Group and OrderTable components.
- TradesFeed (right). It will have Name, LargeTrade, TradeTable and JumpToLatest components.
- For now don't display the data , just mere components as in the screenshot.
- For each section UI read the requirements from the pdf attached

FOr 'groupingInterval' dont take it as an input in useOrderBook. Use local state that sets group which will be a derivate of that symbol and return that setGroup function from that hook and use that function directly.


Architecture Doc — Generation Prompt

Setup
- Write an architecture doc for this live crypto trading dashboard
- Use tables and diagrams where they help; reference real file and hook names.

Architecture Overview
- Explain the three layers: WebSocket layer → state/processing hooks → React component tree.
- Include a diagram: backend → WebSocketService → hooks → UI components.
- Describe WebSocketService as a singleton with one connection and reconnect with exponential backoff + jitter.
- Document the focus model: all 6 tickers always subscribed; order book + trades only for the clicked/focused symbol.
- List the three channels and their hooks `v2/ticker`, `l2_orderbook`, `all_trades`.
- Explain useStreaming hook
- Tab hidden strategy

Performance Strategy
- Document what broke at high update rates and what we did about it.
- Problems and fixes: Order book problem, unthrottled setState caused UI jank and browser freeze, Trades problem, Tickers problem across 6 symbols. 50ms throttle, refs to maintain latest snapshot, 100ms batch interval for rolling status bar and trades
- Background tab problem: wasted CPU and network while tab changes. usStreaming hook

Order Book Grouping
- Mention the pipeline in pointers and approach of using latestMessageRef that groups instantly without any network cost or resubscribing to websocket 

Tradeoffs
- What we simplified for the demo vs what production would need.
- 6 hardcoded symbols, no env usage, no virtualisation, no store for demo, error boundary for graceful handling. 
- Worker based approach for processing order book and trades at large scale and prevent UI janks

Scaling — 50 Symbols with Full Order Book + Trades
- Even with throttling, the volume of messages for 100 subscriptions (50 order books, 50 trade feeds) would choke the main thread. The `WebSocketService` would be dispatching to hundreds of handlers, 
- The processing load from all active hooks instances would cause extreme lag and make the UI unresponsive.
- Storing 50 full order books and 50 trade histories (500 items each) directly in React state would consume a significant amount of RAM, leading to poor performance and potential browser crashes.
- Move L2 grouping + trade batching to a SharedWorker or dedicated worker thread
- Single worker pool - one aggregation pipeline, instead of 50 independent hook instances
- Retain only visible depth i.e top X amount of data
