import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Cpu,
  Download,
  Filter,
  FlaskConical,
  Info,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { BUILTIN_EXPERIMENTS } from './data/experiments';
import {
  ChatMessage,
  ExperimentDataset,
  ResearchSynthesis,
} from './types/research';
import {
  analyzeDataset,
  computeExperimentRigor,
  parseCsvDataset,
} from './utils/statsEngine';
import { buildMarkdownReport, downloadMarkdownFile } from './utils/reportExport';
import {
  askResearchCopilot,
  fetchServerAiStatus,
  getSavedIntelligenceMode,
  hasExplicitModePreference,
  IntelligenceMode,
  saveIntelligenceMode,
  ServerAiStatus,
  ServerKeyMissingError,
  synthesizeLabFindings,
} from './services/geminiResearch';
import { KpiStrip, OutlierExclusionDelta } from './components/KpiStrip';
import { VisualizationPanel } from './components/VisualizationPanel';
import { RigorScorecardCard } from './components/RigorScorecardCard';
import { BottomWorkbench } from './components/BottomWorkbench';
import { ResearchCopilotPanel } from './components/ResearchCopilotPanel';
import { CsvUploadModal, DisclosureModal } from './components/Modals';
import { SettingsModal } from './components/SettingsModal';
import { LoadingScreen } from './components/LoadingScreen';

export default function App() {
  const [showLoader, setShowLoader] = useState(true);
  const handleLoaderComplete = useCallback(() => {
    setShowLoader(false);
  }, []);

  const [experiments, setExperiments] = useState<ExperimentDataset[]>(BUILTIN_EXPERIMENTS);
  const [activeId, setActiveId] = useState<string>(BUILTIN_EXPERIMENTS[0].id);

  // Per-dataset axis selection & outlier exclusion toggles
  const [axisByExp, setAxisByExp] = useState<Record<string, { xKey: string; yKey: string }>>({});
  const [excludeOutliersByExp, setExcludeOutliersByExp] = useState<Record<string, boolean>>({});

  // Per-dataset AI synthesis & chat transcripts
  const [synthesisByExp, setSynthesisByExp] = useState<Record<string, ResearchSynthesis>>({});
  const [messagesByExp, setMessagesByExp] = useState<Record<string, ChatMessage[]>>({});
  const [streamingByExp, setStreamingByExp] = useState<
    Record<string, { content: string; modelUsed?: string } | null>
  >({});

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Modal states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);

  // Intelligence Mode & Server AI Status
  const [intelligenceMode, setIntelligenceMode] = useState<IntelligenceMode>(() =>
    getSavedIntelligenceMode()
  );
  const [serverStatus, setServerStatus] = useState<ServerAiStatus>({
    configured: false,
    primaryModel: 'gemini-3.5-flash-lite',
    fallbackModel: 'gemini-3.8-flash',
  });

  useEffect(() => {
    let active = true;
    fetchServerAiStatus().then((status) => {
      if (!active) return;
      setServerStatus(status);
      // If user hasn't explicitly chosen a mode yet and server Gemini key is active, enable Live mode automatically
      if (!hasExplicitModePreference() && status.configured) {
        setIntelligenceMode('live');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const activeExperiment = useMemo(
    () => experiments.find((e) => e.id === activeId) ?? experiments[0],
    [experiments, activeId]
  );

  const activeAxes = axisByExp[activeExperiment.id] ?? {
    xKey: activeExperiment.defaultXKey,
    yKey: activeExperiment.defaultYKey,
  };

  const baselineAnalysis = useMemo(
    () => analyzeDataset(activeExperiment, activeAxes.xKey, activeAxes.yKey),
    [activeExperiment, activeAxes.xKey, activeAxes.yKey]
  );

  const canExcludeOutliers =
    baselineAnalysis.outliers.length > 0 &&
    activeExperiment.rows.length - baselineAnalysis.outliers.length >= 3;

  const excludeOutliers =
    Boolean(excludeOutliersByExp[activeExperiment.id]) && canExcludeOutliers;

  const excludedRowIds = useMemo(
    () =>
      excludeOutliers
        ? new Set(baselineAnalysis.outliers.map((o) => o.rowId))
        : undefined,
    [excludeOutliers, baselineAnalysis.outliers]
  );

  const analysis = useMemo(
    () =>
      excludeOutliers && excludedRowIds
        ? analyzeDataset(activeExperiment, activeAxes.xKey, activeAxes.yKey, excludedRowIds)
        : baselineAnalysis,
    [excludeOutliers, excludedRowIds, activeExperiment, activeAxes.xKey, activeAxes.yKey, baselineAnalysis]
  );

  const outlierDelta: OutlierExclusionDelta | null = useMemo(() => {
    if (!excludeOutliers) return null;
    const baselineMean = baselineAnalysis.columnStats[baselineAnalysis.yKey]?.mean ?? 0;
    const activeMean = analysis.columnStats[analysis.yKey]?.mean ?? 0;
    const excludedCount = baselineAnalysis.sampleSize - analysis.sampleSize;
    if (excludedCount <= 0) return null;
    return {
      excludedCount,
      baselineN: baselineAnalysis.sampleSize,
      baselineMean,
      baselineR: baselineAnalysis.pearsonR,
      deltaMean: activeMean - baselineMean,
      deltaR: analysis.pearsonR - baselineAnalysis.pearsonR,
      deltaAbsR: Math.abs(analysis.pearsonR) - Math.abs(baselineAnalysis.pearsonR),
    };
  }, [excludeOutliers, baselineAnalysis, analysis]);

  const rigorScorecard = useMemo(
    () => computeExperimentRigor(baselineAnalysis, analysis, excludeOutliers),
    [baselineAnalysis, analysis, excludeOutliers]
  );

  const handleToggleExcludeOutliers = () => {
    if (!canExcludeOutliers) return;
    setExcludeOutliersByExp((prev) => ({
      ...prev,
      [activeExperiment.id]: !prev[activeExperiment.id],
    }));
  };

  const activeSynthesis = synthesisByExp[activeExperiment.id] ?? null;
  const activeMessages = messagesByExp[activeExperiment.id] ?? [];

  const activeModeLabel =
    intelligenceMode === 'live' ? 'Gemini AI Live (Server)' : 'Demo Intelligence Mode';

  const handleSelectExperiment = (id: string) => {
    setActiveId(id);
    setSynthesisError(null);
    setChatError(null);
  };

  const handleUploadCsv = (fileName: string, csvText: string) => {
    const parsed = parseCsvDataset(fileName, csvText);
    setExperiments((prev) => [parsed, ...prev]);
    setActiveId(parsed.id);
    setSynthesisError(null);
    setChatError(null);
  };

  const handleChangeXKey = (newXKey: string) => {
    setAxisByExp((prev) => ({
      ...prev,
      [activeExperiment.id]: { xKey: newXKey, yKey: analysis.yKey },
    }));
  };

  const handleChangeYKey = (newYKey: string) => {
    setAxisByExp((prev) => ({
      ...prev,
      [activeExperiment.id]: { xKey: analysis.xKey, yKey: newYKey },
    }));
  };

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    setSynthesisError(null);
    try {
      const result = await synthesizeLabFindings(activeExperiment, analysis, {
        mode: intelligenceMode,
      });
      setSynthesisByExp((prev) => ({
        ...prev,
        [activeExperiment.id]: result,
      }));
    } catch (err) {
      if (err instanceof ServerKeyMissingError) {
        setSynthesisError(err.message);
        setIsSettingsOpen(true);
      } else {
        setSynthesisError(
          err instanceof Error
            ? err.message
            : 'Unable to complete synthesis.'
        );
      }
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSendMessage = async (question: string) => {
    const targetExpId = activeExperiment.id;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const currentHistory = messagesByExp[targetExpId] ?? [];
    setMessagesByExp((prev) => ({
      ...prev,
      [targetExpId]: [...currentHistory, userMsg],
    }));

    setIsChatting(true);
    setChatError(null);
    setStreamingByExp((prev) => ({ ...prev, [targetExpId]: null }));

    try {
      const reply = await askResearchCopilot(
        question,
        activeExperiment,
        analysis,
        currentHistory,
        {
          mode: intelligenceMode,
          onChunk: (partialText, modelUsed) => {
            setStreamingByExp((prev) => ({
              ...prev,
              [targetExpId]: { content: partialText, modelUsed },
            }));
          },
        }
      );
      const safeContent =
        reply.content?.trim() ||
        'Unable to generate a response for this query. Please retry or switch to Demo Intelligence Mode.';
      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: safeContent,
        mode: reply.mode,
        modelUsed: reply.modelUsed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setStreamingByExp((prev) => ({ ...prev, [targetExpId]: null }));
      setMessagesByExp((prev) => ({
        ...prev,
        [targetExpId]: [...(prev[targetExpId] ?? []), assistantMsg],
      }));
    } catch (err) {
      setStreamingByExp((prev) => ({ ...prev, [targetExpId]: null }));
      if (err instanceof ServerKeyMissingError) {
        setChatError(err.message);
        setIsSettingsOpen(true);
      } else {
        setChatError(
          err instanceof Error
            ? err.message
            : 'Copilot request failed.'
        );
      }
    } finally {
      setStreamingByExp((prev) => ({ ...prev, [targetExpId]: null }));
      setIsChatting(false);
    }
  };

  const handleExportBrief = () => {
    const md = buildMarkdownReport(activeExperiment, analysis, activeSynthesis, activeMessages);
    const slug = activeExperiment.shortTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    downloadMarkdownFile(`biolens-${slug}-report.md`, md);
  };

  const handleApplyMode = (newMode: IntelligenceMode) => {
    saveIntelligenceMode(newMode);
    setIntelligenceMode(newMode);
    setSynthesisError(null);
    setChatError(null);
  };

  const getTabLabel = (exp: ExperimentDataset): string => {
    if (exp.id === 'perovskite-thermal-stress') return 'Solar Perovskite Efficiency';
    if (exp.id === 'crispr-knockdown-viability') return 'CRISPR-Cas9 Knockdown';
    if (exp.id === 'coastal-microplastic-ph') return 'Coastal Microplastics';
    return exp.shortTitle;
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100">
      {showLoader && <LoadingScreen onComplete={handleLoaderComplete} />}
      {/* Row 1: Sleek Top Command Header */}
      <header className="sticky top-0 z-30 border-b border-[#1F2937] bg-[#090D16]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand Logo with glowing emerald/teal pulse icon */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 shadow-[0_0_16px_rgba(16,185,129,0.28)]">
              <Activity className="h-4 w-4 animate-pulse text-emerald-400" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
              BioLens <span className="text-emerald-400">AI</span>
            </span>
          </div>

          {/* Command Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/45 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Experiment CSV
            </button>

            <button
              type="button"
              onClick={handleExportBrief}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Download className="h-3.5 w-3.5" />
              Export Lab Report (.md)
            </button>

            <button
              type="button"
              onClick={() => setIsDisclosureOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/35 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20 whitespace-nowrap shrink-0"
            >
              <Info className="h-3.5 w-3.5" />
              AI Disclosure
            </button>

            <button
              type="button"
              onClick={() => {
                fetchServerAiStatus().then(setServerStatus);
                setIsSettingsOpen(true);
              }}
              aria-label="Open AI Engine Settings"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                intelligenceMode === 'live'
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 focus-visible:outline-violet-400'
                  : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 focus-visible:outline-emerald-400'
              }`}
            >
              {intelligenceMode === 'live' ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                  <span>Gemini AI Live</span>
                </>
              ) : (
                <>
                  <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Demo Mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Horizontal Experiment Switcher Bar */}
        <div className="border-t border-[#1F2937] bg-[#0B101B]">
          <div className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase whitespace-nowrap shrink-0">
              <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
              Experiments:
            </span>
            {experiments.map((exp) => {
              const isActive = exp.id === activeExperiment.id;
              return (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => handleSelectExperiment(exp.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                    isActive
                      ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.14)]'
                      : 'border-[#1F2937] bg-[#111827] text-slate-400 hover:border-slate-600 hover:text-slate-100'
                  }`}
                >
                  <span>{getTabLabel(exp)}</span>
                  <span className="font-mono text-[11px] tabular-nums opacity-75">
                    n={exp.rows.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        {/* Active Experiment Domain Tag & Hypothesis Banner */}
        <section className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 font-medium text-violet-300">
                {activeExperiment.discipline} · {activeExperiment.subfield}
              </span>
              <span className="text-slate-400">{activeExperiment.investigator}</span>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              Recorded {activeExperiment.recordedDate}
            </span>
          </div>

          <h1 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-[26px]">
            {activeExperiment.title}
          </h1>

          <div className="mt-3 rounded-lg border border-[#1F2937] bg-[#090D16]/90 px-4 py-3 text-xs leading-relaxed text-slate-300 sm:text-sm">
            <span className="font-semibold text-emerald-400">Hypothesis: </span>
            {activeExperiment.hypothesis}
          </div>
        </section>

        {/* Sensitivity Control Bar: Live Outlier Exclusion Toggle & Delta Readout */}
        <section className="flex flex-col gap-3 rounded-xl border border-[#1F2937] bg-[#111827]/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={excludeOutliers}
              disabled={!canExcludeOutliers}
              onClick={handleToggleExcludeOutliers}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                excludeOutliers
                  ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.18)]'
                  : canExcludeOutliers
                    ? 'border-[#334155] bg-[#090D16] text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300'
                    : 'cursor-not-allowed border-[#1F2937] bg-[#090D16]/60 text-slate-500'
              }`}
            >
              <Filter className={`h-3.5 w-3.5 ${excludeOutliers ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>Exclude Flagged Outliers (|Z| &gt; 2.0)</span>
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                  excludeOutliers
                    ? 'bg-emerald-500/25 text-emerald-200'
                    : baselineAnalysis.outliers.length > 0
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-slate-800 text-slate-400'
                }`}
              >
                {baselineAnalysis.outliers.length}
              </span>
            </button>

            <span className="text-xs text-slate-400">
              {excludeOutliers
                ? `Showing ${analysis.sampleSize} clean samples (${baselineAnalysis.outliers.map((o) => o.label).join(', ')} excluded)`
                : baselineAnalysis.outliers.length > 0
                  ? `Toggle to dynamically recompute n, mean, OLS fit & Rigor Score without |Z| > 2.0 sensor anomalies`
                  : 'No |Z| > 2.0 outliers detected on this variable pair'}
            </span>
          </div>

          {outlierDelta && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex flex-wrap items-center gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs tabular-nums">
                <span className="font-semibold text-emerald-300">
                  Δ|r| {outlierDelta.deltaAbsR >= 0 ? '+' : ''}
                  {outlierDelta.deltaAbsR.toFixed(3)}
                </span>
                <span className="text-slate-400">
                  (r: {outlierDelta.baselineR >= 0 ? '+' : ''}
                  {outlierDelta.baselineR.toFixed(3)} → {analysis.pearsonR >= 0 ? '+' : ''}
                  {analysis.pearsonR.toFixed(3)})
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-violet-300">
                  ΔMean {outlierDelta.deltaMean >= 0 ? '+' : ''}
                  {outlierDelta.deltaMean.toFixed(2)}
                  {analysis.yMeta.unit ? ` ${analysis.yMeta.unit}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleExcludeOutliers}
                title="Restore full cohort"
                className="inline-flex items-center gap-1 rounded-lg border border-[#1F2937] bg-[#090D16] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          )}
        </section>

        {/* Top Strip: 4 Compact Horizontal Glassmorphism Metric Pills */}
        <KpiStrip analysis={analysis} outlierDelta={outlierDelta} />

        {/* Asymmetric 12-Column Bento-Grid Workspace */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left 7 Columns: Interactive Data & Outlier Chart Card + Rigor Scorecard + Tabbed Bottom Workbench */}
          <div className="space-y-6 lg:col-span-7">
            <VisualizationPanel
              analysis={analysis}
              experimentTitle={activeExperiment.title}
              numericVariables={analysis.numericVariables}
              xKey={analysis.xKey}
              yKey={analysis.yKey}
              onChangeXKey={handleChangeXKey}
              onChangeYKey={handleChangeYKey}
            />

            <RigorScorecardCard
              scorecard={rigorScorecard}
              outliersExcluded={excludeOutliers}
            />

            <BottomWorkbench
              analysis={analysis}
              methodology={activeExperiment.methodology}
              experimentTitle={activeExperiment.shortTitle}
              variables={activeExperiment.variables}
            />
          </div>

          {/* Right 5 Columns: Sticky AI Co-Scientist Panel */}
          <div className="lg:col-span-5">
            <ResearchCopilotPanel
              dataset={activeExperiment}
              analysis={analysis}
              synthesis={activeSynthesis}
              isSynthesizing={isSynthesizing}
              synthesisError={synthesisError}
              onSynthesize={handleSynthesize}
              messages={activeMessages}
              streamingMessage={streamingByExp[activeExperiment.id] ?? null}
              isChatting={isChatting}
              chatError={chatError}
              onSendMessage={handleSendMessage}
              activeModeLabel={activeModeLabel}
            />
          </div>
        </div>
      </main>

      <CsvUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadCsv={handleUploadCsv}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentMode={intelligenceMode}
        serverStatus={serverStatus}
        onApplyMode={handleApplyMode}
      />

      <DisclosureModal
        isOpen={isDisclosureOpen}
        onClose={() => setIsDisclosureOpen(false)}
      />
    </div>
  );
}
