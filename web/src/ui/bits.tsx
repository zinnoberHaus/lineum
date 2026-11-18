import type { ReactNode } from 'react';
import { useApp } from '../app/context';
import { nodeMenu } from '../app/menus';
import { TYPE_LABEL } from '../data/project';
import type { LineumNode, TestStatus } from '../types';
import { Icon, TypeIcon } from './icons';

export function Chip({ children, tone, title }: { children: ReactNode; tone?: string; title?: string }) {
  return (
    <span className={`chip${tone ? ` chip-${tone}` : ''}`} title={title}>
      {children}
    </span>
  );
}

export function LayerChip({ layer }: { layer: string }) {
  const { project } = useApp();
  const label = project.payload.layers.find((l) => l.id === layer)?.label ?? layer;
  return (
    <span className="chip chip-layer" style={{ '--layer': `var(--ln-layer-${layer}, var(--none))` } as React.CSSProperties}>
      <span className="chip-dot" />
      {label}
    </span>
  );
}

export function StatusDot({ status }: { status: TestStatus | string | undefined }) {
  const tone =
    status === 'pass' || status === 'success'
      ? 'pass'
      : status === 'warn'
        ? 'warn'
        : status === 'fail' || status === 'error' || status === 'runtime error'
          ? 'fail'
          : 'none';
  return <span className={`dot dot-${tone}`} aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** A link to a node's page. Right-click opens the node menu, like everywhere else in the app. */
export function NodeLink({ node, showType = false, column }: { node: LineumNode; showType?: boolean; column?: string }) {
  const api = useApp();
  return (
    <a
      className="node-link"
      href={api.router.href({ kind: 'resource', id: node.id }, column ? `col=${encodeURIComponent(column)}` : '')}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        api.navigate({ kind: 'resource', id: node.id }, column ? { hash: `col=${encodeURIComponent(column)}` } : undefined);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        api.openMenu(event, nodeMenu(api, node));
      }}
      title={node.id}
    >
      <span className="node-link-icon" style={{ color: `var(--ln-layer-${node.layer}, var(--ln-color-muted))` }}>
        <TypeIcon type={node.type} size={14} />
      </span>
      <span className="node-link-name">{api.project.displayName(node)}{column ? <span className="node-link-col">.{column}</span> : null}</span>
      {showType && <span className="node-link-type">{TYPE_LABEL[node.type] ?? node.type}</span>}
    </a>
  );
}

export function CopyButton({ text, label = 'Copy', what }: { text: string; label?: string; what?: string }) {
  const api = useApp();
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} onClick={() => api.copy(text, what)}>
      <Icon.copy size={14} />
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; count?: number; hidden?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const visible = tabs.filter((tab) => !tab.hidden);
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={`tab${value === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            const index = visible.findIndex((t) => t.id === value);
            const next = visible[(index + (event.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
            onChange(next.id);
            (event.currentTarget.parentElement?.querySelectorAll('button')[visible.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
          }}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function formatSeconds(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export function formatCount(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatBytes(value: number | undefined): string {
  if (!value) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function formatAge(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  const abs = Math.abs(seconds);
  if (abs < 3600) return `${Math.round(abs / 60)} min`;
  if (abs < 172800) return `${Math.round(abs / 3600)} h`;
  return `${Math.round(abs / 86400)} days`;
}

export function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
