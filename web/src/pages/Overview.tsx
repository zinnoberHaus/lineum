import { useApp } from '../app/context';
import { Explorer } from '../lineage/Explorer';
import { Chip, formatCount, formatSeconds, NodeLink, StatusDot } from '../ui/bits';
import { Icon } from '../ui/icons';
import { RunTimeline } from './RunTimeline';

export function OverviewPage() {
  const api = useApp();
  const { project } = api;
  const { summary, health, meta } = project.payload;
  const counts = summary.counts;
  const keystones = summary.keystones.slice(0, 8).map((id) => project.node(id)!).filter(Boolean);
  const exposures = project.nodes.filter((n) => n.type === 'exposure');
  const critical = summary.criticalPath.nodes.map((id) => project.node(id)!).filter(Boolean);
  const failing = health.findings.filter((f) => f.severity !== 'info');
  const small = project.nodes.length <= 400;
  const stats: [string, number | undefined][] = [
    ['models', counts.model],
    ['sources', counts.source],
    ['seeds', counts.seed],
    ['snapshots', counts.snapshot],
    ['exposures', counts.exposure],
    ['metrics', counts.metric],
    ['columns', summary.columns],
    ['column edges', summary.columnEdges],
    ['tests', summary.testCount],
  ];
  return (
    <div className="overview">
      <header className="overview-head">
        <h1 className="overview-title">{project.title}</h1>
        <p className="overview-meta">
          dbt {meta.dbtVersion || 'project'}
          {meta.adapter ? ` on ${meta.adapter}` : ''}, documented by Lineum {meta.lineumVersion}
          {meta.runGeneratedAt ? `. Last run ${new Date(meta.runGeneratedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.
        </p>
        {project.payload.overview && <div className="prose overview-prose" dangerouslySetInnerHTML={{ __html: project.payload.overview }} />}
        <dl className="stat-line">
          {stats
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatCount(value)}</dd>
              </div>
            ))}
        </dl>
      </header>

      {small ? (
        <section className="overview-map" aria-label="Project lineage">
          <div className="section-head">
            <h2>The whole project</h2>
            <span className="muted small">Bands run from sources on the left to exposures on the right. Right-click any node.</span>
            <span className="spacer" />
            <a className="button button-small" href={api.router.href({ kind: 'lineage' })} onClick={(e) => { e.preventDefault(); api.navigate({ kind: 'lineage' }); }}>
              <Icon.lineage size={14} /> Open the explorer
            </a>
          </div>
          <div className="overview-canvas">
            <Explorer init={{ all: true }} embedded />
          </div>
        </section>
      ) : (
        <section className="overview-map" aria-label="Layers">
          <div className="section-head">
            <h2>Layers</h2>
          </div>
          <ul className="layer-strip">
            {project.payload.layers.map((layer) => (
              <li key={layer.id} style={{ '--layer': `var(--ln-layer-${layer.id}, var(--none))` } as React.CSSProperties}>
                <span className="layer-count">{formatCount(summary.layers[layer.id])}</span>
                <span className="layer-name">{layer.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overview-grid">
        <section>
          <h2 className="section-title">Most depended on</h2>
          <p className="muted small">Changes to these reach the most models and exposures.</p>
          <ol className="rank-list">
            {keystones.map((node) => (
              <li key={node.id}>
                <NodeLink node={node} />
                <span className="rank-value" title="Downstream nodes">
                  {node.m.down}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="section-title">Exposures</h2>
          <p className="muted small">Dashboards, notebooks, apps and models that read this project.</p>
          {exposures.length ? (
            <ul className="link-list">
              {exposures.map((node) => (
                <li key={node.id}>
                  <NodeLink node={node} />
                  {typeof node.x?.exposure_type === 'string' && <Chip>{node.x.exposure_type}</Chip>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No exposures declared. Add them in YAML so impact analysis can reach your dashboards.</p>
          )}
        </section>
        <section>
          <h2 className="section-title">Health {health.score} <span className={`grade grade-${health.grade}`}>{health.grade}</span></h2>
          <p className="muted small">Documentation, tests, freshness, ownership and contracts.</p>
          <ul className="finding-list">
            {failing.slice(0, 4).map((finding) => (
              <li key={finding.rule}>
                <StatusDot status={finding.severity === 'error' ? 'fail' : 'warn'} /> {finding.title}{' '}
                <span className="muted">({finding.nodes.length})</span>
              </li>
            ))}
            {!failing.length && <li className="muted">No failing tests, run errors or stale sources.</li>}
          </ul>
          <a className="button button-small" href={api.router.href({ kind: 'health' })} onClick={(e) => { e.preventDefault(); api.navigate({ kind: 'health' }); }}>
            See the full report
          </a>
        </section>
        <section>
          <h2 className="section-title">Last run</h2>
          {summary.totalSeconds ? (
            <>
              <p className="muted small">
                {formatSeconds(summary.totalSeconds)} of work across {Object.values(summary.runStatus).reduce((a, b) => a + b, 0)} nodes. The critical path is the
                longest chain of dependent runs: {formatSeconds(summary.criticalPath.seconds)}.
              </p>
              <ol className="path-chips">
                {critical.map((node) => (
                  <li key={node.id}>
                    <NodeLink node={node} />
                    <span className="muted small">{formatSeconds(node.run?.seconds)}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted">No run_results.json was found. Run dbt build before Lineum to see timings.</p>
          )}
        </section>
      </div>
      <RunTimeline />
    </div>
  );
}
