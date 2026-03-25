import React, { useState, useEffect } from 'react';
import { useStatsStore, MORTAL_BENCHMARKS, computeStats } from '../store/statsStore';
import { useGameStore } from '../store/gameStore';
import { useReviewStore } from '../store/reviewStore';
import type { RoundResult } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function fmtPoints(v: number): string {
  return v >= 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
}

function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} 分鐘`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

/** Color for a stat: lowerIsBetter controls the direction */
function rateColor(value: number, benchmark: number, lowerIsBetter: boolean): string {
  const delta = benchmark > 0 ? (value - benchmark) / benchmark : 0;
  if (lowerIsBetter) {
    if (delta <= -0.1) return '#00b894';
    if (delta <= 0.1) return '#fdcb6e';
    return '#e17055';
  } else {
    if (delta >= 0.1) return '#00b894';
    if (delta >= -0.1) return '#fdcb6e';
    return '#e17055';
  }
}

function deltaArrow(value: number, benchmark: number, lowerIsBetter: boolean): string {
  const diff = value - benchmark;
  if (Math.abs(diff) < benchmark * 0.02) return '≈';
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return better ? '↑' : '↓';
}

function generateTendencySummary(s: ReturnType<typeof computeStats>, rounds: number): string {
  if (rounds < 3) return '累積更多局數後將顯示趨勢分析（建議至少 5 局）。';

  const tips: string[] = [];

  const dealInDelta = s.dealInRate - MORTAL_BENCHMARKS.dealInRate;
  if (dealInDelta > 0.04) {
    tips.push(
      `放銃率偏高（${pct(s.dealInRate)} vs AI基準 ${pct(MORTAL_BENCHMARKS.dealInRate)}），建議加強防守意識，特別是面對立直時的安全牌選擇。`
    );
  } else if (dealInDelta < -0.05) {
    tips.push(
      `防守意識良好，放銃率低於AI基準（${pct(s.dealInRate)} vs ${pct(MORTAL_BENCHMARKS.dealInRate)}）。`
    );
  }

  const riichiDelta = s.riichiRate - MORTAL_BENCHMARKS.riichiRate;
  if (riichiDelta < -0.06) {
    tips.push(
      `立直頻率偏低（${pct(s.riichiRate)} vs AI基準 ${pct(MORTAL_BENCHMARKS.riichiRate)}），可能錯過了有利的立直機會，建議更主動宣告立直。`
    );
  } else if (riichiDelta > 0.06) {
    tips.push(
      `立直頻率偏高（${pct(s.riichiRate)} vs AI基準 ${pct(MORTAL_BENCHMARKS.riichiRate)}），注意評估聽牌質量，避免在弱牌時冒進立直。`
    );
  }

  const winDelta = s.winRate - MORTAL_BENCHMARKS.winRate;
  if (winDelta < -0.06) {
    tips.push(
      `和了率偏低（${pct(s.winRate)} vs AI基準 ${pct(MORTAL_BENCHMARKS.winRate)}），可加強進攻意識，把握有利聽牌機會。`
    );
  }

  if (s.riichiDeclarations >= 3 && s.riichiWinRate < MORTAL_BENCHMARKS.riichiWinRate - 0.1) {
    tips.push(
      `立直後和了率偏低（${pct(s.riichiWinRate)} vs AI基準 ${pct(MORTAL_BENCHMARKS.riichiWinRate)}），可注意立直時的聽牌形式是否足夠強。`
    );
  }

  if (tips.length === 0) {
    if (s.winRate >= MORTAL_BENCHMARKS.winRate && s.dealInRate <= MORTAL_BENCHMARKS.dealInRate) {
      return '整體表現優於AI基準，攻守平衡良好，繼續保持！';
    }
    return '整體表現接近AI基準水準，繼續保持！';
  }

  return tips[0];
}

const OUTCOME_LABELS: Record<RoundResult['outcome'], string> = {
  'win-tsumo': '和了（自摸）',
  'win-ron': '和了（榮和）',
  'deal-in': '放銃',
  'draw': '流局',
  'other-win': '他家和了',
};

const OUTCOME_ICON: Record<RoundResult['outcome'], string> = {
  'win-tsumo': '🟢',
  'win-ron': '🟢',
  'deal-in': '🔴',
  'draw': '⚪',
  'other-win': '🟡',
};

// ─── round-end recording form ────────────────────────────────────────────────

interface RecordFormState {
  outcome: RoundResult['outcome'] | null;
  points: string;
  wasRiichi: boolean;
  hadOpenHand: boolean;
  toRiichiOpponent: boolean;
  wasTenpaiOnDraw: boolean;
}

function makeDefaultForm(gameStore: ReturnType<typeof useGameStore>): RecordFormState {
  return {
    outcome: null,
    points: '',
    wasRiichi: gameStore.isRiichi,
    hadOpenHand: gameStore.myMelds.length > 0,
    toRiichiOpponent: false,
    wasTenpaiOnDraw: false,
  };
}

interface RecordFormProps {
  onRecorded: () => void;
}

const RecordForm: React.FC<RecordFormProps> = ({ onRecorded }) => {
  const gameStore = useGameStore();
  const { recordRoundResult, resetSession } = useStatsStore();
  const reviewStore = useReviewStore();
  const [form, setForm] = useState<RecordFormState>(() => makeDefaultForm(gameStore));
  const [saved, setSaved] = useState(false);

  const outcomes: Array<{ id: RoundResult['outcome']; label: string; color: string }> = [
    { id: 'win-tsumo', label: '🟢 自摸', color: '#00b894' },
    { id: 'win-ron', label: '🟢 榮和', color: '#00b894' },
    { id: 'deal-in', label: '🔴 放銃', color: '#e17055' },
    { id: 'draw', label: '⚪ 流局', color: 'rgba(255,255,255,0.4)' },
    { id: 'other-win', label: '🟡 他家和了', color: '#fdcb6e' },
  ];

  const handleSubmit = () => {
    if (!form.outcome) return;

    const pts = parseFloat(form.points) || 0;
    const isWin = form.outcome === 'win-tsumo' || form.outcome === 'win-ron';
    const isDealIn = form.outcome === 'deal-in';

    const result: RoundResult = {
      round: gameStore.currentRound,
      wasDealer: gameStore.seatWind === 'east',
      outcome: form.outcome,
      points: isWin ? Math.abs(pts) : isDealIn ? -Math.abs(pts) : pts,
      wasRiichi: form.wasRiichi,
      hadOpenHand: form.hadOpenHand,
      finalShanten: isWin ? -1 : form.wasTenpaiOnDraw ? 0 : 1,
      toRiichiOpponent: form.toRiichiOpponent,
    };

    reviewStore.finalizeRound(gameStore.currentRound);
    recordRoundResult(result);
    gameStore.resetHand();
    gameStore.advanceRound();

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setForm(makeDefaultForm(gameStore));
      onRecorded();
    }, 1000);
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    padding: '5px 8px',
    width: '80px',
    outline: 'none',
  };

  const checkLabel: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  if (saved) {
    return (
      <div style={{
        background: '#00b89420',
        border: '1px solid #00b89440',
        borderRadius: 10,
        padding: '12px',
        textAlign: 'center',
        color: '#00b894',
        fontSize: 13,
        fontWeight: 600,
      }}>
        ✓ 已記錄
      </div>
    );
  }

  return (
    <div style={{
      background: '#12122a',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600 }}>
        記錄本局結果 · {gameStore.currentRound}
      </div>

      {/* Outcome buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {outcomes.map(o => (
          <button
            key={o.id}
            onClick={() => setForm(f => ({ ...f, outcome: o.id }))}
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              border: `1px solid ${form.outcome === o.id ? o.color : 'rgba(255,255,255,0.1)'}`,
              background: form.outcome === o.id ? `${o.color}20` : 'transparent',
              color: form.outcome === o.id ? o.color : 'rgba(255,255,255,0.5)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: form.outcome === o.id ? 700 : 400,
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Points input (only for win / deal-in) */}
      {(form.outcome === 'win-tsumo' || form.outcome === 'win-ron' || form.outcome === 'deal-in') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {form.outcome === 'deal-in' ? '放銃點數' : '和了點數'}
          </span>
          <input
            type="number"
            placeholder="0"
            value={form.points}
            onChange={e => setForm(f => ({ ...f, points: e.target.value }))}
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>點</span>
        </div>
      )}

      {/* Checkboxes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={form.wasRiichi}
            onChange={e => setForm(f => ({ ...f, wasRiichi: e.target.checked }))}
          />
          我立直了
        </label>
        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={form.hadOpenHand}
            onChange={e => setForm(f => ({ ...f, hadOpenHand: e.target.checked }))}
          />
          有副露
        </label>
        {form.outcome === 'deal-in' && (
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={form.toRiichiOpponent}
              onChange={e => setForm(f => ({ ...f, toRiichiOpponent: e.target.checked }))}
            />
            放給立直者
          </label>
        )}
        {form.outcome === 'draw' && (
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={form.wasTenpaiOnDraw}
              onChange={e => setForm(f => ({ ...f, wasTenpaiOnDraw: e.target.checked }))}
            />
            流局聽牌
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!form.outcome}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 8,
            border: 'none',
            background: form.outcome ? '#a29bfe' : 'rgba(255,255,255,0.08)',
            color: form.outcome ? '#fff' : 'rgba(255,255,255,0.25)',
            fontSize: 13,
            fontWeight: 600,
            cursor: form.outcome ? 'pointer' : 'default',
            transition: 'background 0.2s',
          }}
        >
          確認記錄
        </button>
        <button
          onClick={() => {
            if (window.confirm('確定要重置本場統計嗎？')) { resetSession(); reviewStore.resetAll(); }
          }}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          重置
        </button>
      </div>
    </div>
  );
};

// ─── benchmark comparison row ────────────────────────────────────────────────

interface BenchRowProps {
  label: string;
  yourValue: number;
  benchmark: number;
  format: (v: number) => string;
  lowerIsBetter: boolean;
  hasData: boolean;
}

const BenchRow: React.FC<BenchRowProps> = ({ label, yourValue, benchmark, format, lowerIsBetter, hasData }) => {
  const color = hasData ? rateColor(yourValue, benchmark, lowerIsBetter) : 'rgba(255,255,255,0.25)';
  const arrow = hasData ? deltaArrow(yourValue, benchmark, lowerIsBetter) : '-';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, textAlign: 'center' }}>
        {hasData ? format(yourValue) : '-'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{format(benchmark)}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700 }}>{arrow}</span>
      </div>
    </div>
  );
};

// ─── main StatsPanel ─────────────────────────────────────────────────────────

interface StatsPanelProps {
  onClose: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ onClose }) => {
  const stats = useStatsStore();
  const computed = stats.getComputedStats();
  const hasRounds = stats.totalRounds > 0;
  const duration = Date.now() - stats.sessionStartTime;
  const [recordKey, setRecordKey] = useState(0);

  useEffect(() => {
    stats.checkAndResetIfExpired();
  }, []);

  const tendency = generateTendencySummary(computed, stats.totalRounds);

  return (
    <div
      style={{
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
      }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'linear-gradient(135deg, #1a1a3e 0%, #16213e 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>📊 局統計</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            本場 {stats.totalRounds} 局 · {fmtDuration(duration)}
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
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Record form */}
        <RecordForm key={recordKey} onRecorded={() => setRecordKey(k => k + 1)} />

        {/* Session overview */}
        <div style={{
          background: '#12122a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 8 }}>
            本場概況
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: '局數', value: stats.totalRounds },
              { label: '和了', value: stats.wins, color: '#00b894' },
              { label: '放銃', value: stats.dealIns, color: '#e17055' },
              { label: '立直', value: stats.riichiDeclarations, color: '#a29bfe' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: item.color ?? '#fff',
                  lineHeight: 1,
                }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benchmark comparison */}
        <div style={{
          background: '#12122a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>指標</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>你</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>AI基準</span>
          </div>
          <BenchRow label="和了率" yourValue={computed.winRate} benchmark={MORTAL_BENCHMARKS.winRate} format={pct} lowerIsBetter={false} hasData={hasRounds} />
          <BenchRow label="放銃率" yourValue={computed.dealInRate} benchmark={MORTAL_BENCHMARKS.dealInRate} format={pct} lowerIsBetter={true} hasData={hasRounds} />
          <BenchRow label="立直率" yourValue={computed.riichiRate} benchmark={MORTAL_BENCHMARKS.riichiRate} format={pct} lowerIsBetter={false} hasData={hasRounds} />
          <BenchRow label="副露率" yourValue={computed.callRate} benchmark={MORTAL_BENCHMARKS.callRate} format={pct} lowerIsBetter={false} hasData={hasRounds} />
          <BenchRow
            label="立直和了率"
            yourValue={computed.riichiWinRate}
            benchmark={MORTAL_BENCHMARKS.riichiWinRate}
            format={pct}
            lowerIsBetter={false}
            hasData={stats.riichiDeclarations > 0}
          />
          <BenchRow
            label="平均和了點"
            yourValue={computed.avgWinPoints}
            benchmark={MORTAL_BENCHMARKS.avgWinPoints}
            format={v => Math.round(v).toString()}
            lowerIsBetter={false}
            hasData={stats.wins > 0}
          />
          <BenchRow
            label="平均放銃點"
            yourValue={Math.abs(computed.avgDealInPoints)}
            benchmark={Math.abs(MORTAL_BENCHMARKS.avgDealInPoints)}
            format={v => Math.round(v).toString()}
            lowerIsBetter={true}
            hasData={stats.dealIns > 0}
          />
        </div>

        {/* Tendency summary */}
        <div style={{
          background: '#12122a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 6 }}>
            趨勢分析
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            {tendency}
          </div>
        </div>

        {/* Round log */}
        {stats.roundResults.length > 0 && (
          <div style={{
            background: '#12122a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 8 }}>
              局歷史（最近 {Math.min(stats.roundResults.length, 20)} 局）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stats.roundResults.slice(0, 20).map((r, i) => {
                const pts = r.points ?? 0;
                const ptsColor =
                  r.outcome === 'win-tsumo' || r.outcome === 'win-ron' ? '#00b894' :
                  r.outcome === 'deal-in' ? '#e17055' : 'rgba(255,255,255,0.4)';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <span style={{ fontSize: 14, minWidth: 18 }}>{OUTCOME_ICON[r.outcome]}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', minWidth: 22 }}>{r.round}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                      {OUTCOME_LABELS[r.outcome]}
                    </span>
                    {pts !== 0 && (
                      <span style={{ fontSize: 12, color: ptsColor, fontWeight: 600 }}>
                        {fmtPoints(pts)}
                      </span>
                    )}
                    {r.wasRiichi && (
                      <span style={{
                        fontSize: 10,
                        background: '#a29bfe30',
                        color: '#a29bfe',
                        borderRadius: 4,
                        padding: '1px 5px',
                      }}>
                        立
                      </span>
                    )}
                    {r.hadOpenHand && (
                      <span style={{
                        fontSize: 10,
                        background: '#fdcb6e30',
                        color: '#fdcb6e',
                        borderRadius: 4,
                        padding: '1px 5px',
                      }}>
                        副
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Padding at bottom */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
};
