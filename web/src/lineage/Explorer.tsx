import {
  Background,
  BackgroundVariant,
  type Edge,
  MarkerType,
  MiniMap,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApp } from '../app/context';
import { type CanvasActions, columnMenu, nodeMenu } from '../app/menus';
import { writeHash } from '../data/router';
import type { LineumNode } from '../types';
import { Icon } from '../ui/icons';
import type { MenuEntry } from '../ui/Menu';
import { type ColorValue, colorModes } from './colors';
import { Inspector } from './Inspector';
import { layoutGraph } from './layout';
import { Legend } from './Legend';
import { CardContext, type CardData, type CardHandlers, type CardNode, type ColumnMark, NodeCard } from './NodeCard';
import { createReducer, initialState, type Trace, type TraceDirection, traceNodes } from './state';

export interface ExplorerInit {
  focus?: string;
  up?: number;
  down?: number;
  trace?: TraceDirection;
  column?: string;
  color?: string;
  columns?: boolean;
  all?: boolean;
}

interface ExplorerProps {
  init: ExplorerInit;
  embedded?: boolean;
  syncHash?: boolean;
}

const nodeTypes = { card: NodeCard };
const TRANSFORM_CLASS: Record<string, string> = { d: 'direct', r: 'renamed', x: 'derived', a: 'aggregated' };

function testStatus(node: LineumNode): CardData['tests'] {
  const tests = node.tests ?? [];
  if (!tests.length) return 'none';
  if (tests.some((t) => t.status === 'fail' || t.status === 'error')) return 'fail';
  if (tests.some((t) => t.status === 'warn')) return 'warn';
  return 'pass';
}

function subtitle(node: LineumNode): string {
  switch (node.type) {
    case 'source':
      return node.relation ?? 'source';
    case 'exposure':
      return (node.x?.exposure_type as string) ?? 'exposure';
    case 'metric':
      return `${(node.x?.metric_type as string) ?? ''} metric`.trim();
    case 'semantic_model':
      return 'semantic model';
    default:
      return [node.materialized, node.schema].filter(Boolean).join(' in ');
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('.menu, .palette, .dialog');
}

function ExplorerInner({ init, embedded = false, syncHash = false }: ExplorerProps) {
  const api = useApp();
  const { project } = api;
  const flow = useReactFlow();
  const reducer = useMemo(() => createReducer(project), [project]);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(project, {
      focus: init.focus ? project.idx(init.focus) : undefined,
      up: init.up,
      down: init.down,
      color: init.color,
      columns: init.columns,
      all: init.all,
    }),
  );
  const [hover, setHover] = useState<number | null>(null);
  const [manual, setManual] = useState<Map<number, { x: number; y: number }>>(new Map());
  const [allColumns, setAllColumns] = useState<Set<number>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  // On narrow screens the inspector overlays the canvas, so it starts closed there.
  const [inspectorOpen, setInspectorOpen] = useState(() => !embedded && window.innerWidth > 900);
  const wrapper = useRef<HTMLDivElement>(null);
  const modes = useMemo(() => colorModes(project), [project]);
  const mode = modes.find((m) => m.id === state.colorBy) ?? modes[0];
  const values = useMemo<ColorValue[]>(() => project.nodes.map((node, i) => mode.value(node, i)), [project, mode]);

  // Apply a trace from the URL once, after the first render.
  useEffect(() => {
    if (!init.focus || !init.trace) return;
    const node = project.idx(init.focus);
    if (node < 0) return;
    dispatch({
      type: 'trace',
      trace: init.column ? { kind: 'column', node, column: init.column, direction: init.trace } : { kind: 'node', node, direction: init.trace },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    if (!state.hiddenKeys.size) return state.visible;
    return new Set([...state.visible].filter((i) => !state.hiddenKeys.has(values[i].key)));
  }, [state.visible, state.hiddenKeys, values]);

  const boxes = useMemo(
    () => layoutGraph(project, shown, state.columns, state.layout, state.direction, allColumns),
    [project, shown, state.columns, state.layout, state.direction, allColumns],
  );

  useEffect(() => setManual(new Map()), [boxes]);

  // Trace: which nodes, node edges, column marks and column edges it lights up.
  const trace = useMemo(() => {
    if (!state.trace) return null;
    const t = state.trace;
    const nodes = traceNodes(project, t);
    const marks = new Map<number, Map<string, ColumnMark>>();
    const columnEdges = new Set<string>();
    let up = new Set<number>();
    let down = new Set<number>();
    if (t.kind === 'node') {
      up = new Set(t.direction !== 'down' ? project.walk(t.node, 'up').keys() : []);
      down = new Set(t.direction !== 'up' ? project.walk(t.node, 'down').keys() : []);
    }
    if (t.kind === 'column') {
      const result = project.traceColumn(t.node, t.column, t.direction);
      for (const [key, distance] of result.columns) {
        const [n, c] = key.split('|');
        const node = Number(n);
        if (!marks.has(node)) marks.set(node, new Map());
        marks.get(node)!.set(c, distance === 0 ? 'subject' : distance < 0 ? 'up' : 'down');
        if (distance < 0) up.add(node);
        if (distance > 0) down.add(node);
      }
      for (const e of result.edges) columnEdges.add(`${e.from}|${e.fromCol.toLowerCase()}|${e.to}|${e.toCol.toLowerCase()}`);
    }
    const subject = t.kind === 'path' ? t.from : t.node;
    return { trace: t, nodes, marks, columnEdges, up, down, subject };
  }, [project, state.trace]);

  const hoverInfo = useMemo(() => {
    if (hover === null || trace) return null;
    return { parents: new Set(project.parents[hover]), children: new Set(project.children[hover]) };
  }, [hover, trace, project]);

  const handlers = useMemo<CardHandlers>(
    () => ({
      expand: (index, direction) => dispatch({ type: 'expand', node: index, direction, depth: 1 }),
      columnMenu: (event, index, column) => {
        event.preventDefault();
        event.stopPropagation();
        api.openMenu(event, columnMenu(api, project.nodes[index], column, actionsRef.current));
      },
      columnClick: (index, column, event) => {
        event.stopPropagation();
        dispatch({ type: 'trace', trace: { kind: 'column', node: index, column, direction: 'both' } });
      },
      showAllColumns: (index) => setAllColumns((current) => new Set(current).add(index)),
    }),
    [api, project],
  );

  const nodes = useMemo<CardNode[]>(() => {
    const result: CardNode[] = [];
    for (const i of shown) {
      const node = project.nodes[i];
      const box = boxes.get(i);
      if (!box) continue;
      const position = manual.get(i) ?? { x: box.x, y: box.y };
      let role: CardData['role'] = null;
      if (trace) role = trace.nodes.has(i) ? (i === trace.subject ? 'focus' : 'trace') : 'dim';
      else if (hoverInfo) role = hoverInfo.parents.has(i) ? 'hover-up' : hoverInfo.children.has(i) ? 'hover-down' : null;
      if (!trace && state.focus === i) role = 'focus';
      const linked = new Set<string>();
      if (state.columns.has(i)) {
        for (const column of node.columns ?? []) {
          const key = column.name.toLowerCase();
          if (project.columnIn(i, column.name).some((e) => shown.has(e.from)) || project.columnOut(i, column.name).some((e) => shown.has(e.to))) linked.add(key);
        }
      }
      result.push({
        id: String(i),
        type: 'card',
        position,
        width: box.width,
        height: box.height,
        selected: state.selection.has(i),
        data: {
          index: i,
          node,
          title: project.displayName(node),
          subtitle: subtitle(node),
          color: values[i].color,
          hiddenUp: project.parents[i].filter((p) => !shown.has(p)).length,
          hiddenDown: project.children[i].filter((c) => !shown.has(c)).length,
          showColumns: state.columns.has(i),
          allColumns: allColumns.has(i),
          columns: node.columns ?? [],
          marks: trace?.marks.get(i) ?? null,
          linked,
          role,
          critical: !!node.m.critical && state.colorBy === 'run',
          direction: state.direction,
          tests: testStatus(node),
        },
      });
    }
    return result;
  }, [shown, boxes, manual, project, trace, hoverInfo, state.focus, state.columns, state.selection, state.colorBy, state.direction, values, allColumns]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    const marker = (color: string) => ({ type: MarkerType.ArrowClosed, width: 14, height: 14, color });
    for (const i of shown) {
      for (const j of project.children[i]) {
        if (!shown.has(j)) continue;
        let className = 'edge';
        let color = 'var(--edge)';
        if (trace) {
          const onTrace =
            trace.trace.kind === 'node'
              ? (trace.up.has(i) || i === trace.subject) && (trace.up.has(j) || j === trace.subject)
                ? 'up'
                : (trace.down.has(i) || i === trace.subject) && (trace.down.has(j) || j === trace.subject)
                  ? 'down'
                  : null
              : trace.nodes.has(i) && trace.nodes.has(j)
                ? 'path'
                : null;
          if (onTrace && trace.trace.kind !== 'column') {
            className += ` edge-trace edge-trace-${onTrace}`;
            color = 'var(--ln-color-accent)';
          } else if (onTrace) className += ' edge-soft';
          else className += ' edge-dim';
        } else if (hover !== null && (i === hover || j === hover)) {
          const up = j === hover;
          className += up ? ' edge-hover-up' : ' edge-hover-down';
          color = up ? 'var(--ln-color-upstream)' : 'var(--ln-color-downstream)';
        }
        if (state.columns.has(i) && state.columns.has(j)) className += ' edge-soft';
        result.push({
          id: `n${i}-${j}`,
          source: String(i),
          target: String(j),
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'smoothstep',
          pathOptions: { borderRadius: 14, offset: 18 },
          className,
          markerEnd: marker(color),
          focusable: false,
        } as Edge);
      }
    }
    // Column edges: drawn when the target node shows its columns.
    for (const edge of project.columnEdges) {
      if (!shown.has(edge.from) || !shown.has(edge.to)) continue;
      const fromCols = state.columns.has(edge.from);
      const toCols = state.columns.has(edge.to);
      if (!fromCols && !toCols) continue;
      const key = `${edge.from}|${edge.fromCol.toLowerCase()}|${edge.to}|${edge.toCol.toLowerCase()}`;
      const traced = trace?.columnEdges.has(key);
      if (trace && trace.trace.kind === 'column' && !traced) {
        if (!(fromCols && toCols)) continue;
      }
      result.push({
        id: `c${key}`,
        source: String(edge.from),
        target: String(edge.to),
        sourceHandle: fromCols ? `out:${edge.fromCol.toLowerCase()}` : 'out',
        targetHandle: toCols ? `in:${edge.toCol.toLowerCase()}` : 'in',
        type: 'default',
        className: `col-edge col-${TRANSFORM_CLASS[edge.kind]}${traced ? ' edge-trace' : trace?.trace.kind === 'column' ? ' edge-dim' : ''}`,
        focusable: false,
        zIndex: traced ? 2 : 1,
      } as Edge);
    }
    return result;
  }, [shown, project, trace, hover, state.columns]);

  // Fit the view whenever the canvas content changes.
  const revisionRef = useRef(-1);
  useEffect(() => {
    if (revisionRef.current === state.revision) return;
    revisionRef.current = state.revision;
    const frame = requestAnimationFrame(() => {
      const focusNodes = trace && trace.nodes.size < shown.size ? [...trace.nodes].filter((i) => shown.has(i)).map((i) => ({ id: String(i) })) : undefined;
      flow.fitView({ padding: 0.14, duration: revisionRef.current === 0 ? 0 : 320, maxZoom: 1.25, nodes: focusNodes });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.revision, boxes, flow, trace, shown]);

  // Keep the URL in step so a view can be shared.
  useEffect(() => {
    if (!syncHash) return;
    const params = new URLSearchParams();
    if (state.focus !== null) {
      params.set('focus', project.nodes[state.focus].id);
      params.set('up', String(state.depthUp));
      params.set('down', String(state.depthDown));
    }
    if (state.trace && state.trace.kind !== 'path') {
      params.set('trace', state.trace.direction);
      if (state.focus === null || state.trace.node !== state.focus) params.set('focus', project.nodes[state.trace.node].id);
      if (state.trace.kind === 'column') params.set('col', state.trace.column);
    }
    if (state.colorBy !== 'layer') params.set('color', state.colorBy);
    writeHash(params);
  }, [syncHash, state.focus, state.depthUp, state.depthDown, state.trace, state.colorBy, project]);

  const selected = useMemo(() => [...state.selection].filter((i) => state.visible.has(i)), [state.selection, state.visible]);

  const actions = useMemo<CanvasActions>(
    () => ({
      focus: (id) => dispatch({ type: 'focus', node: project.idx(id) }),
      expand: (id, direction, depth) => dispatch({ type: 'expand', node: project.idx(id), direction, depth }),
      trace: (id, direction) => dispatch({ type: 'trace', trace: { kind: 'node', node: project.idx(id), direction } }),
      traceColumn: (id, column, direction) => dispatch({ type: 'trace', trace: { kind: 'column', node: project.idx(id), column, direction } }),
      clearTrace: () => dispatch({ type: 'trace', trace: null }),
      select: (ids, selectMode) => dispatch({ type: 'select', nodes: ids.map((id) => project.idx(id)), mode: selectMode }),
      selectRelated: (id, direction) => {
        const i = project.idx(id);
        const related = new Set<number>([i]);
        if (direction !== 'down') for (const j of project.walk(i, 'up').keys()) related.add(j);
        if (direction !== 'up') for (const j of project.walk(i, 'down').keys()) related.add(j);
        dispatch({ type: 'add', nodes: [...related] });
        dispatch({ type: 'select', nodes: [...related] });
      },
      selectSame: (id) => {
        const key = values[project.idx(id)].key;
        dispatch({ type: 'select', nodes: [...state.visible].filter((i) => values[i].key === key) });
      },
      hide: (ids) => dispatch({ type: 'hide', nodes: ids.map((id) => project.idx(id)) }),
      hideRelated: (id, direction) => dispatch({ type: 'hide', nodes: [...project.walk(project.idx(id), direction).keys()] }),
      isolate: (id) => {
        const i = project.idx(id);
        dispatch({ type: 'only', nodes: [i, ...project.walk(i, 'up').keys(), ...project.walk(i, 'down').keys()].filter((j) => state.visible.has(j)) });
      },
      toggleColumns: (id) => dispatch({ type: 'columns', nodes: [project.idx(id)] }),
      showingColumns: (id) => state.columns.has(project.idx(id)),
      pathFrom: () => {
        const other = selected.length ? project.nodes[selected[selected.length - 1]].id : null;
        return other;
      },
      showPath: (from, to) => {
        const a = project.idx(from);
        const b = project.idx(to);
        const forward = project.between(a, b);
        const trace: Trace = forward.size ? { kind: 'path', from: a, to: b } : { kind: 'path', from: b, to: a };
        if (!traceNodes(project, trace).size) {
          api.toast(`No path connects ${project.nodes[a].name} and ${project.nodes[b].name}.`);
          return;
        }
        dispatch({ type: 'trace', trace });
      },
      impact: (id) => {
        const i = project.idx(id);
        dispatch({ type: 'select', nodes: [i] });
        dispatch({ type: 'trace', trace: { kind: 'node', node: i, direction: 'down' } });
        dispatch({ type: 'inspector', tab: 'impact' });
        setInspectorOpen(true);
      },
      colorLabel: mode.label,
    }),
    [project, values, state.visible, state.columns, selected, mode.label, api],
  );
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) => {
      let selection: Set<number> | null = null;
      const moved = new Map<number, { x: number; y: number }>();
      for (const change of changes) {
        if (change.type === 'select') {
          selection ??= new Set(state.selection);
          const i = Number(change.id);
          if (change.selected) selection.add(i);
          else selection.delete(i);
        } else if (change.type === 'position' && change.position) {
          moved.set(Number(change.id), change.position);
        }
      }
      if (selection) dispatch({ type: 'select', nodes: [...selection] });
      if (moved.size) setManual((current) => new Map([...current, ...moved]));
    },
    [state.selection],
  );

  const paneMenu = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const visibleNodes = [...state.visible].map((i) => project.nodes[i]);
      const entries: MenuEntry[] = [
        { heading: 'Canvas', detail: `${state.visible.size} of ${project.nodes.length} nodes` },
        { label: 'Add a node…', icon: <Icon.search size={14} />, hint: '⌘K', onSelect: () => api.openPalette('add') },
        { label: 'Fit to screen', icon: <Icon.fit size={14} />, hint: '0', onSelect: () => flow.fitView({ padding: 0.14, duration: 300 }) },
        { label: 'Lay out again', icon: <Icon.layout size={14} />, hint: 'L', onSelect: () => dispatch({ type: 'layout' }) },
        {
          label: 'Layout',
          children: [
            { label: 'Flow', checked: state.layout === 'flow', onSelect: () => dispatch({ type: 'layout', layout: 'flow' }) },
            { label: 'Bands by layer', checked: state.layout === 'layers', onSelect: () => dispatch({ type: 'layout', layout: 'layers' }) },
            { separator: true },
            { label: 'Left to right', checked: state.direction === 'LR', onSelect: () => dispatch({ type: 'layout', direction: 'LR' }) },
            { label: 'Top to bottom', checked: state.direction === 'TB', onSelect: () => dispatch({ type: 'layout', direction: 'TB' }) },
          ],
        },
        {
          label: 'Color by',
          children: modes.map((m) => ({ label: m.label, checked: m.id === state.colorBy, onSelect: () => dispatch({ type: 'color', mode: m.id }) })),
        },
        { separator: true },
        { label: 'Show every node', disabled: state.visible.size === project.nodes.length, onSelect: () => dispatch({ type: 'showAll' }) },
        {
          label: 'Show columns on every node',
          onSelect: () => dispatch({ type: 'columns', nodes: [...state.visible], show: true }),
        },
        { label: 'Hide all columns', disabled: !state.columns.size, onSelect: () => dispatch({ type: 'columns', nodes: [...state.columns], show: false }) },
        { label: 'Clear trace', disabled: !state.trace, hint: 'Esc', onSelect: () => dispatch({ type: 'trace', trace: null }) },
        { separator: true },
        { label: 'Undo', icon: <Icon.undo size={14} />, hint: '⌘Z', disabled: !state.past.length, onSelect: () => dispatch({ type: 'undo' }) },
        { label: 'Redo', icon: <Icon.redo size={14} />, hint: '⇧⌘Z', disabled: !state.future.length, onSelect: () => dispatch({ type: 'redo' }) },
        { separator: true },
        {
          label: 'Export view',
          icon: <Icon.download size={14} />,
          children: [
            {
              label: 'Copy dbt selector',
              onSelect: () =>
                api.copy(
                  visibleNodes
                    .filter((n) => ['model', 'seed', 'snapshot', 'source', 'exposure', 'metric'].includes(n.type))
                    .map((n) => project.selector(n))
                    .join(' '),
                  'selector',
                ),
            },
            { label: 'Copy as Mermaid', onSelect: () => api.copy(mermaid(project, state.visible), 'Mermaid diagram') },
            { label: 'Copy link to this view', onSelect: () => api.copy(window.location.href, 'link') },
          ],
        },
        { label: 'Keyboard shortcuts', icon: <Icon.keyboard size={14} />, hint: '?', onSelect: () => setShowHelp(true) },
      ];
      api.openMenu(event, entries, 'Canvas');
    },
    [api, flow, modes, project, state],
  );

  const selectionMenu = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (selected.length === 1) {
        api.openMenu(event, nodeMenu(api, project.nodes[selected[0]], actions));
        return;
      }
      const ids = selected.map((i) => project.nodes[i].id);
      const entries: MenuEntry[] = [
        { heading: `${selected.length} nodes selected` },
        { label: 'Show columns', icon: <Icon.columns size={14} />, hint: 'C', onSelect: () => dispatch({ type: 'columns', nodes: selected, show: true }) },
        { label: 'Show only these', onSelect: () => dispatch({ type: 'only', nodes: selected }) },
        { label: 'Hide these', icon: <Icon.hide size={14} />, hint: 'H', onSelect: () => dispatch({ type: 'hide', nodes: selected }) },
        { label: 'Expand parents of all', tone: 'up', onSelect: () => selected.forEach((i) => dispatch({ type: 'expand', node: i, direction: 'up', depth: 1 })) },
        { label: 'Expand children of all', tone: 'down', onSelect: () => selected.forEach((i) => dispatch({ type: 'expand', node: i, direction: 'down', depth: 1 })) },
      ];
      if (selected.length === 2) entries.push({ label: 'Paths between the two', icon: <Icon.path size={14} />, onSelect: () => actions.showPath(ids[0], ids[1]) });
      entries.push(
        { separator: true },
        { label: 'Copy names', icon: <Icon.copy size={14} />, onSelect: () => api.copy(selected.map((i) => project.displayName(project.nodes[i])).join('\n'), 'names') },
        { label: 'Copy dbt selector', onSelect: () => api.copy(selected.map((i) => project.selector(project.nodes[i])).join(' '), 'selector') },
      );
      api.openMenu(event, entries);
    },
    [actions, api, project, selected],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const target: HTMLElement | Window = embedded ? wrapper.current! : window;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key;
      const one = selected.length === 1 ? selected[0] : null;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };
      if (meta && key.toLowerCase() === 'z') return run(() => dispatch({ type: event.shiftKey ? 'redo' : 'undo' }));
      if (meta && key.toLowerCase() === 'y') return run(() => dispatch({ type: 'redo' }));
      if (meta && key.toLowerCase() === 'a') return run(() => dispatch({ type: 'select', nodes: [...shown] }));
      if (meta && key.toLowerCase() === 'i') return run(() => dispatch({ type: 'select', nodes: [...shown].filter((i) => !state.selection.has(i)) }));
      if (meta || event.altKey) return;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (!selected.length) return;
        const direction = key === 'ArrowLeft' ? 'up' : 'down';
        return run(() => {
          const next = new Set<number>();
          for (const i of selected) {
            if (event.shiftKey) for (const j of project.walk(i, direction).keys()) next.add(j);
            else for (const j of direction === 'up' ? project.parents[i] : project.children[i]) next.add(j);
          }
          if (!next.size) return;
          dispatch({ type: 'add', nodes: [...next] });
          dispatch({ type: 'select', nodes: [...next] });
        });
      }
      switch (key) {
        case 'Escape':
          if (state.trace) return run(() => dispatch({ type: 'trace', trace: null }));
          if (state.selection.size) return run(() => dispatch({ type: 'select', nodes: [] }));
          return;
        case '[':
          return run(() => selected.forEach((i) => dispatch({ type: 'expand', node: i, direction: 'up', depth: 1 })));
        case ']':
          return run(() => selected.forEach((i) => dispatch({ type: 'expand', node: i, direction: 'down', depth: 1 })));
        case 't':
        case 'T':
          if (one !== null) return run(() => dispatch({ type: 'trace', trace: { kind: 'node', node: one, direction: 'both' } }));
          if (selected.length === 2) return run(() => actions.showPath(project.nodes[selected[0]].id, project.nodes[selected[1]].id));
          return;
        case 'c':
        case 'C':
          if (selected.length) return run(() => dispatch({ type: 'columns', nodes: selected }));
          return;
        case 'h':
        case 'H':
        case 'Delete':
        case 'Backspace':
          if (selected.length) return run(() => dispatch({ type: 'hide', nodes: selected }));
          return;
        case 'f':
        case 'F':
          if (one !== null) return run(() => dispatch({ type: 'focus', node: one }));
          return;
        case 'i':
        case 'I':
          if (one !== null) return run(() => actions.impact(project.nodes[one].id));
          return;
        case 'Enter':
          if (one !== null) return run(() => api.navigate({ kind: 'resource', id: project.nodes[one].id }));
          return;
        case '0':
        case 'Home':
          return run(() => flow.fitView({ padding: 0.14, duration: 300 }));
        case 'l':
        case 'L':
          return run(() => dispatch({ type: 'layout' }));
        case '?':
          return run(() => setShowHelp((v) => !v));
        default:
      }
    };
    target.addEventListener('keydown', onKey as EventListener);
    return () => target.removeEventListener('keydown', onKey as EventListener);
  }, [actions, api, embedded, flow, project, selected, shown, state.selection, state.trace]);

  // The command palette asks the canvas to show or add a node.
  useEffect(() => {
    const onCanvas = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; mode: 'add' | 'focus' }>).detail;
      const i = project.idx(detail.id);
      if (i < 0) return;
      if (detail.mode === 'focus') dispatch({ type: 'focus', node: i });
      else dispatch({ type: 'add', nodes: [i], select: true });
    };
    window.addEventListener('lineum:canvas', onCanvas);
    return () => window.removeEventListener('lineum:canvas', onCanvas);
  }, [project]);

  const traceLabel = useMemo(() => {
    if (!state.trace) return null;
    const t = state.trace;
    if (t.kind === 'path') return `Paths from ${project.displayName(project.nodes[t.from])} to ${project.displayName(project.nodes[t.to])}`;
    const name = project.displayName(project.nodes[t.node]) + (t.kind === 'column' ? `.${t.column}` : '');
    const dir = t.direction === 'up' ? 'upstream' : t.direction === 'down' ? 'downstream' : 'both ways';
    return `Tracing ${name} ${dir}`;
  }, [state.trace, project]);

  const hiddenTotal = project.nodes.length - shown.size;

  return (
    <CardContext.Provider value={handlers}>
      <div className={`explorer${embedded ? ' is-embedded' : ''}`} ref={wrapper} tabIndex={embedded ? 0 : -1}>
        <div className="explorer-canvas">
          <ReactFlow<CardNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeMouseEnter={(_, node) => setHover(Number(node.id))}
            onNodeMouseLeave={() => setHover(null)}
            onNodeDoubleClick={(_, node) => dispatch({ type: 'focus', node: Number(node.id) })}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              const i = Number(node.id);
              if (!state.selection.has(i)) dispatch({ type: 'select', nodes: [i] });
              if (state.selection.has(i) && state.selection.size > 1) selectionMenu(event);
              else api.openMenu(event, nodeMenu(api, project.nodes[i], actions));
            }}
            onSelectionContextMenu={(event) => {
              event.preventDefault();
              selectionMenu(event);
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              paneMenu(event);
            }}
            onPaneClick={() => dispatch({ type: 'select', nodes: [] })}
            minZoom={0.05}
            maxZoom={2.5}
            nodesConnectable={false}
            edgesFocusable={false}
            elementsSelectable
            selectionKeyCode="Shift"
            multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
            deleteKeyCode={null}
            onlyRenderVisibleElements={nodes.length > 250}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--ln-color-grid)" />
            {!embedded && (
              <MiniMap
                pannable
                zoomable
                className="minimap"
                nodeColor={(n) => (n.data as CardData).color}
                nodeStrokeWidth={0}
                maskColor="var(--minimap-mask)"
              />
            )}
          </ReactFlow>
          <Toolbar
            embedded={embedded}
            state={state}
            dispatch={dispatch}
            modes={modes}
            onFit={() => flow.fitView({ padding: 0.14, duration: 300 })}
            onHelp={() => setShowHelp(true)}
            onAdd={() => api.openPalette('add')}
            inspectorOpen={inspectorOpen}
            onInspector={() => setInspectorOpen((v) => !v)}
          />
          <Legend mode={mode} values={values} visible={state.visible} hiddenKeys={state.hiddenKeys} dispatch={dispatch} compact={embedded} />
          <div className="explorer-status" role="status">
            {traceLabel ? (
              <span className="status-trace">
                <span className="status-dye" />
                {traceLabel}
                <button type="button" className="link-button" onClick={() => dispatch({ type: 'trace', trace: null })}>
                  Clear
                </button>
              </span>
            ) : (
              <span>
                {shown.size} of {project.nodes.length} nodes
                {hiddenTotal > 0 && !embedded ? ', right-click the canvas to show more' : ''}
              </span>
            )}
          </div>
          {embedded && (
            <a className="explorer-open button button-quiet" href={api.router.href({ kind: 'lineage' }, init.focus ? `focus=${encodeURIComponent(init.focus)}&up=2&down=2` : '')}>
              <Icon.lineage size={14} /> Open full explorer
            </a>
          )}
        </div>
        {!embedded && inspectorOpen && (
          <Inspector
            selected={selected}
            state={state}
            dispatch={dispatch}
            actions={actions}
            mode={mode}
            values={values}
            onClose={() => setInspectorOpen(false)}
          />
        )}
        {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
      </div>
    </CardContext.Provider>
  );
}

function mermaid(project: ReturnType<typeof useApp>['project'], visible: Set<number>): string {
  const safe = (i: number) => `n${i}`;
  const lines = ['flowchart LR'];
  for (const i of visible) lines.push(`  ${safe(i)}["${project.displayName(project.nodes[i]).replace(/"/g, "'")}"]`);
  for (const i of visible) for (const j of project.children[i]) if (visible.has(j)) lines.push(`  ${safe(i)} --> ${safe(j)}`);
  return lines.join('\n');
}

interface ToolbarProps {
  embedded: boolean;
  state: ReturnType<typeof initialState>;
  dispatch: React.Dispatch<Parameters<ReturnType<typeof createReducer>>[1]>;
  modes: ReturnType<typeof colorModes>;
  onFit(): void;
  onHelp(): void;
  onAdd(): void;
  inspectorOpen: boolean;
  onInspector(): void;
}

function Toolbar({ embedded, state, dispatch, modes, onFit, onHelp, onAdd, inspectorOpen, onInspector }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Lineage tools">
      {!embedded && (
        <button type="button" className="tool tool-wide" onClick={onAdd} title="Find a node and add it to the canvas (⌘K)">
          <Icon.search size={14} />
          <span>Add node</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
      )}
      {state.focus !== null && (
        <div className="tool-group" title="Levels shown around the focused node">
          <span className="tool-label tone-up">Up</span>
          <button type="button" className="tool" aria-label="Fewer levels upstream" onClick={() => dispatch({ type: 'depth', up: state.depthUp - 1 })} disabled={state.depthUp <= 0}>
            −
          </button>
          <span className="tool-value">{state.depthUp}</span>
          <button type="button" className="tool" aria-label="More levels upstream" onClick={() => dispatch({ type: 'depth', up: state.depthUp + 1 })}>
            +
          </button>
          <span className="tool-label tone-down">Down</span>
          <button type="button" className="tool" aria-label="Fewer levels downstream" onClick={() => dispatch({ type: 'depth', down: state.depthDown - 1 })} disabled={state.depthDown <= 0}>
            −
          </button>
          <span className="tool-value">{state.depthDown}</span>
          <button type="button" className="tool" aria-label="More levels downstream" onClick={() => dispatch({ type: 'depth', down: state.depthDown + 1 })}>
            +
          </button>
        </div>
      )}
      <label className="tool-select" title="Color nodes by">
        <span className="visually-hidden">Color by</span>
        <span className="swatch-stack" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <select value={state.colorBy} onChange={(event) => dispatch({ type: 'color', mode: event.target.value })}>
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="tool-group">
        <button type="button" className={`tool${state.layout === 'flow' ? ' is-on' : ''}`} onClick={() => dispatch({ type: 'layout', layout: 'flow' })} title="Flow layout">
          Flow
        </button>
        <button type="button" className={`tool${state.layout === 'layers' ? ' is-on' : ''}`} onClick={() => dispatch({ type: 'layout', layout: 'layers' })} title="Bands by layer">
          Layers
        </button>
      </div>
      <div className="tool-group">
        <button type="button" className="tool" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Undo (⌘Z)" aria-label="Undo">
          <Icon.undo size={14} />
        </button>
        <button type="button" className="tool" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Redo (⇧⌘Z)" aria-label="Redo">
          <Icon.redo size={14} />
        </button>
        <button type="button" className="tool" onClick={onFit} title="Fit to screen (0)" aria-label="Fit to screen">
          <Icon.fit size={14} />
        </button>
        {!embedded && (
          <button type="button" className="tool" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            <Icon.keyboard size={14} />
          </button>
        )}
        {!embedded && (
          <button type="button" className={`tool${inspectorOpen ? ' is-on' : ''}`} onClick={onInspector} title="Inspector panel" aria-label="Toggle inspector">
            <Icon.columns size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Right-click', 'Menu for a node, a column, a selection or the canvas'],
  ['Click, ⇧-click', 'Select, add to selection'],
  ['⇧-drag', 'Select an area'],
  ['Double-click', 'Focus on a node'],
  ['← / →', 'Select parents / children'],
  ['⇧← / ⇧→', 'Select everything upstream / downstream'],
  ['[ / ]', 'Show parents / children of the selection'],
  ['T', 'Trace the selected node (two selected: paths between them)'],
  ['C', 'Show or hide columns'],
  ['Click a column', 'Trace that column'],
  ['I', 'Impact analysis'],
  ['F', 'Focus on the selected node'],
  ['H or Delete', 'Hide the selection'],
  ['↵', 'Open documentation'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘A / ⌘I', 'Select all / invert selection'],
  ['0', 'Fit to screen'],
  ['L', 'Lay out again'],
  ['Esc', 'Clear the trace, then the selection'],
];

function Shortcuts({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Lineage shortcuts</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon.close size={14} />
          </button>
        </div>
        <dl className="shortcuts">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key}>
              <dt>
                <kbd className="kbd">{key}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function Explorer(props: ExplorerProps) {
  return (
    <ReactFlowProvider>
      <ExplorerInner {...props} />
    </ReactFlowProvider>
  );
}
