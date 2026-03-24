import React from 'react';
import type { StrategyResult } from '../types';
import { strategyLabel, strategyEmoji, strategyColor } from '../engine/strategy';

interface StrategyPanelProps {
  strategy: StrategyResult | null;
}

export const StrategyPanel: React.FC<StrategyPanelProps> = ({ strategy }) => {
  if (!strategy) {
    return (
      <div style={{
        background: '#12122a',
        borderRadius: 12,
        padding: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.25)',
        fontSize: 12,
      }}>
        輸入手牌后顯示策略建議
      </div>
    );
  }

  const color = strategyColor(strategy.mode);
  const label = strategyLabel(strategy.mode);
  const emoji = strategyEmoji(strategy.mode);

  return (
    <div style={{
      background: `${color}10`,
      borderRadius: 12,
      padding: '10px 12px',
      border: `1px solid ${color}35`,
    }}>
      {/* Strategy mode badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: `${color}20`,
          border: `1px solid ${color}50`,
          borderRadius: 8,
          padding: '4px 10px',
        }}>
          <span style={{ fontSize: 14 }}>{emoji}</span>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color,
          }}>
            {label}
          </span>
        </div>

        {/* Win probability */}
        {strategy.winProbability > 0 && (
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
          }}>
            和牌概率: <span style={{ color: color, fontWeight: 600 }}>
              {Math.round(strategy.winProbability * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Explanation */}
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.6,
        padding: '6px 8px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        borderLeft: `3px solid ${color}60`,
      }}>
        {strategy.explanation}
      </div>

      {/* Expected value note */}
      {strategy.expectedValue > 0 && (
        <div style={{
          marginTop: 6,
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          textAlign: 'right',
        }}>
          期望值约 {strategy.expectedValue.toFixed(0)} 点
        </div>
      )}
    </div>
  );
};
