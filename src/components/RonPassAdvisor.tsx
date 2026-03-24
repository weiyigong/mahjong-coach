import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { evaluateRonPass } from '../engine/strategy';
import { TileComponent } from './TileComponent';
import { tileDisplayName } from '../engine/tiles';

export const RonPassAdvisor: React.FC = () => {
  const gameState = useGameStore();
  const { winningTileAppeared, winningTileFrom, clearWinningTile } = gameState;

  const advice = useMemo(() => {
    if (!winningTileAppeared) return null;
    return evaluateRonPass(gameState);
  }, [winningTileAppeared, winningTileFrom, gameState]);

  if (!winningTileAppeared || !advice) return null;

  const windLabel = (wind: string | null): string => {
    const map: Record<string, string> = { east: '東家', south: '南家', west: '西家', north: '北家' };
    return wind ? (map[wind] ?? wind) : '某家';
  };

  const ronColor = '#e17055';
  const tsumoColor = '#00b894';
  const mainColor = advice.shouldRon ? ronColor : tsumoColor;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      zIndex: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}
    onClick={clearWinningTile}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 16,
          padding: '20px 18px',
          maxWidth: 400,
          width: '100%',
          border: `2px solid ${mainColor}60`,
          boxShadow: `0 0 32px ${mainColor}30`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 4,
          }}>
            和了牌出現！
          </div>
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
            marginBottom: 10,
          }}>
            {windLabel(winningTileFrom)} 棄牌
          </div>

          {/* Winning tile display */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <TileComponent
              tile={winningTileAppeared}
              size="lg"
              highlighted={true}
            />
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
          }}>
            {tileDisplayName(winningTileAppeared)}
          </div>
        </div>

        {/* Recommendation badge */}
        <div style={{
          textAlign: 'center',
          marginBottom: 16,
          padding: '10px',
          background: `${mainColor}15`,
          borderRadius: 10,
          border: `1px solid ${mainColor}40`,
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: mainColor,
            marginBottom: 4,
          }}>
            {advice.shouldRon ? '✅ 建議榮和' : '🔄 建議見逃'}
          </div>
          <div style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.5,
          }}>
            {advice.reason}
          </div>
        </div>

        {/* Ron vs Tsumo stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 16,
        }}>
          {/* Ron column */}
          <div style={{
            background: `${ronColor}12`,
            borderRadius: 10,
            padding: '10px 8px',
            border: `1px solid ${ronColor}30`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: ronColor, fontWeight: 700, marginBottom: 6 }}>
              榮和 Ron
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {advice.ronValue.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>点</div>
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 4,
            }}>
              → 第 {advice.ronPlacement} 位
            </div>
          </div>

          {/* Tsumo column */}
          <div style={{
            background: `${tsumoColor}12`,
            borderRadius: 10,
            padding: '10px 8px',
            border: `1px solid ${tsumoColor}30`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: tsumoColor, fontWeight: 700, marginBottom: 6 }}>
              摸牌勝 Tsumo
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {advice.tsumoValue.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>点</div>
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 4,
            }}>
              → 第 {advice.tsumoPlacement} 位
            </div>
            <div style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              marginTop: 2,
            }}>
              概率 {Math.round(advice.tsumoProb * 100)}%
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={clearWinningTile}
            style={{
              flex: 1,
              padding: '12px 8px',
              borderRadius: 10,
              border: `1.5px solid ${ronColor}60`,
              background: advice.shouldRon ? `${ronColor}25` : 'transparent',
              color: ronColor,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            榮和
          </button>
          <button
            onClick={clearWinningTile}
            style={{
              flex: 1,
              padding: '12px 8px',
              borderRadius: 10,
              border: `1.5px solid ${tsumoColor}60`,
              background: !advice.shouldRon ? `${tsumoColor}25` : 'transparent',
              color: tsumoColor,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            見逃
          </button>
        </div>
      </div>
    </div>
  );
};
