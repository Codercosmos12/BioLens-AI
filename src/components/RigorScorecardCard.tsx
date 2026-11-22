import React from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { RigorScorecard } from '../types/research';

interface RigorScorecardCardProps {
  scorecard: RigorScorecard;
  outliersExcluded: boolean;
}

export const RigorScorecardCard: React.FC<RigorScorecardCardProps> = ({
  scorecard,
  outliersExcluded,
}) => {
  const { score, tier, criteria, tips } = scorecard;

  const tierTone =
    tier === 'Publication Grade'
      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
      : tier === 'Strong Pilot'
        ? 'border-violet-500/45 bg-violet-500/15 text-violet-300'
        : 'border-amber-500/45 bg-amber-500/15 text-amber-300';

  const scoreTone =
    score >= 85
      ? 'text-emerald-400'
      : score >= 65
        ? 'text-violet-300'
        : 'text-amber-300';

  return (
    <section className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
      {/* Header Row */}
      <div className="flex flex-col gap-3 border-b border-[#1F2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/10">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Experiment Rigor &amp; Reproducibility Scorecard
            </h2>
            <p className="text-xs text-slate-400">
              Weighted audit across sample power, anomaly contamination &amp; significance
              {outliersExcluded ? ' (post-exclusion sensitivity active)' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${tierTone}`}
          >
            {tier}
          </span>
          <div className="flex items-baseline gap-1 rounded-lg border border-[#1F2937] bg-[#090D16] px-3 py-1.5">
            <span className={`font-mono text-xl font-bold tabular-nums ${scoreTone}`}>
              {score}
            </span>
            <span className="font-mono text-xs text-slate-500">/100</span>
          </div>
        </div>
      </div>

      {/* 3 Quality Criteria */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {criteria.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-[#1F2937] bg-[#090D16] px-3.5 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                {c.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                {c.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {c.points}/{c.maxPoints}
              </span>
            </div>
            <p
              className={`mt-1.5 font-mono text-xs font-semibold tabular-nums ${
                c.passed ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {c.valueLabel}
            </p>
          </div>
        ))}
      </div>

      {/* 2 Actionable Rigor Tips */}
      <div className="mt-4 rounded-lg border border-[#1F2937] bg-[#090D16]/80 p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-violet-300 uppercase">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Actionable Rigor Recommendations
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
          {tips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-[11px] text-emerald-400">
                0{idx + 1}.
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
