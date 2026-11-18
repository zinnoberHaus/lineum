import type { Column, LineumNode, Payload, TransformCode } from '../types';

export interface ColumnEdge {
  from: number;
  fromCol: string;
  to: number;
  toCol: string;
  kind: TransformCode;
}

export const TRANSFORM_LABEL: Record<TransformCode, string> = {
  d: 'direct',
  r: 'renamed',
  x: 'derived',
  a: 'aggregated',
};

export const TYPE_LABEL: Record<string, string> = {
  model: 'Model',
  source: 'Source',
  seed: 'Seed',
  snapshot: 'Snapshot',
  analysis: 'Analysis',
  function: 'Function',
  semantic_model: 'Semantic model',
  metric: 'Metric',
  saved_query: 'Saved query',
  exposure: 'Exposure',
};

const colKey = (node: number, column: string) => `${node}|${column.toLowerCase()}`;

/** Indexed, read-only view of the payload with graph traversal helpers. */
export class Project {
  readonly payload: Payload;
  readonly nodes: LineumNode[];
  readonly index = new Map<string, number>();
  readonly parents: number[][];
  readonly children: number[][];
  readonly columnEdges: ColumnEdge[];
  private readonly colIn = new Map<string, ColumnEdge[]>();
  private readonly colOut = new Map<string, ColumnEdge[]>();
  private readonly layerRank = new Map<string, number>();

  constructor(payload: Payload) {
    this.payload = payload;
    this.nodes = payload.nodes;
    this.nodes.forEach((node, i) => this.index.set(node.id, i));
    this.parents = this.nodes.map(() => []);
    this.children = this.nodes.map(() => []);
    for (const [a, b] of payload.edges) {
      this.parents[b].push(a);
      this.children[a].push(b);
    }
    this.columnEdges = payload.columnEdges.map(([from, fromCol, to, toCol, kind]) => ({
      from,
      fromCol,
      to,
      toCol,
      kind,
    }));
    for (const edge of this.columnEdges) {
      const inKey = colKey(edge.to, edge.toCol);
      const outKey = colKey(edge.from, edge.fromCol);
      if (!this.colIn.has(inKey)) this.colIn.set(inKey, []);
      if (!this.colOut.has(outKey)) this.colOut.set(outKey, []);
      this.colIn.get(inKey)!.push(edge);
      this.colOut.get(outKey)!.push(edge);
    }
    for (const layer of payload.layers) this.layerRank.set(layer.id, layer.rank);
  }

  get title() {
    return this.payload.meta.title;
  }

  node(ref: string | number): LineumNode | undefined {
    return typeof ref === 'number' ? this.nodes[ref] : this.nodes[this.index.get(ref) ?? -1];
  }

  idx(id: string): number {
    return this.index.get(id) ?? -1;
  }

  rank(layer: string) {
    return this.layerRank.get(layer) ?? 2;
  }

  displayName(node: LineumNode): string {
    if (node.type === 'source') {
      const sourceName = (node.x?.source_name as string | undefined) ?? '';
      return sourceName ? `${sourceName}.${node.name}` : node.name;
    }
    return node.label && node.type === 'exposure' ? node.label : node.name;
  }

  /** All ancestors (direction 'up') or descendants ('down') with their distance, excluding the start. */
  walk(start: number, direction: 'up' | 'down', depth = Number.POSITIVE_INFINITY): Map<number, number> {
    const adjacency = direction === 'up' ? this.parents : this.children;
    const seen = new Map<number, number>([[start, 0]]);
    let frontier = [start];
    let level = 0;
    while (frontier.length && level < depth) {
      level += 1;
      const next: number[] = [];
      for (const i of frontier) {
        for (const j of adjacency[i]) {
          if (!seen.has(j)) {
            seen.set(j, level);
            next.push(j);
          }
        }
      }
      frontier = next;
    }
    seen.delete(start);
    return seen;
  }

  /** Every node on some path from a to b (inclusive), or an empty set when b is not downstream of a. */
  between(a: number, b: number): Set<number> {
    const down = this.walk(a, 'down');
    if (!down.has(b)) return new Set();
    const up = this.walk(b, 'up');
    const result = new Set<number>([a, b]);
    for (const i of down.keys()) if (up.has(i)) result.add(i);
    return result;
  }

  columnsOf(i: number): Column[] {
    return this.nodes[i]?.columns ?? [];
  }

  columnIn(node: number, column: string): ColumnEdge[] {
    return this.colIn.get(colKey(node, column)) ?? [];
  }

  columnOut(node: number, column: string): ColumnEdge[] {
    return this.colOut.get(colKey(node, column)) ?? [];
  }

  hasColumnLineage(node: number): boolean {
    return this.columnsOf(node).some(
      (c) => this.columnIn(node, c.name).length > 0 || this.columnOut(node, c.name).length > 0,
    );
  }

  /** Column-level walk: returns edges reached, keyed by `${node}|${column}` with distance. */
  traceColumn(
    node: number,
    column: string,
    direction: 'up' | 'down' | 'both',
  ): { columns: Map<string, number>; edges: ColumnEdge[] } {
    const columns = new Map<string, number>([[colKey(node, column), 0]]);
    const edges: ColumnEdge[] = [];
    const run = (dir: 'up' | 'down') => {
      let frontier: [number, string][] = [[node, column]];
      let distance = 0;
      const seen = new Set([colKey(node, column)]);
      while (frontier.length) {
        distance += 1;
        const next: [number, string][] = [];
        for (const [n, c] of frontier) {
          const list = dir === 'up' ? this.columnIn(n, c) : this.columnOut(n, c);
          for (const edge of list) {
            edges.push(edge);
            const [m, d] = dir === 'up' ? [edge.from, edge.fromCol] : [edge.to, edge.toCol];
            const key = colKey(m, d);
            if (seen.has(key)) continue;
            seen.add(key);
            if (!columns.has(key)) columns.set(key, dir === 'up' ? -distance : distance);
            next.push([m, d]);
          }
        }
        frontier = next;
      }
    };
    if (direction !== 'down') run('up');
    if (direction !== 'up') run('down');
    return { columns, edges };
  }

  /** dbt selector syntax for a node, used by "Copy dbt selector". */
  selector(node: LineumNode): string {
    if (node.type === 'source') return `source:${(node.x?.source_name as string) ?? ''}.${node.name}`;
    if (node.type === 'exposure') return `exposure:${node.name}`;
    if (node.type === 'metric') return `metric:${node.name}`;
    if (node.type === 'semantic_model') return `semantic_model:${node.name}`;
    return node.name;
  }

  refCall(node: LineumNode): string {
    if (node.type === 'source') return `{{ source('${(node.x?.source_name as string) ?? ''}', '${node.name}') }}`;
    if (node.type === 'model' || node.type === 'seed' || node.type === 'snapshot') {
      return node.version ? `{{ ref('${node.name}', v=${node.version}) }}` : `{{ ref('${node.name}') }}`;
    }
    return node.name;
  }

  dataTable(node: LineumNode): string | undefined {
    return this.payload.meta.data?.tables?.[node.id]?.table;
  }

  sqlName(node: LineumNode): string {
    return this.dataTable(node) ?? (node.relation ? node.relation : node.name);
  }
}

// --------------------------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------------------------

export interface SearchHit {
  kind: 'node' | 'column';
  node: number;
  column?: string;
  score: number;
}

function scoreText(text: string, query: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === query) return 100;
  if (t.startsWith(query)) return 80 - Math.min(20, t.length - query.length) / 2;
  const at = t.indexOf(query);
  if (at >= 0) {
    // Matches at a word boundary (after _ . or space) rank above mid-word matches.
    const boundary = at === 0 || /[_.\s/-]/.test(t[at - 1]);
    return (boundary ? 60 : 45) - Math.min(15, at / 2);
  }
  // Subsequence match ("fctord" → fct_orders).
  let qi = 0;
  for (let i = 0; i < t.length && qi < query.length; i += 1) if (t[i] === query[qi]) qi += 1;
  return qi === query.length && query.length >= 3 ? 20 - Math.min(10, t.length / 10) : 0;
}

const TYPE_BOOST: Record<string, number> = { model: 6, source: 4, exposure: 4, metric: 3, seed: 2, snapshot: 2 };

export function search(project: Project, raw: string, limit = 40): SearchHit[] {
  const query = raw.trim().toLowerCase();
  if (!query) return [];
  const dot = query.indexOf('.');
  const hits: SearchHit[] = [];
  project.nodes.forEach((node, i) => {
    const name = scoreText(node.name, query);
    const display = scoreText(project.displayName(node), query);
    const label = node.label ? scoreText(node.label, query) : 0;
    const description = node.description ? scoreText(node.description, query) * 0.35 : 0;
    const tags = (node.tags ?? []).reduce((best, tag) => Math.max(best, scoreText(tag, query) * 0.6), 0);
    const best = Math.max(name, display, label, description, tags);
    if (best > 0) hits.push({ kind: 'node', node: i, score: best + (TYPE_BOOST[node.type] ?? 0) + node.m.down / 50 });
    if (query.length >= 2) {
      const columnQuery = dot > 0 && node.name.toLowerCase().startsWith(query.slice(0, dot)) ? query.slice(dot + 1) : query;
      for (const column of node.columns ?? []) {
        const s = scoreText(column.name, columnQuery);
        if (s >= 45) hits.push({ kind: 'column', node: i, column: column.name, score: s * 0.7 });
      }
    }
  });
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
