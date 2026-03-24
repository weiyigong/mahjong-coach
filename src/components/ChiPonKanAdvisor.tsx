import React, { useState } from 'react';
import type { Tile } from '../types';
import { TileComponent } from './TileComponent';
import { evaluateChi, evaluatePon, evaluateKan } from '../engine/chiponkan';
import { useGameStore } from '../store/gameStore';
import { tileDisplayName, ALL_TILE_TYPES, createTile } from '../engine/tiles';

export const ChiPonKanAdvisor: React.FC = () => {
  const gameState = useGameStore();
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [expanded, setExpanded] = useState(false);

  const chiAdvice = selectedTile ? evaluateChi(selectedTile, gameState) : [];
  const ponAdvice = selectedTile ? evaluatePon(selectedTile, gameState) : null;
  const kanAdvice = selectedTile ? evaluateKan(selectedTile, gameState, 'open') : null;

  const hasAnyAdvice = chiAdvice.length > 0 || ponAdvice !== null || kanAdvice !== null;

  return (
    <div style={{
      background: '#12122a',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          吃/碰/杠 顾问
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Tile selector: which tile was discarded by opponent */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
              对手打出的牌是：
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {/* Quick buttons for common tiles */}
              {ALL_TILE_TYPES.map(({ suit, value }) => {
                const t = createTile(suit, value);
                const isSelected = selectedTile?.suit === suit && selectedTile?.value === value;
                return (
                  <TileComponent
                    key={`${suit}${value}`}
                    tile={t}
                    size="xs"
                    selected={isSelected}
                    onClick={(tile) => setSelectedTile(isSelected ? null : tile)}
                  />
                );
              })}
            </div>
          </div>

          {selectedTile && (
            <div>
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
                marginBottom: 8,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 8,
              }}>
                分析: 对手打出 <strong style={{ color: '#e0e0e0' }}>{tileDisplayName(selectedTile)}</strong>
              </div>

              {!hasAnyAdvice && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 8 }}>
                  手牌中没有可以吃/碰/杠的牌组合
                </div>
              )}

              {/* Chi advice */}
              {chiAdvice.map((advice, i) => (
                <AdviceCard key={i} advice={advice} />
              ))}

              {/* Pon advice */}
              {ponAdvice && <AdviceCard advice={ponAdvice} />}

              {/* Kan advice */}
              {kanAdvice && <AdviceCard advice={kanAdvice} />}
            </div>
          )}

          {!selectedTile && (
            <div style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,0.2)',
              fontSize: 12,
              padding: 8,
            }}>
              选择对手出的牌来获取建议
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AdviceCardProps {
  advice: {
    action: 'chi' | 'pon' | 'kan';
    calledTile: Tile;
    meldTiles: Tile[];
    recommend: boolean;
    shantenBefore: number;
    shantenAfter: number;
    reason: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  chi: '吃',
  pon: '碰',
  kan: '杠',
};

const AdviceCard: React.FC<AdviceCardProps> = ({ advice }) => {
  const color = advice.recommend ? '#00b894' : '#e17055';
  const icon = advice.recommend ? '✅' : '❌';

  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 8,
      padding: '8px 10px',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color,
        }}>
          {ACTION_LABELS[advice.action]} ({advice.recommend ? '建议' : '不建议'})
        </span>

        {/* Meld tiles preview */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {advice.meldTiles.map((t, i) => (
            <TileComponent key={i} tile={t} size="xs" />
          ))}
        </div>
      </div>

      <div style={{
        fontSize: 11,
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 1.5,
      }}>
        {advice.reason}
      </div>

      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 5,
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
      }}>
        <span>操作前: {advice.shantenBefore}向听</span>
        <span>操作后: {advice.shantenAfter >= 0 ? `${advice.shantenAfter}向听` : '和了！'}</span>
      </div>
    </div>
  );
};
