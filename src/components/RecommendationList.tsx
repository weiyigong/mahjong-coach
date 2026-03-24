import React from 'react';
import type { DiscardRecommendation, StrategyMode } from '../types';
import { TileComponent } from './TileComponent';
import { shantenLabel } from '../engine/shanten';
import { strategyColor } from '../engine/strategy';

interface RecommendationListProps {
  recommendations: DiscardRecommendation[];
  mode: StrategyMode;
  onDiscard?: (rec: DiscardRecommendation) => void;
}

function getSafetyLabel(score: number): string {
  if (score >= 90) return '极安全';
  if (score >= 75) return '較安全';
  if (score >= 55) return '一般';
  if (score >= 35) return '有風險';
  return '危險！';
}

function getSafetyColor(score: number): string {
  if (score >= 75) return '#00b894';
  if (score >= 50) return '#fdcb6e';
  return '#e17055';
}

function getEfficiencyColor(effCount: number, maxCount: number): string {
  if (effCount === 0) return '#636e72';
  const ratio = effCount / Math.max(1, maxCount);
  if (ratio >= 0.8) return '#00b894';
  if (ratio >= 0.5) return '#fdcb6e';
  return '#e17055';
}

export const RecommendationList: React.FC<RecommendationListProps> = ({
  recommendations,
  mode,
  onDiscard,
}) => {
  if (recommendations.length === 0) {
    return (
      <div style={{
        background: '#12122a',
        borderRadius: 12,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
      }}>
        请先輸入手牌
      </div>
    );
  }

  const maxEffective = Math.max(...recommendations.map(r => r.effectiveTileCount));
  const topRecs = recommendations.slice(0, 5);

  return (
    <div style={{
      background: '#12122a',
      borderRadius: 12,
      padding: '10px 10px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 600,
        marginBottom: 8,
        letterSpacing: 0.5,
      }}>
        出牌建議 ({recommendations.length}种選擇)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {topRecs.map((rec, i) => {
          const isTop = i === 0;
          const effColor = getEfficiencyColor(rec.effectiveTileCount, maxEffective);
          const safColor = getSafetyColor(rec.safetyScore);

          return (
            <div
              key={`${rec.tile.suit}${rec.tile.value}`}
              onClick={onDiscard ? () => onDiscard(rec) : undefined}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                background: isTop
                  ? `${strategyColor(mode)}15`
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isTop ? `${strategyColor(mode)}40` : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10,
                cursor: onDiscard ? 'pointer' : 'default',
                transition: 'background 0.15s',
                position: 'relative',
              }}
            >
              {/* Rank badge */}
              <div style={{
                position: 'absolute',
                top: -6,
                left: -4,
                width: 20,
                height: 20,
                background: isTop ? strategyColor(mode) : 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: isTop ? '#1a1a2e' : 'rgba(255,255,255,0.5)',
                border: '1px solid #1a1a2e',
              }}>
                {isTop ? '★' : rec.rank}
              </div>

              {/* Tile */}
              <div style={{ paddingTop: 2, flexShrink: 0 }}>
                <TileComponent
                  tile={rec.tile}
                  size="sm"
                  safetyScore={rec.safetyScore}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Shanten + efficiency */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: rec.shantenAfter <= 0 ? '#00b894' : '#e0e0e0',
                  }}>
                    {shantenLabel(rec.shantenAfter)}
                  </span>

                  {rec.shantenAfter >= 0 && (
                    <span style={{
                      fontSize: 11,
                      color: effColor,
                      fontWeight: 600,
                    }}>
                      {rec.effectiveTileCount}张進張
                      {rec.effectiveTileTypes > 0 && ` (${rec.effectiveTileTypes}种)`}
                    </span>
                  )}

                  {/* Safety */}
                  <span style={{
                    fontSize: 10,
                    color: safColor,
                    background: `${safColor}15`,
                    border: `1px solid ${safColor}30`,
                    borderRadius: 4,
                    padding: '1px 5px',
                  }}>
                    安全{rec.safetyScore}%
                  </span>
                </div>

                {/* Reason */}
                <div style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.4,
                  wordBreak: 'break-all' as const,
                }}>
                  {rec.reason}
                </div>

                {/* Safety breakdown per opponent */}
                {rec.safetyBreakdown.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: 4,
                    marginTop: 4,
                    flexWrap: 'wrap',
                  }}>
                    {rec.safetyBreakdown.map(bd => (
                      <span key={bd.opponent} style={{
                        fontSize: 9,
                        color: getSafetyColor(bd.score),
                        background: `${getSafetyColor(bd.score)}12`,
                        border: `1px solid ${getSafetyColor(bd.score)}25`,
                        borderRadius: 3,
                        padding: '1px 4px',
                      }}>
                        {bd.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {recommendations.length > 5 && (
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          marginTop: 6,
        }}>
          还有 {recommendations.length - 5} 种選擇
        </div>
      )}
    </div>
  );
};
