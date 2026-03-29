import React, { useMemo, useState, useEffect, useRef } from 'react';
import { GameHeader } from './components/GameHeader';
import { HandDisplay } from './components/HandDisplay';
import { TilePicker } from './components/TilePicker';
import { OpponentPanel } from './components/OpponentPanel';
import { StrategyPanel } from './components/StrategyPanel';
import { RecommendationList } from './components/RecommendationList';
import { ChiPonKanAdvisor } from './components/ChiPonKanAdvisor';
import { RonPassAdvisor } from './components/RonPassAdvisor';
import { RiichiAdvisor } from './components/RiichiAdvisor';
import { StatsPanel } from './components/StatsPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { useGameStore } from './store/gameStore';
import { useReviewStore } from './store/reviewStore';
import { calcStrategy } from './engine/strategy';
import type { Tile, StrategyResult } from './types';

type TabId = 'play' | 'defend' | 'meld';

const TAB_CONFIG: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'play', label: '出牌', icon: '🀄' },
  { id: 'defend', label: '對手', icon: '🛡️' },
  { id: 'meld', label: '副露', icon: '🀆' },
];

function estimatePotentialCost(strategy: StrategyResult, userDiscard: Tile): number {
  if (strategy.discards.length === 0) return 0;
  const engineTop = strategy.discards[0];
  if (engineTop.tile.suit === userDiscard.suit && engineTop.tile.value === userDiscard.value) return 0;

  const userRec = strategy.discards.find(d => d.tile.suit === userDiscard.suit && d.tile.value === userDiscard.value);
  let cost = 0;

  if (strategy.mode === 'defense') {
    const userSafety = userRec ? userRec.safetyScore : 20;
    const safetyDiff = (engineTop.safetyScore - userSafety) / 100;
    if (safetyDiff > 0.1) cost = Math.round(safetyDiff * 6000);
  } else if (strategy.mode === 'attack') {
    if (userRec) {
      const effDiff = engineTop.effectiveTileCount - userRec.effectiveTileCount;
      if (effDiff > 0) cost += Math.round(effDiff * 40);
      const shantenDiff = userRec.shantenAfter - engineTop.shantenAfter;
      if (shantenDiff > 0) cost += shantenDiff * 1000;
    } else {
      cost = 500;
    }
  } else {
    if (userRec) {
      const safetyDiff = (engineTop.safetyScore - userRec.safetyScore) / 100;
      const effDiff = engineTop.effectiveTileCount - userRec.effectiveTileCount;
      cost = Math.round(safetyDiff * 3000 + Math.max(0, effDiff) * 20);
    } else {
      cost = 300;
    }
  }
  return Math.max(0, cost);
}

export const App: React.FC = () => {
  const gameState = useGameStore();
  const reviewStore = useReviewStore();
  const [activeTab, setActiveTab] = useState<TabId>('play');
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const decisionKeyRef = useRef('');

  const strategy = useMemo(() => {
    const hand = [...gameState.myHand];
    if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
    if (hand.length < 2) return null;
    return calcStrategy(gameState);
  }, [gameState]);

  // Record engine decision when hand is full (14 tiles) and engine has recommendations
  useEffect(() => {
    if (!strategy || strategy.discards.length === 0) return;
    const totalTiles = gameState.myHand.length +
      (gameState.lastDrawnTile ? 1 : 0) +
      gameState.myMelds.length * 3;
    if (totalTiles !== 14) return;

    const key = `${gameState.currentRound}-${gameState.turnNumber}`;
    if (decisionKeyRef.current === key) return;
    decisionKeyRef.current = key;

    const topDiscard = strategy.discards[0];
    reviewStore.recordDecision({
      turn: gameState.turnNumber,
      round: gameState.currentRound,
      hand: [...gameState.myHand],
      drawnTile: gameState.lastDrawnTile ?? undefined,
      engineRecommendation: {
        topDiscard: topDiscard.tile,
        strategyMode: strategy.mode,
        explanation: topDiscard.reason,
        riichiAdvice: strategy.riichiAdvice
          ? (strategy.riichiAdvice.shouldRiichi ? 'riichi' : 'dama')
          : null,
      },
      agreement: 'unknown',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleTileClick = (tile: Tile) => {
    setSelectedTileId(prev => prev === tile.id ? null : tile.id);
  };

  const handleDiscard = (rec: { tile: Tile }) => {
    const hand = [...gameState.myHand];
    if (gameState.lastDrawnTile) hand.push(gameState.lastDrawnTile);
    const tileInHand = hand.find(t => t.suit === rec.tile.suit && t.value === rec.tile.value);
    if (tileInHand) {
      // Track user action for review
      if (strategy) {
        const cost = estimatePotentialCost(strategy, rec.tile);
        reviewStore.markUserAction(gameState.turnNumber, rec.tile, gameState.isRiichi, cost);
      }
      gameState.discardFromHand(tileInHand.id);
    }
    setSelectedTileId(null);
  };

  const reviewAgreements = reviewStore.currentDecisions.filter(d => d.agreement === 'agree').length;
  const reviewTotal = reviewStore.currentDecisions.length;

  return (
    <>
    {showStats && <StatsPanel onClose={() => setShowStats(false)} />}
    {showReview && <ReviewPanel onClose={() => setShowReview(false)} />}
    <RonPassAdvisor />
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
                麻雀教練
              </div>
              <div style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
              }}>
                Riichi Mahjong Strategy Assistant
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                {strategy.mode === 'attack' && <span style={{ fontSize: 10, color: '#00b894' }}>🟢 進攻</span>}
                {strategy.mode === 'flexible' && <span style={{ fontSize: 10, color: '#fdcb6e' }}>🟡 靈活</span>}
                {strategy.mode === 'defense' && <span style={{ fontSize: 10, color: '#e17055' }}>🔴 防守</span>}
              </div>
            )}
            {/* Review button */}
            <button
              onClick={() => setShowReview(true)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 14,
                padding: '4px 8px',
                cursor: 'pointer',
                lineHeight: 1,
                position: 'relative',
              }}
              title="決策回顧"
            >
              📝
              {reviewTotal > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  fontSize: 9,
                  background: reviewAgreements === reviewTotal ? '#00b894' : '#e17055',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '1px 4px',
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}>
                  {reviewAgreements}/{reviewTotal}
                </span>
              )}
            </button>
            {/* Stats button */}
            <button
              onClick={() => setShowStats(true)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 14,
                padding: '4px 8px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
              title="局統計"
            >
              📊
            </button>
          </div>
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

            {/* Riichi vs Dama advisor (tenpai + closed hand only) */}
            {strategy?.riichiAdvice && (
              <RiichiAdvisor advice={strategy.riichiAdvice} />
            )}

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

            {/* Tile picker — placed before recommendations so it stays accessible during tile entry */}
            <TilePicker />

            {/* Recommendations — below picker, collapsible */}
            {strategy && (
              <RecommendationList
                recommendations={strategy.discards}
                mode={strategy.mode}
                onDiscard={handleDiscard}
              />
            )}
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
            onClick={() => handleTabChange(tab.id)}
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
    </>
  );
};

export default App;
