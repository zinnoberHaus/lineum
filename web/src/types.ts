// The payload Lineum writes to assets/data.js (window.__LINEUM__). Mirrors src/lineum/payload.py.

export type NodeType =
  | 'source'
  | 'seed'
  | 'snapshot'
  | 'model'
  | 'analysis'
  | 'function'
  | 'semantic_model'
  | 'metric'
  | 'saved_query'
  | 'exposure';

export type TestStatus = 'pass' | 'fail' | 'warn' | 'error' | 'skipped' | 'not_run';
export type TransformCode = 'd' | 'r' | 'x' | 'a';

export interface ColumnProfile {
  rows: number;
  nulls: number;
  distinct: number;
  min?: string | number | null;
  max?: string | number | null;
  mean?: number;
  top?: [string, number][];
}

export interface Column {
  name: string;
  type?: string;
  description?: string;
  html?: string;
  meta?: Record<string, unknown>;
  tags?: string[];
  pk?: boolean;
  tests?: number[];
  profile?: ColumnProfile;
}

export interface Test {
  id: string;
  name: string;
  kind: string;
  status: TestStatus;
  column?: string;
  severity?: string;
  failures?: number;
  message?: string;
  seconds?: number;
  references?: string;
}

export interface RunInfo {
  status?: string;
  seconds?: number;
  at?: string;
  rows?: number;
  message?: string;
}

export interface Freshness {
  configured?: boolean;
  status?: string;
  maxLoadedAt?: string;
  checkedAt?: string;
  ageSeconds?: number;
  warnAfter?: string;
  errorAfter?: string;
}

export interface NodeMetrics {
  up: number;
  down: number;
  depth: number;
  height: number;
  fanIn: number;
  fanOut: number;
  exposures: number;
  impact: number;
  critical?: boolean;
}

export interface LineumNode {
  id: string;
  type: NodeType;
  name: string;
  package: string;
  layer: string;
  url: string;
  m: NodeMetrics;
  label?: string;
  path?: string;
  folder?: string;
  description?: string;
  html?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  owner?: string;
  group?: string;
  access?: string;
  materialized?: string;
  database?: string;
  schema?: string;
  alias?: string;
  relation?: string;
  language?: string;
  version?: string;
  contract?: boolean;
  run?: RunInfo;
  stats?: { rows?: number; bytes?: number; kind?: string; modified?: string };
  freshness?: Freshness;
  columnLineage?: string;
  columns?: Column[];
  tests?: Test[];
  sql?: { raw?: string; compiled?: string };
  x?: Record<string, unknown>;
}

export interface Layer {
  id: string;
  label: string;
  rank: number;
}

export interface HealthDimension {
  id: string;
  label: string;
  weight: number;
  hit: number;
  total: number;
  score: number | null;
  hint: string;
  missing: string[];
}

export interface HealthFinding {
  rule: string;
  severity: 'info' | 'warn' | 'error';
  title: string;
  detail: string;
  nodes: string[];
}

export interface DataTable {
  file: string;
  table: string;
  rows: number;
  totalRows: number;
  sampled: boolean;
}

export interface Payload {
  schema: string;
  meta: {
    project: string;
    title: string;
    generatedAt: string;
    lineumVersion: string;
    dbtVersion: string;
    adapter: string;
    dialect?: string | null;
    artifacts: Record<string, string>;
    manifestGeneratedAt?: string;
    runGeneratedAt?: string | null;
    baseUrl?: string | null;
    sql: boolean;
    data: { enabled: boolean; rowsPerTable?: number; tables?: Record<string, DataTable>; skipped?: string[] };
    queries?: { title: string; sql: string }[];
  };
  overview: string;
  layers: Layer[];
  groups: { name: string; owner?: string; email?: string }[];
  nodes: LineumNode[];
  edges: [number, number][];
  columnEdges: [number, string, number, string, TransformCode][];
  summary: {
    counts: Record<string, number>;
    layers: Record<string, number>;
    materializations: Record<string, number>;
    columns: number;
    edges: number;
    columnEdges: number;
    tests: Record<string, number>;
    testCount: number;
    runStatus: Record<string, number>;
    maxDepth: number;
    criticalPath: { nodes: string[]; seconds: number };
    keystones: string[];
    slowest: string[];
    orphans: string[];
    totalSeconds: number;
  };
  health: { score: number; grade: string; dimensions: HealthDimension[]; findings: HealthFinding[] };
  warnings: string[];
}

export type Page =
  | { kind: 'overview' }
  | { kind: 'resource'; id: string }
  | { kind: 'lineage' }
  | { kind: 'health' }
  | { kind: 'analyze' }
  | { kind: 'notfound' };

declare global {
  interface Window {
    __LINEUM__?: Payload;
  }
}
