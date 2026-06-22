import { useRef, useState, useEffect } from 'react';
import { useTradesFeed } from '../hooks/useTradesFeed';
import type { AggregatedTrade, RollingStats } from '../hooks/useTradesFeed';

interface TradesFeedProps {
  symbol: string;
  largeTradeThreshold: number;
  onThresholdChange: (val: number) => void;
}

// 1. TradesFeedName Sub-Component
export function TradesFeedName({ symbol }: { symbol: string }) {
  return (
    <div className="panel-title">
      <span>Recent Trades — {symbol}</span>
    </div>
  );
}

// 2. LargeTrade Sub-Component
export function LargeTrade({
  threshold,
  onChange,
}: {
  threshold: number;
  onChange: (val: number) => void;
}) {
  const [inputValue, setInputValue] = useState(threshold.toString());

  // Keep state sync with external changes
  useEffect(() => {
    setInputValue(threshold.toString());
  }, [threshold]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setInputValue(rawVal);

    // Parse to number and notify parent (if valid positive number)
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    }
  };

  return (
    <div className="trades-controls">
      <span className="control-label">Large trade ≥</span>
      <div className="threshold-input-wrapper">
        <span className="threshold-currency">$</span>
        <input
          type="text"
          className="threshold-input"
          value={inputValue}
          onChange={handleChange}
          placeholder="0"
        />
      </div>
    </div>
  );
}

// Helper to format values
function formatPrice(val: number, symbol: string): string {
  const precisionMap: Record<string, number> = {
    BTCUSD: 1,
    ETHUSD: 2,
    XRPUSD: 4,
    SOLUSD: 4,
    PAXGUSD: 2,
    DOGEUSD: 6,
  };
  const precision = precisionMap[symbol] ?? 2;
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function formatSize(val: number): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

// 3. TradeTable Sub-Component
export function TradeTable({
  trades,
  symbol,
  scrollContainerRef,
  onScroll,
}: {
  trades: AggregatedTrade[];
  symbol: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="trades-table-container">
      {/* Column Headers */}
      <div className="table-header-row" style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
        <div>Time</div>
        <div>Price (USD)</div>
        <div>Size ({symbol.replace('USD', '')})</div>
      </div>

      {/* Trades Scrollable viewport */}
      <div
        className="trades-list-viewport"
        ref={scrollContainerRef}
        onScroll={onScroll}
      >
        {trades.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Awaiting new trade updates...
          </div>
        ) : (
          trades.map((trade) => {
            const sideClass = trade.side === 'buy' ? 'buy-trade' : 'sell-trade';
            const largeClass = trade.isLarge ? 'large-trade' : '';

            return (
              <div
                key={trade.id}
                className={`trade-row ${sideClass} ${largeClass}`}
              >
                <div>{trade.timeStr}</div>
                <div className="price-col">{formatPrice(trade.price, symbol)}</div>
                <div>
                  {formatSize(trade.size)}
                  {trade.count > 1 && (
                    <span className="trade-count">({trade.count})</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// 4. JumpToLatest Sub-Component
export function JumpToLatest({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="jump-to-latest-container">
      <button className="btn-jump-to-latest" onClick={onClick}>
        ↑ Jump to latest
      </button>
    </div>
  );
}

// 5. RollingStatsBar Sub-Component
export function RollingStatsBar({
  stats,
  symbol,
}: {
  stats: RollingStats;
  symbol: string;
}) {
  const assetName = symbol.replace('USD', '');

  return (
    <div className="rolling-stats-header">
      <div className="stat-item">
        <span className="stat-label">1m Volume</span>
        <span className="stat-val volumes">
          <span className="buy-vol">{formatSize(stats.buyVolume)} buy</span>
          <span className="sell-vol">{formatSize(stats.sellVolume)} sell</span>
        </span>
      </div>
      <div className="stat-item">
        <span className="stat-label">1m Trades</span>
        <span className="stat-val">{stats.tradeCount.toLocaleString()}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Avg Size</span>
        <span className="stat-val">{formatSize(stats.avgSize)} {assetName}</span>
      </div>
    </div>
  );
}

// Root TradesFeed Component
export function TradesFeed({
  symbol,
  largeTradeThreshold,
  onThresholdChange,
}: TradesFeedProps) {
  console.log('trade render');
  const feed = useTradesFeed(symbol, largeTradeThreshold);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Monitor scroll movements to determine if the user has scrolled down (away from the latest)
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Since we unshift items to the top,scrollTop = 0 is the newest trades.
    // If scrollTop > 15, we are looking at older trades.
    if (el.scrollTop > 15) {
      setAutoScroll(false);
      setShowJumpToLatest(true);
    } else {
      setAutoScroll(true);
      setShowJumpToLatest(false);
    }
  };

  const handleJumpToLatest = () => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = 0; // Scroll back to top
      setAutoScroll(true);
      setShowJumpToLatest(false);
    }
  };

  // Auto scroll to top when new trades arrive and autoScroll is active
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [feed.trades, autoScroll]);

  return (
    <div className="panel">
      <div className="panel-header">
        <TradesFeedName symbol={symbol} />
        <LargeTrade threshold={largeTradeThreshold} onChange={onThresholdChange} />
      </div>

      {/* Rolling Stats Header Section */}
      <RollingStatsBar stats={feed.stats} symbol={symbol} />

      {/* Trades List Viewport */}
      <TradeTable
        trades={feed.trades}
        symbol={symbol}
        scrollContainerRef={scrollContainerRef}
        onScroll={handleScroll}
      />

      {/* Floating Jump to Latest Button */}
      <JumpToLatest visible={showJumpToLatest} onClick={handleJumpToLatest} />

      <div className="section-marker-caption" style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
        <span>→ SECTION 3: Trades Feed — all_trades channel, focused product</span>
        <span>Updates: 10-40ms default, 1-5ms under stress</span>
      </div>
    </div>
  );
}

export default TradesFeed;
