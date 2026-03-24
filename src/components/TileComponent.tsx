import React from 'react';
import type { Tile } from '../types';
import { tileDisplayName } from '../engine/tiles';

interface TileComponentProps {
  tile: Tile;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  highlighted?: boolean;
  safetyScore?: number;
  onClick?: (tile: Tile) => void;
  onLongPress?: (tile: Tile) => void;
  dimmed?: boolean;
  count?: number; // remaining count badge
  showCount?: boolean;
}

const SUIT_COLORS: Record<string, string> = {
  man: '#ff6b6b',   // red for characters
  pin: '#74b9ff',   // blue for circles
  sou: '#55efc4',   // green for bamboo
  honor: '#ffd93d', // gold for honors
};

const SUIT_BG: Record<string, string> = {
  man: 'rgba(255,107,107,0.12)',
  pin: 'rgba(116,185,255,0.12)',
  sou: 'rgba(85,239,196,0.12)',
  honor: 'rgba(255,217,61,0.12)',
};

const SIZE_CONFIG = {
  xs: { width: 28, height: 36, fontSize: 10, valueFontSize: 14 },
  sm: { width: 36, height: 46, fontSize: 11, valueFontSize: 16 },
  md: { width: 44, height: 56, fontSize: 12, valueFontSize: 20 },
  lg: { width: 54, height: 68, fontSize: 13, valueFontSize: 24 },
};

const HONOR_CHARS: Record<number, string> = {
  1: '東', 2: '南', 3: '西', 4: '北', 5: '白', 6: '發', 7: '中',
};

const HONOR_COLORS: Record<number, string> = {
  1: '#74b9ff', 2: '#ff6b6b', 3: '#74b9ff', 4: '#55efc4',
  5: '#f0f0f0', 6: '#55efc4', 7: '#ff6b6b',
};

function getSafetyBorderColor(score: number): string {
  if (score >= 85) return '#00b894';
  if (score >= 60) return '#fdcb6e';
  if (score >= 40) return '#e17055';
  return '#d63031';
}

export const TileComponent: React.FC<TileComponentProps> = ({
  tile,
  size = 'md',
  selected = false,
  highlighted = false,
  safetyScore,
  onClick,
  onLongPress,
  dimmed = false,
  count,
  showCount = false,
}) => {
  const config = SIZE_CONFIG[size];
  const color = tile.suit === 'honor' ? HONOR_COLORS[tile.value] : SUIT_COLORS[tile.suit];
  const bg = SUIT_BG[tile.suit];

  const borderColor = safetyScore !== undefined
    ? getSafetyBorderColor(safetyScore)
    : selected
    ? '#a29bfe'
    : highlighted
    ? '#00b894'
    : 'rgba(255,255,255,0.15)';

  const borderWidth = (selected || highlighted || safetyScore !== undefined) ? 2 : 1;

  // Long press support
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  const handlePointerDown = () => {
    if (onLongPress) {
      pressTimer = setTimeout(() => { onLongPress(tile); }, 500);
    }
  };
  const handlePointerUp = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  const renderTileContent = () => {
    if (tile.suit === 'honor') {
      return (
        <span style={{
          fontSize: config.valueFontSize + 2,
          color,
          fontWeight: 'bold',
          lineHeight: 1,
          textShadow: `0 0 8px ${color}40`,
        }}>
          {HONOR_CHARS[tile.value]}
        </span>
      );
    }

    const suitChar = tile.suit === 'man' ? '万' : tile.suit === 'pin' ? '筒' : '索';
    return (
      <>
        <span style={{
          fontSize: config.valueFontSize,
          color,
          fontWeight: 'bold',
          lineHeight: 1,
        }}>
          {tile.value}
        </span>
        <span style={{
          fontSize: config.fontSize - 1,
          color: `${color}99`,
          lineHeight: 1,
          marginTop: 1,
        }}>
          {suitChar}
        </span>
      </>
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: config.width,
        height: config.height,
        background: selected ? `${bg.replace('0.12', '0.25')}` : bg,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: 6,
        cursor: onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.35 : 1,
        boxShadow: selected
          ? `0 0 12px ${color}50, inset 0 0 8px ${color}20`
          : highlighted
          ? `0 0 8px #00b89450`
          : '0 2px 4px rgba(0,0,0,0.3)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        flexShrink: 0,
      }}
      onClick={onClick ? () => onClick(tile) : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={e => { e.preventDefault(); if (onLongPress) onLongPress(tile); }}
    >
      {renderTileContent()}

      {/* Count badge */}
      {showCount && count !== undefined && (
        <div style={{
          position: 'absolute',
          top: -6,
          right: -6,
          background: count === 0 ? '#636e72' : count <= 1 ? '#e17055' : '#6c5ce7',
          color: '#fff',
          borderRadius: '50%',
          width: 16,
          height: 16,
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          border: '1px solid #1a1a2e',
          lineHeight: 1,
        }}>
          {count}
        </div>
      )}

      {/* Safety indicator dot */}
      {safetyScore !== undefined && (
        <div style={{
          position: 'absolute',
          bottom: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 6,
          height: 3,
          borderRadius: 2,
          background: getSafetyBorderColor(safetyScore),
          opacity: 0.9,
        }} />
      )}
    </div>
  );
};

// Compact tile name pill (for small displays)
export const TilePill: React.FC<{ tile: Tile; color?: string }> = ({ tile, color }) => {
  const c = color || (tile.suit === 'honor'
    ? HONOR_COLORS[tile.value]
    : SUIT_COLORS[tile.suit]);

  return (
    <span style={{
      display: 'inline-block',
      background: `${c}20`,
      border: `1px solid ${c}60`,
      color: c,
      borderRadius: 4,
      padding: '1px 5px',
      fontSize: 12,
      fontWeight: 600,
      margin: '0 2px',
    }}>
      {tileDisplayName(tile)}
    </span>
  );
};
