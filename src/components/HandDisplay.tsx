import React, { useMemo } from 'react';
import type { Tile } from '../types';
import { tileDisplayName, sortTiles } from '../engine/tiles';
import { tilesToCounts } from '../engine/tiles';
import { calcShanten, shantenLabel, findEffectiveTiles } from '../engine/shanten';
import { TileComponent, TilePill } from './TileComponent';
import { useGameStore } from '../store/gameStore';
import { getAllHandSafetyScores } from '../engine/safety';
import { indexToTile, createTile } from '../engine/tiles';

interface HandDisplayProps {
  onTileClick?: (tile: Tile) => void;
  selectedTileId?: string | null;
}

export const HandDisplay: React.FC<HandDisplayProps> = ({ onTileClick, selectedTileId }) => {
  const gameState = useGameStore();

  const fullHand = useMemo(() => {
    const hand = [...gameState.myHand];
    if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
    return hand;
  }, [gameState.myHand, gameState.lastDrawnTile]);

  const { shanten, effectiveTiles, shantenStr } = useMemo(() => {
    const handForCalc = [...gameState.myHand];
    // For shanten calc, use hand without drawn tile (13 tiles)
    // or with drawn tile (14 tiles)
    const counts = tilesToCounts(handForCalc);
    const sh = calcShanten(counts, gameState.myMelds.length);
    const eff = findEffectiveTiles(counts, gameState.myMelds.length);
    return {
      shanten: sh,
      effectiveTiles: eff.map(idx => {
        const { suit, value } = indexToTile(idx);
        return createTile(suit, value);
      }),
      shantenStr: shantenLabel(sh),
    };
  }, [gameState.myHand, gameState.myMelds]);

  const safetyScores = useMemo(() => {
    return getAllHandSafetyScores(fullHand, gameState);
  }, [fullHand, gameState]);

  const getSafety = (tile: Tile): number | undefined => {
    const key = `${tile.suit}${tile.value}`;
    return safetyScores.get(key);
  };

  if (fullHand.length === 0) {
    return (
      <div style={{
        background: '#12122a',
        borderRadius: 12,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 8 }}>
          手牌为空
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
          在下方選擇"我的手牌"然后點擊牌面添加
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#12122a',
      borderRadius: 12,
      padding: '10px 10px 12px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Hand tiles */}
      <div style={{
        display: 'flex',
        gap: 3,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 8,
      }}>
        {/* Regular hand tiles */}
        {gameState.myHand.map((tile, i) => (
          <TileComponent
            key={tile.id}
            tile={tile}
            size="md"
            selected={selectedTileId === tile.id}
            safetyScore={getSafety(tile)}
            onClick={onTileClick}
          />
        ))}

        {/* Separator before drawn tile */}
        {gameState.lastDrawnTile && (
          <>
            <div style={{
              width: 2,
              height: 56,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 1,
              margin: '0 2px',
              flexShrink: 0,
            }} />
            <TileComponent
              tile={gameState.lastDrawnTile}
              size="md"
              selected={selectedTileId === gameState.lastDrawnTile.id}
              safetyScore={getSafety(gameState.lastDrawnTile)}
              onClick={onTileClick}
              highlighted={true}
            />
          </>
        )}

        {/* Open melds */}
        {gameState.myMelds.map((meld, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 2,
            marginLeft: 4,
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

      {/* Riichi indicator */}
      {gameState.isRiichi && (
        <div style={{
          display: 'inline-block',
          background: '#e17055',
          color: '#fff',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: 1,
        }}>
          立直
        </div>
      )}

      {/* Shanten info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
          }}>向聽数</span>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: shanten <= 0 ? '#00b894' : shanten === 1 ? '#fdcb6e' : '#e0e0e0',
          }}>
            {shantenStr}
          </span>
        </div>

        {shanten >= 0 && effectiveTiles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              有效牌:
            </span>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {effectiveTiles.slice(0, 8).map((t, i) => (
                <TilePill key={i} tile={t} />
              ))}
              {effectiveTiles.length > 8 && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  +{effectiveTiles.length - 8}种
                </span>
              )}
            </div>
          </div>
        )}

        {shanten === 0 && (
          <div style={{
            fontSize: 11,
            color: '#00b894',
            fontWeight: 600,
          }}>
            聽牌中！
          </div>
        )}
      </div>

      {/* Tenpai hint for ron/pass analysis */}
      {shanten === 0 && (
        <div style={{
          marginTop: 6,
          fontSize: 10,
          color: 'rgba(253,203,110,0.6)',
          padding: '4px 6px',
          background: 'rgba(253,203,110,0.06)',
          borderRadius: 6,
          borderLeft: '2px solid rgba(253,203,110,0.3)',
        }}>
          聽牌中 — 若和了牌出現，可在牌堆選擇器點擊「和了牌出現」分析榮和/見逃
        </div>
      )}

      {/* Tile count */}
      <div style={{
        marginTop: 4,
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
      }}>
        手牌: {gameState.myHand.length + (gameState.lastDrawnTile ? 1 : 0)}张
        {gameState.myMelds.length > 0 && ` + ${gameState.myMelds.length}副面子`}
      </div>
    </div>
  );
};
