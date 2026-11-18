import { useMemo } from 'react';
import { useApp } from '../app/context';
import { type CanvasActions, columnMenu } from '../app/menus';
import { TRANSFORM_LABEL, TYPE_LABEL } from '../data/project';
import type { LineumNode } from '../types';
import { Chip, Empty, formatCount, formatSeconds, LayerChip, NodeLink, StatusDot, Tabs } from '../ui/bits';
import { Code } from '../ui/Code';
import { Icon, TypeIcon } from '../ui/icons';
import type { ColorMode, ColorValue } from './colors';
import type { Action, ViewState } from './state';

interface InspectorProps {
  selected: number[];
  state: ViewState;
  dispatch: React.Dispatch<Action>;
  actions: CanvasActions;
  mode: ColorMode;
  values: ColorValue[];
  onClose(): void;
}

export function Inspector({ selected, state, dispatch, actions, mode, values, onClose }: InspectorProps) {
  const { project } = useApp();
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-top">
        <span className="inspector-heading">{selected.length > 1 ? `${selected.length} selected` : selected.length ? 'Selected' : 'Inspector'}</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inspector">
          <Icon.close size={14} />
        </button>
      </div>
      {selected.length === 0 && <NothingSelected />}
      {selected.length === 1 && <One node={project.nodes[selected[0]]} state={state} dispatch={dispatch} actions={actions} />}
      {selected.length > 1 && <Many selected={selected} dispatch={dispatch} actions={actions} mode={mode} values={values} />}
    </aside>
  );
}

function NothingSelected() {
  const { project } = useApp();
  const counts = project.payload.summary.counts;
  return (
    <div className="inspector-body">
      <p className="muted">Select a node to see its details, columns and impact. Right-click anything for actions.</p>
      <dl className="facts">
        <dt>Models</dt>
        <dd>{counts.model ?? 0}</dd>
        <dt>Sources</dt>
        <dd>{counts.source ?? 0}</dd>
        <dt>Exposures</dt>
        <dd>{counts.exposure ?? 0}</dd>
        <dt>Column edges</dt>
        <dd>{formatCount(project.payload.summary.columnEdges)}</dd>
      </dl>
      <ul className="tips">
        <li>Click a column name inside a node to trace that column.</li>
        <li>The +N buttons on a node's sides show hidden parents and children.</li>
        <li>Select two nodes and press T to see every path between them.</li>
      </ul>
    </div>
  );
}

function One({ node, state, dispatch, actions }: { node: LineumNode; state: ViewState; dispatch: React.Dispatch<Action>; actions: CanvasActions }) {
  const api = useApp();
  const { project } = api;
  const i = project.idx(node.id);
  const tab = state.inspector;
  const tests = node.tests ?? [];
  const failing = tests.filter((t) => t.status === 'fail' || t.status === 'error' || t.status === 'warn');
  return (
    <div className="inspector-body">
      <div className="inspector-title">
        <span className="inspector-icon" style={{ color: `var(--ln-layer-${node.layer}, var(--ln-color-muted))` }}>
          <TypeIcon type={node.type} size={18} />
        </span>
        <div>
          <h2 className="inspector-name">{project.displayName(node)}</h2>
          <div className="chips">
            <Chip>{TYPE_LABEL[node.type] ?? node.type}</Chip>
            <LayerChip layer={node.layer} />
            {node.type === 'model' && node.materialized && <Chip>{node.materialized}</Chip>}
            {node.contract && <Chip tone="pass">contract</Chip>}
          </div>
        </div>
      </div>
      <div className="inspector-actions">
        <button type="button" className="button button-small" onClick={() => api.navigate({ kind: 'resource', id: node.id })}>
          <Icon.doc size={14} /> Docs
        </button>
        <button type="button" className="button button-small tone-up" onClick={() => actions.trace(node.id, 'up')}>
          Trace up
        </button>
        <button type="button" className="button button-small tone-down" onClick={() => actions.trace(node.id, 'down')}>
          Trace down
        </button>
        {!!node.columns?.length && (
          <button type="button" className="button button-small" onClick={() => actions.toggleColumns(node.id)}>
            {state.columns.has(i) ? 'Hide columns' : 'Columns'}
          </button>
        )}
      </div>
      <Tabs
        label="Inspector sections"
        value={tab}
        onChange={(t) => dispatch({ type: 'inspector', tab: t })}
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'columns', label: 'Columns', count: node.columns?.length ?? 0, hidden: !node.columns?.length },
          { id: 'impact', label: 'Impact', count: node.m.down },
          { id: 'sql', label: 'SQL', hidden: !node.sql?.compiled && !node.sql?.raw },
        ]}
      />
      {tab === 'details' && (
        <div className="inspector-section">
          {node.html ? <div className="prose" dangerouslySetInnerHTML={{ __html: node.html }} /> : <p className="muted">No description.</p>}
          <dl className="facts">
            {node.relation && (
              <>
                <dt>Relation</dt>
                <dd className="mono">{node.relation}</dd>
              </>
            )}
            {node.owner && (
              <>
                <dt>Owner</dt>
                <dd>{node.owner}</dd>
              </>
            )}
            {node.access && (
              <>
                <dt>Access</dt>
                <dd>{node.access}</dd>
              </>
            )}
            {node.run && (
              <>
                <dt>Last run</dt>
                <dd>
                  <StatusDot status={node.run.status} /> {node.run.status} in {formatSeconds(node.run.seconds)}
                </dd>
              </>
            )}
            {node.stats?.rows !== undefined && (
              <>
                <dt>Rows</dt>
                <dd>{formatCount(node.stats.rows)}</dd>
              </>
            )}
            {node.freshness?.status && (
              <>
                <dt>Freshness</dt>
                <dd>
                  <StatusDot status={node.freshness.status} /> {node.freshness.status}
                </dd>
              </>
            )}
            <dt>Upstream</dt>
            <dd>{node.m.up} nodes, {node.m.depth} levels deep</dd>
            <dt>Downstream</dt>
            <dd>
              {node.m.down} nodes{node.m.exposures ? `, ${node.m.exposures} exposure${node.m.exposures === 1 ? '' : 's'}` : ''}
            </dd>
            {tests.length > 0 && (
              <>
                <dt>Tests</dt>
                <dd>
                  {tests.length} ({tests.filter((t) => t.status === 'pass').length} passing)
                </dd>
              </>
            )}
            {!!node.tags?.length && (
              <>
                <dt>Tags</dt>
                <dd>{node.tags.join(', ')}</dd>
              </>
            )}
          </dl>
          {failing.length > 0 && (
            <ul className="test-list">
              {failing.map((t) => (
                <li key={t.id}>
                  <StatusDot status={t.status} /> <span className="mono">{t.kind}</span>
                  {t.column ? ` on ${t.column}` : ''}
                  {t.failures ? `: ${formatCount(t.failures)} rows` : ''}
                </li>
              ))}
            </ul>
          )}
          {node.columnLineage && <p className="note">Column lineage unavailable: {node.columnLineage}.</p>}
        </div>
      )}
      {tab === 'columns' && (
        <ul className="inspector-columns">
          {(node.columns ?? []).map((column) => {
            const ins = project.columnIn(i, column.name);
            return (
              <li
                key={column.name}
                onContextMenu={(event) => {
                  event.preventDefault();
                  api.openMenu(event, columnMenu(api, node, column.name, actions));
                }}
              >
                <button type="button" className="inspector-column" onClick={() => actions.traceColumn(node.id, column.name, 'both')} title="Trace this column">
                  <span className="mono">{column.name}</span>
                  <span className="muted mono">{(column.type ?? '').toLowerCase()}</span>
                </button>
                {ins.length > 0 && (
                  <span className="column-from">
                    from{' '}
                    {ins.slice(0, 3).map((e, k) => (
                      <span key={k} className={`transform t-${e.kind}`} title={TRANSFORM_LABEL[e.kind]}>
                        {project.displayName(project.nodes[e.from])}.{e.fromCol}
                      </span>
                    ))}
                    {ins.length > 3 ? ` and ${ins.length - 3} more` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'impact' && <Impact node={node} actions={actions} />}
      {tab === 'sql' && node.sql && <Code code={node.sql.compiled ?? node.sql.raw ?? ''} lines={false} className="code-compact" />}
    </div>
  );
}

function Impact({ node, actions }: { node: LineumNode; actions: CanvasActions }) {
  const { project } = useApp();
  const i = project.idx(node.id);
  const data = useMemo(() => {
    const down = project.walk(i, 'down');
    const byType = new Map<string, number>();
    const byLayer = new Map<string, number>();
    const owners = new Map<string, number>();
    const exposures: LineumNode[] = [];
    let tests = 0;
    for (const j of down.keys()) {
      const n = project.nodes[j];
      byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
      byLayer.set(n.layer, (byLayer.get(n.layer) ?? 0) + 1);
      if (n.owner) owners.set(n.owner, (owners.get(n.owner) ?? 0) + 1);
      if (n.type === 'exposure') exposures.push(n);
      tests += n.tests?.length ?? 0;
    }
    const staleUp = [...project.walk(i, 'up').keys()]
      .map((j) => project.nodes[j])
      .filter((n) => n.freshness?.status && n.freshness.status !== 'pass');
    return { count: down.size, byType, byLayer, owners, exposures, tests, staleUp };
  }, [project, i]);
  const max = Math.max(1, ...data.byLayer.values());
  if (!data.count && !data.staleUp.length) return <Empty title="Nothing depends on this node.">Changing it affects no other model or exposure.</Empty>;
  return (
    <div className="inspector-section">
      <p className="impact-lede">
        Changing <span className="mono">{project.displayName(node)}</span> affects <strong>{data.count}</strong> downstream node
        {data.count === 1 ? '' : 's'}
        {data.exposures.length ? (
          <>
            {' '}
            and <strong>{data.exposures.length}</strong> exposure{data.exposures.length === 1 ? '' : 's'}
          </>
        ) : null}
        , covered by {data.tests} tests.
      </p>
      <button type="button" className="button button-small tone-down" onClick={() => actions.trace(node.id, 'down')}>
        Show on canvas
      </button>
      <h3 className="inspector-sub">By layer</h3>
      <ul className="bars">
        {[...data.byLayer.entries()]
          .sort((a, b) => project.rank(a[0]) - project.rank(b[0]))
          .map(([layer, count]) => (
            <li key={layer}>
              <span className="bar-label">{project.payload.layers.find((l) => l.id === layer)?.label ?? layer}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(100 * count) / max}%`, background: `var(--ln-layer-${layer}, var(--none))` }} />
              </span>
              <span className="bar-value">{count}</span>
            </li>
          ))}
      </ul>
      {data.exposures.length > 0 && (
        <>
          <h3 className="inspector-sub">Exposures affected</h3>
          <ul className="link-list">
            {data.exposures.map((n) => (
              <li key={n.id}>
                <NodeLink node={n} />
              </li>
            ))}
          </ul>
        </>
      )}
      {data.owners.size > 0 && (
        <>
          <h3 className="inspector-sub">Owners to tell</h3>
          <ul className="plain-list">
            {[...data.owners.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([owner, count]) => (
                <li key={owner}>
                  {owner} <span className="muted">({count})</span>
                </li>
              ))}
          </ul>
        </>
      )}
      {data.staleUp.length > 0 && (
        <>
          <h3 className="inspector-sub">Stale sources upstream</h3>
          <ul className="link-list">
            {data.staleUp.map((n) => (
              <li key={n.id}>
                <StatusDot status={n.freshness?.status} /> <NodeLink node={n} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Many({
  selected,
  dispatch,
  actions,
  mode,
  values,
}: {
  selected: number[];
  dispatch: React.Dispatch<Action>;
  actions: CanvasActions;
  mode: ColorMode;
  values: ColorValue[];
}) {
  const { project, copy } = useApp();
  const groups = useMemo(() => {
    const histogram = (read: (i: number) => string) => {
      const map = new Map<string, number[]>();
      for (const i of selected) {
        const key = read(i);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(i);
      }
      return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    };
    return [
      { title: mode.label, rows: histogram((i) => values[i].label) },
      { title: 'Type', rows: histogram((i) => TYPE_LABEL[project.nodes[i].type] ?? project.nodes[i].type) },
      { title: 'Owner', rows: histogram((i) => project.nodes[i].owner ?? 'No owner') },
    ];
  }, [selected, project, mode, values]);
  return (
    <div className="inspector-body">
      <div className="inspector-actions">
        <button type="button" className="button button-small" onClick={() => dispatch({ type: 'only', nodes: selected })}>
          Show only these
        </button>
        <button type="button" className="button button-small" onClick={() => dispatch({ type: 'hide', nodes: selected })}>
          Hide
        </button>
        {selected.length === 2 && (
          <button type="button" className="button button-small tone-accent" onClick={() => actions.showPath(project.nodes[selected[0]].id, project.nodes[selected[1]].id)}>
            Paths between
          </button>
        )}
        <button type="button" className="button button-small" onClick={() => copy(selected.map((i) => project.selector(project.nodes[i])).join(' '), 'selector')}>
          Copy selector
        </button>
      </div>
      {groups.map((group) => {
        const max = Math.max(...group.rows.map((r) => r[1].length));
        return (
          <section key={group.title}>
            <h3 className="inspector-sub">{group.title}</h3>
            <ul className="bars">
              {group.rows.slice(0, 8).map(([label, nodes]) => (
                <li key={label}>
                  <button type="button" className="bar-button" onClick={() => dispatch({ type: 'select', nodes })} title="Select only these">
                    <span className="bar-label">{label}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(100 * nodes.length) / max}%` }} />
                    </span>
                    <span className="bar-value">{nodes.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
