import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/context';
import { columnMenu, nodeMenu } from '../app/menus';
import { TRANSFORM_LABEL, TYPE_LABEL } from '../data/project';
import { readHash } from '../data/router';
import { Explorer } from '../lineage/Explorer';
import type { Column, LineumNode } from '../types';
import {
  Breakable,
  Chip,
  CopyButton,
  Empty,
  formatAge,
  formatBytes,
  formatCount,
  formatDate,
  formatSeconds,
  LayerChip,
  NodeLink,
  StatusDot,
  Tabs,
} from '../ui/bits';
import { Code } from '../ui/Code';
import { Icon, TypeIcon } from '../ui/icons';

type Tab = 'columns' | 'lineage' | 'sql' | 'tests' | 'details';

export function ResourcePage({ node }: { node: LineumNode }) {
  const api = useApp();
  const { project } = api;
  const i = project.idx(node.id);
  const hasColumns = !!node.columns?.length;
  const [tab, setTab] = useState<Tab>(hasColumns ? 'columns' : 'lineage');
  const [sqlKind, setSqlKind] = useState<'compiled' | 'raw'>(node.sql?.compiled ? 'compiled' : 'raw');
  const highlightColumn = readHash().get('col');

  useEffect(() => {
    setTab(hasColumns ? 'columns' : 'lineage');
    setSqlKind(node.sql?.compiled ? 'compiled' : 'raw');
  }, [node.id, hasColumns, node.sql?.compiled]);

  useEffect(() => {
    if (!highlightColumn) return;
    const row = document.getElementById(`col-${highlightColumn.toLowerCase()}`);
    row?.scrollIntoView({ block: 'center' });
  }, [highlightColumn, node.id]);

  const tests = node.tests ?? [];
  const failing = tests.filter((t) => t.status === 'fail' || t.status === 'error').length;
  const warning = tests.filter((t) => t.status === 'warn').length;
  const parents = project.parents[i].map((p) => project.nodes[p]);
  const children = project.children[i].map((c) => project.nodes[c]);
  const layerLabel = project.payload.layers.find((l) => l.id === node.layer)?.label ?? node.layer;
  const data = project.payload.meta.data?.tables?.[node.id];

  return (
    <article className="resource">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={api.router.href({ kind: 'overview' })} onClick={(e) => { e.preventDefault(); api.navigate({ kind: 'overview' }); }}>
          {project.title}
        </a>
        <span aria-hidden="true">/</span>
        <span>{layerLabel}</span>
        {node.folder && node.folder.toLowerCase() !== node.layer.toLowerCase() && (
          <>
            <span aria-hidden="true">/</span>
            <span className="mono">{node.folder}</span>
          </>
        )}
      </nav>
      <header
        className="resource-head"
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('a, button')) return;
          event.preventDefault();
          api.openMenu(event, nodeMenu(api, node));
        }}
      >
        <div className="resource-title-row">
          <span className="resource-icon" style={{ color: `var(--ln-layer-${node.layer}, var(--ln-color-muted))` }}>
            <TypeIcon type={node.type} size={26} />
          </span>
          <h1 className="resource-title">
            <Breakable text={node.label && node.type === 'exposure' ? node.label : project.displayName(node)} />
          </h1>
          <button type="button" className="icon-button" title="Actions" aria-label="Actions" onClick={(event) => api.openMenu(event, nodeMenu(api, node))}>
            <Icon.menu size={16} />
          </button>
        </div>
        <div className="chips">
          <Chip>{TYPE_LABEL[node.type] ?? node.type}</Chip>
          <LayerChip layer={node.layer} />
          {node.type === 'model' && node.materialized && <Chip>{node.materialized}</Chip>}
          {node.access && <Chip title="dbt model access">{node.access}</Chip>}
          {node.contract && <Chip tone="pass" title="The model contract is enforced">contract enforced</Chip>}
          {node.version && <Chip>v{node.version}</Chip>}
          {node.owner && <Chip title="Owner">{node.owner}</Chip>}
          {(node.tags ?? []).map((tag) => (
            <Chip key={tag} tone="tag">
              #{tag}
            </Chip>
          ))}
        </div>
        {node.relation && (
          <div className="relation">
            <span className="mono">{node.relation}</span>
            <CopyButton text={node.relation} label="Copy relation name" what="relation" />
          </div>
        )}
        {node.html ? (
          <div className="prose resource-description" dangerouslySetInnerHTML={{ __html: node.html }} />
        ) : (
          <p className="muted resource-description">
            No description yet{node.path ? (
              <>
                {' '}
                for <span className="mono">{node.path}</span>
              </>
            ) : null}
            .
          </p>
        )}
        {node.type === 'exposure' && typeof node.x?.link === 'string' && (
          <a className="button" href={node.x.link} target="_blank" rel="noopener noreferrer">
            Open {node.label ?? node.name} <Icon.external size={13} />
          </a>
        )}
      </header>

      <div className="resource-body">
        <div className="resource-main">
          <Tabs
            label="Sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'columns', label: 'Columns', count: node.columns?.length ?? 0, hidden: !hasColumns },
              { id: 'lineage', label: 'Lineage' },
              { id: 'sql', label: 'SQL', hidden: !node.sql },
              { id: 'tests', label: 'Tests', count: tests.length, hidden: !tests.length },
              { id: 'details', label: 'Details' },
            ]}
          />
          {tab === 'columns' && <ColumnsTable node={node} highlight={highlightColumn} />}
          {tab === 'lineage' && (
            <div className="resource-lineage">
              <Explorer key={node.id} init={{ focus: node.id, up: 1, down: 1 }} embedded />
            </div>
          )}
          {tab === 'sql' && node.sql && (
            <div className="resource-sql">
              <div className="sql-bar">
                <div className="segmented" role="tablist" aria-label="SQL version">
                  {node.sql.compiled && (
                    <button type="button" role="tab" aria-selected={sqlKind === 'compiled'} className={sqlKind === 'compiled' ? 'is-on' : ''} onClick={() => setSqlKind('compiled')}>
                      Compiled
                    </button>
                  )}
                  {node.sql.raw && (
                    <button type="button" role="tab" aria-selected={sqlKind === 'raw'} className={sqlKind === 'raw' ? 'is-on' : ''} onClick={() => setSqlKind('raw')}>
                      Source
                    </button>
                  )}
                </div>
                <span className="spacer" />
                <button type="button" className="button button-small" onClick={() => api.copy((sqlKind === 'compiled' ? node.sql?.compiled : node.sql?.raw) ?? '', 'SQL')}>
                  <Icon.copy size={13} /> Copy SQL
                </button>
              </div>
              <Code code={(sqlKind === 'compiled' ? node.sql.compiled : node.sql.raw) ?? ''} />
            </div>
          )}
          {tab === 'tests' && <TestsTable node={node} />}
          {tab === 'details' && <Details node={node} />}
        </div>

        <aside className="resource-rail" aria-label="Lineage summary">
          <section className="rail-card">
            <h2 className="rail-title">Impact</h2>
            {node.m.down ? (
              <p>
                <strong>{node.m.down}</strong> node{node.m.down === 1 ? '' : 's'} depend on this
                {node.m.exposures ? (
                  <>
                    , including <strong>{node.m.exposures}</strong> exposure{node.m.exposures === 1 ? '' : 's'}
                  </>
                ) : null}
                .
              </p>
            ) : (
              <p className="muted">Nothing depends on this yet.</p>
            )}
            <div className="rail-actions">
              <button type="button" className="button button-small tone-up" onClick={() => api.openLineage({ focus: node.id, up: 99, down: 0, trace: 'up' })}>
                Trace upstream
              </button>
              <button type="button" className="button button-small tone-down" onClick={() => api.openLineage({ focus: node.id, up: 0, down: 99, trace: 'down' })}>
                Trace downstream
              </button>
            </div>
          </section>
          {(failing > 0 || warning > 0 || node.run || node.freshness || data) && (
            <section className="rail-card">
              <h2 className="rail-title">Status</h2>
              <dl className="facts">
                {node.run && (
                  <>
                    <dt>Last run</dt>
                    <dd>
                      <StatusDot status={node.run.status} /> {node.run.status}, {formatSeconds(node.run.seconds)}
                    </dd>
                  </>
                )}
                {tests.length > 0 && (
                  <>
                    <dt>Tests</dt>
                    <dd>
                      <StatusDot status={failing ? 'fail' : warning ? 'warn' : 'pass'} /> {tests.length - failing - warning} pass
                      {warning ? `, ${warning} warn` : ''}
                      {failing ? `, ${failing} fail` : ''}
                    </dd>
                  </>
                )}
                {node.freshness?.status && (
                  <>
                    <dt>Freshness</dt>
                    <dd>
                      <StatusDot status={node.freshness.status} /> {node.freshness.status}, last load {formatAge(node.freshness.ageSeconds)} ago
                    </dd>
                  </>
                )}
                {node.stats?.rows !== undefined && (
                  <>
                    <dt>Rows</dt>
                    <dd>{formatCount(node.stats.rows)}</dd>
                  </>
                )}
                {data && (
                  <>
                    <dt>Sample</dt>
                    <dd>
                      <button type="button" className="link-button" onClick={() => api.openSql(`select *\nfrom ${data.table}\nlimit 100`, true)}>
                        Query {formatCount(data.rows)} rows
                      </button>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          )}
          <section className="rail-card">
            <h2 className="rail-title tone-up">Upstream {parents.length ? <span className="muted">{parents.length}</span> : null}</h2>
            {parents.length ? (
              <ul className="link-list">
                {parents.map((p) => (
                  <li key={p.id}>
                    <NodeLink node={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">A starting point of the graph.</p>
            )}
          </section>
          <section className="rail-card">
            <h2 className="rail-title tone-down">Downstream {children.length ? <span className="muted">{children.length}</span> : null}</h2>
            {children.length ? (
              <ul className="link-list">
                {children.map((c) => (
                  <li key={c.id}>
                    <NodeLink node={c} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing reads this yet.</p>
            )}
          </section>
        </aside>
      </div>
    </article>
  );
}

function ColumnsTable({ node, highlight }: { node: LineumNode; highlight: string | null }) {
  const api = useApp();
  const { project } = api;
  const i = project.idx(node.id);
  const columns = node.columns ?? [];
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [columns, filter]);
  const profiled = columns.some((c) => c.profile);
  return (
    <div className="columns-table">
      <div className="table-tools">
        <label className="filter">
          <Icon.search size={13} />
          <span className="visually-hidden">Filter columns</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${columns.length} columns`} />
        </label>
        {node.columnLineage ? (
          <span className="muted small">Column lineage unavailable: {node.columnLineage}.</span>
        ) : (
          <span className="muted small">Click a source column to follow it. Right-click a row to trace or query it.</span>
        )}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Description</th>
            <th>Comes from</th>
            {profiled && <th className="num">Nulls</th>}
            {profiled && <th className="num">Distinct</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((column) => (
            <ColumnRow key={column.name} node={node} index={i} column={column} profiled={profiled} highlight={highlight?.toLowerCase() === column.name.toLowerCase()} />
          ))}
        </tbody>
      </table>
      {!shown.length && <Empty title="No columns match the filter." />}
    </div>
  );
}

function ColumnRow({ node, index, column, profiled, highlight }: { node: LineumNode; index: number; column: Column; profiled: boolean; highlight: boolean }) {
  const api = useApp();
  const { project } = api;
  const ins = project.columnIn(index, column.name);
  const outs = project.columnOut(index, column.name);
  const tests = (column.tests ?? []).map((t) => node.tests?.[t]).filter(Boolean);
  const profile = column.profile;
  return (
    <tr
      id={`col-${column.name.toLowerCase()}`}
      className={highlight ? 'is-highlight' : ''}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('a')) return;
        event.preventDefault();
        api.openMenu(event, columnMenu(api, node, column.name));
      }}
    >
      <th scope="row">
        <span className="mono column-name">{column.name}</span>
        {column.pk && <span className="pk" title="Primary key">key</span>}
        {tests.length > 0 && (
          <span className="column-tests">
            {tests.map((t) => (
              <span key={t!.id} className={`test-chip test-${t!.status}`} title={`${t!.kind}: ${t!.status}`}>
                {t!.kind.replace(/^.*\./, '').replace('accepted_values', 'values').replace('relationships', 'refs')}
              </span>
            ))}
          </span>
        )}
      </th>
      <td className="mono muted">{(column.type ?? '').toLowerCase()}</td>
      <td>{column.html ? <span className="prose prose-inline" dangerouslySetInnerHTML={{ __html: column.html }} /> : <span className="muted">—</span>}</td>
      <td>
        {ins.length ? (
          <span className="from-list">
            {ins.map((edge, k) => {
              const source = project.nodes[edge.from];
              return (
                <span key={k} className={`transform t-${edge.kind}`} title={`${TRANSFORM_LABEL[edge.kind]} from ${project.displayName(source)}.${edge.fromCol}`}>
                  <NodeLink node={source} column={edge.fromCol} />
                  {edge.kind !== 'd' && <span className="transform-kind">{TRANSFORM_LABEL[edge.kind]}</span>}
                </span>
              );
            })}
          </span>
        ) : (
          <span className="muted small">{node.type === 'source' || node.type === 'seed' ? 'loaded' : node.columnLineage ? 'unknown' : '—'}</span>
        )}
        {outs.length > 0 && (
          <button
            type="button"
            className="feeds"
            onClick={() => api.openLineage({ focus: node.id, up: 0, down: 99, column: column.name, trace: 'down', columns: true })}
            title="Trace where this column goes"
          >
            feeds {outs.length}
          </button>
        )}
      </td>
      {profiled && <td className="num">{profile ? `${profile.rows ? Math.round((100 * profile.nulls) / profile.rows) : 0}%` : ''}</td>}
      {profiled && <td className="num">{profile ? formatCount(profile.distinct) : ''}</td>}
    </tr>
  );
}

function TestsTable({ node }: { node: LineumNode }) {
  const { project } = useApp();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Test</th>
          <th>Column</th>
          <th className="num">Failing rows</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        {(node.tests ?? []).map((test) => {
          const other = test.references ? project.node(test.references) : undefined;
          return (
            <tr key={test.id}>
              <td>
                <StatusDot status={test.status} /> {test.status.replace('_', ' ')}
              </td>
              <td>
                <span className="mono">{test.kind}</span>
                {other && (
                  <>
                    {' '}
                    to <NodeLink node={other} />
                  </>
                )}
                {test.message && test.status !== 'pass' && <div className="muted small">{test.message}</div>}
              </td>
              <td className="mono">{test.column ?? '—'}</td>
              <td className="num">{test.failures ? formatCount(test.failures) : '—'}</td>
              <td>{test.severity ?? 'error'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Details({ node }: { node: LineumNode }) {
  const rows: [string, React.ReactNode][] = [
    ['Unique ID', <span className="mono">{node.id}</span>],
    ['Package', node.package],
    ['Path', node.path ? <span className="mono">{node.path}</span> : null],
    ['Database', node.database],
    ['Schema', node.schema],
    ['Alias', node.alias],
    ['Language', node.language],
    ['Group', node.group],
    ['Rows', node.stats?.rows !== undefined ? formatCount(node.stats.rows) : null],
    ['Size', node.stats?.bytes ? formatBytes(node.stats.bytes) : null],
    ['Last run', node.run?.at ? formatDate(node.run.at) : null],
    ['Freshness rule', node.freshness?.warnAfter ? `warn after ${node.freshness.warnAfter}${node.freshness.errorAfter ? `, error after ${node.freshness.errorAfter}` : ''}` : null],
    ['Max loaded at', node.freshness?.maxLoadedAt ? formatDate(node.freshness.maxLoadedAt) : null],
    ['Upstream', `${node.m.up} nodes, ${node.m.depth} levels`],
    ['Downstream', `${node.m.down} nodes, ${node.m.height} levels`],
  ];
  const extra = node.x ?? {};
  for (const key of ['loader', 'source_description', 'exposure_type', 'maturity', 'owner_email', 'metric_type', 'measure', 'expression', 'numerator', 'denominator']) {
    if (extra[key]) rows.push([key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), String(extra[key])]);
  }
  for (const key of ['entities', 'dimensions']) {
    const value = extra[key];
    if (Array.isArray(value) && value.length) rows.push([key[0].toUpperCase() + key.slice(1), value.join(', ')]);
  }
  if (Array.isArray(extra.measures) && extra.measures.length) {
    rows.push(['Measures', (extra.measures as { name: string; agg: string }[]).map((m) => `${m.name} (${m.agg})`).join(', ')]);
  }
  const meta = node.meta && Object.keys(node.meta).length ? JSON.stringify(node.meta, null, 2) : null;
  return (
    <div className="details">
      <dl className="facts facts-wide">
        {rows
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([label, value]) => (
            <div key={label} className="fact-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {meta && (
        <>
          <h3 className="sub-heading">meta</h3>
          <pre className="code-block">{meta}</pre>
        </>
      )}
    </div>
  );
}
