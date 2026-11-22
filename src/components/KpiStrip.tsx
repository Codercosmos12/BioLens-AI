import React from 'react';
import { AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import { DatasetAnalysis } from '../types/research';
import { formatPValue } from '../utils/statsEngine';

export interface OutlierExclusionDelta {
  excludedCount: number;
  baselineN: number;
  baselineMean: number;
  baselineR: number;
  deltaMean: number;
  deltaR: number;
  deltaAbsR: number;
}

interface KpiStripProps {
  analysis: DatasetAnalysis;
  outlierDelta?: OutlierExclusionDelta | null;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ analysis, outlierDelta }) => {
  const { sampleSize, yMeta, columnStats, pearsonR, rSquared, pValue, outliers } = analysis;
  const yStats = columnStats[yMeta.key];
  const hasOutliers = outliers.length > 0;
  const isSignificant = pValue < 0.05;
  const isFiltered = Boolean(outlierDelta && outlierDelta.excludedCount > 0);

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {/* Pill 1: Sample Size (n) */}
      <div className="relative overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]/80 px-4 py-3.5 backdrop-blur-md">
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-emerald-500/85"
        />
        <div className="flex items-center justify-between gap-3 pl-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Sample Size (n)
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tabular-nums text-slate-50">
                {sampleSize}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {isFiltered ? `of ${outlierDelta?.baselineN}` : 'rows'}
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] tabular-nums text-slate-400">
            <p>df = {Math.max(0, sampleSize - 2)}</p>
            <p className="mt-0.5 text-emerald-400">
              {isFiltered
                ? `-${outlierDelta?.excludedCount} excluded`
                : `${analysis.numericVariables.length} vars`}
            </p>
          </div>
        </div>
      </div>

      {/* Pill 2: Primary Mean */}
      <div className="relative overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]/80 px-4 py-3.5 backdrop-blur-md">
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-violet-500/85"
        />
        <div className="flex items-center justify-between gap-3 pl-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Primary Mean
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tabular-nums text-emerald-400">
                {yStats ? yStats.mean.toFixed(2) : '0.00'}
              </span>
              {yMeta.unit && (
                <span className="font-mono text-xs text-slate-400">{yMeta.unit}</span>
              )}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] tabular-nums text-slate-400">
            {isFiltered && outlierDelta ? (
              <>
                <p className="text-emerald-300">
                  Δ {outlierDelta.deltaMean >= 0 ? '+' : ''}
                  {outlierDelta.deltaMean.toFixed(2)}
                  {yMeta.unit ? ` ${yMeta.unit}` : ''}
                </p>
                <p className="mt-0.5 text-slate-400">
                  from {outlierDelta.baselineMean.toFixed(2)}
                </p>
              </>
            ) : (
              <>
                <p>σ = {yStats ? yStats.stdDev.toFixed(2) : '0.00'}</p>
                <p className="mt-0.5 text-violet-300">
                  Med {yStats ? yStats.median.toFixed(2) : '0.00'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pill 3: Correlation (r) */}
      <div className="relative overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]/80 px-4 py-3.5 backdrop-blur-md">
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-emerald-500/85"
        />
        <div className="flex items-center justify-between gap-3 pl-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Correlation (r)
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tabular-nums text-violet-300">
                {pearsonR >= 0 ? '+' : ''}
                {pearsonR.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] tabular-nums text-slate-400">
            {isFiltered && outlierDelta ? (
              <>
                <p
                  className={
                    outlierDelta.deltaAbsR >= 0 ? 'text-emerald-400' : 'text-amber-300'
                  }
                >
                  Δ|r| {outlierDelta.deltaAbsR >= 0 ? '+' : ''}
                  {outlierDelta.deltaAbsR.toFixed(3)}
                </p>
                <p className="mt-0.5 text-slate-400">
                  R² {(rSquared * 100).toFixed(1)}%
                </p>
              </>
            ) : (
              <>
                <p>R² {(rSquared * 100).toFixed(1)}%</p>
                <p className={`mt-0.5 ${isSignificant ? 'text-emerald-400' : 'text-slate-400'}`}>
                  p = {formatPValue(pValue)}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pill 4: Outliers Flagged / Excluded */}
      <div className="relative overflow-hidden rounded-xl border border-[#1F2937] bg-[#111827]/80 px-4 py-3.5 backdrop-blur-md">
        <span
          aria-hidden="true"
          className={`absolute inset-y-2.5 left-0 w-1 rounded-r-full ${
            isFiltered
              ? 'bg-emerald-500/85'
              : hasOutliers
                ? 'bg-amber-400/90'
                : 'bg-violet-500/85'
          }`}
        />
        <div className="flex items-center justify-between gap-3 pl-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {isFiltered ? 'Anomalies Excluded' : 'Outliers Flagged'}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  isFiltered
                    ? 'text-emerald-400'
                    : hasOutliers
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {isFiltered ? outlierDelta?.excludedCount : outliers.length}
              </span>
              <span className="font-mono text-xs text-slate-400">|Z| &gt; 2.0</span>
            </div>
          </div>
          <div className="text-right text-[11px] font-medium">
            {isFiltered ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Filter className="h-3.5 w-3.5 shrink-0" />
                Filtered
              </span>
            ) : hasOutliers ? (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Anomaly
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Nominal
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
