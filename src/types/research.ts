export interface DataRow {
  id: string;
  label: string;
  [key: string]: string | number;
}

export interface VariableMeta {
  key: string;
  label: string;
  unit: string;
  role: 'independent' | 'dependent' | 'covariate';
}

export interface ExperimentDataset {
  id: string;
  title: string;
  shortTitle: string;
  discipline: string;
  subfield: string;
  sourceType: 'builtin' | 'csv';
  investigator: string;
  recordedDate: string;
  hypothesis: string;
  methodology: string;
  defaultXKey: string;
  defaultYKey: string;
  variables: VariableMeta[];
  rows: DataRow[];
}

export interface ColumnStats {
  key: string;
  label: string;
  unit: string;
  count: number;
  mean: number;
  stdDev: number;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

export interface OutlierRecord {
  rowId: string;
  rowIndex: number;
  label: string;
  xValue: number;
  yValue: number;
  zScore: number;
  direction: 'High Anomaly' | 'Low Anomaly';
  note: string;
}

export interface ChartPoint {
  rowId: string;
  index: number;
  label: string;
  x: number;
  y: number;
  zScore: number;
  isOutlier: boolean;
  trendY: number;
  raw: DataRow;
}

export interface DatasetAnalysis {
  sampleSize: number;
  xKey: string;
  yKey: string;
  xMeta: VariableMeta;
  yMeta: VariableMeta;
  numericVariables: VariableMeta[];
  columnStats: Record<string, ColumnStats>;
  pearsonR: number;
  rSquared: number;
  pValue: number;
  slope: number;
  intercept: number;
  outliers: OutlierRecord[];
  chartPoints: ChartPoint[];
  statisticalContextJson: string;
}

export interface NextStepHypothesis {
  title: string;
  rationale: string;
  protocol: string;
  expectedMetricShift: string;
}

export interface ResearchSynthesis {
  mode: 'gemini-live' | 'demo-intelligence';
  modelUsed: string;
  generatedAt: string;
  keyFindings: string[];
  confoundersAndBias: string[];
  nextStepHypotheses: NextStepHypothesis[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'gemini-live' | 'demo-intelligence';
  modelUsed?: string;
  timestamp: string;
}

export interface RigorCriterion {
  id: 'sample-size' | 'outlier-rate' | 'significance';
  label: string;
  valueLabel: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

export interface RigorScorecard {
  score: number;
  tier: 'Publication Grade' | 'Strong Pilot' | 'Needs Replication';
  criteria: RigorCriterion[];
  tips: [string, string];
}
