import { useMemo, useState } from 'react';
import { SqlConsole } from '../analytics/SqlConsole';
import { useApp } from '../app/context';
import { readHash } from '../data/router';
import { Explorer, type ExplorerInit } from '../lineage/Explorer';
import { Empty, NodeLink, StatusDot } from '../ui/bits';

export function LineagePage() {
  const init = useMemo<ExplorerInit>(() => {
    const params = readHash();
    const number = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);
    const trace = params.get('trace');
    return {
      focus: params.get('focus') ?? undefined,
      up: number('up'),
      down: number('down'),
      trace: trace === 'up' || trace === 'down' || trace === 'both' ? trace : undefined,
      column: params.get('col') ?? undefined,
      color: params.get('color') ?? undefined,
      columns: params.get('columns') === '1' || params.has('col'),
    };
  }, []);
  return (
    <div className="lineage-page">
      <h1 className="visually-hidden">Lineage explorer</h1>
      <Explorer init={init} syncHash />
    </div>
  );
}

export function AnalyzePage() {
  const params = readHash();
  const sql = params.get('sql') ?? undefined;
  return (
    <div className="analyze-page">
      <h1 className="visually-hidden">Analyze with SQL</h1>
      <SqlConsole initialSql={sql} autorun={!!sql && params.get('run') === '1'} />
    </div>
  );
}

export function HealthPage() {
  const api = useApp();
  const { project } = api;
  const { health } = project.payload;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="health">
      <header className="health-head">
        <div className={`score-ring grade-${health.grade}`} style={{ '--score': health.score } as React.CSSProperties} role="img" aria-label={`Health score ${health.score} out of 100`}>
          <span className="score-value">{Math.round(health.score)}</span>
          <span className="score-grade">{health.grade}</span>
        </div>
        <div>
          <h1>Project health</h1>
          <p className="muted">
            A weighted score of documentation, tests, freshness checks, ownership and contracts. Run <span className="mono">lineum check --fail-under 70</span> in CI to keep it from slipping.
          </p>
        </div>
      </header>
      <section>
        <h2 className="section-title">Coverage</h2>
        <ul className="dimension-list">
          {health.dimensions.map((d) => (
            <li key={d.id} className={d.score === null ? 'is-na' : ''}>
              <button type="button" className="dimension" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id} disabled={!d.missing.length}>
                <span className="dimension-label">{d.label}</span>
                <span className="dimension-track" aria-hidden="true">
                  <span className={`dimension-fill${(d.score ?? 0) >= 80 ? ' is-good' : (d.score ?? 0) >= 60 ? ' is-ok' : ' is-low'}`} style={{ width: `${d.score ?? 0}%` }} />
                </span>
                <span className="dimension-score">{d.score === null ? 'n/a' : `${Math.round(d.score)}%`}</span>
                <span className="dimension-count muted">
                  {d.hit} of {d.total}
                </span>
              </button>
              {open === d.id && (
                <div className="dimension-detail">
                  <p className="muted small">{d.hint}</p>
                  <ul className="chip-list">
                    {d.missing.slice(0, 200).map((id) => {
                      const node = project.node(id);
                      return node ? (
                        <li key={id}>
                          <NodeLink node={node} />
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Findings</h2>
        {health.findings.length ? (
          <ul className="findings">
            {health.findings.map((finding) => (
              <li key={finding.rule} className={`finding sev-${finding.severity}`}>
                <h3>
                  <StatusDot status={finding.severity === 'error' ? 'fail' : finding.severity === 'warn' ? 'warn' : 'none'} /> {finding.title}{' '}
                  <span className="muted">{finding.nodes.length}</span>
                </h3>
                <p className="muted">{finding.detail}</p>
                <ul className="chip-list">
                  {finding.nodes.slice(0, 60).map((id) => {
                    const node = project.node(id);
                    return node ? (
                      <li key={id}>
                        <NodeLink node={node} />
                      </li>
                    ) : null;
                  })}
                </ul>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => api.openLineage({ focus: finding.nodes[0], up: 2, down: 2, color: finding.rule.includes('test') ? 'tests' : finding.rule.includes('stale') ? 'freshness' : 'layer' })}
                >
                  See in the lineage explorer
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing to fix.">No failing tests, stale sources or structural issues were found.</Empty>
        )}
      </section>
    </div>
  );
}

export function NotFoundPage() {
  const api = useApp();
  return (
    <Empty title="This page is not in this build of the documentation.">
      <p>It may have been renamed or removed. Search with ⌘K, or go to the overview.</p>
      <button type="button" className="button" onClick={() => api.navigate({ kind: 'overview' })}>
        Go to the overview
      </button>
    </Empty>
  );
}
