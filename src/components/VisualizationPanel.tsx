import React, { useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RechartsScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Check,
  ImageDown,
  LineChart,
  ScatterChart,
  SlidersHorizontal,
} from 'lucide-react';
import { ChartPoint, DatasetAnalysis, VariableMeta } from '../types/research';
import { formatPValue } from '../utils/statsEngine';

type ChartMode = 'trend' | 'comparison' | 'outlier-scatter';

interface VisualizationPanelProps {
  analysis: DatasetAnalysis;
  experimentTitle?: string;
  numericVariables: VariableMeta[];
  xKey: string;
  yKey: string;
  onChangeXKey: (key: string) => void;
  onChangeYKey: (key: string) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
}

const LabChartTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#1F2937] bg-[#090D16]/95 px-3 py-2.5 text-xs shadow-xl">
      <p className="font-display font-semibold text-slate-100">{pt.label}</p>
      <div className="mt-1.5 space-y-1 font-mono tabular-nums">
        <p className="text-slate-300">
          {xLabel}: <span className="text-violet-300">{pt.x.toFixed(2)}</span> {xUnit}
        </p>
        <p className="text-slate-300">
          {yLabel}: <span className="text-emerald-300">{pt.y.toFixed(2)}</span> {yUnit}
        </p>
        <p className={pt.isOutlier ? 'text-amber-300' : 'text-slate-400'}>
          Z-Score: {pt.zScore >= 0 ? '+' : ''}
          {pt.zScore.toFixed(2)} {pt.isOutlier ? '(Outlier |Z| > 2.0)' : '(Nominal)'}
        </p>
      </div>
    </div>
  );
};

export const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  analysis,
  experimentTitle = 'BioLens AI Empirical Analysis',
  numericVariables,
  xKey,
  yKey,
  onChangeXKey,
  onChangeYKey,
}) => {
  const [mode, setMode] = useState<ChartMode>('trend');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    chartPoints,
    xMeta,
    yMeta,
    columnStats,
    slope,
    intercept,
    pearsonR,
    rSquared,
    pValue,
    sampleSize,
  } = analysis;

  const yMean = columnStats[yMeta.key]?.mean ?? 0;

  const sortedByX = [...chartPoints].sort((a, b) => a.x - b.x);
  const normalPoints = sortedByX.filter((p) => !p.isOutlier);
  const outlierPoints = sortedByX.filter((p) => p.isOutlier);

  const handleExportPng = async () => {
    if (!chartContainerRef.current) return;
    setExportError(null);
    setIsExporting(true);

    try {
      const svgEl =
        chartContainerRef.current.querySelector('svg.recharts-surface') ??
        chartContainerRef.current.querySelector('svg');

      if (!svgEl) {
        throw new Error('Chart SVG surface is not ready to export.');
      }

      const rect = svgEl.getBoundingClientRect();
      const svgWidth = Math.max(Math.round(rect.width), 640);
      const svgHeight = Math.max(Math.round(rect.height), 300);

      const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clonedSvg.setAttribute('width', String(svgWidth));
      clonedSvg.setAttribute('height', String(svgHeight));
      if (!clonedSvg.getAttribute('viewBox')) {
        clonedSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
      }

      clonedSvg.querySelectorAll('text').forEach((textNode) => {
        if (!textNode.getAttribute('font-family')) {
          textNode.setAttribute('font-family', 'JetBrains Mono, ui-monospace, monospace');
        }
      });

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to rasterize chart SVG.'));
        image.src = svgUrl;
      });

      URL.revokeObjectURL(svgUrl);

      // 3x high-resolution canvas for scientific slides & publications
      const scale = 3;
      const paddingX = 36;
      const headerHeight = 84;
      const footerHeight = 46;
      const canvasLogicalW = svgWidth + paddingX * 2;
      const canvasLogicalH = svgHeight + headerHeight + footerHeight;

      const canvas = document.createElement('canvas');
      canvas.width = canvasLogicalW * scale;
      canvas.height = canvasLogicalH * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable.');
      }

      ctx.scale(scale, scale);

      // Charcoal-slate Bio-Lab presentation background
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, canvasLogicalW, canvasLogicalH);

      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0.75, 0.75, canvasLogicalW - 1.5, canvasLogicalH - 1.5);

      const modeTitle =
        mode === 'trend'
          ? 'Trend & OLS Regression'
          : mode === 'comparison'
            ? 'Sample Bar Comparison'
            : 'Z-Score Outlier Scatter';

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 17px "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
      const maxTitleWidth = canvasLogicalW - paddingX * 2;
      let displayTitle = experimentTitle;
      while (ctx.measureText(displayTitle).width > maxTitleWidth && displayTitle.length > 12) {
        displayTitle = `${displayTitle.slice(0, -4)}...`;
      }
      ctx.fillText(displayTitle, paddingX, 34);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 11.5px "JetBrains Mono", ui-monospace, monospace';
      const subtitle = `${modeTitle}  |  ${xMeta.label} (${xMeta.unit || 'units'}) vs. ${yMeta.label} (${yMeta.unit || 'units'})  |  n=${sampleSize}  r=${pearsonR >= 0 ? '+' : ''}${pearsonR.toFixed(3)}  R²=${(rSquared * 100).toFixed(1)}%  p=${formatPValue(pValue)}`;
      ctx.fillText(subtitle, paddingX, 56, maxTitleWidth);

      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingX, 70);
      ctx.lineTo(canvasLogicalW - paddingX, 70);
      ctx.stroke();

      ctx.drawImage(img, paddingX, headerHeight, svgWidth, svgHeight);

      const footerY = headerHeight + svgHeight + 26;
      ctx.font = '500 11px "IBM Plex Sans", ui-sans-serif, sans-serif';
      let cursorX = paddingX;

      const drawLegendDot = (color: string, label: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cursorX + 4, footerY - 3.5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CBD5E1';
        ctx.fillText(label, cursorX + 14, footerY);
        cursorX += ctx.measureText(label).width + 32;
      };

      if (mode === 'trend') {
        drawLegendDot('#10B981', 'Nominal Sample');
        drawLegendDot('#F59E0B', 'Outlier (|Z| > 2.0)');
        drawLegendDot(
          '#8B5CF6',
          `OLS Fit: y = ${slope.toFixed(3)}x ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(2)}`
        );
      } else if (mode === 'comparison') {
        drawLegendDot('#10B981', 'Nominal Observation');
        drawLegendDot('#F59E0B', 'Outlier (|Z| > 2.0)');
        drawLegendDot('#8B5CF6', `Sample Mean (μ = ${yMean.toFixed(2)})`);
      } else {
        drawLegendDot('#10B981', '|Z| ≤ 2.0 (Nominal)');
        drawLegendDot('#F43F5E', '|Z| > 2.0 (Anomaly)');
        drawLegendDot('#8B5CF6', '±2.0σ Threshold');
      }

      ctx.fillStyle = '#64748B';
      ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
      const brandLabel = 'BioLens AI · 3x High-Res Export';
      const brandW = ctx.measureText(brandLabel).width;
      if (cursorX + brandW + 16 < canvasLogicalW - paddingX) {
        ctx.fillText(brandLabel, canvasLogicalW - paddingX - brandW, footerY);
      }

      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      );

      if (!pngBlob) {
        throw new Error('Failed to encode PNG image.');
      }

      const pngUrl = URL.createObjectURL(pngBlob);
      const slug = experimentTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const anchor = document.createElement('a');
      anchor.href = pngUrl;
      anchor.download = `biolens-${slug || 'chart'}-${mode}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(pngUrl);

      setExportSuccess(true);
      window.setTimeout(() => setExportSuccess(false), 2200);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export chart PNG.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
      {/* Header & Chart Tabs + PNG Export */}
      <div className="flex flex-col gap-3 border-b border-[#1F2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Interactive Data &amp; Outlier Chart
          </h2>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">
            OLS Fit: y = {slope.toFixed(3)}x {intercept >= 0 ? '+' : '-'}{' '}
            {Math.abs(intercept).toFixed(2)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Chart visualization mode"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[#1F2937] bg-[#090D16] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'trend'}
              onClick={() => setMode('trend')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'trend'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LineChart className="h-3.5 w-3.5" />
              Trend
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'comparison'}
              onClick={() => setMode('comparison')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'comparison'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Comparison
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'outlier-scatter'}
              onClick={() => setMode('outlier-scatter')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'outlier-scatter'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ScatterChart className="h-3.5 w-3.5" />
              Outlier Scatter
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={isExporting}
            title="Export current chart as a 3x high-resolution PNG for scientific presentations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1F2937] bg-[#090D16] px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            {exportSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>PNG Saved</span>
              </>
            ) : (
              <>
                <ImageDown className="h-3.5 w-3.5" />
                <span>{isExporting ? 'Rendering...' : 'Export PNG'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline Axis Selector Bar (replaces sidebar variable controls) */}
      <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-[#1F2937] bg-[#090D16]/75 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          {mode === 'trend' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Nominal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                |Z| &gt; 2.0 Outlier
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-400" />
                OLS Fit
              </span>
            </>
          )}
          {mode === 'comparison' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
                Nominal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-400" />
                |Z| &gt; 2.0
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-400" />
                Mean μ = {yMean.toFixed(2)}
              </span>
            </>
          )}
          {mode === 'outlier-scatter' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                |Z| ≤ 2.0
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                |Z| &gt; 2.0 Anomaly
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-400" />
                ±2.0σ Bounds
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5 text-violet-400 shrink-0" />
          <label htmlFor="wb-x-select" className="text-slate-400">
            X:
          </label>
          <select
            id="wb-x-select"
            value={xKey}
            onChange={(e) => onChangeXKey(e.target.value)}
            className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            {numericVariables.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label} {v.unit ? `(${v.unit})` : ''}
              </option>
            ))}
          </select>

          <label htmlFor="wb-y-select" className="text-slate-400">
            Y:
          </label>
          <select
            id="wb-y-select"
            value={yKey}
            onChange={(e) => onChangeYKey(e.target.value)}
            className="rounded-md border border-[#1F2937] bg-[#111827] px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            {numericVariables.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label} {v.unit ? `(${v.unit})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {exportError && (
        <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {exportError}
        </p>
      )}

      {/* Visualization Stage */}
      <div className="mt-4" ref={chartContainerRef}>
        {mode === 'trend' && (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={sortedByX}
                margin={{ top: 12, right: 18, left: 4, bottom: 18 }}
              >
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  label={{
                    value: `${xMeta.label}${xMeta.unit ? ` (${xMeta.unit})` : ''}`,
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#94A3B8',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  width={54}
                />
                <Tooltip
                  cursor={{ stroke: '#374151', strokeDasharray: '3 3' }}
                  content={
                    <LabChartTooltip
                      xLabel={xMeta.label}
                      xUnit={xMeta.unit}
                      yLabel={yMeta.label}
                      yUnit={yMeta.unit}
                    />
                  }
                />
                <Line
                  type="linear"
                  dataKey="trendY"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Scatter name="Nominal" data={normalPoints} fill="#10B981" />
                {outlierPoints.length > 0 && (
                  <Scatter name="Outlier" data={outlierPoints} fill="#F59E0B" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {mode === 'comparison' && (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartPoints}
                margin={{ top: 12, right: 18, left: 4, bottom: 18 }}
              >
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="rowId"
                  tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  width={54}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(31, 41, 55, 0.5)' }}
                  content={
                    <LabChartTooltip
                      xLabel={xMeta.label}
                      xUnit={xMeta.unit}
                      yLabel={yMeta.label}
                      yUnit={yMeta.unit}
                    />
                  }
                />
                <ReferenceLine
                  y={yMean}
                  stroke="#8B5CF6"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                />
                <Bar dataKey="y" radius={[4, 4, 0, 0]}>
                  {chartPoints.map((entry) => (
                    <Cell
                      key={entry.rowId}
                      fill={entry.isOutlier ? '#F59E0B' : '#10B981'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {mode === 'outlier-scatter' && (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsScatterChart margin={{ top: 12, right: 18, left: 4, bottom: 18 }}>
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  label={{
                    value: `${xMeta.label}${xMeta.unit ? ` (${xMeta.unit})` : ''}`,
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#94A3B8',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="zScore"
                  domain={[-3.5, 3.5]}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#374151"
                  width={48}
                  label={{
                    value: 'Z-Score (σ)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#94A3B8',
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  cursor={{ stroke: '#374151', strokeDasharray: '3 3' }}
                  content={
                    <LabChartTooltip
                      xLabel={xMeta.label}
                      xUnit={xMeta.unit}
                      yLabel={yMeta.label}
                      yUnit={yMeta.unit}
                    />
                  }
                />
                <ReferenceLine y={0} stroke="#4B5563" />
                <ReferenceLine y={2} stroke="#8B5CF6" strokeDasharray="5 4" strokeWidth={1.5} />
                <ReferenceLine y={-2} stroke="#8B5CF6" strokeDasharray="5 4" strokeWidth={1.5} />
                <Scatter name="Nominal" data={normalPoints} fill="#10B981" />
                {outlierPoints.length > 0 && (
                  <Scatter name="Anomaly" data={outlierPoints} fill="#F43F5E" />
                )}
              </RechartsScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
};
