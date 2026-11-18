import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/context';
import { readHash, writeHash } from '../data/router';
import { highlightSql } from '../ui/Code';
import { Icon } from '../ui/icons';
import { AutoChart, chartable } from './AutoChart';
import { type Engine, engine, exampleQueries, type QueryResult } from './engine';

const DEFAULT_SQL = `-- Ask anything about this dbt project. Tables: nodes, edges, columns, column_edges, tests.\nselect layer, count(*) as nodes, sum(test_count) as tests\nfrom nodes\ngroup by all\norder by nodes desc`;

function toCsv(result: QueryResult): string {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [result.columns.map((c) => escape(c.name)).join(','), ...result.rows.map((row) => row.map(escape).join(','))].join('\n');
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('en-US');
    return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function SqlConsole({ initialSql, autorun = false }: { initialSql?: string; autorun?: boolean }) {
  const api = useApp();
  const { project } = api;
  const [sql, setSql] = useState(initialSql ?? DEFAULT_SQL);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState<Engine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLPreElement>(null);
  const examples = useMemo(() => exampleQueries(project), [project]);

  useEffect(() => {
    let cancelled = false;
    engine(project, api.router.baseHref, (message) => !cancelled && setStatus(message))
      .then((e) => !cancelled && setReady(e))
      .catch((e: Error) => !cancelled && setLoadError(e.message || String(e)));
    return () => {
      cancelled = true;
    };
  }, [project, api.router.baseHref]);

  const run = useCallback(
    async (text = sql) => {
      if (!ready) return;
      setRunning(true);
      setError(null);
      try {
        const next = await ready.query(text);
        setResult(next);
        setView(chartable(next) && next.rows.length > 1 && next.rows.length <= 400 ? view : 'table');
      } catch (e) {
        setError((e as Error).message ?? String(e));
        setResult(null);
      } finally {
        setRunning(false);
      }
      const params = readHash();
      params.set('sql', text);
      writeHash(params);
    },
    [ready, sql, view],
  );

  // Run the query that came with the link once the engine is ready.
  const autoran = useRef(false);
  useEffect(() => {
    if (ready && autorun && !autoran.current) {
      autoran.current = true;
      void run(initialSql ?? sql);
    }
  }, [ready, autorun, run, initialSql, sql]);

  const highlighted = useMemo(() => highlightSql(`${sql}\n`), [sql]);
  const insert = (text: string) => {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const next = sql.slice(0, selectionStart) + text + sql.slice(selectionEnd);
    setSql(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = selectionStart + text.length;
    });
  };

  return (
    <div className="console">
      <aside className="console-schema" aria-label="Tables">
        <h2 className="console-heading">Tables</h2>
        {!ready && !loadError && <p className="muted small">Tables appear when DuckDB has loaded.</p>}
        {ready && (
          <>
            {(['metadata', 'data'] as const).map((kind) => {
              const tables = ready.tables.filter((t) => t.kind === kind).sort((a, b) => (kind === 'data' ? a.name.localeCompare(b.name) : 0));
              if (!tables.length) return null;
              return (
                <div key={kind} className="schema-group">
                  <h3 className="schema-group-title">{kind === 'metadata' ? 'Project metadata' : 'Sample data'}</h3>
                  <ul>
                    {tables.map((table) => (
                      <li key={table.name}>
                        <details>
                          <summary
                            onContextMenu={(event) => {
                              event.preventDefault();
                              api.openMenu(event, [
                                { heading: table.name, detail: kind === 'data' ? 'Sample data' : 'Metadata' },
                                { label: 'Preview rows', onSelect: () => { const q = `select *\nfrom ${table.name}\nlimit 100`; setSql(q); void run(q); } },
                                { label: 'Profile every column', onSelect: () => { const q = `summarize ${table.name}`; setSql(q); void run(q); } },
                                { label: 'Insert name', onSelect: () => insert(table.name) },
                                ...(table.node ? [{ label: 'Open documentation', onSelect: () => api.navigate({ kind: 'resource', id: table.node! }) }] : []),
                              ]);
                            }}
                          >
                            <span className="mono">{table.name}</span>
                            {table.rows !== undefined && <span className="muted small">{table.rows.toLocaleString('en-US')}</span>}
                          </summary>
                          <ul className="schema-columns">
                            {table.columns.map((column) => (
                              <li key={column.name}>
                                <button type="button" onClick={() => insert(column.name)} title="Insert into the query">
                                  <span className="mono">{column.name}</span>
                                  <span className="muted mono small">{column.type.toLowerCase()}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {ready.notes.map((note) => (
              <p key={note} className="note">
                {note}
              </p>
            ))}
          </>
        )}
      </aside>
      <section className="console-main">
        <div className="console-bar">
          <button type="button" className="button button-primary" onClick={() => void run()} disabled={!ready || running}>
            <Icon.play size={12} />
            {running ? 'Running…' : 'Run'}
            <kbd className="kbd kbd-on-accent">⌘↵</kbd>
          </button>
          <label className="select">
            <span className="visually-hidden">Example queries</span>
            <select
              value=""
              onChange={(event) => {
                const example = examples[Number(event.target.value)];
                if (example) {
                  setSql(example.sql);
                  void run(example.sql);
                }
              }}
            >
              <option value="">Example queries…</option>
              {examples.map((example, i) => (
                <option key={example.title} value={i}>
                  {example.title}
                </option>
              ))}
            </select>
          </label>
          <span className="console-status" role="status">
            {loadError ? (
              <span className="text-fail">DuckDB could not load: {loadError}. The SQL console needs internet access to cdn.jsdelivr.net.</span>
            ) : status ? (
              <span className="loading">{status}</span>
            ) : ready ? (
              <span className="muted">DuckDB {`1.32`} in your browser. Nothing leaves this page.</span>
            ) : null}
          </span>
        </div>
        <div className="editor">
          <pre className="editor-overlay" ref={overlay} aria-hidden="true">
            <code>{highlighted}</code>
          </pre>
          <textarea
            ref={textarea}
            className="editor-input"
            value={sql}
            spellCheck={false}
            aria-label="SQL query"
            onChange={(event) => setSql(event.target.value)}
            onScroll={(event) => {
              if (overlay.current) {
                overlay.current.scrollTop = event.currentTarget.scrollTop;
                overlay.current.scrollLeft = event.currentTarget.scrollLeft;
              }
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void run();
              } else if (event.key === 'Tab') {
                event.preventDefault();
                insert('  ');
              }
            }}
          />
        </div>
        <div className="results">
          {error && (
            <div className="result-error" role="alert">
              <strong>Query failed.</strong> {error}
            </div>
          )}
          {result && (
            <>
              <div className="results-bar">
                <div className="segmented" role="tablist" aria-label="Result view">
                  <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}>
                    Table
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'chart'}
                    className={view === 'chart' ? 'is-on' : ''}
                    onClick={() => setView('chart')}
                    disabled={!chartable(result)}
                    title={chartable(result) ? 'Chart the first two columns' : 'Charts need a label column and a number column'}
                  >
                    Chart
                  </button>
                </div>
                <span className="muted small">
                  {result.total.toLocaleString('en-US')} row{result.total === 1 ? '' : 's'}
                  {result.truncated ? `, showing ${result.rows.length.toLocaleString('en-US')}` : ''} in {Math.round(result.elapsed)} ms
                </span>
                <span className="spacer" />
                <button type="button" className="button button-small" onClick={() => api.copy(toCsv(result), 'CSV')}>
                  <Icon.copy size={13} /> Copy CSV
                </button>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    const blob = new Blob([toCsv(result)], { type: 'text/csv' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'lineum-query.csv';
                    link.click();
                    URL.revokeObjectURL(link.href);
                  }}
                >
                  <Icon.download size={13} /> Download
                </button>
              </div>
              {view === 'chart' && chartable(result) ? (
                <AutoChart result={result} />
              ) : (
                <div className="grid-wrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th className="grid-index">#</th>
                        {result.columns.map((column) => (
                          <th key={column.name} className={column.numeric ? 'num' : ''}>
                            <span className="mono">{column.name}</span>
                            <span className="grid-type">{column.type.replace(/<.*>/, '').toLowerCase()}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, r) => (
                        <tr key={r}>
                          <td className="grid-index">{r + 1}</td>
                          {row.map((value, c) => (
                            <td key={c} className={`${result.columns[c].numeric ? 'num' : ''}${value === null ? ' is-null' : ''}`}>
                              {value === null ? 'null' : formatCell(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!result && !error && (
            <div className="results-empty">
              <p>Run a query to see results here. Right-click a table on the left for ready-made queries.</p>
              <p className="muted small">Write dbt references if you like: {`{{ ref('model_name') }}`} resolves to the exported sample table.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
