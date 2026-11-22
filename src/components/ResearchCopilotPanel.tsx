import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Code2,
  FlaskConical,
  Lightbulb,
  MessageSquare,
  Microscope,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  ChatMessage,
  DatasetAnalysis,
  ExperimentDataset,
  ResearchSynthesis,
} from '../types/research';

type CopilotTab = 'synthesis' | 'chat';

interface ResearchCopilotPanelProps {
  dataset: ExperimentDataset;
  analysis: DatasetAnalysis;
  synthesis: ResearchSynthesis | null;
  isSynthesizing: boolean;
  synthesisError: string | null;
  onSynthesize: () => void;
  messages: ChatMessage[];
  streamingMessage?: { content: string; modelUsed?: string } | null;
  isChatting: boolean;
  chatError: string | null;
  onSendMessage: (question: string) => void;
  activeModeLabel: string;
}

export const ResearchCopilotPanel: React.FC<ResearchCopilotPanelProps> = ({
  dataset,
  analysis,
  synthesis,
  isSynthesizing,
  synthesisError,
  onSynthesize,
  messages,
  streamingMessage,
  isChatting,
  chatError,
  onSendMessage,
  activeModeLabel,
}) => {
  const [activeTab, setActiveTab] = useState<CopilotTab>('synthesis');
  const [questionInput, setQuestionInput] = useState('');
  const [showContext, setShowContext] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, streamingMessage?.content, isChatting, activeTab]);

  const quickPrompts = [
    'Explain the flagged Z-score outliers',
    'Is the correlation statistically significant?',
    'What follow-up experiment should we run next?',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || isChatting) return;
    setQuestionInput('');
    onSendMessage(trimmed);
  };

  return (
    <aside className="rounded-xl border border-[#1F2937] bg-[#111827] p-5 lg:sticky lg:top-[120px]">
      {/* Header & Segmented Top Toggle */}
      <div className="flex flex-col gap-3 border-b border-[#1F2937] pb-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              AI Co-Scientist
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Mode: <span className="font-mono text-emerald-400">{activeModeLabel}</span>
            </p>
          </div>

          <div
            role="tablist"
            aria-label="AI Co-Scientist view"
            className="inline-flex items-center gap-1 rounded-lg border border-[#1F2937] bg-[#090D16] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'synthesis'}
              onClick={() => setActiveTab('synthesis')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'synthesis'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Microscope className="h-3.5 w-3.5" />
              Lab Synthesis
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Research Q&amp;A Chat
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: Lab Synthesis */}
      {activeTab === 'synthesis' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Generate empirical findings, bias checks &amp; 3 testable hypotheses.
            </p>
            <button
              type="button"
              onClick={onSynthesize}
              disabled={isSynthesizing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Microscope className="h-3.5 w-3.5" />
              {isSynthesizing ? 'Synthesizing...' : 'Synthesize Lab Findings'}
            </button>
          </div>

          {synthesisError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <p className="font-medium text-rose-300">Synthesis Error</p>
                <p className="mt-0.5 text-rose-200/90">{synthesisError}</p>
              </div>
            </div>
          )}

          {!synthesis && !isSynthesizing && !synthesisError && (
            <div className="rounded-lg border border-dashed border-[#1F2937] bg-[#090D16]/80 p-6 text-center">
              <FlaskConical className="mx-auto mb-2.5 h-6 w-6 text-emerald-400" />
              <p className="text-sm font-medium text-slate-200">
                Ready to analyze {dataset.shortTitle}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                Click &ldquo;Synthesize Lab Findings&rdquo; to ground empirical insights directly in
                computed Pearson r, p-values, and |Z| &gt; 2.0 anomalies.
              </p>
            </div>
          )}

          {isSynthesizing && (
            <div className="space-y-3" aria-live="polite">
              <div className="h-24 animate-pulse rounded-lg border border-[#1F2937] bg-[#090D16]" />
              <div className="h-24 animate-pulse rounded-lg border border-[#1F2937] bg-[#090D16]" />
              <div className="h-28 animate-pulse rounded-lg border border-[#1F2937] bg-[#090D16]" />
            </div>
          )}

          {synthesis && !isSynthesizing && (
            <div className="max-h-[600px] space-y-3.5 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Source: <span className="font-mono text-violet-300">{synthesis.modelUsed}</span>
                </span>
                <span className="font-mono tabular-nums">{synthesis.generatedAt}</span>
              </div>

              {/* Key Empirical Findings */}
              <div className="rounded-lg border border-[#1F2937] bg-[#090D16] p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-300 uppercase">
                  <Microscope className="h-3.5 w-3.5" />
                  Empirical Findings
                </h3>
                <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-200">
                  {synthesis.keyFindings.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-[11px] text-emerald-400">
                        0{idx + 1}.
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bias & Confounder Check */}
              <div className="rounded-lg border border-[#1F2937] bg-[#090D16] p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-300 uppercase">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Bias Check &amp; Confounders
                </h3>
                <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-200">
                  {synthesis.confoundersAndBias.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-[11px] text-amber-400">
                        0{idx + 1}.
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 3 Next-Step Testable Hypotheses */}
              <div className="rounded-lg border border-[#1F2937] bg-[#090D16] p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-violet-300 uppercase">
                  <Lightbulb className="h-3.5 w-3.5" />
                  3 Next-Step Testable Hypotheses
                </h3>
                <div className="mt-3 space-y-3">
                  {synthesis.nextStepHypotheses.map((hyp, idx) => (
                    <div
                      key={idx}
                      className="border-t border-[#1F2937] pt-3 first:border-t-0 first:pt-0"
                    >
                      <p className="text-xs font-semibold text-slate-100">
                        {idx + 1}. {hyp.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        <span className="text-slate-400">Rationale:</span> {hyp.rationale}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        <span className="text-slate-400">Protocol:</span> {hyp.protocol}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-emerald-400">
                        Expected Signal: {hyp.expectedMetricShift}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Research Q&A Chat */}
      {activeTab === 'chat' && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Collapsible </> View Statistical Context Drawer */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Grounded in active dataset stats</span>
            <button
              type="button"
              onClick={() => setShowContext((prev) => !prev)}
              aria-expanded={showContext}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1F2937] bg-[#090D16] px-2.5 py-1.5 font-mono text-xs text-violet-300 transition-colors hover:border-violet-500/50 hover:text-violet-200 whitespace-nowrap shrink-0"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>&lt;/&gt; View Statistical Context</span>
              {showContext ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {showContext && (
            <div className="rounded-lg border border-[#1F2937] bg-[#090D16] p-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>Exact JSON context sent to Gemini</span>
                <span className="font-mono text-emerald-400">
                  n={analysis.sampleSize} · r={analysis.pearsonR.toFixed(3)}
                </span>
              </div>
              <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-slate-300">
                {analysis.statisticalContextJson}
              </pre>
            </div>
          )}

          {/* Quick Suggested Prompts */}
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isChatting}
                onClick={() => onSendMessage(prompt)}
                className="rounded-md border border-[#1F2937] bg-[#090D16] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-200 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Message Log */}
          <div
            ref={chatScrollRef}
            className="max-h-[340px] min-h-[200px] space-y-3 overflow-y-auto rounded-lg border border-[#1F2937] bg-[#090D16] p-3.5"
          >
            {messages.length === 0 && !streamingMessage?.content ? (
              <p className="py-10 text-center text-xs text-slate-400">
                Ask about outliers, p-values, regression slopes, or follow-up experiments for{' '}
                {dataset.shortTitle}.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'ml-6 border border-violet-500/35 bg-violet-500/10 text-slate-100'
                      : 'mr-4 border border-[#1F2937] bg-[#111827] text-slate-100'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium text-slate-300">
                      {msg.role === 'user' ? 'Researcher' : 'BioLens Copilot'}
                    </span>
                    <span className="font-mono">
                      {msg.modelUsed ? `${msg.modelUsed} · ` : ''}
                      {msg.timestamp}
                    </span>
                  </div>
                  <div className="text-slate-100 leading-relaxed whitespace-pre-wrap">
                    {msg.content?.trim()
                      ? msg.content
                      : 'No response text was returned for this query. Please retry or switch to Demo Intelligence Mode.'}
                  </div>
                </div>
              ))
            )}

            {streamingMessage?.content && (
              <div className="mr-4 rounded-lg border border-emerald-500/35 bg-[#111827] p-3 text-xs leading-relaxed text-slate-100">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-medium text-emerald-300">BioLens Copilot</span>
                  <span className="font-mono text-emerald-400">
                    {streamingMessage.modelUsed ? `${streamingMessage.modelUsed} · ` : ''}
                    streaming
                  </span>
                </div>
                <div className="text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {streamingMessage.content}
                  <span
                    aria-hidden="true"
                    className="ml-1 inline-block h-3.5 w-1.5 align-middle bg-emerald-400 animate-pulse"
                  />
                </div>
              </div>
            )}

            {isChatting && !streamingMessage?.content && (
              <div className="mr-4 rounded-lg border border-[#1F2937] bg-[#111827] p-3 text-xs text-slate-400">
                Analyzing statistical context...
              </div>
            )}
          </div>

          {chatError && <p className="text-xs text-rose-400">{chatError}</p>}

          {/* Input Bar */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask about anomalies, p-value, or next protocols..."
              aria-label="Ask Research Copilot"
              className="flex-1 rounded-lg border border-[#1F2937] bg-[#090D16] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isChatting || !questionInput.trim()}
              aria-label="Send question"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Ask
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
