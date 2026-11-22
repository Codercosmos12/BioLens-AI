import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Filter,
  Sigma,
  Table2,
} from 'lucide-react';
import { DatasetAnalysis, VariableMeta } from '../types/research';
import { buildFilteredDatasetCsv, downloadCsvFile } from '../utils/reportExport';

type BottomTab = 'inspector' | 'matrix';

interface BottomWorkbenchProps {
  analysis: DatasetAnalysis;
  methodology: string;
  experimentTitle?: string;
  variables?: VariableMeta[];
}

export const BottomWorkbench: React.FC<BottomWorkbenchProps> = ({
  analysis,
  methodology,
  experimentTitle = 'dataset',
  variables,
}) => {
  const [activeTab, setActiveTab] = useState<BottomTab>('inspector');
  const [outliersOnly, setOutliersOnly] = useState(false);
  const [csvSaved, setCsvSaved] = useState(false);

  const { chartPoints, xMeta, yMeta, columnStats, outliers } = analysis;
  const displayedRows = outliersOnly
    ? chartPoints.filter((pt) => pt.isOutlier)
    : chartPoints;

  const handleExportCsv = () => {
    if (displayedRows.length === 0) return;
    const csvContent = buildFilteredDatasetCsv(analysis, outliersOnly, variables);
    const slug = experimentTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const suffix = outliersOnly ? 'outliers-only' : 'all-rows';
    downloadCsvFile(`biolens-${slug || 'dataset'}-${suffix}.csv`, csvContent);
    setCsvSaved(true);
    window.setTimeout(() => setCsvSaved(false), 2200);
  };

  return (
    <section className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
      {/* Segmented Workbench Tabs & Filter Toggle */}
      <div className="flex flex-col gap-3 border-b border-[#1F2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Workbench inspection tabs"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[#1F2937] bg-[#090D16] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inspector'}
            onClick={() => setActiveTab('inspector')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'inspector'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Data Table &amp; Outlier Inspector
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'matrix'
                ? 'bg-violet-500/15 text-violet-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sigma className="h-3.5 w-3.5" />
            Statistical Summary Matrix
          </button>
        </div>

        {activeTab === 'inspector' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOutliersOnly((prev) => !prev)}
              aria-pressed={outliersOnly}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                outliersOnly
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                  : 'border-[#1F2937] bg-[#090D16] text-slate-300 hover:border-slate-600 hover:text-slate-100'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filter Outliers Only</span>
              <span className="font-mono text-[11px] tabular-nums opacity-80">
                ({outliers.length})
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={displayedRows.length === 0}
              title="Export the currently filtered table rows to a new CSV file"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1F2937] bg-[#090D16] px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              {csvSaved ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>CSV Saved</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV ({displayedRows.length})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Tab A: Data Table & Outlier Inspector */}
      {activeTab === 'inspector' && (
        <div className="mt-4">
          {displayedRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#090D16] py-10 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <p className="text-xs font-medium text-slate-200">
                No |Z| &gt; 2.0 outliers detected on {yMeta.label}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Disable &ldquo;Filter Outliers Only&rdquo; to inspect all {chartPoints.length}{' '}
                observations.
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-auto rounded-lg border border-[#1F2937] bg-[#090D16]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#0D1320] text-slate-400">
                  <tr className="border-b border-[#1F2937]">
                    <th className="px-3.5 py-2.5 font-medium">Sample</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">
                      {xMeta.label} {xMeta.unit ? `(${xMeta.unit})` : ''}
                    </th>
                    <th className="px-3.5 py-2.5 text-right font-medium">
                      {yMeta.label} {yMeta.unit ? `(${yMeta.unit})` : ''}
                    </th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Z-Score</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937]/70 font-mono tabular-nums">
                  {displayedRows.map((pt) => (
                    <tr
                      key={pt.rowId}
                      className={
                        pt.isOutlier
                          ? 'bg-rose-500/10 text-slate-100 hover:bg-rose-500/15'
                          : 'text-slate-300 hover:bg-slate-800/40'
                      }
                    >
                      <td className="px-3.5 py-2.5 font-sans font-medium text-slate-100">
                        {pt.label}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">{pt.x.toFixed(2)}</td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-300">
                        {pt.y.toFixed(2)}
                      </td>
                      <td
                        className={`px-3.5 py-2.5 text-right font-semibold ${
                          pt.isOutlier ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        {pt.zScore >= 0 ? '+' : ''}
                        {pt.zScore.toFixed(2)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-sans">
                        {pt.isOutlier ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                            <AlertTriangle className="h-3 w-3 text-rose-400" />
                            Outlier (|Z| &gt; 2.0)
                          </span>
                        ) : (
                          <span className="text-emerald-400">Nominal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab B: Statistical Summary Matrix */}
      {activeTab === 'matrix' && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-slate-400">
            <span className="font-medium text-slate-200">Protocol:</span> {methodology}
          </p>

          <div className="overflow-x-auto rounded-lg border border-[#1F2937] bg-[#090D16]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#1F2937] bg-[#0D1320] text-slate-400">
                  <th className="px-3.5 py-2.5 font-medium">Variable</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Min</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Max</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Median</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Mean (μ)</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Std Dev (σ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]/70 font-mono tabular-nums text-slate-300">
                {Object.values(columnStats).map((col) => (
                  <tr key={col.key} className="hover:bg-slate-800/40">
                    <td className="px-3.5 py-2.5 font-sans font-medium text-slate-100">
                      {col.label}{' '}
                      {col.unit && (
                        <span className="font-mono text-[11px] text-slate-400">
                          ({col.unit})
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-slate-400">
                      {col.min.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-slate-400">
                      {col.max.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-violet-300">
                      {col.median.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-semibold text-emerald-300">
                      {col.mean.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">{col.stdDev.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
