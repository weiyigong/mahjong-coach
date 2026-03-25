import React from 'react';
import type { RiichiAdvice, Tile } from '../types';
import { tileDisplayName } from '../engine/tiles';

interface RiichiAdvisorProps {
  advice: RiichiAdvice;
}

const SUIT_COLORS: Record<string, string> = {
  man: '#ff6b6b',
  pin: '#74b9ff',
  sou: '#55efc4',
  honor: '#ffd93d',
};

function TilePip({ tile, remaining }: { tile: Tile; remaining: number }) {
  const color = SUIT_COLORS[tile.suit] ?? '#e0e0e0';
  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      margin: '0 3px',
    }}>
      <div style={{
        background: `${color}18`,
        border: `1px solid ${color}50`,
        borderRadius: 5,
        padding: '2px 5px',
        fontSize: 12,
        fontWeight: 700,
        color,
        lineHeight: 1.3,
      }}>
        {tileDisplayName(tile)}
      </div>
      <div style={{
        fontSize: 9,
        color: 'rgba(255,255,255,0.35)',
        marginTop: 1,
      }}>
        ×{remaining}
      </div>
    </div>
  );
}

export const RiichiAdvisor: React.FC<RiichiAdvisorProps> = ({ advice }) => {
  const { shouldRiichi, riichiEV, damaEV, reasons, waitAnalysis } = advice;

  const mainColor = shouldRiichi ? '#00b894' : '#fdcb6e';
  const waitTypeLabel = waitAnalysis.waitType === 'good'
    ? '良形'
    : waitAnalysis.waitType === 'decent'
    ? '普通形'
    : '愚形';
  const waitTypeBadgeColor = waitAnalysis.waitType === 'good'
    ? '#00b894'
    : waitAnalysis.waitType === 'decent'
    ? '#fdcb6e'
    : '#e17055';

  // EV bar: proportional display
  const totalEV = Math.max(1, Math.abs(riichiEV) + Math.abs(damaEV));
  const riichiBarPct = Math.max(5, Math.min(90, ((riichiEV + totalEV) / (2 * totalEV)) * 100));
  const damaBarPct = 100 - riichiBarPct;

  return (
    <div style={{
      background: `${mainColor}0d`,
      borderRadius: 12,
      padding: '10px 12px',
      border: `1px solid ${mainColor}35`,
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          background: `${mainColor}22`,
          border: `1px solid ${mainColor}55`,
          borderRadius: 8,
          padding: '4px 12px',
        }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: mainColor }}>
            {shouldRiichi ? '立直！' : '黙聽（ダマ）'}
          </span>
        </div>

        {/* Wait type badge */}
        <div style={{
          background: `${waitTypeBadgeColor}18`,
          border: `1px solid ${waitTypeBadgeColor}45`,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: waitTypeBadgeColor,
        }}>
          {waitTypeLabel}
        </div>

        <div style={{
          marginLeft: 'auto',
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
        }}>
          {waitAnalysis.totalRemaining}張殘
        </div>
      </div>

      {/* Wait tiles */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        marginBottom: 8,
        padding: '5px 6px',
        background: 'rgba(0,0,0,0.18)',
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>聽:</span>
        {waitAnalysis.waitTiles.map((tile, i) => (
          <TilePip key={i} tile={tile} remaining={0} />
        ))}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>
          共{waitAnalysis.totalRemaining}張
        </span>
      </div>

      {/* EV comparison bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 3,
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
        }}>
          <span>立直 EV: <span style={{ color: '#00b894', fontWeight: 600 }}>{riichiEV.toLocaleString()}</span></span>
          <span>黙聽 EV: <span style={{ color: '#fdcb6e', fontWeight: 600 }}>{damaEV.toLocaleString()}</span></span>
        </div>
        <div style={{
          display: 'flex',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          gap: 1,
        }}>
          <div style={{
            width: `${riichiBarPct}%`,
            background: shouldRiichi ? '#00b894' : 'rgba(0,184,148,0.35)',
            borderRadius: '3px 0 0 3px',
            transition: 'width 0.3s',
          }} />
          <div style={{
            width: `${damaBarPct}%`,
            background: !shouldRiichi ? '#fdcb6e' : 'rgba(253,203,110,0.35)',
            borderRadius: '0 3px 3px 0',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Reason bullets */}
      <div style={{
        padding: '6px 8px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        borderLeft: `3px solid ${mainColor}60`,
      }}>
        {reasons.map((r, i) => (
          <div key={i} style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.6,
            paddingLeft: 8,
            position: 'relative',
          }}>
            <span style={{
              position: 'absolute',
              left: 0,
              color: mainColor,
              fontWeight: 700,
            }}>·</span>
            {r}
          </div>
        ))}
      </div>
    </div>
  );
};
