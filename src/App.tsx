import React, { useMemo, useState } from 'react';
import { GameHeader } from './components/GameHeader';
import { HandDisplay } from './components/HandDisplay';
import { TilePicker } from './components/TilePicker';
import { OpponentPanel } from './components/OpponentPanel';
import { StrategyPanel } from './components/StrategyPanel';
import { RecommendationList } from './components/RecommendationList';
import { ChiPonKanAdvisor } from './components/ChiPonKanAdvisor';
import { useGameStore } from './store/gameStore';
import { calcStrategy } from './engine/strategy';
import type { Tile } from './types';

type TabId = 'play' | 'defend' | 'meld';

const TAB_CONFIG: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'play', label: '出牌', icon: '🀄' },
  { id: 'defend', label: '对手', icon: '🛡️' },
  { id: 'meld', label: '副露', icon: '🀆' },
];

export const App: React.FC = () => {
  const gameState = useGameStore();
  const [activeTab, setActiveTab] = useState<TabId>('play');
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  const strategy = useMemo(() => {
    const hand = [...gameState.myHand];
    if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
    if (hand.length < 2) return null;
    return calcStrategy(gameState);
  }, [gameState]);

  const handleTileClick = (tile: Tile) => {
    setSelectedTileId(prev => prev === tile.id ? null : tile.id);
  };

  const handleDiscard = (rec: { tile: Tile }) => {
    const hand = [...gameState.myHand];
    if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
    // Find the tile in hand and discard it
    const tileInHand = hand.find(t => t.suit === rec.tile.suit && t.value === rec.tile.value);
    if (tileInHand) {
      gameState.discardFromHand(tileInHand.id);
    }
    setSelectedTileId(null);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0f0f1a',
      color: '#e0e0e0',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 72, // space for bottom tabs
    }}>
      {/* App title bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a3e 0%, #16213e 100%)',
        padding: '12px 16px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🀄</span>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.2,
              }}>
                麻雀コーチ
              </div>
              <div style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
              }}>
                Riichi Mahjong Strategy Assistant
              </div>
            </div>
          </div>

          {/* Strategy badge (mini) */}
          {strategy && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '4px 8px',
            }}>
              {strategy.mode === 'attack' && <span style={{ fontSize: 10, color: '#00b894' }}>🟢 进攻</span>}
              {strategy.mode === 'flexible' && <span style={{ fontSize: 10, color: '#fdcb6e' }}>🟡 灵活</span>}
              {strategy.mode === 'defense' && <span style={{ fontSize: 10, color: '#e17055' }}>🔴 防守</span>}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Game settings header */}
        <GameHeader />

        {/* TAB: Play (main tab) */}
        {activeTab === 'play' && (
          <>
            {/* Strategy panel */}
            <StrategyPanel strategy={strategy} />

            {/* Hand display */}
            <div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                fontWeight: 600,
                marginBottom: 5,
                letterSpacing: 0.5,
              }}>
                我的手牌 / 出牌分析
              </div>
              <HandDisplay
                onTileClick={handleTileClick}
                selectedTileId={selectedTileId}
              />
            </div>

            {/* Recommendations */}
            {strategy && (
              <RecommendationList
                recommendations={strategy.discards}
                mode={strategy.mode}
                onDiscard={handleDiscard}
              />
            )}

            {/* Tile picker */}
            <TilePicker />
          </>
        )}

        {/* TAB: Defend */}
        {activeTab === 'defend' && (
          <>
            <OpponentPanel />
            <TilePicker />
          </>
        )}

        {/* TAB: Meld */}
        {activeTab === 'meld' && (
          <>
            <ChiPonKanAdvisor />
            <TilePicker />
          </>
        )}
      </div>

      {/* Bottom tab bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#1a1a2e',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        zIndex: 200,
      }}>
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 4px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              borderTop: `2px solid ${activeTab === tab.id ? '#a29bfe' : 'transparent'}`,
              transition: 'border-color 0.2s',
            }}
          >
            <span style={{ fontSize: 18 }}>{tab.icon}</span>
            <span style={{
              fontSize: 11,
              color: activeTab === tab.id ? '#a29bfe' : 'rgba(255,255,255,0.35)',
              fontWeight: activeTab === tab.id ? 700 : 400,
            }}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
