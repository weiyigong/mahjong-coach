import React, { useState } from 'react';
import type { Wind, Opponent, PickTarget, Meld, Tile } from '../types';
import { windLabel, createTile } from '../engine/tiles';
import { TileComponent } from './TileComponent';
import { dangerLevelColor, dangerLevelEmoji } from '../engine/opponents';
import { useGameStore } from '../store/gameStore';

/**
 * Spatial mahjong table layout:
 *
 *        [ 對面 (across) ]
 *   [上家]              [下家]
 *        [  自家 (you)  ]
 *
 * Tap an opponent to set them as the active discard target.
 * Shows discards, riichi status, danger level inline.
 */

const WIND_ORDER: Wind[] = ['east', 'south', 'west', 'north'];

function getRelation(seatWind: Wind, oppWind: Wind): string {
  const seatIdx = WIND_ORDER.indexOf(seatWind);
  const oppIdx = WIND_ORDER.indexOf(oppWind);
  const diff = (oppIdx - seatIdx + 4) % 4;
  if (diff === 1) return '下家';
  if (diff === 2) return '對面';
  if (diff === 3) return '上家';
  return '自家';
}

function getOpponentsByRelation(seatWind: Wind, opponents: Opponent[]) {
  const result: { shimocha?: Opponent; toimen?: Opponent; kamicha?: Opponent } = {};
  for (const opp of opponents) {
    const rel = getRelation(seatWind, opp.position);
    if (rel === '下家') result.shimocha = opp;
    else if (rel === '對面') result.toimen = opp;
    else if (rel === '上家') result.kamicha = opp;
  }
  return result;
}

interface OpponentSlotProps {
  opponent: Opponent;
  relation: string;
  isActive: boolean;
  onTap: () => void;
  onRiichi: () => void;
  onMeld: (meld: Meld) => void;
  compact?: boolean;
}

const OpponentSlot: React.FC<OpponentSlotProps> = ({ opponent, relation, isActive, onTap, onRiichi, onMeld, compact }) => {
  const dangerColor = dangerLevelColor(opponent.dangerLevel);
  const isRiichi = opponent.riichiTurn !== null;
  const [showMeldPicker, setShowMeldPicker] = useState(false);
  const [meldType, setMeldType] = useState<'chi' | 'pon' | 'kan' | null>(null);
  const [meldTiles, setMeldTiles] = useState<Tile[]>([]);

  return (
    <div
      onClick={onTap}
      style={{
        background: isActive ? 'rgba(162,155,254,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1.5px solid ${isActive ? '#a29bfe' : isRiichi ? '#e17055' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10,
        padding: compact ? '6px 8px' : '8px 10px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header: wind + relation + danger */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: isActive ? '#a29bfe' : '#e0e0e0',
          }}>
            {windLabel(opponent.position)}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            {relation}
          </span>
          {isRiichi && (
            <span style={{
              background: '#e17055',
              color: '#fff',
              borderRadius: 3,
              padding: '0px 4px',
              fontSize: 9,
              fontWeight: 700,
            }}>
              立直
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 9 }}>{dangerLevelEmoji(opponent.dangerLevel)}</span>
          {!isRiichi && (
            <button
              onClick={(e) => { e.stopPropagation(); onRiichi(); }}
              style={{
                background: 'rgba(225,112,85,0.15)',
                border: '1px solid rgba(225,112,85,0.4)',
                color: '#e17055',
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: 9,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              立直
            </button>
          )}
        </div>
      </div>

      {/* Discards (compact, last 6) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        minHeight: 20,
      }}>
        {opponent.discards.length === 0 ? (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>無棄牌</span>
        ) : (
          opponent.discards.slice(-8).map((d, i) => (
            <TileComponent key={i} tile={d.tile} size="xs" />
          ))
        )}
        {opponent.discards.length > 8 && (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', alignSelf: 'center' }}>
            +{opponent.discards.length - 8}
          </span>
        )}
      </div>

      {/* Melds + add meld button */}
      <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        {opponent.melds.map((meld, i) => (
          <div key={i} style={{
            display: 'flex', gap: 1,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 4,
            padding: '1px 2px',
          }}>
            {meld.tiles.map((t, j) => (
              <TileComponent key={j} tile={t} size="xs" />
            ))}
          </div>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMeldPicker(!showMeldPicker); setMeldType(null); setMeldTiles([]); }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.4)',
            borderRadius: 4,
            padding: '1px 5px',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          +副露
        </button>
      </div>

      {/* Meld picker inline */}
      {showMeldPicker && (
        <div onClick={(e) => e.stopPropagation()} style={{
          marginTop: 4,
          padding: '6px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {!meldType ? (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {(['chi', 'pon', 'kan'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setMeldType(t); setMeldTiles([]); }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e0e0e0',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {{ chi: '吃', pon: '碰', kan: '杠' }[t]}
                </button>
              ))}
              <button
                onClick={() => setShowMeldPicker(false)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textAlign: 'center' }}>
                {{ chi: '吃', pon: '碰', kan: '杠' }[meldType]} — 選擇{meldType === 'kan' ? 4 : 3}張牌 ({meldTiles.length}/{meldType === 'kan' ? 4 : 3})
              </div>
              {/* Quick tile grid for meld */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                {(['man', 'pin', 'sou'] as const).map(suit =>
                  [1,2,3,4,5,6,7,8,9].map(v => (
                    <div
                      key={`${suit}${v}`}
                      onClick={() => {
                        const tile = createTile(suit, v);
                        const needed = meldType === 'kan' ? 4 : 3;
                        const newTiles = [...meldTiles, tile];
                        if (newTiles.length >= needed) {
                          onMeld({ type: meldType, tiles: newTiles });
                          setShowMeldPicker(false);
                          setMeldType(null);
                          setMeldTiles([]);
                        } else {
                          setMeldTiles(newTiles);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <TileComponent tile={createTile(suit, v)} size="xs" />
                    </div>
                  ))
                )}
                {[1,2,3,4,5,6,7].map(v => (
                  <div
                    key={`honor${v}`}
                    onClick={() => {
                      const tile = createTile('honor', v);
                      const needed = meldType === 'kan' ? 4 : 3;
                      const newTiles = [...meldTiles, tile];
                      if (newTiles.length >= needed) {
                        onMeld({ type: meldType, tiles: newTiles });
                        setShowMeldPicker(false);
                        setMeldType(null);
                        setMeldTiles([]);
                      } else {
                        setMeldTiles(newTiles);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <TileComponent tile={createTile('honor', v)} size="xs" />
                  </div>
                ))}
              </div>
              {meldTiles.length > 0 && (
                <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>已選:</span>
                  {meldTiles.map((t, i) => <TileComponent key={i} tile={t} size="xs" />)}
                  <button
                    onClick={() => setMeldTiles([])}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'rgba(255,255,255,0.3)', fontSize: 9, cursor: 'pointer',
                    }}
                  >
                    重選
                  </button>
                </div>
              )}
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button
                  onClick={() => { setMeldType(null); setMeldTiles([]); }}
                  style={{
                    padding: '2px 8px', borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.3)',
                    fontSize: 9, cursor: 'pointer',
                  }}
                >
                  ← 返回
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TableView: React.FC = () => {
  const { opponents, seatWind, pickTarget, setPickTarget, declareOpponentRiichi, declareOpponentMeld, myHand, lastDrawnTile, myDiscards } = useGameStore();
  const { shimocha, toimen, kamicha } = getOpponentsByRelation(seatWind, opponents);

  const handCount = myHand.length + (lastDrawnTile ? 1 : 0);

  const windToTarget = (w: Wind): PickTarget => w;
  const isActiveTarget = (w: Wind) => pickTarget === w;

  return (
    <div style={{
      background: '#0a0a1a',
      borderRadius: 12,
      padding: '8px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Label */}
      <div style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
        textAlign: 'center',
        marginBottom: 6,
        letterSpacing: 0.5,
      }}>
        點擊對手 → 下方選牌添加棄牌
      </div>

      {/* Table layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Top: toimen (across) */}
        {toimen && (
          <OpponentSlot
            opponent={toimen}
            relation="對面"
            isActive={isActiveTarget(toimen.position)}
            onTap={() => setPickTarget(windToTarget(toimen.position))}
            onRiichi={() => declareOpponentRiichi(toimen.position)}
            onMeld={(meld) => declareOpponentMeld(toimen.position, meld)}
          />
        )}

        {/* Middle row: kamicha (left) + self info (center) + shimocha (right) */}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Kamicha (upper house / left) */}
          {kamicha && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <OpponentSlot
                opponent={kamicha}
                relation="上家"
                isActive={isActiveTarget(kamicha.position)}
                onTap={() => setPickTarget(windToTarget(kamicha.position))}
                onRiichi={() => declareOpponentRiichi(kamicha.position)}
                onMeld={(meld) => declareOpponentMeld(kamicha.position, meld)}
                compact
              />
            </div>
          )}

          {/* Self indicator (center) */}
          <div style={{
            width: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#a29bfe',
            }}>
              {windLabel(seatWind)}
            </div>
            <div style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.3)',
            }}>
              自家
            </div>
            <div style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.2)',
            }}>
              {handCount}枚
            </div>
          </div>

          {/* Shimocha (lower house / right) */}
          {shimocha && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <OpponentSlot
                opponent={shimocha}
                relation="下家"
                isActive={isActiveTarget(shimocha.position)}
                onTap={() => setPickTarget(windToTarget(shimocha.position))}
                onRiichi={() => declareOpponentRiichi(shimocha.position)}
                onMeld={(meld) => declareOpponentMeld(shimocha.position, meld)}
                compact
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick target buttons (hand + dora) */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginTop: 8,
        justifyContent: 'center',
      }}>
        <button
          onClick={() => setPickTarget('hand')}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: `1px solid ${pickTarget === 'hand' ? '#a29bfe' : 'rgba(255,255,255,0.15)'}`,
            background: pickTarget === 'hand' ? '#a29bfe20' : 'transparent',
            color: pickTarget === 'hand' ? '#a29bfe' : 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: pickTarget === 'hand' ? 700 : 400,
            cursor: 'pointer',
          }}
        >
          🀄 手牌
        </button>
        <button
          onClick={() => setPickTarget('dora')}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: `1px solid ${pickTarget === 'dora' ? '#fd79a8' : 'rgba(255,255,255,0.15)'}`,
            background: pickTarget === 'dora' ? '#fd79a820' : 'transparent',
            color: pickTarget === 'dora' ? '#fd79a8' : 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: pickTarget === 'dora' ? 700 : 400,
            cursor: 'pointer',
          }}
        >
          💎 寶牌
        </button>
      </div>
    </div>
  );
};
