import React from 'react';
import type { Wind } from '../types';
import { windLabel, doraFromIndicator, createTile } from '../engine/tiles';
import { TileComponent } from './TileComponent';
import { useGameStore } from '../store/gameStore';

const WIND_OPTIONS: Wind[] = ['east', 'south', 'west', 'north'];
const WIND_LABELS: Record<Wind, string> = {
  east: '东', south: '南', west: '西', north: '北',
};

export const GameHeader: React.FC = () => {
  const {
    roundWind,
    seatWind,
    turnNumber,
    doraIndicators,
    isRiichi,
    setRoundWind,
    setSeatWind,
    advanceTurn,
    removeLastDora,
    setPickTarget,
    pickTarget,
    declareRiichi,
    resetGame,
    resetHand,
  } = useGameStore();

  const doraTiles = doraIndicators.map(ind => {
    const { suit, value } = doraFromIndicator(ind);
    return createTile(suit, value);
  });

  return (
    <div style={{
      background: '#1a1a2e',
      borderRadius: 12,
      padding: '10px 12px',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {/* Top row: round/seat wind and turn */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        flexWrap: 'wrap',
        gap: 6,
      }}>
        {/* Round info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Round wind selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>场风</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {WIND_OPTIONS.slice(0, 2).map(w => (
                <button
                  key={w}
                  onClick={() => setRoundWind(w)}
                  style={{
                    padding: '3px 7px',
                    borderRadius: 6,
                    border: `1px solid ${roundWind === w ? '#a29bfe' : 'rgba(255,255,255,0.15)'}`,
                    background: roundWind === w ? '#a29bfe25' : 'transparent',
                    color: roundWind === w ? '#a29bfe' : 'rgba(255,255,255,0.4)',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: roundWind === w ? 700 : 400,
                    minWidth: 32,
                  }}
                >
                  {WIND_LABELS[w]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

          {/* Seat wind selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>自风</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {WIND_OPTIONS.map(w => (
                <button
                  key={w}
                  onClick={() => setSeatWind(w)}
                  style={{
                    padding: '3px 7px',
                    borderRadius: 6,
                    border: `1px solid ${seatWind === w ? '#fd79a8' : 'rgba(255,255,255,0.15)'}`,
                    background: seatWind === w ? '#fd79a825' : 'transparent',
                    color: seatWind === w ? '#fd79a8' : 'rgba(255,255,255,0.4)',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: seatWind === w ? 700 : 400,
                    minWidth: 32,
                  }}
                >
                  {WIND_LABELS[w]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Turn counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>第</span>
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e0e0e0',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {turnNumber}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>巡</span>
          <button
            onClick={advanceTurn}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            +1
          </button>
        </div>
      </div>

      {/* Dora indicators */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>宝牌:</span>
        {doraIndicators.length === 0 ? (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
            点击下方"宝牌指示"添加
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {doraIndicators.map((ind, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TileComponent tile={ind} size="xs" />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>→</span>
                <TileComponent tile={doraTiles[i]} size="xs" highlighted />
              </div>
            ))}
            <button
              onClick={removeLastDora}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.3)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              ↩
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        {!isRiichi && (
          <button
            onClick={declareRiichi}
            style={{
              background: '#e1705520',
              border: '1px solid #e1705560',
              color: '#e17055',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            宣告立直
          </button>
        )}
        {isRiichi && (
          <div style={{
            background: '#e17055',
            color: '#fff',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}>
            立直中！
          </div>
        )}
        <button
          onClick={resetHand}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.4)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          清空手牌
        </button>
        <button
          onClick={resetGame}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.3)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          新局
        </button>
      </div>
    </div>
  );
};
