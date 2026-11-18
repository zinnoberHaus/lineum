import type { Project } from '../data/project';
import type { Direction, LayoutKind } from './layout';

export type TraceDirection = 'up' | 'down' | 'both';

export type Trace =
  | { kind: 'node'; node: number; direction: TraceDirection }
  | { kind: 'column'; node: number; column: string; direction: TraceDirection }
  | { kind: 'path'; from: number; to: number };

interface Canvas {
  visible: Set<number>;
  columns: Set<number>;
  focus: number | null;
}

export interface ViewState extends Canvas {
  selection: Set<number>;
  trace: Trace | null;
  colorBy: string;
  hiddenKeys: Set<string>;
  layout: LayoutKind;
  direction: Direction;
  depthUp: number;
  depthDown: number;
  past: Canvas[];
  future: Canvas[];
  /** Bumped when the canvas content changes, so the view refits. */
  revision: number;
  inspector: 'details' | 'columns' | 'impact' | 'sql';
}

export type Action =
  | { type: 'focus'; node: number; up?: number; down?: number }
  | { type: 'depth'; up?: number; down?: number }
  | { type: 'add'; nodes: number[]; select?: boolean }
  | { type: 'expand'; node: number; direction: 'up' | 'down'; depth: number }
  | { type: 'hide'; nodes: number[] }
  | { type: 'only'; nodes: number[] }
  | { type: 'showAll' }
  | { type: 'columns'; nodes: number[]; show?: boolean }
  | { type: 'select'; nodes: number[]; mode?: 'replace' | 'add' | 'toggle' }
  | { type: 'trace'; trace: Trace | null }
  | { type: 'color'; mode: string }
  | { type: 'toggleKey'; key: string }
  | { type: 'layout'; layout?: LayoutKind; direction?: Direction }
  | { type: 'inspector'; tab: ViewState['inspector'] }
  | { type: 'undo' }
  | { type: 'redo' };

export const TRACE_LIMIT = 600;

function snapshot(state: ViewState): Canvas {
  return { visible: new Set(state.visible), columns: new Set(state.columns), focus: state.focus };
}

function commit(state: ViewState, next: Partial<ViewState>): ViewState {
  return {
    ...state,
    ...next,
    past: [...state.past.slice(-49), snapshot(state)],
    future: [],
    revision: state.revision + 1,
  };
}

export function neighbourhood(project: Project, node: number, up: number, down: number): Set<number> {
  const result = new Set<number>([node]);
  for (const i of project.walk(node, 'up', up).keys()) result.add(i);
  for (const i of project.walk(node, 'down', down).keys()) result.add(i);
  return result;
}

/** Nodes a trace touches: the subject plus everything up and/or downstream of it. */
export function traceNodes(project: Project, trace: Trace): Set<number> {
  if (trace.kind === 'path') return project.between(trace.from, trace.to);
  if (trace.kind === 'column') {
    const { columns } = project.traceColumn(trace.node, trace.column, trace.direction);
    return new Set([...columns.keys()].map((key) => Number(key.split('|')[0])));
  }
  const result = new Set<number>([trace.node]);
  if (trace.direction !== 'down') for (const i of project.walk(trace.node, 'up').keys()) result.add(i);
  if (trace.direction !== 'up') for (const i of project.walk(trace.node, 'down').keys()) result.add(i);
  return result;
}

export function createReducer(project: Project) {
  return function reducer(state: ViewState, action: Action): ViewState {
    switch (action.type) {
      case 'focus': {
        const up = action.up ?? state.depthUp;
        const down = action.down ?? state.depthDown;
        return commit(state, {
          visible: neighbourhood(project, action.node, up, down),
          focus: action.node,
          depthUp: up,
          depthDown: down,
          selection: new Set([action.node]),
          trace: null,
        });
      }
      case 'depth': {
        if (state.focus === null) return state;
        const up = Math.max(0, action.up ?? state.depthUp);
        const down = Math.max(0, action.down ?? state.depthDown);
        const visible = neighbourhood(project, state.focus, up, down);
        return commit(state, { visible, depthUp: up, depthDown: down, columns: new Set([...state.columns].filter((i) => visible.has(i))) });
      }
      case 'add': {
        const visible = new Set(state.visible);
        for (const i of action.nodes) visible.add(i);
        return commit(state, {
          visible,
          selection: action.select ? new Set(action.nodes) : state.selection,
        });
      }
      case 'expand': {
        const visible = new Set(state.visible);
        for (const i of project.walk(action.node, action.direction, action.depth).keys()) visible.add(i);
        return commit(state, { visible });
      }
      case 'hide': {
        const visible = new Set(state.visible);
        for (const i of action.nodes) visible.delete(i);
        if (!visible.size) return state;
        const selection = new Set([...state.selection].filter((i) => visible.has(i)));
        return commit(state, { visible, selection, focus: state.focus !== null && visible.has(state.focus) ? state.focus : null });
      }
      case 'only': {
        const visible = new Set(action.nodes);
        if (!visible.size) return state;
        return commit(state, { visible, columns: new Set([...state.columns].filter((i) => visible.has(i))) });
      }
      case 'showAll':
        return commit(state, { visible: new Set(project.nodes.map((_, i) => i)), focus: null });
      case 'columns': {
        const columns = new Set(state.columns);
        const show = action.show ?? !action.nodes.every((i) => columns.has(i));
        for (const i of action.nodes) {
          if (show && project.columnsOf(i).length) columns.add(i);
          else columns.delete(i);
        }
        return { ...commit(state, { columns }) };
      }
      case 'select': {
        const mode = action.mode ?? 'replace';
        if (mode === 'replace') return { ...state, selection: new Set(action.nodes) };
        const selection = new Set(state.selection);
        for (const i of action.nodes) {
          if (mode === 'toggle' && selection.has(i)) selection.delete(i);
          else selection.add(i);
        }
        return { ...state, selection };
      }
      case 'trace': {
        if (!action.trace) return { ...state, trace: null };
        const touched = traceNodes(project, action.trace);
        const capped = touched.size > TRACE_LIMIT ? new Set([...touched].slice(0, TRACE_LIMIT)) : touched;
        const visible = new Set(state.visible);
        let grew = false;
        for (const i of capped) {
          if (!visible.has(i)) {
            visible.add(i);
            grew = true;
          }
        }
        let columns = state.columns;
        if (action.trace.kind === 'column') {
          columns = new Set(state.columns);
          for (const i of capped) if (project.columnsOf(i).length) columns.add(i);
        }
        const changed = grew || columns !== state.columns;
        const next = { trace: action.trace, visible, columns };
        return changed ? commit(state, next) : { ...state, ...next };
      }
      case 'color':
        return { ...state, colorBy: action.mode, hiddenKeys: new Set() };
      case 'toggleKey': {
        const hiddenKeys = new Set(state.hiddenKeys);
        if (hiddenKeys.has(action.key)) hiddenKeys.delete(action.key);
        else hiddenKeys.add(action.key);
        return { ...state, hiddenKeys, revision: state.revision + 1 };
      }
      case 'layout':
        return {
          ...state,
          layout: action.layout ?? state.layout,
          direction: action.direction ?? state.direction,
          revision: state.revision + 1,
        };
      case 'inspector':
        return { ...state, inspector: action.tab };
      case 'undo': {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          ...state,
          ...previous,
          past: state.past.slice(0, -1),
          future: [snapshot(state), ...state.future].slice(0, 50),
          revision: state.revision + 1,
        };
      }
      case 'redo': {
        const next = state.future[0];
        if (!next) return state;
        return {
          ...state,
          ...next,
          past: [...state.past, snapshot(state)],
          future: state.future.slice(1),
          revision: state.revision + 1,
        };
      }
      default:
        return state;
    }
  };
}

export function initialState(
  project: Project,
  options: { focus?: number; up?: number; down?: number; color?: string; columns?: boolean; all?: boolean },
): ViewState {
  const base: ViewState = {
    visible: new Set(),
    columns: new Set(),
    focus: null,
    selection: new Set(),
    trace: null,
    colorBy: options.color ?? 'layer',
    hiddenKeys: new Set(),
    layout: 'flow',
    direction: 'LR',
    depthUp: options.up ?? 2,
    depthDown: options.down ?? 2,
    past: [],
    future: [],
    revision: 0,
    inspector: 'details',
  };
  if (options.focus !== undefined && options.focus >= 0) {
    const visible = neighbourhood(project, options.focus, base.depthUp, base.depthDown);
    return {
      ...base,
      visible,
      focus: options.focus,
      selection: new Set([options.focus]),
      columns: options.columns ? new Set([options.focus]) : new Set(),
    };
  }
  if (options.all || project.nodes.length <= 160) {
    return { ...base, visible: new Set(project.nodes.map((_, i) => i)), layout: project.nodes.length > 60 ? 'layers' : 'flow' };
  }
  // Large projects open on the most depended-on model and its neighbourhood.
  const keystone = project.payload.summary.keystones[0];
  const start = keystone ? project.idx(keystone) : 0;
  return { ...base, visible: neighbourhood(project, start, 2, 2), focus: start, selection: new Set([start]) };
}
