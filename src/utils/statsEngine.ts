import {
  ChartPoint,
  ColumnStats,
  DataRow,
  DatasetAnalysis,
  ExperimentDataset,
  OutlierRecord,
  RigorCriterion,
  RigorScorecard,
  VariableMeta,
} from '../types/research';

// Mathematical helper: log gamma via Lanczos approximation for accurate Student-t p-values
function logGamma(z: number): number {
  const coefficients = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < coefficients.length; j += 1) {
    y += 1;
    ser += coefficients[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3.0e-7;
  const fpmin = 1.0e-30;

  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1.0 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1.0 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1.0 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < eps) break;
  }
  return h;
}

function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function computePearsonPValue(r: number, n: number): number {
  if (n <= 2) return 1;
  const absR = Math.min(Math.abs(r), 0.9999999999);
  if (absR === 0) return 1;
  const df = n - 2;
  const tSquared = (df * absR * absR) / (1 - absR * absR);
  const x = df / (df + tSquared);
  const p = regularizedIncompleteBeta(df / 2, 0.5, x);
  return Math.max(0, Math.min(1, p));
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function computeColumnStats(values: number[], meta: VariableMeta): ColumnStats {
  const count = values.length;
  if (count === 0) {
    return {
      key: meta.key,
      label: meta.label,
      unit: meta.unit,
      count: 0,
      mean: 0,
      stdDev: 0,
      median: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const variance =
    count > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  return {
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    count,
    mean,
    stdDev,
    median: quantile(sorted, 0.5),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
  };
}

export function analyzeDataset(
  dataset: ExperimentDataset,
  requestedXKey?: string,
  requestedYKey?: string,
  excludeRowIds?: Set<string>
): DatasetAnalysis {
  const activeRows =
    excludeRowIds && excludeRowIds.size > 0
      ? dataset.rows.filter((r) => !excludeRowIds.has(r.id))
      : dataset.rows;
  const rowsToAnalyze = activeRows.length >= 3 ? activeRows : dataset.rows;

  const numericVariables = dataset.variables.filter((v) =>
    rowsToAnalyze.some(
      (row) => typeof row[v.key] === 'number' && Number.isFinite(row[v.key] as number)
    )
  );

  const fallbackX = numericVariables[0]?.key ?? dataset.defaultXKey;
  const fallbackY = numericVariables[1]?.key ?? numericVariables[0]?.key ?? dataset.defaultYKey;

  const xKey = numericVariables.some((v) => v.key === requestedXKey)
    ? (requestedXKey as string)
    : numericVariables.some((v) => v.key === dataset.defaultXKey)
      ? dataset.defaultXKey
      : fallbackX;

  const yKey = numericVariables.some((v) => v.key === requestedYKey)
    ? (requestedYKey as string)
    : numericVariables.some((v) => v.key === dataset.defaultYKey)
      ? dataset.defaultYKey
      : fallbackY;

  const xMeta =
    numericVariables.find((v) => v.key === xKey) ?? {
      key: xKey,
      label: xKey,
      unit: '',
      role: 'independent',
    };

  const yMeta =
    numericVariables.find((v) => v.key === yKey) ?? {
      key: yKey,
      label: yKey,
      unit: '',
      role: 'dependent',
    };

  const columnStats: Record<string, ColumnStats> = {};
  for (const variable of numericVariables) {
    const vals = rowsToAnalyze
      .map((r) => Number(r[variable.key]))
      .filter((v) => Number.isFinite(v));
    columnStats[variable.key] = computeColumnStats(vals, variable);
  }

  const pairedRows = rowsToAnalyze
    .map((row, idx) => ({
      row,
      idx,
      x: Number(row[xKey]),
      y: Number(row[yKey]),
    }))
    .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));

  const n = pairedRows.length;
  const xMean = n > 0 ? pairedRows.reduce((s, p) => s + p.x, 0) / n : 0;
  const yMean = n > 0 ? pairedRows.reduce((s, p) => s + p.y, 0) / n : 0;

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (const p of pairedRows) {
    const dx = p.x - xMean;
    const dy = p.y - yMean;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denom = Math.sqrt(sumSqX * sumSqY);
  const pearsonR = denom > 0 ? numerator / denom : 0;
  const rSquared = pearsonR * pearsonR;
  const slope = sumSqX > 0 ? numerator / sumSqX : 0;
  const intercept = yMean - slope * xMean;
  const pValue = computePearsonPValue(pearsonR, n);

  const yStats = columnStats[yKey];
  const yMeanFull = yStats?.mean ?? yMean;
  const yStdFull = yStats?.stdDev ?? 0;

  // Also calculate residual Z-scores or metric Z-scores: user asked for Z-score anomalies (|Z| > 2.0)
  // Using primary Y metric Z-score (and flagging if |Z| > 2.0)
  const outliers: OutlierRecord[] = [];
  const chartPoints: ChartPoint[] = pairedRows.map((item, i) => {
    const zScore = yStdFull > 0 ? (item.y - yMeanFull) / yStdFull : 0;
    const isOutlier = Math.abs(zScore) > 2.0;
    const trendY = slope * item.x + intercept;

    if (isOutlier) {
      const direction = zScore > 0 ? 'High Anomaly' : 'Low Anomaly';
      const deltaFromMean = item.y - yMeanFull;
      outliers.push({
        rowId: item.row.id,
        rowIndex: i + 1,
        label: item.row.label,
        xValue: item.x,
        yValue: item.y,
        zScore,
        direction,
        note: `${yMeta.label} deviates by ${deltaFromMean >= 0 ? '+' : ''}${deltaFromMean.toFixed(2)} ${yMeta.unit} (Z = ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}) from sample mean`,
      });
    }

    return {
      rowId: item.row.id,
      index: i + 1,
      label: item.row.label,
      x: item.x,
      y: item.y,
      zScore,
      isOutlier,
      trendY,
      raw: item.row,
    };
  });

  const contextPayload = {
    experiment: dataset.title,
    discipline: `${dataset.discipline} (${dataset.subfield})`,
    hypothesis: dataset.hypothesis,
    sampleSize: n,
    activePair: {
      independentX: `${xMeta.label} (${xMeta.unit || 'units'})`,
      dependentY: `${yMeta.label} (${yMeta.unit || 'units'})`,
      pearsonR: Number(pearsonR.toFixed(4)),
      rSquared: Number(rSquared.toFixed(4)),
      pValue: pValue < 0.0001 ? '< 0.0001' : Number(pValue.toFixed(5)),
      linearModel: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,
    },
    columnStatistics: Object.values(columnStats).map((c) => ({
      variable: c.label,
      unit: c.unit || 'numeric',
      mean: Number(c.mean.toFixed(3)),
      stdDev: Number(c.stdDev.toFixed(3)),
      median: Number(c.median.toFixed(3)),
      range: [Number(c.min.toFixed(3)), Number(c.max.toFixed(3))],
    })),
    zScoreAnomaliesThreshold: '|Z| > 2.0',
    detectedOutliers: outliers.map((o) => ({
      sample: o.label,
      x: Number(o.xValue.toFixed(3)),
      y: Number(o.yValue.toFixed(3)),
      zScore: Number(o.zScore.toFixed(2)),
      classification: o.direction,
    })),
  };

  return {
    sampleSize: n,
    xKey,
    yKey,
    xMeta,
    yMeta,
    numericVariables,
    columnStats,
    pearsonR,
    rSquared,
    pValue,
    slope,
    intercept,
    outliers,
    chartPoints,
    statisticalContextJson: JSON.stringify(contextPayload, null, 2),
  };
}

// RFC-4180 compliant single CSV line splitter
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function sanitizeKey(header: string, index: number): string {
  const cleaned = header
    .replace(/\([^)]*\)/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return cleaned || `col${index + 1}`;
}

function extractUnit(header: string): string {
  const match = header.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : '';
}

export function parseCsvDataset(fileName: string, csvText: string): ExperimentDataset {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length < 3) {
    throw new Error('CSV file must include a header row and at least 2 numeric data rows.');
  }

  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) {
    throw new Error('CSV file must contain at least 2 columns.');
  }

  const rawRecords = lines.slice(1).map((line) => splitCsvLine(line));

  // Identify numeric columns (>= 70% parseable as finite numbers)
  const numericColIndices: number[] = [];
  const labelColIndices: number[] = [];

  headers.forEach((_, colIdx) => {
    let numericCount = 0;
    let nonEmptyCount = 0;
    for (const rec of rawRecords) {
      const cell = (rec[colIdx] ?? '').trim();
      if (cell !== '') {
        nonEmptyCount += 1;
        const parsed = Number(cell.replace(/,/g, ''));
        if (Number.isFinite(parsed)) {
          numericCount += 1;
        }
      }
    }
    if (nonEmptyCount > 0 && numericCount / nonEmptyCount >= 0.7) {
      numericColIndices.push(colIdx);
    } else {
      labelColIndices.push(colIdx);
    }
  });

  if (numericColIndices.length < 2) {
    throw new Error(
      'Could not find at least 2 numeric measurement columns in this CSV for correlation and Z-score analysis.'
    );
  }

  const labelIdx = labelColIndices[0] ?? -1;
  const usedKeys = new Set<string>();
  const keyByColIdx: Record<number, string> = {};

  headers.forEach((h, idx) => {
    let baseKey = sanitizeKey(h, idx);
    while (usedKeys.has(baseKey)) {
      baseKey = `${baseKey}_${idx}`;
    }
    usedKeys.add(baseKey);
    keyByColIdx[idx] = baseKey;
  });

  const variables: VariableMeta[] = numericColIndices.map((colIdx, pos) => ({
    key: keyByColIdx[colIdx],
    label: headers[colIdx].replace(/\([^)]*\)/g, '').trim() || `Variable ${pos + 1}`,
    unit: extractUnit(headers[colIdx]),
    role: pos === 0 ? 'independent' : pos === 1 ? 'dependent' : 'covariate',
  }));

  const rows: DataRow[] = rawRecords
    .map((rec, rIdx) => {
      const sampleLabel =
        labelIdx >= 0 && rec[labelIdx] ? rec[labelIdx] : `Sample ${String(rIdx + 1).padStart(2, '0')}`;
      const row: DataRow = {
        id: `CSV-${String(rIdx + 1).padStart(2, '0')}`,
        label: sampleLabel,
      };
      let validNumericCount = 0;
      for (const colIdx of numericColIndices) {
        const key = keyByColIdx[colIdx];
        const parsed = Number((rec[colIdx] ?? '').replace(/,/g, ''));
        if (Number.isFinite(parsed)) {
          row[key] = parsed;
          validNumericCount += 1;
        }
      }
      return validNumericCount >= 2 ? row : null;
    })
    .filter((r): r is DataRow => r !== null);

  if (rows.length < 3) {
    throw new Error('At least 3 valid numeric rows are required for statistical analysis.');
  }

  const cleanTitle = fileName.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim();

  return {
    id: `csv-${Date.now()}`,
    title: cleanTitle || 'Uploaded Laboratory Dataset',
    shortTitle: cleanTitle.length > 28 ? `${cleanTitle.slice(0, 26)}…` : cleanTitle || 'Uploaded CSV',
    discipline: 'Custom Lab Upload',
    subfield: 'User CSV Dataset',
    sourceType: 'csv',
    investigator: `Imported CSV · ${fileName}`,
    recordedDate: new Date().toISOString().slice(0, 10),
    hypothesis: `Exploratory correlation and Z-score anomaly screening between ${variables[0].label} and ${variables[1].label}.`,
    methodology: `Client-side parsed CSV (${rows.length} valid samples, ${variables.length} quantitative variables).`,
    defaultXKey: variables[0].key,
    defaultYKey: variables[1].key,
    variables,
    rows,
  };
}

export function formatPValue(p: number): string {
  if (p < 0.0001) return '< 0.0001';
  if (p < 0.001) return p.toFixed(4);
  return p.toFixed(3);
}

export function computeExperimentRigor(
  baselineAnalysis: DatasetAnalysis,
  activeAnalysis: DatasetAnalysis,
  outliersExcluded: boolean
): RigorScorecard {
  const n = activeAnalysis.sampleSize;
  const totalBaseline = baselineAnalysis.sampleSize;
  const flaggedCount = baselineAnalysis.outliers.length;
  const outlierPct = totalBaseline > 0 ? (flaggedCount / totalBaseline) * 100 : 0;
  const p = activeAnalysis.pValue;

  // 1. Sample size criterion (max 35 pts, target n >= 25)
  const samplePoints =
    n >= 25 ? 35 : n >= 15 ? 25 : n >= 8 ? 15 : Math.max(4, Math.round((n / 8) * 10));
  const samplePassed = n >= 25;

  // 2. Outlier contamination criterion (max 30 pts, target < 10%)
  const outlierPoints =
    flaggedCount === 0
      ? 30
      : outlierPct < 10
        ? Math.round(30 - outlierPct * 0.5)
        : Math.max(6, Math.round(20 - (outlierPct - 10) * 0.7));
  const outlierPassed = outlierPct < 10;

  // 3. Statistical significance criterion (max 35 pts, target p < 0.05)
  const sigPoints =
    p < 0.001 ? 35 : p < 0.01 ? 30 : p < 0.05 ? 24 : p < 0.1 ? 14 : 6;
  const sigPassed = p < 0.05;

  const score = Math.min(100, Math.max(0, samplePoints + outlierPoints + sigPoints));
  const tier: RigorScorecard['tier'] =
    score >= 85 ? 'Publication Grade' : score >= 65 ? 'Strong Pilot' : 'Needs Replication';

  const criteria: RigorCriterion[] = [
    {
      id: 'sample-size',
      label: 'Sample Size (n ≥ 25)',
      valueLabel: `n = ${n}`,
      passed: samplePassed,
      points: samplePoints,
      maxPoints: 35,
    },
    {
      id: 'outlier-rate',
      label: 'Outlier Rate (< 10%)',
      valueLabel: `${outlierPct.toFixed(1)}% (${flaggedCount}/${totalBaseline})`,
      passed: outlierPassed,
      points: outlierPoints,
      maxPoints: 30,
    },
    {
      id: 'significance',
      label: 'Significance (p < 0.05)',
      valueLabel: `p = ${formatPValue(p)}`,
      passed: sigPassed,
      points: sigPoints,
      maxPoints: 35,
    },
  ];

  const tipsList: string[] = [];

  if (!samplePassed) {
    tipsList.push(
      `Expand cohort from n = ${n} to at least n = 25 independent replicates to tighten the 95% confidence band and stabilize σ.`
    );
  }

  if (flaggedCount > 0) {
    const flaggedLabels = baselineAnalysis.outliers.map((o) => o.label).join(', ');
    tipsList.push(
      outliersExcluded
        ? `Document physical/instrument root-cause logs for excluded |Z| > 2.0 rows (${flaggedLabels}) in your supplementary methods to prevent survivorship bias.`
        : `Inspect instrumentation logs for ${flaggedCount} flagged |Z| > 2.0 sample(s) (${flaggedLabels}) and run a sensitivity toggle check before final publication.`
    );
  }

  if (!sigPassed) {
    tipsList.push(
      `Current relationship (${activeAnalysis.xMeta.label} vs. ${activeAnalysis.yMeta.label}, p = ${formatPValue(p)}) is above α = 0.05; stratify confounding covariates or test non-linear regimes.`
    );
  }

  if (tipsList.length < 2) {
    tipsList.push(
      `Report both raw (n = ${totalBaseline}) and outlier-screened regression slopes alongside effect size (R² = ${(activeAnalysis.rSquared * 100).toFixed(1)}%) for transparent reproducibility.`
    );
  }
  if (tipsList.length < 2) {
    tipsList.push(
      `Validate model generalizability via k-fold cross-validation or an independent holdout batch spanning [${activeAnalysis.columnStats[activeAnalysis.xKey]?.min.toFixed(1) ?? 'min'}, ${activeAnalysis.columnStats[activeAnalysis.xKey]?.max.toFixed(1) ?? 'max'}].`
    );
  }

  return {
    score,
    tier,
    criteria,
    tips: [tipsList[0], tipsList[1]],
  };
}
