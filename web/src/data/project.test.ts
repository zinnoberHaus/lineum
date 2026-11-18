import { describe, expect, it } from 'vitest';
import { rewriteRefs } from '../analytics/engine';
import type { LineumNode, Payload } from '../types';
import { Project, search } from './project';

function node(id: string, type: LineumNode['type'], layer: string, extra: Partial<LineumNode> = {}): LineumNode {
  const name = id.split('.').pop()!;
  return { id, type, name, package: 'shop', layer, url: `${type}/shop/${name}.html`, m: { up: 0, down: 0, depth: 0, height: 0, fanIn: 0, fanOut: 0, exposures: 0, impact: 0 }, ...extra };
}

// raw.orders → stg_orders → fct_orders → dashboard ; raw.payments → stg_payments → fct_orders
const nodes: LineumNode[] = [
  node('source.shop.raw.orders', 'source', 'source', { x: { source_name: 'raw' }, columns: [{ name: 'id' }, { name: 'amount_cents' }] }),
  node('source.shop.raw.payments', 'source', 'source', { x: { source_name: 'raw' } }),
  node('model.shop.stg_orders', 'model', 'staging', { columns: [{ name: 'order_id' }, { name: 'amount' }] }),
  node('model.shop.stg_payments', 'model', 'staging'),
  node('model.shop.fct_orders', 'model', 'marts', { columns: [{ name: 'order_id' }, { name: 'balance' }], description: 'Orders with payments' }),
  node('exposure.shop.dashboard', 'exposure', 'exposure', { label: 'Finance dashboard' }),
];
const payload = {
  schema: 'lineum/1',
  meta: { project: 'shop', title: 'Shop', data: { enabled: true, tables: { 'model.shop.fct_orders': { file: 'data/f.parquet', table: 'fct_orders', rows: 1, totalRows: 1, sampled: false } } } },
  layers: [
    { id: 'source', label: 'Sources', rank: 0 },
    { id: 'staging', label: 'Staging', rank: 1 },
    { id: 'marts', label: 'Marts', rank: 3 },
    { id: 'exposure', label: 'Exposures', rank: 5 },
  ],
  nodes,
  edges: [[0, 2], [1, 3], [2, 4], [3, 4], [4, 5]],
  columnEdges: [
    [0, 'id', 2, 'order_id', 'r'],
    [0, 'amount_cents', 2, 'amount', 'x'],
    [2, 'order_id', 4, 'order_id', 'd'],
    [2, 'amount', 4, 'balance', 'x'],
  ],
  summary: { keystones: [] },
} as unknown as Payload;

const project = new Project(payload);

describe('Project', () => {
  it('walks upstream and downstream with distances', () => {
    const down = project.walk(0, 'down');
    expect([...down.entries()]).toEqual([[2, 1], [4, 2], [5, 3]]);
    expect(project.walk(5, 'up', 1)).toEqual(new Map([[4, 1]]));
  });

  it('finds every node between two nodes, and nothing when unconnected', () => {
    expect([...project.between(0, 5)].sort()).toEqual([0, 2, 4, 5]);
    expect(project.between(0, 3).size).toBe(0);
  });

  it('traces a column both ways through renames', () => {
    const { columns, edges } = project.traceColumn(2, 'order_id', 'both');
    expect(columns.get('0|id')).toBe(-1);
    expect(columns.get('4|order_id')).toBe(1);
    expect(edges).toHaveLength(2);
  });

  it('names sources with their source name and builds dbt references', () => {
    expect(project.displayName(nodes[0])).toBe('raw.orders');
    expect(project.selector(nodes[0])).toBe('source:raw.orders');
    expect(project.refCall(nodes[4])).toBe("{{ ref('fct_orders') }}");
  });
});

describe('search', () => {
  it('ranks exact names first and finds columns with model.column', () => {
    expect(project.nodes[search(project, 'fct_orders')[0].node].name).toBe('fct_orders');
    const hits = search(project, 'fct_orders.bal');
    expect(hits.some((h) => h.kind === 'column' && h.column === 'balance')).toBe(true);
  });

  it('matches subsequences and labels', () => {
    expect(search(project, 'fctord').length).toBeGreaterThan(0);
    expect(project.nodes[search(project, 'finance dash')[0].node].id).toBe('exposure.shop.dashboard');
  });
});

describe('rewriteRefs', () => {
  it('turns dbt references into exported table names', () => {
    expect(rewriteRefs(project, "select * from {{ ref('fct_orders') }}")).toBe('select * from fct_orders');
    expect(rewriteRefs(project, "select * from {{ ref('missing') }}")).toBe("select * from {{ ref('missing') }}");
  });
});
