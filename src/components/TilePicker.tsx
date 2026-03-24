import React, { useMemo } from 'react';
import type { Tile, PickTarget } from '../types';
import { ALL_TILE_TYPES, createTile, tileToIndex } from '../engine/tiles';
import { TileComponent } from './TileComponent';
import { useGameStore } from '../store/gameStore';

const TARGET_LABELS: Record<PickTarget, string> = {
  hand: '我的手牌',
  east: '东家弃牌',
  south: '南家弃牌',
  west: '西家弃牌',
  north: '北家弃牌',
  dora: '宝牌指示',
  myDiscard: '我的弃牌',
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
  } = useGameStore();

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
    { value: 6, label: '発' },
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

      {/* Current target indicator */}
      <div style={{
        textAlign: 'center',
        marginBottom: 8,
        fontSize: 12,
        color: activeColor,
        fontWeight: 600,
        letterSpacing: 0.5,
      }}>
        点击添加到：{TARGET_LABELS[pickTarget]}
      </div>

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
            gap: 3,
            flexWrap: 'wrap',
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
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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
