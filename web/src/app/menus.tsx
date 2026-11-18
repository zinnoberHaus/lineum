import type { Project } from '../data/project';
import { TYPE_LABEL } from '../data/project';
import type { LineumNode } from '../types';
import { Icon } from '../ui/icons';
import type { MenuEntry, MenuItem } from '../ui/Menu';
import type { AppApi } from './context';

/** Actions only the lineage canvas can perform; elsewhere the menu offers "open in explorer" instead. */
export interface CanvasActions {
  focus(id: string): void;
  expand(id: string, direction: 'up' | 'down', depth: number): void;
  trace(id: string, direction: 'up' | 'down' | 'both'): void;
  traceColumn(id: string, column: string, direction: 'up' | 'down' | 'both'): void;
  clearTrace(): void;
  select(ids: string[], mode?: 'replace' | 'add'): void;
  selectRelated(id: string, direction: 'up' | 'down' | 'both'): void;
  selectSame(id: string): void;
  hide(ids: string[]): void;
  hideRelated(id: string, direction: 'up' | 'down'): void;
  isolate(id: string): void;
  toggleColumns(id: string): void;
  showingColumns(id: string): boolean;
  pathFrom(): string | null;
  showPath(from: string, to: string): void;
  impact(id: string): void;
  colorLabel: string;
}

function quoteSql(name: string) {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

export function queryFor(project: Project, node: LineumNode): string | null {
  const table = project.dataTable(node);
  if (!table) return null;
  return `select *\nfrom ${table}\nlimit 100`;
}

function copyMenu(api: AppApi, node: LineumNode): MenuItem {
  const project = api.project;
  const items: MenuEntry[] = [
    { label: 'Name', hint: node.name.length > 22 ? undefined : node.name, onSelect: () => api.copy(node.name, 'name') },
    { label: 'Unique ID', onSelect: () => api.copy(node.id, 'unique ID') },
  ];
  if (['model', 'seed', 'snapshot', 'source'].includes(node.type)) {
    items.push({ label: node.type === 'source' ? 'source() call' : 'ref() call', onSelect: () => api.copy(project.refCall(node), 'reference') });
  }
  if (node.relation) items.push({ label: 'Relation name', onSelect: () => api.copy(node.relation!, 'relation') });
  items.push(
    { separator: true },
    { label: 'dbt selector, this node', onSelect: () => api.copy(project.selector(node), 'selector') },
    { label: 'dbt selector, with upstream', onSelect: () => api.copy(`+${project.selector(node)}`, 'selector') },
    { label: 'dbt selector, with downstream', onSelect: () => api.copy(`${project.selector(node)}+`, 'selector') },
    {
      label: 'dbt build command for downstream',
      onSelect: () => api.copy(`dbt build --select ${project.selector(node)}+`, 'command'),
    },
    { separator: true },
    { label: 'Link to this page', onSelect: () => api.copy(api.router.href({ kind: 'resource', id: node.id }), 'link') },
  );
  return { label: 'Copy', icon: <Icon.copy size={14} />, children: items };
}

function analyzeMenu(api: AppApi, node: LineumNode, canvas?: CanvasActions): MenuItem {
  const project = api.project;
  const table = project.dataTable(node);
  const items: MenuEntry[] = [
    {
      label: 'Impact analysis',
      icon: <Icon.impact size={14} />,
      hint: canvas ? 'I' : undefined,
      onSelect: () =>
        canvas ? canvas.impact(node.id) : api.openLineage({ focus: node.id, up: 0, down: 99, trace: 'down' }),
    },
    {
      label: 'Downstream in SQL',
      icon: <Icon.sql size={14} />,
      onSelect: () =>
        api.openSql(
          `-- Everything downstream of ${node.name}, nearest first\nwith recursive downstream(id, distance) as (\n  select '${node.id}', 0\n  union\n  select e.child, d.distance + 1\n  from edges e join downstream d on e.parent = d.id\n)\nselect n.name, n.type, n.layer, n.owner, min(d.distance) as distance\nfrom downstream d join nodes n on n.id = d.id\nwhere d.distance > 0\ngroup by all\norder by distance, n.type, n.name`,
          true,
        ),
    },
  ];
  if (table) {
    items.push(
      { separator: true },
      { heading: 'Sample data', detail: table },
      { label: 'Preview rows', icon: <Icon.play size={14} />, onSelect: () => api.openSql(`select *\nfrom ${table}\nlimit 100`, true) },
      { label: 'Profile every column', onSelect: () => api.openSql(`summarize ${table}`, true) },
      { label: 'Count rows', onSelect: () => api.openSql(`select count(*) as rows\nfrom ${table}`, true) },
    );
  } else {
    items.push({ label: 'Columns in SQL', icon: <Icon.columns size={14} />, onSelect: () => api.openSql(`select name, type, description\nfrom columns\nwhere node_id = '${node.id}'`, true) });
  }
  return { label: 'Analyze', icon: <Icon.sql size={14} />, children: items };
}

export function nodeMenu(api: AppApi, node: LineumNode, canvas?: CanvasActions): MenuEntry[] {
  const project = api.project;
  const i = project.idx(node.id);
  const ups = project.parents[i]?.length ?? 0;
  const downs = project.children[i]?.length ?? 0;
  const head: MenuEntry = {
    heading: project.displayName(node),
    detail: `${TYPE_LABEL[node.type] ?? node.type}${node.materialized && node.type === 'model' ? `, ${node.materialized}` : ''}`,
  };
  const open: MenuItem = {
    label: 'Open documentation',
    icon: <Icon.doc size={14} />,
    hint: canvas ? '↵' : undefined,
    onSelect: () => api.navigate({ kind: 'resource', id: node.id }),
  };
  if (!canvas) {
    return [
      head,
      open,
      {
        label: 'Open in lineage explorer',
        icon: <Icon.lineage size={14} />,
        onSelect: () => api.openLineage({ focus: node.id, up: 2, down: 2 }),
      },
      {
        label: 'Trace',
        icon: <Icon.trace size={14} />,
        children: [
          { label: 'Upstream to sources', tone: 'up', onSelect: () => api.openLineage({ focus: node.id, up: 99, down: 0, trace: 'up' }) },
          { label: 'Downstream to exposures', tone: 'down', onSelect: () => api.openLineage({ focus: node.id, up: 0, down: 99, trace: 'down' }) },
          { label: 'Both directions', onSelect: () => api.openLineage({ focus: node.id, up: 99, down: 99, trace: 'both' }) },
        ],
      },
      analyzeMenu(api, node),
      { separator: true },
      copyMenu(api, node),
    ];
  }
  const from = canvas.pathFrom();
  const entries: MenuEntry[] = [
    head,
    open,
    { label: 'Focus here', icon: <Icon.focus size={14} />, hint: 'F', onSelect: () => canvas.focus(node.id) },
    {
      label: 'Expand',
      icon: <Icon.expand size={14} />,
      children: [
        { label: `Parents (${ups})`, tone: 'up', hint: '[', disabled: !ups, onSelect: () => canvas.expand(node.id, 'up', 1) },
        { label: `Children (${downs})`, tone: 'down', hint: ']', disabled: !downs, onSelect: () => canvas.expand(node.id, 'down', 1) },
        { separator: true },
        { label: `All upstream (${node.m.up})`, tone: 'up', disabled: !node.m.up, onSelect: () => canvas.expand(node.id, 'up', 99) },
        { label: `All downstream (${node.m.down})`, tone: 'down', disabled: !node.m.down, onSelect: () => canvas.expand(node.id, 'down', 99) },
      ],
    },
    {
      label: 'Trace',
      icon: <Icon.trace size={14} />,
      hint: 'T',
      children: [
        { label: 'Upstream', tone: 'up', onSelect: () => canvas.trace(node.id, 'up') },
        { label: 'Downstream', tone: 'down', onSelect: () => canvas.trace(node.id, 'down') },
        { label: 'Both directions', tone: 'accent', onSelect: () => canvas.trace(node.id, 'both') },
        { separator: true },
        { label: 'Clear trace', hint: 'Esc', onSelect: () => canvas.clearTrace() },
      ],
    },
    {
      label: 'Select',
      children: [
        { label: 'Upstream', tone: 'up', hint: '⇧←', onSelect: () => canvas.selectRelated(node.id, 'up') },
        { label: 'Downstream', tone: 'down', hint: '⇧→', onSelect: () => canvas.selectRelated(node.id, 'down') },
        { label: 'Everything connected', onSelect: () => canvas.selectRelated(node.id, 'both') },
        { label: `Same ${canvas.colorLabel.toLowerCase()}`, onSelect: () => canvas.selectSame(node.id) },
      ],
    },
  ];
  if (node.columns?.length) {
    entries.push({
      label: canvas.showingColumns(node.id) ? 'Hide columns' : `Show columns (${node.columns.length})`,
      icon: <Icon.columns size={14} />,
      hint: 'C',
      onSelect: () => canvas.toggleColumns(node.id),
    });
  }
  if (from && from !== node.id) {
    const source = project.node(from);
    entries.push({
      label: `Paths from ${source ? project.displayName(source) : 'selection'}`,
      icon: <Icon.path size={14} />,
      onSelect: () => canvas.showPath(from, node.id),
    });
  }
  entries.push(
    { separator: true },
    analyzeMenu(api, node, canvas),
    copyMenu(api, node),
    { separator: true },
    {
      label: 'Hide',
      icon: <Icon.hide size={14} />,
      children: [
        { label: 'This node', hint: 'H', onSelect: () => canvas.hide([node.id]) },
        { label: 'Upstream of it', tone: 'up', onSelect: () => canvas.hideRelated(node.id, 'up') },
        { label: 'Downstream of it', tone: 'down', onSelect: () => canvas.hideRelated(node.id, 'down') },
        { label: 'Everything not connected', onSelect: () => canvas.isolate(node.id) },
      ],
    },
  );
  return entries;
}

export function columnMenu(api: AppApi, node: LineumNode, column: string, canvas?: CanvasActions): MenuEntry[] {
  const project = api.project;
  const i = project.idx(node.id);
  const ins = project.columnIn(i, column).length;
  const outs = project.columnOut(i, column).length;
  const table = project.dataTable(node);
  const quoted = quoteSql(column);
  const entries: MenuEntry[] = [{ heading: `${project.displayName(node)}.${column}`, detail: 'Column' }];
  const trace = (direction: 'up' | 'down' | 'both') =>
    canvas
      ? canvas.traceColumn(node.id, column, direction)
      : api.openLineage({ focus: node.id, up: direction === 'down' ? 0 : 99, down: direction === 'up' ? 0 : 99, column, trace: direction, columns: true });
  entries.push(
    { label: `Trace upstream (${ins} direct)`, tone: 'up', icon: <Icon.trace size={14} />, disabled: !ins, onSelect: () => trace('up') },
    { label: `Trace downstream (${outs} direct)`, tone: 'down', icon: <Icon.trace size={14} />, disabled: !outs, onSelect: () => trace('down') },
    { label: 'Trace both directions', tone: 'accent', disabled: !ins && !outs, onSelect: () => trace('both') },
    { separator: true },
    {
      label: 'Where it comes from, in SQL',
      icon: <Icon.sql size={14} />,
      onSelect: () =>
        api.openSql(
          `-- Every source column that feeds ${node.name}.${column}\nwith recursive trace(node_id, col, depth, transforms) as (\n  select '${node.id}', '${column}', 0, []::varchar[]\n  union all\n  select e.source, e.source_column, t.depth + 1, list_append(t.transforms, e.transform)\n  from column_edges e\n  join trace t on e.target = t.node_id and lower(e.target_column) = lower(t.col)\n)\nselect n.name as node, t.col as column, t.depth, t.transforms\nfrom trace t join nodes n on n.id = t.node_id\nwhere t.depth > 0\norder by t.depth, node`,
          true,
        ),
    },
  );
  if (table) {
    entries.push(
      { heading: 'Sample data', detail: table },
      {
        label: 'Value distribution',
        icon: <Icon.play size={14} />,
        onSelect: () =>
          api.openSql(`select ${quoted}, count(*) as rows\nfrom ${table}\ngroup by 1\norder by rows desc\nlimit 50`, true),
      },
      {
        label: 'Nulls and distinct values',
        onSelect: () =>
          api.openSql(
            `select\n  count(*) as rows,\n  count(*) - count(${quoted}) as nulls,\n  count(distinct ${quoted}) as distinct_values,\n  min(${quoted}) as min,\n  max(${quoted}) as max\nfrom ${table}`,
            true,
          ),
      },
    );
  }
  entries.push(
    { separator: true },
    {
      label: 'Copy',
      icon: <Icon.copy size={14} />,
      children: [
        { label: 'Column name', onSelect: () => api.copy(column, 'column name') },
        { label: 'model.column', onSelect: () => api.copy(`${node.name}.${column}`, 'column') },
        ...(node.relation ? [{ label: 'relation.column', onSelect: () => api.copy(`${node.relation}.${column}`, 'column') }] : []),
      ],
    },
    { label: 'Open model documentation', icon: <Icon.doc size={14} />, onSelect: () => api.navigate({ kind: 'resource', id: node.id }, { hash: `col=${encodeURIComponent(column)}` }) },
  );
  return entries;
}
