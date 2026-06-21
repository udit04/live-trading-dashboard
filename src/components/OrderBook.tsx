import { useOrderBook, SYMBOL_CONFIGS } from '../hooks/useOrderBook';
import type { PriceLevel } from '../hooks/useOrderBook';

interface OrderBookProps {
  symbol: string;
}

// 1. OrderBookName Sub-Component
export function OrderBookName({ symbol }: { symbol: string }) {
  return (
    <div className="panel-title">
      <span>Order Book — {symbol}</span>
      <span className="live-badge">LIVE</span>
    </div>
  );
}

// 2. OrderBookGroup Sub-Component
export function OrderBookGroup({
  symbol,
  activeInterval,
  onChange,
}: {
  symbol: string;
  activeInterval: number;
  onChange: (interval: number) => void;
}) {
  const config = SYMBOL_CONFIGS[symbol] || { groupingOptions: [1, 5, 10] };
  
  return (
    <div className="orderbook-controls">
      <span className="control-label">Group:</span>
      <div className="group-buttons">
        {config.groupingOptions.map((opt) => (
          <button
            key={opt}
            className={`btn-group ${activeInterval === opt ? 'active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper to format values with symbol precision
function formatPrice(val: number, precision: number): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

// Helper to format sizes/volumes
function formatSize(val: number): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatCumulative(val: number): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// 3. OrderBookTable Sub-Component
export function OrderBookTable({
  bids,
  asks,
  midPrice,
  spread,
  spreadBps,
  imbalance,
  precision,
}: {
  bids: PriceLevel[];
  asks: PriceLevel[];
  midPrice: number;
  spread: number;
  spreadBps: number;
  imbalance: number;
  precision: number;
}) {
  // Find max cumulative volume in view for depth bar scaling
  const maxCumulative = Math.max(
    bids.length > 0 ? bids[bids.length - 1].cumulative : 1,
    asks.length > 0 ? asks[asks.length - 1].cumulative : 1
  );

  // Reverse asks for correct stack visualization: lowest ask (best ask) is at the bottom
  const reversedAsks = [...asks].reverse();

  const isBidHeavy = imbalance >= 1.0;
  const imbalanceText = `${imbalance.toFixed(2)} ${isBidHeavy ? 'bid heavy' : 'ask heavy'}`;

  return (
    <div className="order-book-table-container">
      {/* Column Headers */}
      <div className="table-header-row">
        <div>Total ({precision <= 2 ? 'BTC' : 'XRP'})</div>
        <div>Size ({precision <= 2 ? 'BTC' : 'XRP'})</div>
        <div>Price (USD)</div>
      </div>

      {/* Asks (Sell Side) - stacked descending (highest on top, best ask/lowest price at bottom) */}
      <div className="asks-section">
        {reversedAsks.map((level) => {
          const widthPercent = (level.cumulative / maxCumulative) * 100;
          return (
            <div
              key={`ask-${level.price}`}
              className={`order-book-row ${level.flash === 'up' ? 'flash-up' : level.flash === 'down' ? 'flash-down' : ''}`}
            >
              <div
                className="depth-bar"
                style={{ width: `${widthPercent}%` }}
              />
              <div className="row-val">{formatCumulative(level.cumulative)}</div>
              <div className="row-val">{formatSize(level.size)}</div>
              <div className="row-val price-col">{formatPrice(level.price, precision)}</div>
            </div>
          );
        })}
      </div>

      {/* Mid Price / Spread Separator */}
      <div className="mid-price-bar">
        <div className="mid-price-value">
          {midPrice > 0 ? formatPrice(midPrice, precision) : '0.0'}
        </div>
        <div className="spread-value">
          Spread: <span>{spread.toFixed(precision)}</span> ({spreadBps.toFixed(1)}bp)
        </div>
        <div className={`imbalance-value ${isBidHeavy ? 'bid-heavy' : 'ask-heavy'}`}>
          Imbalance: <span>{imbalanceText}</span>
        </div>
      </div>

      {/* Bids (Buy Side) - stacked descending (best bid/highest price on top, lowest price at bottom) */}
      <div className="bids-section">
        {bids.map((level) => {
          const widthPercent = (level.cumulative / maxCumulative) * 100;
          return (
            <div
              key={`bid-${level.price}`}
              className={`order-book-row ${level.flash === 'up' ? 'flash-up' : level.flash === 'down' ? 'flash-down' : ''}`}
            >
              <div
                className="depth-bar"
                style={{ width: `${widthPercent}%` }}
              />
              <div className="row-val">{formatCumulative(level.cumulative)}</div>
              <div className="row-val">{formatSize(level.size)}</div>
              <div className="row-val price-col">{formatPrice(level.price, precision)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Root OrderBook Component
export function OrderBook({ symbol }: OrderBookProps) {
  const {
    bids,
    asks,
    midPrice,
    spread,
    spreadBps,
    imbalance,
    isLoading,
    groupingInterval,
    setGroupingInterval,
  } = useOrderBook(symbol);
  const precision = SYMBOL_CONFIGS[symbol]?.precision ?? 2;

  return (
    <div className="panel">
      <div className="panel-header">
        <OrderBookName symbol={symbol} />
        <OrderBookGroup
          symbol={symbol}
          activeInterval={groupingInterval}
          onChange={setGroupingInterval}
        />
      </div>

      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          Loading Order Book data...
        </div>
      ) : (
        <OrderBookTable
          bids={bids}
          asks={asks}
          midPrice={midPrice}
          spread={spread}
          spreadBps={spreadBps}
          imbalance={imbalance}
          precision={precision}
        />
      )}
      
      <div className="section-marker-caption" style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
        <span>← SECTION 2: Order Book — l2_orderbook channel, focused product</span>
        <span>Updates: 50-100ms default, 10-20ms under stress</span>
      </div>
    </div>
  );
}

export default OrderBook;
