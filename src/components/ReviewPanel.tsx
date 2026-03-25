import React, { useState } from 'react';
import { useReviewStore, tileToString, handToString } from '../store/reviewStore';
import type { DecisionRecord, RoundReview } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function agreementIcon(a: DecisionRecord['agreement']): string {
  return a === 'agree' ? '🟢' : a === 'disagree' ? '🔴' : '⚪';
}

function strategyLabel(mode: string): string {
  const m: Record<string, string> = { attack: '進攻', flexible: '靈活', defense: '防守', abandon: '棄和' };
  return m[mode] ?? mode;
}

// ─── single decision row ──────────────────────────────────────────────────────

const DecisionRow: React.FC<{ record: DecisionRecord }> = ({ record }) => {
  const [expanded, setExpanded] = useState(false);
  const isDisagree = record.agreement === 'disagree';

  const engTile = tileToString(record.engineRecommendation.topDiscard);
  const userTile = record.userAction?.discardedTile ? tileToString(record.userAction.discardedTile) : null;
  const cost = record.potentialCost ?? 0;

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${isDisagree ? 'rgba(225,112,85,0.35)' : 'rgba(255,255,255,0.06)'}`,
        background: isDisagree ? 'rgba(225,112,85,0.06)' : 'rgba(255,255,255,0.02)',
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      {/* Row header */}
      <div
        onClick={() => (isDisagree || record.agreement === 'unknown') && setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          cursor: isDisagree || record.agreement === 'unknown' ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', minWidth: 28, fontVariantNumeric: 'tabular-nums' }}>
          T{record.turn}
        </span>
        <span style={{ fontSize: 13 }}>{agreementIcon(record.agreement)}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
          {record.agreement === 'agree' && `打 ${engTile}`}
          {record.agreement === 'disagree' && (
            <>
              <span style={{ color: '#e17055' }}>打 {userTile}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}> ← 推薦 {engTile}</span>
            </>
          )}
          {record.agreement === 'unknown' && `推薦打 ${engTile}`}
        </span>
        {isDisagree && cost > 0 && (
          <span style={{ fontSize: 11, color: '#e17055', fontWeight: 600, whiteSpace: 'nowrap' }}>
            -{cost}點
          </span>
        )}
        <span style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 4,
          padding: '1px 5px',
        }}>
          {strategyLabel(record.engineRecommendation.strategyMode)}
        </span>
        {(isDisagree || record.agreement === 'unknown') && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          padding: '0 8px 8px 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            手牌：{handToString(record.hand, record.drawnTile)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            引擎理由：{record.engineRecommendation.explanation}
          </div>
          {record.engineRecommendation.riichiAdvice && (
            <div style={{ fontSize: 11, color: '#a29bfe' }}>
              立直建議：{record.engineRecommendation.riichiAdvice === 'riichi' ? '宣告立直' : '默聽'}
            </div>
          )}
          {isDisagree && cost > 0 && (
            <div style={{
              fontSize: 11,
              color: '#e17055',
              background: 'rgba(225,112,85,0.1)',
              borderRadius: 5,
              padding: '4px 6px',
              marginTop: 2,
            }}>
              推定損失：{cost} 點
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── current round tab ────────────────────────────────────────────────────────

const CurrentRoundTab: React.FC<{ decisions: DecisionRecord[] }> = ({ decisions }) => {
  if (decisions.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        本局尚無決策記錄。<br />
        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>當手牌滿 14 張時引擎將自動記錄推薦。</span>
      </div>
    );
  }

  const agreements = decisions.filter(d => d.agreement === 'agree').length;
  const disagreements = decisions.filter(d => d.agreement === 'disagree').length;
  const totalCost = decisions.reduce((s, d) => s + (d.potentialCost ?? 0), 0);

  // Find biggest mistake in current round
  const disagreeRecords = decisions.filter(d => d.agreement === 'disagree' && (d.potentialCost ?? 0) > 0);
  const biggestMistake = disagreeRecords.length > 0
    ? disagreeRecords.reduce((a, b) => (a.potentialCost ?? 0) >= (b.potentialCost ?? 0) ? a : b)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Summary bar */}
      <div style={{
        background: '#12122a',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {agreements}/{decisions.length}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 5 }}>一致</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00b894' }}>{agreements}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>🟢 一致</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e17055' }}>{disagreements}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>🔴 不符</div>
          </div>
          {totalCost > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e17055' }}>-{totalCost}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>推定損失</div>
            </div>
          )}
        </div>
      </div>

      {/* Biggest mistake callout */}
      {biggestMistake && (
        <div style={{
          background: 'rgba(225,112,85,0.1)',
          border: '1px solid rgba(225,112,85,0.3)',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12,
          color: '#e17055',
          lineHeight: 1.5,
        }}>
          ⚠️ 本局最大失誤：第 {biggestMistake.turn} 巡 打{biggestMistake.userAction?.discardedTile ? tileToString(biggestMistake.userAction.discardedTile) : '?'} 而非{tileToString(biggestMistake.engineRecommendation.topDiscard)}，推定損失 {biggestMistake.potentialCost ?? 0} 點
        </div>
      )}

      {/* Decision timeline */}
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginBottom: 6 }}>
          決策明細（點擊不符項目查看詳情）
        </div>
        {decisions.map((d, i) => (
          <DecisionRow key={i} record={d} />
        ))}
      </div>
    </div>
  );
};

// ─── single past round block ──────────────────────────────────────────────────

const PastRoundBlock: React.FC<{ review: RoundReview }> = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const s = review.summary;
  const agreeRate = s.totalDecisions > 0 ? s.agreements / s.totalDecisions : 0;
  const agreeColor = agreeRate >= 0.8 ? '#00b894' : agreeRate >= 0.6 ? '#fdcb6e' : '#e17055';

  return (
    <div style={{
      background: '#12122a',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      {/* Round header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', minWidth: 24 }}>
          {review.round}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: agreeColor }}>
          {s.agreements}/{s.totalDecisions}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>一致</span>
        {s.estimatedPointsLost > 0 && (
          <span style={{ fontSize: 11, color: '#e17055', marginLeft: 4 }}>
            推定損失 {s.estimatedPointsLost}點
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Biggest mistake */}
          {s.biggestMistake && (
            <div style={{
              background: 'rgba(225,112,85,0.1)',
              border: '1px solid rgba(225,112,85,0.25)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              color: '#e17055',
              margin: '8px 0 6px',
              lineHeight: 1.5,
            }}>
              ⚠️ {s.biggestMistake.description}（推定損失 {s.biggestMistake.estimatedCost} 點）
            </div>
          )}
          {/* Decisions */}
          <div style={{ marginTop: 6 }}>
            {review.decisions.map((d, i) => (
              <DecisionRow key={i} record={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── past rounds tab ──────────────────────────────────────────────────────────

const PastRoundsTab: React.FC<{ reviews: RoundReview[] }> = ({ reviews }) => {
  if (reviews.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        尚無歷局記錄。<br />
        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>在統計面板記錄本局結果後將生成回顧。</span>
      </div>
    );
  }

  // Overall stats
  const allDecisions = reviews.flatMap(r => r.decisions);
  const totalAgreements = reviews.reduce((s, r) => s + r.summary.agreements, 0);
  const totalDecisions = reviews.reduce((s, r) => s + r.summary.totalDecisions, 0);
  const totalCost = reviews.reduce((s, r) => s + r.summary.estimatedPointsLost, 0);
  const overallRate = totalDecisions > 0 ? totalAgreements / totalDecisions : 0;

  // Top 3 costliest mistakes
  const mistakes = allDecisions
    .filter(d => d.agreement === 'disagree' && (d.potentialCost ?? 0) > 0)
    .sort((a, b) => (b.potentialCost ?? 0) - (a.potentialCost ?? 0))
    .slice(0, 3);

  // Trend: compare last 3 rounds vs first 3 rounds
  let trendText = '';
  if (reviews.length >= 4) {
    const recentRate = reviews.slice(0, 3).reduce((s, r) =>
      s + (r.summary.totalDecisions > 0 ? r.summary.agreements / r.summary.totalDecisions : 0), 0) / 3;
    const earlyRate = reviews.slice(-3).reduce((s, r) =>
      s + (r.summary.totalDecisions > 0 ? r.summary.agreements / r.summary.totalDecisions : 0), 0) / 3;
    const diff = recentRate - earlyRate;
    if (diff > 0.05) trendText = '📈 一致率持續提升，進步明顯！';
    else if (diff < -0.05) trendText = '📉 近期一致率下滑，注意調整。';
    else trendText = '📊 一致率保持穩定。';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Overall summary */}
      <div style={{
        background: '#12122a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 8 }}>
          歷局總覽（{reviews.length} 局）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: overallRate >= 0.7 ? '#00b894' : '#fdcb6e' }}>
              {(overallRate * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>整體一致率</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
              {totalAgreements}/{totalDecisions}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>一致決策</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: totalCost > 0 ? '#e17055' : '#00b894' }}>
              {totalCost > 0 ? `-${totalCost}` : '0'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>推定總損失</div>
          </div>
        </div>
        {trendText && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {trendText}
          </div>
        )}
      </div>

      {/* Top mistakes */}
      {mistakes.length > 0 && (
        <div style={{
          background: '#12122a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 8 }}>
            代價最高的失誤（最多 3 筆）
          </div>
          {mistakes.map((d, i) => (
            <div key={i} style={{
              padding: '5px 0',
              borderBottom: i < mistakes.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              fontSize: 11,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.5,
            }}>
              <span style={{ color: '#e17055', fontWeight: 600 }}>#{i + 1}</span>
              {' '}{d.round} 第 {d.turn} 巡：推薦打 {tileToString(d.engineRecommendation.topDiscard)}，實打 {d.userAction?.discardedTile ? tileToString(d.userAction.discardedTile) : '?'}
              <span style={{ color: '#e17055', marginLeft: 4 }}>（-{d.potentialCost}點）</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-round list */}
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginBottom: 6 }}>
          各局明細（點擊展開）
        </div>
        {reviews.map((r, i) => (
          <PastRoundBlock key={i} review={r} />
        ))}
      </div>
    </div>
  );
};

// ─── main ReviewPanel ─────────────────────────────────────────────────────────

interface ReviewPanelProps {
  onClose: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ onClose }) => {
  const { currentDecisions, completedReviews } = useReviewStore();
  const [tab, setTab] = useState<'current' | 'past'>('current');

  const agreements = currentDecisions.filter(d => d.agreement === 'agree').length;
  const total = currentDecisions.length;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      background: '#0f0f1a',
      overflowY: 'auto',
      maxWidth: 480,
      left: '50%',
      transform: 'translateX(-50%)',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'linear-gradient(135deg, #1a1a3e 0%, #16213e 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>📝 決策回顧</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              {total > 0 ? `本局 ${agreements}/${total} 一致` : '本局尚無記錄'}
              {completedReviews.length > 0 && ` · 已完成 ${completedReviews.length} 局`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.6)',
              fontSize: 16,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { id: 'current' as const, label: '本局', badge: total > 0 ? `${agreements}/${total}` : null },
            { id: 'past' as const, label: '歷局', badge: completedReviews.length > 0 ? `${completedReviews.length}局` : null },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 7,
                border: `1px solid ${tab === t.id ? '#a29bfe' : 'rgba(255,255,255,0.1)'}`,
                background: tab === t.id ? 'rgba(162,155,254,0.15)' : 'transparent',
                color: tab === t.id ? '#a29bfe' : 'rgba(255,255,255,0.5)',
                fontSize: 12,
                fontWeight: tab === t.id ? 700 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {t.label}
              {t.badge && (
                <span style={{
                  fontSize: 10,
                  background: tab === t.id ? 'rgba(162,155,254,0.3)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tab === 'current' && <CurrentRoundTab decisions={currentDecisions} />}
        {tab === 'past' && <PastRoundsTab reviews={completedReviews} />}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
};
