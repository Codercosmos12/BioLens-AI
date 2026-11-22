import React, { useCallback, useEffect, useRef, useState } from 'react';

interface LoadingScreenProps {
  onComplete: () => void;
}

const STATUS_MESSAGES = [
  'Initializing client-side statistical engine...',
  'Calibrating Z-score anomaly thresholds (|Z| > 2.0)...',
  'Loading STEM benchmark datasets & Demo Intelligence...',
  'Ready — launching research workbench',
] as const;

const DURATION_MS = 1400;
const EXIT_FADE_MS = 300;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const exitedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);

  const triggerExit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setProgress(100);
    setIsExiting(true);
    unmountTimerRef.current = window.setTimeout(() => {
      onComplete();
    }, EXIT_FADE_MS);
  }, [onComplete]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setProgress(100);
      holdTimerRef.current = window.setTimeout(triggerExit, 350);
      return () => {
        if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
        if (unmountTimerRef.current !== null) window.clearTimeout(unmountTimerRef.current);
      };
    }

    const startTime = performance.now();

    const step = (now: number) => {
      if (exitedRef.current) return;
      const elapsed = now - startTime;
      const rawRatio = Math.min(1, elapsed / DURATION_MS);
      // Smooth ease-out curve so progress sweeps crisply from 0% -> 100% in ~1.4s
      const eased = 1 - Math.pow(1 - rawRatio, 2.2);
      const nextPct = Math.min(100, Math.round(eased * 100));
      setProgress(nextPct);

      if (rawRatio < 1) {
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        setProgress(100);
        holdTimerRef.current = window.setTimeout(triggerExit, 120);
      }
    };

    rafRef.current = window.requestAnimationFrame(step);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (unmountTimerRef.current !== null) window.clearTimeout(unmountTimerRef.current);
    };
  }, [triggerExit]);

  const statusIndex =
    progress >= 94 ? 3 : progress >= 62 ? 2 : progress >= 30 ? 1 : 0;
  const activeStatus = STATUS_MESSAGES[statusIndex];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Initializing BioLens AI Research Workbench"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#090D16] px-6 transition-opacity duration-300 ${
        isExiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle Ambient Bio-Emerald & Spectral Violet Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 38% 42%, rgba(16, 185, 129, 0.14) 0%, transparent 48%), radial-gradient(circle at 64% 58%, rgba(139, 92, 246, 0.13) 0%, transparent 50%)',
        }}
      />

      {/* Centered Identity, Progress Bar & Status Sequence */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* BioLens AI Emblem with Pulsing Orbital / DNA-Grid Mark */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 motion-safe:animate-ping"
            style={{ animationDuration: '2.4s' }}
          />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-[#1F2937] bg-[#111827] shadow-[0_0_36px_rgba(16,185,129,0.22)]">
            <svg
              viewBox="0 0 64 64"
              className="h-12 w-12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="biolens-orbit-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
              {/* Precision coordinate grid hairline */}
              <path
                d="M14 32H50M32 14V50"
                stroke="#1F2937"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
              {/* Orbital ellipse 1 (Bio-Emerald) */}
              <ellipse
                cx="32"
                cy="32"
                rx="22"
                ry="10"
                transform="rotate(-32 32 32)"
                stroke="#10B981"
                strokeOpacity="0.85"
                strokeWidth="1.75"
              />
              {/* Orbital ellipse 2 (Spectral Violet) */}
              <ellipse
                cx="32"
                cy="32"
                rx="22"
                ry="10"
                transform="rotate(32 32 32)"
                stroke="#8B5CF6"
                strokeOpacity="0.85"
                strokeWidth="1.75"
              />
              {/* Inner DNA-grid rungs */}
              <path
                d="M23 24C27 28 37 36 41 40M41 24C37 28 27 36 23 40"
                stroke="url(#biolens-orbit-grad)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M26 27H38M28 32H36M26 37H38"
                stroke="#E2E8F0"
                strokeOpacity="0.7"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              {/* Central focal node */}
              <circle
                cx="32"
                cy="32"
                r="3.2"
                fill="#10B981"
                className="motion-safe:animate-pulse"
              />
            </svg>
          </div>
        </div>

        {/* Brand Wordmark & Subtitle */}
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-[34px]">
          BioLens <span className="text-emerald-400">AI</span>
        </h1>
        <p className="mt-1.5 text-sm font-medium tracking-wide text-slate-400">
          Interactive STEM Lab &amp; Research Copilot
        </p>

        {/* Progress Meter & Tabular Percentage Readout */}
        <div className="mt-8 w-full">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-left text-xs font-medium text-slate-300 truncate">
              {activeStatus}
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-emerald-400 shrink-0">
              {progress}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full border border-[#1F2937] bg-[#111827]"
          >
            <div
              className="h-full w-full origin-left rounded-full will-change-transform"
              style={{
                transform: `scaleX(${progress / 100})`,
                background: 'linear-gradient(90deg, #10B981 0%, #34D399 55%, #8B5CF6 100%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Subtle Bottom-Right Skip Action */}
      <button
        type="button"
        onClick={triggerExit}
        className="absolute right-6 bottom-6 z-10 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-[#111827] hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Skip
      </button>
    </div>
  );
};
