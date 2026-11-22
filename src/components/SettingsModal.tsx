import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  Loader2,
  Server,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  IntelligenceMode,
  ServerAiStatus,
  testGeminiConnection,
} from '../services/geminiResearch';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: IntelligenceMode;
  serverStatus: ServerAiStatus;
  onApplyMode: (mode: IntelligenceMode) => void;
}

interface StatusToast {
  mode: IntelligenceMode;
  message: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  serverStatus,
  onApplyMode,
}) => {
  const [selectedMode, setSelectedMode] = useState<IntelligenceMode>(currentMode);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [toast, setToast] = useState<StatusToast | null>(null);

  const verifyAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedMode(currentMode);
      setTestResult(null);
      setIsTesting(false);
    } else {
      verifyAbortRef.current?.abort();
      verifyAbortRef.current = null;
      setIsTesting(false);
    }
  }, [isOpen, currentMode]);

  useEffect(() => {
    return () => {
      verifyAbortRef.current?.abort();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  if (!isOpen && !toast) return null;

  const showStatusToast = (nextToast: StatusToast) => {
    setToast(nextToast);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  const runLiveVerification = async (): Promise<boolean> => {
    verifyAbortRef.current?.abort();
    const controller = new AbortController();
    verifyAbortRef.current = controller;

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testGeminiConnection(controller.signal);
      if (verifyAbortRef.current !== controller) {
        return false;
      }

      const replyText = result.reply?.trim() ?? '';
      if (result.ok && Boolean(replyText && replyText.length > 0)) {
        setTestResult({
          ok: true,
          message: `Connected ✓ — ${result.model} (${replyText})`,
        });
        return true;
      }

      setTestResult({
        ok: false,
        message: result.error?.trim() || 'Unknown Gemini API error.',
      });
      return false;
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Verification timed out after 8s — check your network or API key.'
          : err instanceof Error && err.message.trim()
            ? err.message.trim()
            : 'Gemini connection test failed.';
      setTestResult({ ok: false, message: msg });
      return false;
    } finally {
      if (verifyAbortRef.current === controller) {
        verifyAbortRef.current = null;
      }
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
    setIsTesting(false);

    onApplyMode(selectedMode);
    showStatusToast({
      mode: selectedMode,
      message:
        selectedMode === 'live'
          ? `Live Gemini AI Mode activated (${serverStatus.primaryModel}).`
          : 'Demo Intelligence Mode activated — zero-key local analysis ready.',
    });
    onClose();
  };

  const handleTestConnection = () => {
    void runLiveVerification();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-engine-settings-title"
        >
          <div className="w-full max-w-xl rounded-xl border border-[#1F2937] bg-[#111827] p-6 text-slate-100 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 id="ai-engine-settings-title" className="font-display text-lg font-semibold">
                AI Engine Settings
              </h2>
              <p className="text-xs text-slate-400">
                Choose how the BioLens AI Co-Scientist synthesizes findings &amp; Q&amp;A
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Engine Settings"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2-Option Radio Card Selector */}
        <div className="mt-5 space-y-3" role="radiogroup" aria-label="AI Intelligence Mode">
          {/* Option A: Demo Intelligence Mode */}
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === 'demo'}
            onClick={() => setSelectedMode('demo')}
            className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
              selectedMode === 'demo'
                ? 'border-emerald-500/70 bg-emerald-500/10'
                : 'border-[#1F2937] bg-[#090D16] hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selectedMode === 'demo'
                      ? 'border-emerald-400 bg-emerald-500/20'
                      : 'border-slate-600'
                  }`}
                >
                  {selectedMode === 'demo' && (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    Option A: Demo Intelligence Mode
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Runs 100% locally in the browser using deterministic statistical synthesis (
                    <code className="font-mono text-emerald-300">statsEngine.ts</code>) with zero
                    network latency and zero external API calls.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-300 whitespace-nowrap shrink-0">
                Offline Ready
              </span>
            </div>
          </button>

          {/* Option B: Live Gemini AI Mode (Server-Side) */}
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === 'live'}
            onClick={() => setSelectedMode('live')}
            className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
              selectedMode === 'live'
                ? 'border-violet-500/70 bg-violet-500/10'
                : 'border-[#1F2937] bg-[#090D16] hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selectedMode === 'live'
                      ? 'border-violet-400 bg-violet-500/20'
                      : 'border-slate-600'
                  }`}
                >
                  {selectedMode === 'live' && (
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    Option B: Live Gemini AI Mode
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Routes requests through the Express backend using{' '}
                    <code className="font-mono text-violet-300">{serverStatus.primaryModel}</code>{' '}
                    with automatic fallback to{' '}
                    <code className="font-mono text-violet-300">{serverStatus.fallbackModel}</code>{' '}
                    and the app&apos;s attached server key.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-violet-300 whitespace-nowrap shrink-0">
                Server API
              </span>
            </div>
          </button>
        </div>

        {/* Live Mode Server Status Banner & Test Connection */}
        {selectedMode === 'live' && (
          <div className="mt-4 space-y-3 border-t border-[#1F2937] pt-4">
            <div className="flex flex-col gap-3 rounded-lg border border-violet-500/35 bg-[#090D16] p-3.5 text-xs text-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                {serverStatus.configured ? (
                  <Server className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <div>
                  <p className="font-semibold text-slate-100">
                    {serverStatus.configured
                      ? 'Server GEMINI_API_KEY Detected'
                      : 'Server GEMINI_API_KEY Not Configured'}
                  </p>
                  <p className="mt-0.5 text-slate-400">
                    Any valid Gemini key configured in <strong>Settings &gt; Secrets</strong> (
                    <code className="font-mono text-violet-300">GEMINI_API_KEY</code>) is verified
                    live against{' '}
                    <code className="font-mono text-violet-300">{serverStatus.primaryModel}</code>{' '}
                    (with <code className="font-mono text-violet-300">{serverStatus.fallbackModel}</code>{' '}
                    fallback). If verification fails, BioLens AI keeps you safely in Demo Intelligence Mode.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      <span>Test Connection</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    verifyAbortRef.current?.abort();
                    verifyAbortRef.current = null;
                    setIsTesting(false);
                    onApplyMode('demo');
                    showStatusToast({
                      mode: 'demo',
                      message: 'Reset to Demo Intelligence Mode — zero-key local analysis ready.',
                    });
                    onClose();
                  }}
                  className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 whitespace-nowrap"
                >
                  Reset to Demo Mode
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                  testResult.ok
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-rose-500/45 bg-rose-500/10 text-rose-200'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span className="font-mono break-words">{testResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#1F2937] pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Server className="h-3.5 w-3.5 text-slate-500" />
            {selectedMode === 'live'
              ? 'Server-side Gemini SDK (@google/genai)'
              : 'Local deterministic engine'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#1F2937] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedMode === 'live'
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {selectedMode === 'live' ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Activate &amp; Save
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Activate &amp; Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-5 bottom-5 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-md ${
            toast.mode === 'live'
              ? 'border-violet-500/50 bg-[#111827]/95 text-violet-200'
              : 'border-emerald-500/50 bg-[#111827]/95 text-emerald-200'
          }`}
        >
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${
              toast.mode === 'live' ? 'text-violet-400' : 'text-emerald-400'
            }`}
          />
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss status notification"
            className="ml-1 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
