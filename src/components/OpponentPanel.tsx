import React, { useState } from 'react';
import type { Opponent, Wind } from '../types';
import { TileComponent } from './TileComponent';
import { dangerLevelLabel, dangerLevelColor, dangerLevelEmoji } from '../engine/opponents';
import { windLabel } from '../engine/tiles';
import { useGameStore } from '../store/gameStore';

interface OpponentRowProps {
  opponent: Opponent;
  seatRelation: string; // 上家, 对家, 下家
}

const WIND_TO_RELATION: Record<Wind, string> = {
  east: '上家',
  south: '下家',
  west: '对家',
  north: '下家',
};

// We'll compute the real relation based on seat wind vs opp position
function getRelation(seatWind: Wind, oppPosition: Wind): string {
  const order: Wind[] = ['east', 'south', 'west', 'north'];
  const seatIdx = order.indexOf(seatWind);
  const oppIdx = order.indexOf(oppPosition);
  const diff = (oppIdx - seatIdx + 4) % 4;
  if (diff === 1) return '下家';  // next to discard, can chi
  if (diff === 2) return '对面';  // across
  if (diff === 3) return '上家';  // can take chi from them
  return '自家';
}

const OpponentRow: React.FC<OpponentRowProps & { seatWind: Wind }> = ({ opponent, seatRelation, seatWind }) => {
  const relation = getRelation(seatWind, opponent.position);
  const dangerColor = dangerLevelColor(opponent.dangerLevel);
  const [expanded, setExpanded] = useState(false);

  const {
    declareOpponentRiichi,
    removeLastOpponentDiscard,
  } = useGameStore();

  return (
    <div style={{
      marginBottom: 8,
      background: '#0e0e22',
      borderRadius: 10,
      padding: '8px 10px',
      border: `1px solid ${dangerColor}30`,
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#e0e0e0',
          }}>
            {windLabel(opponent.position)}家
          </span>
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
          }}>
            ({relation})
          </span>
          {opponent.riichiTurn !== null && (
            <span style={{
              background: '#e17055',
              color: '#fff',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 700,
            }}>
              立直
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Danger indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: `${dangerColor}15`,
            border: `1px solid ${dangerColor}40`,
            borderRadius: 6,
            padding: '2px 7px',
          }}>
            <span style={{ fontSize: 10 }}>{dangerLevelEmoji(opponent.dangerLevel)}</span>
            <span style={{ fontSize: 10, color: dangerColor, fontWeight: 600 }}>
              {dangerLevelLabel(opponent.dangerLevel)}
            </span>
          </div>

          {/* Actions */}
          <button
            onClick={() => removeLastOpponentDiscard(opponent.position)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
            }}
            title="撤销最后一张弃牌"
          >
            ↩
          </button>

          {opponent.riichiTurn === null && (
            <button
              onClick={() => declareOpponentRiichi(opponent.position)}
              style={{
                background: 'rgba(225,112,85,0.15)',
                border: '1px solid rgba(225,112,85,0.4)',
                color: '#e17055',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              立直
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 2px',
            }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Discard pond */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        minHeight: 32,
      }}>
        {opponent.discards.length === 0 ? (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', alignSelf: 'center' }}>
            暂无弃牌
          </span>
        ) : (
          opponent.discards.map((d, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <TileComponent
                tile={d.tile}
                size="xs"
              />
              {d.isTsumogiri && (
                <div style={{
                  position: 'absolute',
                  top: 0, right: 0,
                  width: 5, height: 5,
                  background: '#74b9ff',
                  borderRadius: '50%',
                  border: '1px solid #1a1a2e',
                }} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Expanded: melds + danger score */}
      {expanded && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
            危险度: {opponent.dangerScore}/100
          </div>
          <div style={{
            width: '100%',
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${opponent.dangerScore}%`,
              height: '100%',
              background: dangerColor,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>

          {opponent.melds.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                副露:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {opponent.melds.map((meld, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    gap: 2,
                    padding: '2px 4px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    {meld.tiles.map((t, j) => (
                      <TileComponent key={j} tile={t} size="xs" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const OpponentPanel: React.FC = () => {
  const { opponents, seatWind } = useGameStore();

  return (
    <div>
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 600,
        marginBottom: 8,
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
      }}>
        对手状况
      </div>
      {opponents.map(opp => (
        <OpponentRow
          key={opp.position}
          opponent={opp}
          seatRelation={WIND_TO_RELATION[opp.position]}
          seatWind={seatWind}
        />
      ))}
    </div>
  );
};
