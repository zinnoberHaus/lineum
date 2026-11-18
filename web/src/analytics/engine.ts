import type { Project } from '../data/project';

// DuckDB-WASM loads from jsDelivr only when someone opens the SQL console. It is never bundled into
// the site, and nothing loads for readers who never run a query.
export const DUCKDB_VERSION = '1.32.0';
const CDN = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}`;

export interface ResultColumn {
  name: string;
  type: string;
  numeric: boolean;
  temporal: boolean;
}

export interface QueryResult {
  columns: ResultColumn[];
  rows: unknown[][];
  total: number;
  truncated: boolean;
  elapsed: number;
}

export interface TableInfo {
  name: string;
  kind: 'metadata' | 'data';
  columns: { name: string; type: string }[];
  rows?: number;
  node?: string;
}

export interface Engine {
  query(sql: string, limit?: number): Promise<QueryResult>;
  tables: TableInfo[];
  notes: string[];
}

type Status = (message: string) => void;

// biome-ignore lint/suspicious/noExplicitAny: DuckDB-WASM is loaded at runtime without type packages.
type Any = any;

let pending: Promise<Engine> | null = null;

export function engine(project: Project, baseHref: string, status?: Status): Promise<Engine> {
  if (!pending) {
    pending = start(project, baseHref, status ?? (() => {})).catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

// A real dynamic import of a URL, untouched by the bundler (the app itself is a classic script).
const importUrl = new Function('url', 'return import(url)') as (url: string) => Promise<Any>;

async function start(project: Project, baseHref: string, status: Status): Promise<Engine> {
  status('Downloading DuckDB (about 7 MB, once)…');
  const duckdb = await importUrl(`${CDN}/+esm`);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  status('Starting DuckDB…');
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true, castTimestampToDate: true } });
  const conn = await db.connect();

  status('Loading project metadata…');
  const tables: TableInfo[] = [];
  for (const [name, rows, columns] of metadataTables(project)) {
    await db.registerFileText(`${name}.json`, JSON.stringify(rows));
    const spec = columns.map(([column, type]) => `'${column}': '${type}'`).join(', ');
    await conn.query(`create or replace table ${name} as select * from read_json('${name}.json', format = 'array', columns = {${spec}})`);
    tables.push({ name, kind: 'metadata', columns: columns.map(([column, type]) => ({ name: column, type })), rows: rows.length });
  }

  const notes: string[] = [];
  const data = project.payload.meta.data;
  if (data?.enabled && data.tables) {
    const http = /^https?:$/.test(window.location.protocol);
    if (!http) {
      notes.push('Sample data needs the site to be served over HTTP. Run `lineum serve` to query it.');
    } else {
      status('Attaching sample data…');
      for (const [id, entry] of Object.entries(data.tables)) {
        const url = new URL(entry.file, baseHref).href;
        await db.registerFileURL(`${entry.table}.parquet`, url, duckdb.DuckDBDataProtocol.HTTP, false);
        await conn.query(`create or replace view ${entry.table} as select * from read_parquet('${entry.table}.parquet')`);
        const node = project.node(id);
        tables.push({
          name: entry.table,
          kind: 'data',
          node: id,
          rows: entry.rows,
          columns: (node?.columns ?? []).map((c) => ({ name: c.name, type: (c.type ?? '').toLowerCase() })),
        });
      }
    }
  }
  status('');

  return {
    tables,
    notes,
    async query(sql: string, limit = 2000): Promise<QueryResult> {
      const started = performance.now();
      const table = await conn.query(rewriteRefs(project, sql));
      const columns: ResultColumn[] = table.schema.fields.map((field: Any) => {
        const type = String(field.type);
        return {
          name: field.name,
          type,
          numeric: /^(Int|Uint|Float|Decimal)/i.test(type),
          temporal: /^(Date|Timestamp)/i.test(type),
        };
      });
      const total: number = table.numRows;
      const rows: unknown[][] = [];
      const vectors = columns.map((_, i) => table.getChildAt(i));
      for (let r = 0; r < Math.min(total, limit); r += 1) {
        rows.push(columns.map((column, i) => plain(vectors[i]?.get(r), column)));
      }
      return { columns, rows, total, truncated: total > limit, elapsed: performance.now() - started };
    },
  };
}

function plain(value: unknown, column: ResultColumn): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (column.temporal && typeof value === 'number') {
    const iso = new Date(value).toISOString();
    return /^Date/i.test(column.type) || iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('T', ' ').replace(/\.000Z$/, '');
  }
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace(/\.000Z$/, '');
  if (typeof value === 'object') {
    const v = value as { toJSON?: () => unknown; toArray?: () => unknown };
    try {
      return JSON.stringify(v.toJSON ? v.toJSON() : v.toArray ? Array.from(v.toArray() as Iterable<unknown>) : value, (_, inner) =>
        typeof inner === 'bigint' ? inner.toString() : inner,
      );
    } catch {
      return String(value);
    }
  }
  return value;
}

/** Let people paste dbt SQL: {{ ref('x') }} and {{ source('a', 'b') }} resolve to the exported tables. */
export function rewriteRefs(project: Project, sql: string): string {
  return sql
    .replace(/\{\{\s*ref\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?[^)]*\)\s*\}\}/g, (match, a: string, b?: string) => {
      const name = b ?? a;
      const node = project.nodes.find((n) => n.name === name && n.type !== 'source');
      return node ? project.sqlName(node) : match;
    })
    .replace(/\{\{\s*source\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g, (match, source: string, table: string) => {
      const node = project.nodes.find((n) => n.type === 'source' && n.name === table && n.x?.source_name === source);
      return node ? project.sqlName(node) : match;
    });
}

type Row = Record<string, unknown>;

function metadataTables(project: Project): [string, Row[], [string, string][]][] {
  const nodes: Row[] = project.nodes.map((n) => {
    const columns = n.columns ?? [];
    const tests = n.tests ?? [];
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      package: n.package,
      layer: n.layer,
      folder: n.folder ?? null,
      materialized: n.materialized ?? null,
      database: n.database ?? null,
      schema: n.schema ?? null,
      relation: n.relation ?? null,
      owner: n.owner ?? null,
      dbt_group: n.group ?? null,
      access: n.access ?? null,
      tags: n.tags ?? [],
      description: n.description ?? null,
      has_description: !!n.description,
      column_count: columns.length,
      described_columns: columns.filter((c) => c.description).length,
      test_count: tests.length,
      failing_tests: tests.filter((t) => t.status === 'fail' || t.status === 'error').length,
      warning_tests: tests.filter((t) => t.status === 'warn').length,
      run_status: n.run?.status ?? null,
      run_seconds: n.run?.seconds ?? null,
      rows: n.stats?.rows ?? null,
      upstream: n.m.up,
      downstream: n.m.down,
      depth: n.m.depth,
      fan_in: n.m.fanIn,
      fan_out: n.m.fanOut,
      exposures: n.m.exposures,
      impact: n.m.impact,
      on_critical_path: !!n.m.critical,
      freshness: n.freshness?.status ?? null,
      path: n.path ?? null,
    };
  });
  const edges: Row[] = project.payload.edges.map(([a, b]) => ({
    parent: project.nodes[a].id,
    child: project.nodes[b].id,
    parent_name: project.nodes[a].name,
    child_name: project.nodes[b].name,
  }));
  const columns: Row[] = project.nodes.flatMap((n) =>
    (n.columns ?? []).map((c, position) => ({
      node_id: n.id,
      node: n.name,
      name: c.name,
      type: c.type ?? null,
      description: c.description ?? null,
      has_description: !!c.description,
      is_primary_key: !!c.pk,
      test_count: c.tests?.length ?? 0,
      position: position + 1,
      nulls: c.profile?.nulls ?? null,
      distinct_values: c.profile?.distinct ?? null,
    })),
  );
  const kinds: Record<string, string> = { d: 'direct', r: 'renamed', x: 'derived', a: 'aggregated' };
  const columnEdges: Row[] = project.columnEdges.map((e) => ({
    source: project.nodes[e.from].id,
    source_node: project.nodes[e.from].name,
    source_column: e.fromCol,
    target: project.nodes[e.to].id,
    target_node: project.nodes[e.to].name,
    target_column: e.toCol,
    transform: kinds[e.kind],
  }));
  const tests: Row[] = project.nodes.flatMap((n) =>
    (n.tests ?? []).map((t) => ({
      node_id: n.id,
      node: n.name,
      name: t.name,
      kind: t.kind,
      column_name: t.column ?? null,
      status: t.status,
      severity: t.severity ?? 'error',
      failures: t.failures ?? null,
      seconds: t.seconds ?? null,
    })),
  );
  return [
    ['nodes', nodes, [
      ['id', 'VARCHAR'], ['name', 'VARCHAR'], ['type', 'VARCHAR'], ['package', 'VARCHAR'], ['layer', 'VARCHAR'],
      ['folder', 'VARCHAR'], ['materialized', 'VARCHAR'], ['database', 'VARCHAR'], ['schema', 'VARCHAR'],
      ['relation', 'VARCHAR'], ['owner', 'VARCHAR'], ['dbt_group', 'VARCHAR'], ['access', 'VARCHAR'], ['tags', 'VARCHAR[]'],
      ['description', 'VARCHAR'], ['has_description', 'BOOLEAN'], ['column_count', 'INTEGER'],
      ['described_columns', 'INTEGER'], ['test_count', 'INTEGER'], ['failing_tests', 'INTEGER'],
      ['warning_tests', 'INTEGER'], ['run_status', 'VARCHAR'], ['run_seconds', 'DOUBLE'], ['rows', 'BIGINT'],
      ['upstream', 'INTEGER'], ['downstream', 'INTEGER'], ['depth', 'INTEGER'], ['fan_in', 'INTEGER'],
      ['fan_out', 'INTEGER'], ['exposures', 'INTEGER'], ['impact', 'DOUBLE'], ['on_critical_path', 'BOOLEAN'],
      ['freshness', 'VARCHAR'], ['path', 'VARCHAR'],
    ]],
    ['edges', edges, [['parent', 'VARCHAR'], ['child', 'VARCHAR'], ['parent_name', 'VARCHAR'], ['child_name', 'VARCHAR']]],
    ['columns', columns, [
      ['node_id', 'VARCHAR'], ['node', 'VARCHAR'], ['name', 'VARCHAR'], ['type', 'VARCHAR'], ['description', 'VARCHAR'],
      ['has_description', 'BOOLEAN'], ['is_primary_key', 'BOOLEAN'], ['test_count', 'INTEGER'], ['position', 'INTEGER'],
      ['nulls', 'BIGINT'], ['distinct_values', 'BIGINT'],
    ]],
    ['column_edges', columnEdges, [
      ['source', 'VARCHAR'], ['source_node', 'VARCHAR'], ['source_column', 'VARCHAR'], ['target', 'VARCHAR'],
      ['target_node', 'VARCHAR'], ['target_column', 'VARCHAR'], ['transform', 'VARCHAR'],
    ]],
    ['tests', tests, [
      ['node_id', 'VARCHAR'], ['node', 'VARCHAR'], ['name', 'VARCHAR'], ['kind', 'VARCHAR'], ['column_name', 'VARCHAR'],
      ['status', 'VARCHAR'], ['severity', 'VARCHAR'], ['failures', 'BIGINT'], ['seconds', 'DOUBLE'],
    ]],
  ];
}

export function exampleQueries(project: Project): { title: string; sql: string }[] {
  const examples = [
    {
      title: 'Models by layer and materialization',
      sql: `select layer, materialized, count(*) as models\nfrom nodes\nwhere type = 'model'\ngroup by all\norder by layer, models desc`,
    },
    {
      title: 'Widest blast radius',
      sql: `select name, type, layer, downstream, exposures\nfrom nodes\nwhere downstream > 0\norder by downstream desc, exposures desc\nlimit 15`,
    },
    {
      title: 'Slowest models in the last run',
      sql: `select name, layer, materialized, run_seconds\nfrom nodes\nwhere run_seconds is not null\norder by run_seconds desc\nlimit 15`,
    },
    {
      title: 'Documentation gaps by layer',
      sql: `select n.layer,\n  count(*) as columns,\n  count(*) filter (where not c.has_description) as undocumented,\n  round(100.0 * count(*) filter (where c.has_description) / count(*), 1) as pct_documented\nfrom columns c join nodes n on n.id = c.node_id\ngroup by all\norder by undocumented desc`,
    },
    {
      title: 'Untested models with dependents',
      sql: `select name, layer, downstream, exposures\nfrom nodes\nwhere type = 'model' and test_count = 0 and materialized != 'ephemeral'\norder by downstream desc`,
    },
    {
      title: 'How columns are transformed',
      sql: `select transform, count(*) as column_edges\nfrom column_edges\ngroup by all\norder by column_edges desc`,
    },
  ];
  return [...(project.payload.meta.queries ?? []), ...examples];
}
