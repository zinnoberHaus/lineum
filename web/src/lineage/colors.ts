import type { Project } from '../data/project';
import { TYPE_LABEL } from '../data/project';
import type { LineumNode } from '../types';

export interface ColorValue {
  key: string;
  label: string;
  color: string;
  order: number;
}

export interface ColorMode {
  id: string;
  label: string;
  describe: string;
  value(node: LineumNode, index: number): ColorValue;
}

const CATEGORICAL = Array.from({ length: 8 }, (_, i) => `var(--cat-${i + 1})`);
const RAMP = Array.from({ length: 5 }, (_, i) => `var(--ramp-${i + 1})`);
const NONE = 'var(--none)';

function hashIndex(text: string, size: number) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
}

function categorical(values: string[]): (value: string) => string {
  const sorted = [...new Set(values)].sort();
  const assigned = new Map<string, string>();
  sorted.forEach((value, i) => assigned.set(value, CATEGORICAL[i < CATEGORICAL.length ? i : hashIndex(value, CATEGORICAL.length)]));
  return (value) => assigned.get(value) ?? NONE;
}

function quantiles(values: number[], steps: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from({ length: steps - 1 }, (_, i) => sorted[Math.floor(((i + 1) / steps) * (sorted.length - 1))]);
}

function formatNumber(value: number, unit = ''): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M${unit}`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k${unit}`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k${unit}`;
  if (value < 1 && value > 0) return `${value.toFixed(2)}${unit}`;
  return `${Math.round(value * 10) / 10}${unit}`;
}

function scaled(
  label: string,
  read: (node: LineumNode) => number | undefined,
  nodes: LineumNode[],
  unit: string,
): (node: LineumNode) => ColorValue {
  const cuts = quantiles(nodes.map(read).filter((v): v is number => v !== undefined), RAMP.length);
  const bucket = (value: number) => {
    let i = 0;
    while (i < cuts.length && value > cuts[i]) i += 1;
    return i;
  };
  const range = (i: number) => {
    const low = i === 0 ? 0 : cuts[i - 1];
    const high = cuts[i];
    if (high === undefined) return `over ${formatNumber(low, unit)}`;
    return i === 0 ? `up to ${formatNumber(high, unit)}` : `${formatNumber(low, unit)} to ${formatNumber(high, unit)}`;
  };
  return (node) => {
    const value = read(node);
    if (value === undefined) return { key: 'none', label: `No ${label}`, color: NONE, order: 99 };
    const i = bucket(value);
    return { key: `b${i}`, label: range(i), color: RAMP[i], order: i };
  };
}

const STATUS = {
  pass: { label: 'Passing', color: 'var(--ln-color-pass)', order: 0 },
  warn: { label: 'Warning', color: 'var(--ln-color-warn)', order: 1 },
  fail: { label: 'Failing', color: 'var(--ln-color-fail)', order: 2 },
  none: { label: 'Not tested', color: NONE, order: 3 },
};

function testStatus(node: LineumNode): keyof typeof STATUS {
  const tests = node.tests ?? [];
  if (!tests.length) return 'none';
  if (tests.some((t) => t.status === 'fail' || t.status === 'error')) return 'fail';
  if (tests.some((t) => t.status === 'warn')) return 'warn';
  return 'pass';
}

export function colorModes(project: Project): ColorMode[] {
  const nodes = project.nodes;
  const layers = new Map(project.payload.layers.map((layer) => [layer.id, layer]));
  const folderColor = categorical(nodes.map((n) => n.folder?.split('/')[0] || '(root)'));
  const packageColor = categorical(nodes.map((n) => n.package));
  const ownerColor = categorical(nodes.map((n) => n.owner ?? n.group ?? ''));
  const materialColor = categorical(nodes.map((n) => n.materialized ?? n.type));
  const tagColor = categorical(nodes.flatMap((n) => n.tags ?? []));
  const runtime = scaled('run time', (n) => n.run?.seconds, nodes, 's');
  const impact = scaled('dependents', (n) => (n.m.down > 0 ? n.m.down : undefined), nodes, '');
  const rows = scaled('row count', (n) => n.stats?.rows, nodes, '');

  // Nodes downstream of a stale source are "possibly stale" (Foundry's out-of-date colouring).
  const staleSources = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.freshness?.status && ['warn', 'error', 'runtime error'].includes(n.freshness.status));
  const affected = new Map<number, string>();
  for (const { n, i } of staleSources) {
    for (const j of project.walk(i, 'down').keys()) {
      const previous = affected.get(j);
      if (previous !== 'error') affected.set(j, n.freshness!.status === 'warn' ? previous ?? 'warn' : 'error');
    }
  }

  return [
    {
      id: 'layer',
      label: 'Layer',
      describe: 'Where the node sits in the flow, from sources to exposures.',
      value: (node) => {
        const layer = layers.get(node.layer);
        return { key: node.layer, label: layer?.label ?? node.layer, color: `var(--ln-layer-${node.layer}, var(--none))`, order: layer?.rank ?? 9 };
      },
    },
    {
      id: 'type',
      label: 'Resource type',
      describe: 'Model, source, seed, snapshot, exposure or semantic layer node.',
      value: (node) => {
        const byType: Record<string, string> = {
          source: 'source', seed: 'seed', snapshot: 'snapshot', model: 'staging', analysis: 'other', function: 'other',
          semantic_model: 'semantic', metric: 'semantic', saved_query: 'semantic', exposure: 'exposure',
        };
        const order = ['source', 'seed', 'snapshot', 'model', 'semantic_model', 'metric', 'saved_query', 'exposure'].indexOf(node.type);
        return { key: node.type, label: TYPE_LABEL[node.type] ?? node.type, color: `var(--ln-layer-${byType[node.type] ?? 'other'})`, order };
      },
    },
    {
      id: 'materialized',
      label: 'Materialization',
      describe: 'How dbt builds the node: view, table, incremental, ephemeral…',
      value: (node) => {
        const key = node.materialized ?? node.type;
        return { key, label: key, color: materialColor(key), order: 0 };
      },
    },
    {
      id: 'tests',
      label: 'Test status',
      describe: 'Result of the tests attached to each node in the last run.',
      value: (node) => {
        const status = testStatus(node);
        return { key: status, ...STATUS[status] };
      },
    },
    {
      id: 'run',
      label: 'Run time',
      describe: 'Execution time in the last dbt run, in quintiles.',
      value: (node) => runtime(node),
    },
    {
      id: 'freshness',
      label: 'Freshness',
      describe: 'Stale sources, and everything built from them.',
      value: (node, index) => {
        const status = node.freshness?.status;
        if (status === 'pass') return { key: 'fresh', label: 'Fresh source', color: 'var(--ln-color-pass)', order: 0 };
        if (status === 'warn') return { key: 'warn', label: 'Stale source (warn)', color: 'var(--ln-color-warn)', order: 1 };
        if (status === 'error' || status === 'runtime error')
          return { key: 'error', label: 'Stale source (error)', color: 'var(--ln-color-fail)', order: 2 };
        const downstream = affected.get(index);
        if (downstream) return { key: `affected-${downstream}`, label: 'Built from a stale source', color: downstream === 'error' ? 'var(--fail-soft)' : 'var(--warn-soft)', order: 3 };
        return { key: 'unknown', label: 'Not checked', color: NONE, order: 4 };
      },
    },
    {
      id: 'impact',
      label: 'Blast radius',
      describe: 'How many nodes depend on each node, in quintiles.',
      value: (node) => impact(node),
    },
    {
      id: 'rows',
      label: 'Row count',
      describe: 'Rows from the warehouse catalog or the exported sample.',
      value: (node) => rows(node),
    },
    {
      id: 'docs',
      label: 'Documentation',
      describe: 'Whether the node and its columns are described.',
      value: (node) => {
        const columns = node.columns ?? [];
        const described = columns.filter((c) => c.description).length;
        if (node.description && (!columns.length || described === columns.length))
          return { key: 'full', label: 'Fully described', color: 'var(--ln-color-pass)', order: 0 };
        if (node.description || described)
          return { key: 'partial', label: 'Partly described', color: 'var(--ln-color-warn)', order: 1 };
        return { key: 'none', label: 'Not described', color: 'var(--ln-color-fail)', order: 2 };
      },
    },
    {
      id: 'owner',
      label: 'Owner',
      describe: 'The dbt group or owner responsible for the node.',
      value: (node) => {
        const key = node.owner ?? node.group ?? '';
        return { key: key || 'none', label: key || 'No owner', color: key ? ownerColor(key) : NONE, order: key ? 0 : 1 };
      },
    },
    {
      id: 'folder',
      label: 'Folder',
      describe: 'Top-level folder in the dbt project.',
      value: (node) => {
        const key = node.folder?.split('/')[0] || '(root)';
        return { key, label: key, color: folderColor(key), order: 0 };
      },
    },
    {
      id: 'package',
      label: 'Package',
      describe: 'The dbt package the node belongs to.',
      value: (node) => ({ key: node.package, label: node.package, color: packageColor(node.package), order: node.package === project.payload.meta.project ? 0 : 1 }),
    },
    {
      id: 'access',
      label: 'Access',
      describe: 'dbt model access: public, protected or private.',
      value: (node) => {
        const key = node.access ?? 'n/a';
        const colors: Record<string, string> = { public: 'var(--cat-1)', protected: 'var(--cat-3)', private: 'var(--cat-6)' };
        return { key, label: key === 'n/a' ? 'Not a model' : key, color: colors[key] ?? NONE, order: ['public', 'protected', 'private'].indexOf(key) + 1 || 9 };
      },
    },
    {
      id: 'tag',
      label: 'Tag',
      describe: 'First dbt tag on the node.',
      value: (node) => {
        const tag = node.tags?.[0];
        return { key: tag ?? 'none', label: tag ?? 'Untagged', color: tag ? tagColor(tag) : NONE, order: tag ? 0 : 1 };
      },
    },
  ];
}
