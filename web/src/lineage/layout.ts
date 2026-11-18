import dagre from '@dagrejs/dagre';
import type { Project } from '../data/project';

export const NODE_WIDTH = 276;
export const NODE_HEIGHT = 56;
export const COLUMN_ROW = 24;
export const MAX_COLUMNS = 40;

export type LayoutKind = 'flow' | 'layers';
export type Direction = 'LR' | 'TB';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nodeHeight(columnCount: number, showColumns: boolean, all = false): number {
  if (!showColumns || columnCount === 0) return NODE_HEIGHT;
  const shown = all ? columnCount : Math.min(columnCount, MAX_COLUMNS);
  const more = !all && columnCount > MAX_COLUMNS ? COLUMN_ROW : 0;
  return NODE_HEIGHT + 4 + shown * COLUMN_ROW + more + 6;
}

/** Position the visible nodes. Returns top-left corners keyed by node index. */
export function layoutGraph(
  project: Project,
  visible: Set<number>,
  columns: Set<number>,
  kind: LayoutKind,
  direction: Direction,
  allColumns: Set<number> = new Set(),
): Map<number, Box> {
  const sizes = new Map<number, { width: number; height: number }>();
  for (const i of visible) {
    sizes.set(i, { width: NODE_WIDTH, height: nodeHeight(project.columnsOf(i).length, columns.has(i), allColumns.has(i)) });
  }
  return kind === 'layers' ? layered(project, visible, sizes, direction) : flow(project, visible, sizes, direction);
}

function flow(
  project: Project,
  visible: Set<number>,
  sizes: Map<number, { width: number; height: number }>,
  direction: Direction,
): Map<number, Box> {
  const graph = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  const large = visible.size > 400;
  graph.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 16 : 28,
    ranksep: direction === 'LR' ? 96 : 64,
    edgesep: 8,
    marginx: 24,
    marginy: 24,
    ranker: large ? 'longest-path' : 'network-simplex',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const i of visible) graph.setNode(String(i), { ...sizes.get(i)! });
  for (const i of visible) {
    for (const j of project.children[i]) {
      if (visible.has(j)) graph.setEdge(String(i), String(j));
    }
  }
  dagre.layout(graph);
  const result = new Map<number, Box>();
  for (const i of visible) {
    const n = graph.node(String(i)) as { x: number; y: number; width: number; height: number };
    result.set(i, { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height });
  }
  return result;
}

/**
 * Bands by layer (sources, staging, intermediate, marts, …), one column per layer, nodes ordered
 * inside a band by the average position of their parents to keep edges short.
 */
function layered(
  project: Project,
  visible: Set<number>,
  sizes: Map<number, { width: number; height: number }>,
  direction: Direction,
): Map<number, Box> {
  const bands = new Map<number, number[]>();
  for (const i of visible) {
    const rank = project.rank(project.nodes[i].layer);
    if (!bands.has(rank)) bands.set(rank, []);
    bands.get(rank)!.push(i);
  }
  const ranks = [...bands.keys()].sort((a, b) => a - b);
  const order = new Map<number, number>();
  const result = new Map<number, Box>();
  const gap = 14;
  const bandGap = 110;
  let offset = 24;
  for (const rank of ranks) {
    const members = bands.get(rank)!;
    const score = (i: number) => {
      const placed = project.parents[i].filter((p) => order.has(p));
      if (!placed.length) return Number.POSITIVE_INFINITY;
      return placed.reduce((sum, p) => sum + order.get(p)!, 0) / placed.length;
    };
    members.sort((a, b) => {
      const diff = score(a) - score(b);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      const fa = project.nodes[a].folder ?? '';
      const fb = project.nodes[b].folder ?? '';
      return fa.localeCompare(fb) || project.nodes[a].name.localeCompare(project.nodes[b].name);
    });
    let cursor = 24;
    members.forEach((i, position) => {
      order.set(i, position);
      const size = sizes.get(i)!;
      if (direction === 'LR') {
        result.set(i, { x: offset, y: cursor, ...size });
        cursor += size.height + gap;
      } else {
        result.set(i, { x: cursor, y: offset, ...size });
        cursor += size.width + gap;
      }
    });
    offset += (direction === 'LR' ? NODE_WIDTH : Math.max(...members.map((i) => sizes.get(i)!.height))) + bandGap;
  }
  // Centre each band vertically against the tallest one.
  const extent = (box: Box) => (direction === 'LR' ? box.y + box.height : box.x + box.width);
  const tallest = Math.max(0, ...[...result.values()].map(extent));
  for (const rank of ranks) {
    const members = bands.get(rank)!;
    const end = Math.max(...members.map((i) => extent(result.get(i)!)));
    const shift = (tallest - end) / 2;
    for (const i of members) {
      const box = result.get(i)!;
      if (direction === 'LR') box.y += shift;
      else box.x += shift;
    }
  }
  return result;
}
