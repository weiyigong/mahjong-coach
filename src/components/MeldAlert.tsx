import React, { useMemo } from 'react';
import type { Tile } from '../types';
import { TileComponent } from './TileComponent';
import { evaluateChi, evaluatePon, evaluateKan } from '../engine/chiponkan';
import { useGameStore } from '../store/gameStore';

/**
 * MeldAlert: shown on the main play tab.
 * Automatically checks the most recent opponent discard
 * to see if you can 吃/碰/杠, and shows inline advice.
 */
export const MeldAlert: React.FC = () => {
  const gameState = useGameStore();
  const { opponents, seatWind } = gameState;

  // Find the most recent opponent discard across all opponents
  const lastDiscard = useMemo(() => {
    let latest: { tile: Tile; position: string; turn: number } | null = null;
    for (const opp of opponents) {
      if (opp.discards.length === 0) continue;
      const last = opp.discards[opp.discards.length - 1];
      if (!latest || last.turn > latest.turn) {
        latest = { tile: last.tile, position: opp.position, turn: last.turn };
      }
    }
    return latest;
  }, [opponents]);

  const chiAdvice = useMemo(() => lastDiscard ? evaluateChi(lastDiscard.tile, gameState) : [], [lastDiscard, gameState]);
  const ponAdvice = useMemo(() => lastDiscard ? evaluatePon(lastDiscard.tile, gameState) : null, [lastDiscard, gameState]);
  const kanAdvice = useMemo(() => lastDiscard ? evaluateKan(lastDiscard.tile, gameState, 'open') : null, [lastDiscard, gameState]);

  const hasAdvice = chiAdvice.length > 0 || ponAdvice !== null || kanAdvice !== null;

  if (!lastDiscard || !hasAdvice) return null;

  const windLabels: Record<string, string> = { east: '東', south: '南', west: '西', north: '北' };

  return (
    <div style={{
      background: 'rgba(253,203,110,0.08)',
      border: '1px solid rgba(253,203,110,0.25)',
      borderRadius: 10,
      padding: '8px 10px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 11, color: '#fdcb6e', fontWeight: 700 }}>
          副露機會
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          {windLabels[lastDiscard.position]}家棄
        </span>
        <TileComponent tile={lastDiscard.tile} size="xs" highlighted />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chiAdvice.map((advice, i) => (
          <div key={`chi-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: advice.recommend ? 'rgba(0,184,148,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${advice.recommend ? 'rgba(0,184,148,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6,
            padding: '4px 8px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: advice.recommend ? '#00b894' : '#e17055' }}>
              {advice.recommend ? '✓ 吃' : '✕ 吃'}
            </span>
            <div style={{ display: 'flex', gap: 1 }}>
              {advice.meldTiles.map((t, j) => <TileComponent key={j} tile={t} size="xs" />)}
            </div>
          </div>
        ))}

        {ponAdvice && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: ponAdvice.recommend ? 'rgba(0,184,148,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${ponAdvice.recommend ? 'rgba(0,184,148,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6,
            padding: '4px 8px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ponAdvice.recommend ? '#00b894' : '#e17055' }}>
              {ponAdvice.recommend ? '✓ 碰' : '✕ 碰'}
            </span>
          </div>
        )}

        {kanAdvice && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: kanAdvice.recommend ? 'rgba(0,184,148,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${kanAdvice.recommend ? 'rgba(0,184,148,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6,
            padding: '4px 8px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: kanAdvice.recommend ? '#00b894' : '#e17055' }}>
              {kanAdvice.recommend ? '✓ 杠' : '✕ 杠'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
