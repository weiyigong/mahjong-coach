import React, { useMemo, useState } from 'react';
import type { Tile, PickTarget, Wind } from '../types';
import { ALL_TILE_TYPES, createTile, tileToIndex } from '../engine/tiles';
import { TileComponent } from './TileComponent';
import { useGameStore } from '../store/gameStore';
import { tilesToCounts } from '../engine/tiles';
import { calcShanten } from '../engine/shanten';

const TARGET_LABELS: Record<PickTarget, string> = {
  hand: '我的手牌',
  east: '东家棄牌',
  south: '南家棄牌',
  west: '西家棄牌',
  north: '北家棄牌',
  dora: '寶牌指示',
  myDiscard: '我的棄牌',
};

const TARGET_COLORS: Record<PickTarget, string> = {
  hand: '#a29bfe',
  east: '#74b9ff',
  south: '#ff7675',
  west: '#55efc4',
  north: '#fdcb6e',
  dora: '#fd79a8',
  myDiscard: '#636e72',
};

export const TilePicker: React.FC = () => {
  const {
    pickTarget,
    seatWind,
    myHand,
    lastDrawnTile,
    myDiscards,
    myMelds,
    doraIndicators,
    opponents,
    setPickTarget,
    addTileToHand,
    setDrawnTile,
    addTileToOpponentDiscard,
    addDoraIndicator,
    setWinningTileAppeared,
  } = useGameStore();

  const [winningTileMode, setWinningTileMode] = useState(false);
  const [winningTileOpponent, setWinningTileOpponent] = useState<Wind | null>(null);

  // Check if at tenpai (shanten = 0)
  const isAtTenpai = useMemo(() => {
    const counts = tilesToCounts(myHand);
    return calcShanten(counts, myMelds.length) === 0;
  }, [myHand, myMelds]);

  // Count all visible tiles to show remaining counts
  const visibleCounts = useMemo(() => {
    const counts = new Array(34).fill(0);
    for (const t of myHand) counts[tileToIndex(t)]++;
    if (lastDrawnTile) counts[tileToIndex(lastDrawnTile)]++;
    for (const t of myDiscards) counts[tileToIndex(t)]++;
    for (const m of myMelds) for (const t of m.tiles) counts[tileToIndex(t)]++;
    for (const t of doraIndicators) counts[tileToIndex(t)]++;
    for (const opp of opponents) {
      for (const d of opp.discards) counts[tileToIndex(d.tile)]++;
      for (const m of opp.melds) for (const t of m.tiles) counts[tileToIndex(t)]++;
    }
    return counts;
  }, [myHand, lastDrawnTile, myDiscards, myMelds, doraIndicators, opponents]);

  const handleTileTap = (suit: Tile['suit'], value: number) => {
    const idx = tileToIndex(createTile(suit, value));
    const remaining = 4 - visibleCounts[idx];
    if (remaining <= 0) return; // no tiles left

    // Winning tile mode: set winning tile and open advisor
    if (winningTileMode) {
      setWinningTileAppeared(createTile(suit, value), winningTileOpponent);
      setWinningTileMode(false);
      setWinningTileOpponent(null);
      return;
    }

    switch (pickTarget) {
      case 'hand':
        addTileToHand(suit, value);
        break;
      case 'east':
      case 'south':
      case 'west':
      case 'north':
        addTileToOpponentDiscard(pickTarget, suit, value);
        break;
      case 'dora':
        addDoraIndicator(suit, value);
        break;
      case 'myDiscard':
        // Add to my discards (tracked separately)
        break;
    }
  };

  const suits: Array<{ key: 'man' | 'pin' | 'sou'; label: string; values: number[] }> = [
    { key: 'man', label: '万子', values: [1,2,3,4,5,6,7,8,9] },
    { key: 'pin', label: '筒子', values: [1,2,3,4,5,6,7,8,9] },
    { key: 'sou', label: '索子', values: [1,2,3,4,5,6,7,8,9] },
  ];

  const honors: Array<{ value: number; label: string }> = [
    { value: 1, label: '東' },
    { value: 2, label: '南' },
    { value: 3, label: '西' },
    { value: 4, label: '北' },
    { value: 5, label: '白' },
    { value: 6, label: '發' },
    { value: 7, label: '中' },
  ];

  const activeColor = TARGET_COLORS[pickTarget];

  const allWinds: PickTarget[] = ['east', 'south', 'west', 'north'];
  const opponentWinds = allWinds.filter(w => w !== seatWind);
  const targets: PickTarget[] = ['hand', ...opponentWinds, 'dora'];

  return (
    <div style={{
      background: '#12122a',
      borderRadius: 12,
      padding: '10px 8px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Target selector */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 10,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {targets.map(target => (
          <button
            key={target}
            onClick={() => setPickTarget(target)}
            style={{
              padding: '5px 8px',
              borderRadius: 8,
              border: `1px solid ${pickTarget === target ? TARGET_COLORS[target] : 'rgba(255,255,255,0.15)'}`,
              background: pickTarget === target ? `${TARGET_COLORS[target]}25` : 'transparent',
              color: pickTarget === target ? TARGET_COLORS[target] : 'rgba(255,255,255,0.5)',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: pickTarget === target ? 700 : 400,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {TARGET_LABELS[target]}
          </button>
        ))}
      </div>

      {/* 和了牌出現 button (shown when at tenpai) */}
      {isAtTenpai && !winningTileMode && (
        <div style={{ marginBottom: 8, textAlign: 'center' }}>
          <button
            onClick={() => {
              setWinningTileMode(true);
              setWinningTileOpponent(null);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1.5px solid #fdcb6e80',
              background: '#fdcb6e18',
              color: '#fdcb6e',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.3,
            }}
          >
            和了牌出現 — 分析榮和/見逃
          </button>
        </div>
      )}

      {/* Winning tile flow: opponent selector + tile pick prompt */}
      {winningTileMode && (
        <div style={{
          marginBottom: 10,
          padding: '10px 8px',
          background: '#fdcb6e12',
          border: '1.5px solid #fdcb6e50',
          borderRadius: 10,
        }}>
          <div style={{
            fontSize: 12,
            color: '#fdcb6e',
            fontWeight: 700,
            marginBottom: 6,
            textAlign: 'center',
          }}>
            {winningTileOpponent === null
              ? '選擇哪家棄牌為和了牌'
              : '點擊下方和了牌'}
          </div>
          {winningTileOpponent === null ? (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {opponents.map(opp => {
                const labels: Record<string, string> = { east: '東家', south: '南家', west: '西家', north: '北家' };
                return (
                  <button
                    key={opp.position}
                    onClick={() => setWinningTileOpponent(opp.position)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(253,203,110,0.4)',
                      background: 'rgba(253,203,110,0.12)',
                      color: '#fdcb6e',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {labels[opp.position] ?? opp.position}
                  </button>
                );
              })}
              <button
                onClick={() => { setWinningTileMode(false); setWinningTileOpponent(null); }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <button
                onClick={() => setWinningTileOpponent(null)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ← 返回
              </button>
              <button
                onClick={() => { setWinningTileMode(false); setWinningTileOpponent(null); }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {/* Current target indicator */}
      {!winningTileMode && (
      <div style={{
        textAlign: 'center',
        marginBottom: 8,
        fontSize: 12,
        color: activeColor,
        fontWeight: 600,
        letterSpacing: 0.5,
      }}>
        點擊添加到：{TARGET_LABELS[pickTarget]}
      </div>
      )}

      {/* Suited tiles */}
      {suits.map(suit => (
        <div key={suit.key} style={{ marginBottom: 6 }}>
          <div style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            marginBottom: 3,
            paddingLeft: 2,
          }}>
            {suit.label}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
          }}>
            {suit.values.map(value => {
              const tile = createTile(suit.key, value);
              const remaining = 4 - visibleCounts[tileToIndex(tile)];
              return (
                <TileComponent
                  key={`${suit.key}${value}`}
                  tile={tile}
                  size="sm"
                  count={remaining}
                  showCount={true}
                  dimmed={remaining <= 0}
                  onClick={remaining > 0 ? () => handleTileTap(suit.key, value) : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Honor tiles */}
      <div>
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.35)',
          marginBottom: 3,
          paddingLeft: 2,
        }}>
          字牌
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap' }}>
          {honors.map(({ value }) => {
            const tile = createTile('honor', value);
            const remaining = 4 - visibleCounts[tileToIndex(tile)];
            return (
              <TileComponent
                key={`honor${value}`}
                tile={tile}
                size="sm"
                count={remaining}
                showCount={true}
                dimmed={remaining <= 0}
                onClick={remaining > 0 ? () => handleTileTap('honor', value) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
