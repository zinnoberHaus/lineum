import { useMemo } from 'react';
import { useApp } from '../app/context';
import { nodeMenu } from '../app/menus';
import { formatSeconds } from '../ui/bits';

interface Bar {
  index: number;
  start: number;
  end: number;
  lane: number;
}

/** A Gantt chart of the last dbt run: when each node ran, in parallel lanes, with the critical path marked. */
export function RunTimeline() {
  const api = useApp();
  const { project } = api;
  const data = useMemo(() => {
    const bars: Omit<Bar, 'lane'>[] = [];
    project.nodes.forEach((node, index) => {
      const run = node.run;
      if (!run?.at || run.seconds === undefined) return;
      const end = Date.parse(run.at);
      if (Number.isNaN(end)) return;
      bars.push({ index, start: end - run.seconds * 1000, end });
    });
    if (bars.length < 2) return null;
    bars.sort((a, b) => a.start - b.start);
    const t0 = bars[0].start;
    const t1 = Math.max(...bars.map((b) => b.end));
    // Greedy lane packing approximates dbt's worker threads.
    const laneEnds: number[] = [];
    const placed: Bar[] = bars.map((bar) => {
      let lane = laneEnds.findIndex((end) => end <= bar.start + 1);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = bar.end;
      return { ...bar, lane };
    });
    return { bars: placed, t0, span: Math.max(1, t1 - t0), lanes: laneEnds.length };
  }, [project]);
  if (!data) return null;
  const critical = new Set(project.payload.summary.criticalPath.nodes);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <section className="timeline" aria-label="Last run timeline">
      <div className="section-head">
        <h2>Last run, over time</h2>
        <span className="muted small">
          Each bar is one model, seed or snapshot, placed where it ran. The critical path is outlined. Right-click a bar for actions.
        </span>
      </div>
      <div className="timeline-chart" style={{ '--lanes': data.lanes } as React.CSSProperties}>
        <div className="timeline-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${t * 100}%` }}>
              {formatSeconds((t * data.span) / 1000)}
            </span>
          ))}
        </div>
        <ol className="timeline-lanes">
          {data.bars.map((bar) => {
            const node = project.nodes[bar.index];
            const left = ((bar.start - data.t0) / data.span) * 100;
            const width = Math.max(0.4, ((bar.end - bar.start) / data.span) * 100);
            return (
              <li
                key={node.id}
                className={`timeline-bar${critical.has(node.id) ? ' is-critical' : ''}${node.run?.status !== 'success' ? ' is-failed' : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, top: `${bar.lane * 22}px`, background: `var(--ln-layer-${node.layer}, var(--none))` }}
                title={`${project.displayName(node)}: ${formatSeconds(node.run?.seconds)}${critical.has(node.id) ? ', on the critical path' : ''}`}
                onClick={() => api.navigate({ kind: 'resource', id: node.id })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  api.openMenu(event, nodeMenu(api, node));
                }}
              >
                <span className="visually-hidden">
                  {project.displayName(node)}, {formatSeconds(node.run?.seconds)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
