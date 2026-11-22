import {
  ChatMessage,
  DatasetAnalysis,
  ExperimentDataset,
  NextStepHypothesis,
  ResearchSynthesis,
} from '../types/research';
import { formatPValue } from '../utils/statsEngine';
import {
  fetchServerAiStatus,
  forwardChatStreamRequest,
  forwardSynthesisRequest,
  ServerAiStatus,
  ServerKeyMissingError,
  testServerGeminiConnection,
  TestConnectionResponse,
} from './aiProxy';

const LOCAL_STORAGE_MODE = 'biolens_ai_mode';

export type IntelligenceMode = 'demo' | 'live';
export type { ServerAiStatus, TestConnectionResponse };
export { fetchServerAiStatus, ServerKeyMissingError };

const VERIFICATION_TIMEOUT_MS = 8000;

export async function testGeminiConnection(
  externalSignal?: AbortSignal
): Promise<TestConnectionResponse> {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, VERIFICATION_TIMEOUT_MS);

  try {
    const res = await testServerGeminiConnection(controller.signal);
    const reply = res.reply?.trim() ?? '';
    const hasNonEmptyReply = Boolean(reply && reply.trim().length > 0);
    if (!res.ok || !hasNonEmptyReply) {
      return {
        ok: false,
        model: res.model || 'gemini-3.5-flash-lite',
        error:
          res.error?.trim() ||
          `${res.model || 'gemini-3.5-flash-lite'} returned an empty verification reply. Check GEMINI_API_KEY in Settings > Secrets or switch to Demo Intelligence Mode.`,
      };
    }
    return {
      ok: true,
      model: res.model || 'gemini-3.5-flash-lite',
      reply,
    };
  } catch (err) {
    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      return {
        ok: false,
        model: 'gemini-3.5-flash-lite',
        error: 'Verification timed out after 8s — check your network or API key.',
      };
    }
    const message =
      err instanceof Error && err.message.trim() ? err.message.trim() : String(err);
    console.error('[BioLens AI] Test connection failed:', message);
    return {
      ok: false,
      model: 'gemini-3.5-flash-lite',
      error: message,
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function hasExplicitModePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(LOCAL_STORAGE_MODE);
    return stored === 'demo' || stored === 'live';
  } catch {
    return false;
  }
}

export function getSavedIntelligenceMode(): IntelligenceMode {
  if (typeof window === 'undefined') return 'demo';
  try {
    const stored = window.localStorage.getItem(LOCAL_STORAGE_MODE);
    if (stored === 'demo' || stored === 'live') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'demo';
}

export function saveIntelligenceMode(mode: IntelligenceMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_MODE, mode);
  } catch {
    // Ignore storage quota errors
  }
}

function describeCorrelationStrength(r: number): string {
  const abs = Math.abs(r);
  const direction = r >= 0 ? 'positive' : 'negative';
  if (abs >= 0.85) return `very strong ${direction}`;
  if (abs >= 0.65) return `strong ${direction}`;
  if (abs >= 0.4) return `moderate ${direction}`;
  if (abs >= 0.2) return `weak ${direction}`;
  return 'negligible linear';
}

function computeDemoSynthesis(
  dataset: ExperimentDataset,
  analysis: DatasetAnalysis
): ResearchSynthesis {
  const {
    xMeta,
    yMeta,
    pearsonR,
    rSquared,
    pValue,
    slope,
    intercept,
    outliers,
    columnStats,
    sampleSize,
  } = analysis;
  const yStat = columnStats[yMeta.key];
  const xStat = columnStats[xMeta.key];
  const strength = describeCorrelationStrength(pearsonR);
  const pStr = formatPValue(pValue);
  const rSign = pearsonR >= 0 ? '+' : '';
  const unitX = xMeta.unit ? ` ${xMeta.unit}` : '';
  const unitY = yMeta.unit ? ` ${yMeta.unit}` : '';

  const outlierSummary =
    outliers.length > 0
      ? outliers
          .map(
            (o) =>
              `${o.label} (${yMeta.label} = ${o.yValue.toFixed(2)}${unitY}, Z = ${o.zScore >= 0 ? '+' : ''}${o.zScore.toFixed(2)})`
          )
          .join('; ')
      : `no observations exceeded |Z| > 2.0 on ${yMeta.label}`;

  const keyFindings: string[] = [
    `Across n = ${sampleSize} valid observations, ${xMeta.label} exhibits a ${strength} correlation with ${yMeta.label} (r = ${rSign}${pearsonR.toFixed(3)}, R² = ${(rSquared * 100).toFixed(1)}%, p = ${pStr}).`,
    `Ordinary least squares regression estimates ${yMeta.label} = ${slope.toFixed(4)}·(${xMeta.label}) ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(3)}, with sample mean ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY} across [${xStat.min.toFixed(1)}–${xStat.max.toFixed(1)}${unitX}].`,
    outliers.length > 0
      ? `Z-score screening (|Z| > 2.0) isolated ${outliers.length} statistical ${outliers.length === 1 ? 'anomaly' : 'anomalies'}: ${outlierSummary}. Re-evaluating the model without these isolated anomalies clarifies the underlying physical/biological response.`
      : `Z-score distribution across ${yMeta.label} remained within ±2.0σ (median ${yStat.median.toFixed(2)}${unitY}, IQR ${(yStat.q3 - yStat.q1).toFixed(2)}${unitY}), indicating tight experimental repeatability.`,
  ];

  let confoundersAndBias: string[] = [];
  let nextStepHypotheses: NextStepHypothesis[] = [];

  if (dataset.id === 'perovskite-thermal-stress') {
    const rsStat = columnStats['seriesResistance'];
    const ffStat = columnStats['fillFactor'];
    confoundersAndBias = [
      `Non-linear thermal degradation regime: Above 75 °C, halide ion migration and series resistance growth (mean ${rsStat?.mean.toFixed(2) ?? '4.5'} Ω·cm², max ${rsStat?.max.toFixed(2) ?? '12.9'} Ω·cm²) accelerate faster than a single linear OLS slope captures.`,
      `Encapsulation & edge-seal defects: Coupon PV-13 (PCE = 11.45%, Z = ${outliers.find((o) => o.rowId === 'PV-13')?.zScore.toFixed(2) ?? '-2.17'}) fails prematurely at 65 °C, pointing to localized moisture/oxygen ingress rather than intrinsic bulk lattice thermal instability.`,
      `Fill Factor co-degradation (mean ${ffStat?.mean.toFixed(1) ?? '72.4'}%): Thermal soak duration (120 min) without active inert N₂ purge may confound temperature effects with ambient humidity stress.`,
    ];
    nextStepHypotheses = [
      {
        title: 'Piecewise Arrhenius Thermal Transition Model',
        rationale:
          'Efficiency decline steepens noticeably past 75 °C alongside rising series resistance, suggesting a threshold activation energy for iodide vacancy migration.',
        protocol:
          'Split thermal sweep into <65 °C and >75 °C regimes with in-situ impedance spectroscopy (EIS) at 10 °C intervals under dry N₂ glovebox atmosphere.',
        expectedMetricShift:
          'Segmented R² improves from current linear fit to > 0.97; charge-transfer resistance doubles above 80 °C.',
      },
      {
        title: '2D Dion-Jacobson Passivation Layer Screening',
        rationale:
          'Suppressing grain-boundary ion transport should preserve Voc and Fill Factor at 85 °C+ without sacrificing room-temperature PCE.',
        protocol:
          'Compare control MAPbI3/FAPbI3 coupons against phenethylammonium iodide (PEAI) surface-passivated coupons across n = 15 replicates at 85 °C for 500 h.',
        expectedMetricShift: '+3.5% to +4.8% absolute PCE retention at 85 °C and < 1.2 Ω·cm² ΔRs.',
      },
      {
        title: 'Atomic Layer Deposition (ALD) Barrier Validation',
        rationale:
          'Low-outlier Coupon PV-13 indicates encapsulation pinholes cause catastrophic mid-temperature drop-outs.',
        protocol:
          'Add 15 nm Al₂O₃ ALD barrier beneath glass/epoxy encapsulation and perform helium leak + damp-heat (85 °C / 85% RH) screening.',
        expectedMetricShift:
          'Eliminate |Z| > 2.0 premature pinhole failures; batch σ(PCE) drops below 0.8%.',
      },
    ];
  } else if (dataset.id === 'crispr-knockdown-viability') {
    const viaStat = columnStats['viabilityPercent'];
    const offStat = columnStats['offTargetIndels'];
    confoundersAndBias = [
      `Dose-response saturation vs. linear model: Knockdown efficiency plateaus near 88–90% above 70 nM, causing a linear Pearson r (${rSign}${pearsonR.toFixed(3)}) to underestimate the true Hill-equation sigmoidal potency.`,
      `Sequence-specific folding & toxicity outliers: Guide CR-09 (80% GC content, knockdown 18.4%) suffers from secondary hairpin misfolding, whereas Guide CR-19 (viability ${viaStat ? '48.2%' : 'low'}) exhibits acute delivery toxicity rather than target biology.`,
      `Off-target indel escalation: Off-target indels rise to ${offStat?.max.toFixed(2) ?? '4.21'}% at 120 nM while viability drops to ${viaStat?.min.toFixed(1) ?? '55.2'}%, confounding true transcriptional knockdown with dead-cell mRNA loss.`,
    ];
    nextStepHypotheses = [
      {
        title: 'Therapeutic Window Optimization via 4-Parameter Hill Fit',
        rationale:
          'Maximum knockdown plateau (~86–88%) is already achieved at 60–75 nM while preserving >81% viability and <1.7% off-target indels.',
        protocol:
          'Fit a 4-parameter logistic (4PL) dose-response curve to calculate EC90 and LD20, then validate a 55–65 nM target window across 3 biological replicates.',
        expectedMetricShift:
          '> 83% target knockdown with > 85% cell viability and > 50% reduction in off-target indels vs. 115 nM.',
      },
      {
        title: 'GC-Content & Secondary Structure Pre-Filtering',
        rationale:
          'CR-09 (80% GC) showed a severe knockdown drop (Z < -2.0), demonstrating that extreme GC richness impairs Cas9 RNP loading.',
        protocol:
          'Restrict candidate sgRNA library to 40–65% GC with ΔG_folding > -3.0 kcal/mol and re-assay 12 sequence variants at 50 nM.',
        expectedMetricShift: 'Zero hairpin-induced knockdown dropouts; intra-plate CV reduced below 5%.',
      },
      {
        title: 'High-Fidelity Cas9 (HiFi-Cas9) Off-Target Rescue',
        rationale:
          'High-dose RNP drives exponential off-target cleavage above 80 nM, confounding viability assays.',
        protocol:
          'Deliver R691A HiFi-Cas9 RNP at 60 nM and 90 nM and quantify off-target indels via GUIDE-seq / amplicon NGS.',
        expectedMetricShift:
          'Off-target indel rate reduced below 0.5% at 90 nM while maintaining > 85% knockdown.',
      },
    ];
  } else if (dataset.id === 'coastal-microplastic-ph') {
    const salStat = columnStats['salinityPsu'];
    const doStat = columnStats['dissolvedOxygen'];
    confoundersAndBias = [
      `Freshwater stormwater dilution confounding: Salinity drops from ${salStat?.max.toFixed(1) ?? '33.8'} PSU to ${salStat?.min.toFixed(1) ?? '22.1'} PSU at high-microplastic stations, meaning terrestrial runoff acidity and lower alkalinity co-vary with plastic particle load.`,
      `Local biological & mineral buffering outliers: Station ST-09 (pH 8.34, positive Z-score outlier) sits adjacent to a calcareous shell-hash reef, whereas Station ST-23 (pH 7.21, negative outlier) captures an acute storm-outfall plume (DO = 4.42 mg/L).`,
      `Dissolved oxygen coupling (mean ${doStat?.mean.toFixed(2) ?? '6.85'} mg/L): Elevated water temperature (+3.9 °C across transect) and organic biofilm respiration jointly depress both DO and pH.`,
    ];
    nextStepHypotheses = [
      {
        title: 'Partial Correlation Controlling for Salinity & Alkalinity',
        rationale:
          'Because freshwater runoff lowers salinity and carbonate buffering simultaneously, isolating microplastic-driven acidification requires multivariate regression.',
        protocol:
          'Measure Total Alkalinity (TA) and Dissolved Inorganic Carbon (DIC) at all 27 stations and compute partial correlation between microplastics and pH holding salinity constant.',
        expectedMetricShift:
          'Quantify exact ΔpH attributable to plastic-biofilm CO₂ respiration vs. estuarine freshwater mixing.',
      },
      {
        title: 'Polymer Composition & Biofilm Respiration Microcosm',
        rationale:
          'Weathered polyethylene/polyamide fibers host heterotrophic microbial biofilms that respire CO₂ and leach acidic additives locally.',
        protocol:
          'Incubate sterile vs. field-colonized microplastics (0, 25, 75 particles/L) in filtered 33 PSU seawater for 72 h with continuous micro-optode pH/DO logging.',
        expectedMetricShift:
          'Biofilm-colonized treatments lower pH by -0.08 to -0.15 units relative to sterile polymer controls.',
      },
      {
        title: 'Tidal-Cycle Time-Series at Storm Outfall ST-23',
        rationale:
          'ST-23 exhibited severe acidification (pH 7.21, |Z| > 2.0) coupled with 22.1 PSU salinity, indicating episodic discharge rather than steady-state conditions.',
        protocol:
          'Deploy autonomous CTD + pH sonde at ST-23 and ST-09 across 4 complete spring/neap tidal cycles with hourly polymer sampling.',
        expectedMetricShift:
          'Separate episodic runoff plumes (ΔpH > 0.4 during ebb tide) from baseline coastal acidification.',
      },
    ];
  } else {
    const otherVars = analysis.numericVariables.filter(
      (v) => v.key !== xMeta.key && v.key !== yMeta.key
    );
    confoundersAndBias = [
      `Uncontrolled covariate influence: ${otherVars.length > 0 ? `Variables such as ${otherVars.map((v) => v.label).join(', ')} may co-vary with ${xMeta.label} and mediate the observed ${yMeta.label} shift.` : `Single-pair bivariate analysis cannot exclude latent environmental or batch confounders.`}`,
      `Sample size & leverage sensitivity (n = ${sampleSize}): ${outliers.length > 0 ? `The ${outliers.length} flagged |Z| > 2.0 observation(s) (${outliers.map((o) => o.label).join(', ')}) exert disproportionate leverage on the linear slope (${slope.toFixed(4)}).` : `Verify measurement calibration drift and randomization order across sample collection.`}`,
      `Linearity assumption check: Pearson r (${rSign}${pearsonR.toFixed(3)}) measures monotonic linear association only; non-linear thresholds or saturation plateaus should be inspected in the Trend view.`,
    ];
    nextStepHypotheses = [
      {
        title: `Sensitivity Re-Analysis Excluding |Z| > 2.0 Anomalies`,
        rationale:
          outliers.length > 0
            ? `Removing ${outliers.length} extreme observation(s) tests whether the observed r = ${rSign}${pearsonR.toFixed(3)} relationship holds across the core sample population.`
            : `Testing robust Huber/Tukey regression confirms whether minor tail observations alter the estimated slope.`,
        protocol: `Audit raw instrumentation logs for ${outliers.length > 0 ? outliers.map((o) => o.label).join(', ') : 'boundary samples'}, perform sensitivity OLS fit, and compare ΔR².`,
        expectedMetricShift: `Clarifies core slope stability within ±10% and verifies true p-value robustness.`,
      },
      {
        title: `Multivariate Residual Modeling on ${yMeta.label}`,
        rationale: `${(100 - rSquared * 100).toFixed(1)}% of variance in ${yMeta.label} remains unexplained by ${xMeta.label} alone.`,
        protocol:
          otherVars.length > 0
            ? `Fit multiple linear regression incorporating ${otherVars.slice(0, 3).map((v) => v.label).join(' + ')} as covariates.`
            : `Collect paired replicate controls and environmental covariates across additional experimental blocks.`,
        expectedMetricShift: `Target adjusted R² increase of +0.10 to +0.25 over univariate baseline.`,
      },
      {
        title: `Targeted Replication Across Mid-Range ${xMeta.label}`,
        rationale: `Increasing sampling density around ${xStat.median.toFixed(2)}${unitX} narrows the 95% confidence band of the regression slope.`,
        protocol: `Execute n = 10 randomized technical replicates spanning [${xStat.q1.toFixed(2)}, ${xStat.q3.toFixed(2)}]${unitX}.`,
        expectedMetricShift: `Reduces standard error of ${yMeta.label} mean by ~30% and improves statistical power (> 0.90).`,
      },
    ];
  }

  return {
    mode: 'demo-intelligence',
    modelUsed: 'BioLens Instant Demo Engine',
    generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    keyFindings,
    confoundersAndBias,
    nextStepHypotheses,
  };
}

export const COPILOT_SYSTEM_INSTRUCTION = [
  'You are BioLens Copilot, a friendly, sharp STEM Research Co-Scientist built for the BioLens AI platform.',
  'Adapt naturally to the researcher’s intent:',
  '1) Casual, greeting, or identity questions (e.g., "hello", "who are you", "what can you do"): respond warmly, naturally, and concisely in plain conversational prose, briefly mentioning what you can help analyze on the active experiment.',
  '2) Scientific, statistical, or tricky multi-step/hypothetical questions (e.g., confounding, causality vs. correlation, outlier sensitivity, non-linear regimes, experimental design): reason rigorously and thoroughly using the injected dataset context (sample size n, column means, standard deviations, Pearson r, R², p-value, OLS fit, and flagged |Z| > 2.0 outlier rows).',
  'Cite exact sample IDs and observed values when making data claims, never fabricate measurements not in the context, and clearly flag assumptions when reasoning about counterfactuals or follow-up experiments.',
].join(' ');

function isGreetingOrIdentityQuery(question: string): boolean {
  const trimmed = question.trim().toLowerCase();
  if (!trimmed) return true;
  if (
    /^(hi|hello|hey|greetings|howdy|good\s+(morning|afternoon|evening)|yo|sup)([!.,?\s]|$)/i.test(
      trimmed
    ) &&
    trimmed.split(/\s+/).length <= 8
  ) {
    return true;
  }
  return /\b(who are you|what are you|what can you do|what do you do|introduce yourself|your name|how can you help|how do you work)\b/i.test(
    trimmed
  );
}

function computeDemoChatReply(
  question: string,
  dataset: ExperimentDataset,
  analysis: DatasetAnalysis
): string {
  const q = question.toLowerCase();
  const {
    xMeta,
    yMeta,
    pearsonR,
    rSquared,
    pValue,
    slope,
    intercept,
    outliers,
    columnStats,
    sampleSize,
  } = analysis;
  const yStat = columnStats[yMeta.key];
  const xStat = columnStats[xMeta.key];
  const unitY = yMeta.unit ? ` ${yMeta.unit}` : '';
  const unitX = xMeta.unit ? ` ${xMeta.unit}` : '';
  const rSign = pearsonR >= 0 ? '+' : '';
  const outlierHeadline =
    outliers.length > 0
      ? outliers
          .map(
            (o) =>
              `${o.label} (${yMeta.label} = ${o.yValue.toFixed(2)}${unitY}, Z = ${o.zScore >= 0 ? '+' : ''}${o.zScore.toFixed(2)})`
          )
          .join(', ')
      : 'none exceeding |Z| > 2.0';

  if (isGreetingOrIdentityQuery(question)) {
    return `Hello! I'm **BioLens Copilot**, your AI STEM Research Co-Scientist on the **BioLens AI** platform. I help researchers audit experimental data, screen Z-score anomalies, evaluate statistical trends and potential confounders, and design testable follow-up protocols.\n\nRight now we have **${dataset.title}** loaded (n = ${sampleSize}, ${yMeta.label} mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY}, Pearson r = ${rSign}${pearsonR.toFixed(3)}, flagged |Z| > 2.0 outliers: ${outlierHeadline}). Ask me about the flagged outliers, hidden biases, statistical significance, or what experiment to run next!`;
  }

  if (
    q.includes('outlier') ||
    q.includes('anomal') ||
    q.includes('z-score') ||
    q.includes('z score') ||
    q.includes('unusual') ||
    q.includes('extreme')
  ) {
    if (outliers.length === 0) {
      return `In **${dataset.title}** (n = ${sampleSize}), no observations exceeded the |Z| > 2.0 anomaly threshold for ${yMeta.label}. Across the full cohort, ${yMeta.label} has a mean of ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY} (range ${yStat.min.toFixed(2)}–${yStat.max.toFixed(2)}${unitY}) and exhibits a ${describeCorrelationStrength(pearsonR)} correlation with ${xMeta.label} (Pearson r = ${rSign}${pearsonR.toFixed(3)}, p = ${formatPValue(pValue)}). Because no extreme Z-score outliers are present, the OLS trend reflects the entire sample consistently.`;
    }
    const details = outliers
      .map(
        (o) =>
          `• **${o.label}**: ${xMeta.label} = ${o.xValue.toFixed(2)}${unitX}, ${yMeta.label} = ${o.yValue.toFixed(2)}${unitY} (**Z = ${o.zScore >= 0 ? '+' : ''}${o.zScore.toFixed(2)}**, ${o.direction})`
      )
      .join('\n');
    return `Detected **${outliers.length} Z-score ${outliers.length === 1 ? 'anomaly' : 'anomalies'}** (|Z| > 2.0) in **${dataset.title}** (n = ${sampleSize}) for ${yMeta.label} (mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY}, Pearson r = ${rSign}${pearsonR.toFixed(3)}):\n\n${details}\n\nRecommended check: inspect raw experimental logs for these flagged rows (${outliers.map((o) => o.label).join(', ')}) before excluding them from regression fitting, as they may reflect genuine boundary physics, delivery toxicity, or localized sampling artifacts rather than random noise.`;
  }

  if (
    q.includes('bias') ||
    q.includes('confound') ||
    q.includes('caus') ||
    q.includes('limit') ||
    q.includes('artifact') ||
    q.includes('remove') ||
    q.includes('exclude') ||
    q.includes('drop') ||
    q.includes('why') ||
    q.includes('tricky') ||
    q.includes('valid')
  ) {
    const synth = computeDemoSynthesis(dataset, analysis);
    const biasPoints = synth.confoundersAndBias.map((b, i) => `${i + 1}. ${b}`).join('\n');
    return `Great methodological question on **${dataset.title}** (n = ${sampleSize}, ${yMeta.label} mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY}, Pearson r = ${rSign}${pearsonR.toFixed(3)}, p = ${formatPValue(pValue)}). Even a strong linear correlation (R² = ${(rSquared * 100).toFixed(1)}%) does not prove unconfounded causation, and flagged |Z| > 2.0 rows (${outlierHeadline}) can materially shift the slope (${slope.toFixed(4)}):\n\n${biasPoints}\n\nTo avoid cherry-picking bias, run a sensitivity comparison with and without those flagged rows rather than dropping points without documented instrument failure.`;
  }

  if (
    q.includes('correlat') ||
    q.includes('p-value') ||
    q.includes('p value') ||
    q.includes('significant') ||
    q.includes('regress') ||
    q.includes('trend') ||
    q.includes('r²') ||
    q.includes('r2') ||
    q.includes('slope') ||
    q.includes('predict') ||
    q.includes('what if')
  ) {
    const strength = describeCorrelationStrength(pearsonR);
    const sigText =
      pValue < 0.001
        ? 'highly statistically significant (p < 0.001)'
        : pValue < 0.05
          ? 'statistically significant at α = 0.05'
          : 'not statistically significant at α = 0.05';
    return `For **${xMeta.label}** vs. **${yMeta.label}** in **${dataset.title}** (n = ${sampleSize}, ${yMeta.label} mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY}):\n\n• **Pearson r**: ${rSign}${pearsonR.toFixed(4)} (${strength})\n• **R²**: ${(rSquared * 100).toFixed(1)}% of variance explained\n• **Two-tailed p-value**: ${formatPValue(pValue)} — ${sigText}\n• **OLS Equation**: ${yMeta.label} = ${slope.toFixed(4)}·(${xMeta.label}) ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(3)}\n\nFlagged |Z| > 2.0 outlier rows: ${outlierHeadline}. Keep in mind that linear extrapolation outside [${xStat.min.toFixed(1)}, ${xStat.max.toFixed(1)}${unitX}] may break down if non-linear thresholds or saturation plateaus occur.`;
  }

  if (
    q.includes('next') ||
    q.includes('follow') ||
    q.includes('experiment') ||
    q.includes('hypothesis') ||
    q.includes('hypotheses') ||
    q.includes('protocol') ||
    q.includes('test') ||
    q.includes('improve')
  ) {
    const synth = computeDemoSynthesis(dataset, analysis);
    const protocols = synth.nextStepHypotheses
      .map(
        (h, i) =>
          `${i + 1}. **${h.title}** — ${h.protocol} (Expected: ${h.expectedMetricShift})`
      )
      .join('\n\n');
    return `Based on **${dataset.title}** (n = ${sampleSize}, ${yMeta.label} mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY}, Pearson r = ${rSign}${pearsonR.toFixed(3)}, flagged |Z| > 2.0 outliers: ${outlierHeadline}), here are the highest-leverage next experiments:\n\n${protocols}`;
  }

  return `**Quantitative Summary for ${dataset.title}** (n = ${sampleSize}):\n\n• **${yMeta.label}**: Mean = ${yStat.mean.toFixed(2)} ± ${yStat.stdDev.toFixed(2)}${unitY} (Median ${yStat.median.toFixed(2)}, Range ${yStat.min.toFixed(2)}–${yStat.max.toFixed(2)})\n• **${xMeta.label}**: Mean = ${xStat.mean.toFixed(2)}${unitX} (Range ${xStat.min.toFixed(2)}–${xStat.max.toFixed(2)})\n• **Relationship**: Pearson r = ${rSign}${pearsonR.toFixed(3)} (R² = ${(rSquared * 100).toFixed(1)}%, p = ${formatPValue(pValue)})\n• **Flagged Z-Score Anomalies (|Z| > 2.0)**: ${outlierHeadline}\n\nAsk me about the flagged outliers, confounding biases, correlation significance, hypothetical edge cases, or follow-up experimental protocols to dig deeper.`;
}

interface GeminiResponseShape {
  content?: string;
  text?: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

function extractChatResponseText(result: unknown): string {
  if (typeof result === 'string') {
    return result.trim();
  }
  if (!result || typeof result !== 'object') {
    return '';
  }

  const r = result as GeminiResponseShape;
  const directContent = typeof r.content === 'string' ? r.content.trim() : '';
  if (directContent) return directContent;

  const directText = typeof r.text === 'string' ? r.text.trim() : '';
  if (directText) return directText;

  const partsText = (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p?.thought !== true && typeof p?.text === 'string' && p.text)
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  return partsText;
}

export async function synthesizeLabFindings(
  dataset: ExperimentDataset,
  analysis: DatasetAnalysis,
  options: { mode: IntelligenceMode }
): Promise<ResearchSynthesis> {
  if (options.mode === 'demo') {
    return computeDemoSynthesis(dataset, analysis);
  }

  return forwardSynthesisRequest({
    methodology: dataset.methodology,
    statisticalContextJson: analysis.statisticalContextJson,
  });
}

export async function askResearchCopilot(
  question: string,
  dataset: ExperimentDataset,
  analysis: DatasetAnalysis,
  history: ChatMessage[],
  options: {
    mode: IntelligenceMode;
    onChunk?: (partialText: string, modelUsed?: string) => void;
    signal?: AbortSignal;
  }
): Promise<{ content: string; mode: 'gemini-live' | 'demo-intelligence'; modelUsed: string }> {
  if (options.mode === 'demo') {
    return {
      content: computeDemoChatReply(question, dataset, analysis),
      mode: 'demo-intelligence',
      modelUsed: 'BioLens Instant Demo Engine',
    };
  }

  try {
    const result = await forwardChatStreamRequest(
      {
        question,
        methodology: dataset.methodology,
        statisticalContextJson: analysis.statisticalContextJson,
        systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
        history: history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      },
      (partialText, modelUsed) => {
        options.onChunk?.(partialText, modelUsed);
      },
      options.signal
    );

    const extracted = extractChatResponseText(result);
    if (extracted) {
      return {
        content: extracted,
        mode: 'gemini-live',
        modelUsed: result.modelUsed || 'gemini-3.5-flash-lite',
      };
    }

    const demoFallback = computeDemoChatReply(question, dataset, analysis);
    return {
      content: `Gemini returned an empty completion for this prompt. Showing deterministic statistical analysis from the active dataset:\n\n${demoFallback}`,
      mode: 'gemini-live',
      modelUsed: result.modelUsed || 'gemini-3.5-flash-lite',
    };
  } catch (err) {
    if (err instanceof ServerKeyMissingError) {
      throw err;
    }
    const errMsg =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'Unexpected Gemini API error.';
    console.error('[BioLens AI] Live Gemini chat error:', errMsg);
    const demoFallback = computeDemoChatReply(question, dataset, analysis);
    return {
      content: `Live Gemini API error: ${errMsg}\n\nDeterministic dataset fallback while resolving the issue:\n\n${demoFallback}`,
      mode: 'gemini-live',
      modelUsed: 'gemini-3.5-flash-lite (error)',
    };
  }
}
