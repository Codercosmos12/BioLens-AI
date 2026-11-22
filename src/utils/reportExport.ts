import {
  ChatMessage,
  DatasetAnalysis,
  ExperimentDataset,
  ResearchSynthesis,
  VariableMeta,
} from '../types/research';
import { formatPValue } from './statsEngine';

function escapeCsvCell(value: string | number | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildFilteredDatasetCsv(
  analysis: DatasetAnalysis,
  outliersOnly: boolean,
  allVariables?: VariableMeta[]
): string {
  const { chartPoints, yMeta, numericVariables } = analysis;
  const rows = outliersOnly ? chartPoints.filter((pt) => pt.isOutlier) : chartPoints;
  const variables = allVariables && allVariables.length > 0 ? allVariables : numericVariables;

  const headers = [
    'Sample',
    ...variables.map((v) => (v.unit ? `${v.label} (${v.unit})` : v.label)),
    `Z-Score (${yMeta.label})`,
    'Classification',
  ];

  const csvLines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const pt of rows) {
    const varCells = variables.map((v) => {
      const rawVal = pt.raw[v.key];
      if (typeof rawVal === 'number') {
        return Number.isInteger(rawVal) ? rawVal : Number(rawVal.toFixed(4));
      }
      return rawVal ?? '';
    });

    const rowCells = [
      pt.label,
      ...varCells,
      `${pt.zScore >= 0 ? '+' : ''}${pt.zScore.toFixed(3)}`,
      pt.isOutlier ? 'Outlier (|Z| > 2.0)' : 'Nominal',
    ];

    csvLines.push(rowCells.map(escapeCsvCell).join(','));
  }

  return csvLines.join('\n');
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildMarkdownReport(
  dataset: ExperimentDataset,
  analysis: DatasetAnalysis,
  synthesis: ResearchSynthesis | null,
  messages: ChatMessage[]
): string {
  const { xMeta, yMeta, pearsonR, rSquared, pValue, slope, intercept, outliers, columnStats } =
    analysis;

  const lines: string[] = [];
  lines.push(`# BioLens AI — Scientific Research Brief`);
  lines.push(``);
  lines.push(`**Experiment:** ${dataset.title}`);
  lines.push(`**Discipline:** ${dataset.discipline} · ${dataset.subfield}`);
  lines.push(`**Source / Batch:** ${dataset.investigator}`);
  lines.push(`**Date Recorded:** ${dataset.recordedDate}`);
  lines.push(`**Report Generated:** ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 1. Working Hypothesis & Methodology`);
  lines.push(`- **Hypothesis:** ${dataset.hypothesis}`);
  lines.push(`- **Methodology:** ${dataset.methodology}`);
  lines.push(``);
  lines.push(`## 2. Quantitative Summary (n = ${analysis.sampleSize})`);
  lines.push(
    `- **Primary Relationship:** \`${xMeta.label}\` (${xMeta.unit || 'units'}) vs. \`${yMeta.label}\` (${yMeta.unit || 'units'})`
  );
  lines.push(`- **Pearson Correlation (r):** \`${pearsonR >= 0 ? '+' : ''}${pearsonR.toFixed(4)}\``);
  lines.push(`- **Coefficient of Determination (R²):** \`${rSquared.toFixed(4)}\``);
  lines.push(`- **Two-Tailed p-value:** \`${formatPValue(pValue)}\``);
  lines.push(
    `- **Ordinary Least Squares Fit:** \`y = ${slope.toFixed(4)}x ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(4)}\``
  );
  lines.push(``);
  lines.push(`### Descriptive Statistics by Variable`);
  lines.push(`| Variable | Unit | Mean | Std Dev (σ) | Median | Min | Max |`);
  lines.push(`| :--- | :--- | ---: | ---: | ---: | ---: | ---: |`);
  for (const col of Object.values(columnStats)) {
    lines.push(
      `| ${col.label} | ${col.unit || '—'} | ${col.mean.toFixed(3)} | ${col.stdDev.toFixed(3)} | ${col.median.toFixed(3)} | ${col.min.toFixed(3)} | ${col.max.toFixed(3)} |`
    );
  }
  lines.push(``);
  lines.push(`## 3. Z-Score Anomaly Screening (|Z| > 2.0 on ${yMeta.label})`);
  if (outliers.length === 0) {
    lines.push(`No observations exceeded the \`|Z| > 2.0\` threshold on ${yMeta.label}.`);
  } else {
    lines.push(`| Sample | ${xMeta.label} | ${yMeta.label} | Z-Score | Classification |`);
    lines.push(`| :--- | ---: | ---: | ---: | :--- |`);
    for (const o of outliers) {
      lines.push(
        `| ${o.label} | ${o.xValue.toFixed(2)} | ${o.yValue.toFixed(2)} | ${o.zScore >= 0 ? '+' : ''}${o.zScore.toFixed(2)} | ${o.direction} |`
      );
    }
  }
  lines.push(``);

  if (synthesis) {
    lines.push(`## 4. AI Research Co-Scientist Synthesis`);
    lines.push(
      `*Generated via ${synthesis.mode === 'gemini-live' ? `Live Gemini API (${synthesis.modelUsed})` : 'BioLens Instant Demo Intelligence'}*`
    );
    lines.push(``);
    lines.push(`### Key Empirical Findings`);
    for (const f of synthesis.keyFindings) {
      lines.push(`- ${f}`);
    }
    lines.push(``);
    lines.push(`### Confounding Variables & Bias Audit`);
    for (const c of synthesis.confoundersAndBias) {
      lines.push(`- ${c}`);
    }
    lines.push(``);
    lines.push(`### Next-Step Testable Hypotheses`);
    synthesis.nextStepHypotheses.forEach((h, idx) => {
      lines.push(`${idx + 1}. **${h.title}**`);
      lines.push(`   - *Rationale:* ${h.rationale}`);
      lines.push(`   - *Experimental Protocol:* ${h.protocol}`);
      lines.push(`   - *Expected Signal:* ${h.expectedMetricShift}`);
    });
    lines.push(``);
  }

  if (messages.length > 0) {
    lines.push(`## 5. Research Copilot Q&A Log`);
    for (const m of messages) {
      const speaker = m.role === 'user' ? 'Researcher' : `BioLens Copilot (${m.modelUsed ?? 'Demo'})`;
      lines.push(`**${speaker}:** ${m.content}`);
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(
    `*Exported from BioLens AI — Interactive STEM Lab & Research Copilot (STEM2Connect AI Hackathon). Built with Google AI Studio & Gemini.*`
  );

  return lines.join('\n');
}

export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
