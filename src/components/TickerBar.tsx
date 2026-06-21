import { useTickers } from '../hooks/useTickers';
import type { TickerData } from '../hooks/useTickers';

interface TickerBarProps {
  focusedSymbol: string;
  onFocusSymbol: (symbol: string) => void;
}

export function formatSymbolPrice(price: number, symbol: string): string {
  const precisionMap: Record<string, number> = {
    BTCUSD: 1,
    ETHUSD: 2,
    XRPUSD: 4,
    SOLUSD: 4,
    PAXGUSD: 2,
    DOGEUSD: 6,
  };
  const precision = precisionMap[symbol] ?? 2;
  return price.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function TickerBar({ focusedSymbol, onFocusSymbol }: TickerBarProps) {
  const tickers = useTickers();
  const symbols = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'PAXGUSD', 'DOGEUSD'];

  return (
    <div className="ticker-bar-container">
      <div className="ticker-bar">
        {symbols.map((symbol) => {
          const data: TickerData | undefined = tickers[symbol];
          const isFocused = symbol === focusedSymbol;
          
          const lastPriceStr = data ? formatSymbolPrice(data.lastPrice, symbol) : 'Loading...';
          const change = data ? data.change24h : 0;
          const changeStr = data 
            ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` 
            : '0.00%';
          const isUp = change >= 0;

          return (
            <div
              key={symbol}
              className={`ticker-card ${isFocused ? 'focused' : ''}`}
              onClick={() => onFocusSymbol(symbol)}
            >
              <div className="ticker-header">
                <span className="ticker-symbol">{symbol}</span>
                <span className="ticker-price">{lastPriceStr}</span>
              </div>
              <div className="ticker-body">
                <span className="ticker-type">Perpetual</span>
                <span className={`ticker-change ${isUp ? 'up' : 'down'}`}>
                  {isUp ? '▲' : '▼'} {changeStr}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="section-marker-caption">
        <span>↑ SECTION 1: Ticker Strip — v2/ticker channel, all 6 symbols subscribed, click to focus</span>
        <span>Real-time updates: ~12-30 msgs/sec across all tickers</span>
      </div>
    </div>
  );
}

export default TickerBar;
