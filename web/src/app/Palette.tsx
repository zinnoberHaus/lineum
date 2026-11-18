import { useEffect, useMemo, useRef, useState } from 'react';
import { search, TYPE_LABEL } from '../data/project';
import type { Page } from '../types';
import { Icon, TypeIcon } from '../ui/icons';
import { useApp } from './context';
import { columnMenu, nodeMenu } from './menus';

interface Item {
  key: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  run(event: { shiftKey: boolean }): void;
  menu?(event: React.MouseEvent): void;
}

/** ⌘K: jump to any node or column, or run a command. On the lineage page it adds nodes to the canvas. */
export function Palette({ mode, onClose }: { mode: 'go' | 'add'; onClose(): void }) {
  const api = useApp();
  const { project } = api;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onCanvas = mode === 'add' && api.page.kind === 'lineage';

  useEffect(() => input.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const go = (page: Page, hash?: string) => () => api.navigate(page, hash ? { hash } : undefined);
    const commands: Item[] = [
      { key: 'c:lineage', title: 'Open the lineage explorer', detail: 'Command', icon: <Icon.lineage size={15} />, run: go({ kind: 'lineage' }) },
      { key: 'c:health', title: 'Open project health', detail: 'Command', icon: <Icon.health size={15} />, run: go({ kind: 'health' }) },
      { key: 'c:sql', title: 'Query the project with SQL', detail: 'Command', icon: <Icon.sql size={15} />, run: go({ kind: 'analyze' }) },
      { key: 'c:overview', title: 'Go to the overview', detail: 'Command', icon: <Icon.overview size={15} />, run: go({ kind: 'overview' }) },
      {
        key: 'c:theme',
        title: 'Switch between light and dark',
        detail: 'Command',
        icon: <Icon.moon size={15} />,
        run: () => api.setTheme(api.theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    const q = query.trim();
    if (!q) {
      const keystones = project.payload.summary.keystones.slice(0, 6).map((id) => project.idx(id));
      return [
        ...keystones.map((i) => nodeItem(i)),
        ...commands,
      ];
    }
    const hits = search(project, q, 30).map((hit) => (hit.kind === 'column' ? columnItem(hit.node, hit.column!) : nodeItem(hit.node)));
    const lower = q.toLowerCase();
    return [...hits, ...commands.filter((c) => c.title.toLowerCase().includes(lower))];

    function nodeItem(i: number): Item {
      const node = project.nodes[i];
      return {
        key: `n:${node.id}`,
        title: project.displayName(node),
        detail: `${TYPE_LABEL[node.type] ?? node.type}${node.materialized && node.type === 'model' ? `, ${node.materialized}` : ''}${node.m.down ? `, ${node.m.down} downstream` : ''}`,
        icon: (
          <span style={{ color: `var(--ln-layer-${node.layer}, var(--ln-color-muted))` }}>
            <TypeIcon type={node.type} size={15} />
          </span>
        ),
        run: (event) => {
          if (onCanvas && !event.shiftKey) {
            window.dispatchEvent(new CustomEvent('lineum:canvas', { detail: { id: node.id, mode: 'add' } }));
            onClose();
          } else api.navigate({ kind: 'resource', id: node.id });
        },
        menu: (event) => api.openMenu(event, nodeMenu(api, node)),
      };
    }
    function columnItem(i: number, column: string): Item {
      const node = project.nodes[i];
      return {
        key: `c:${node.id}.${column}`,
        title: `${project.displayName(node)}.${column}`,
        detail: 'Column',
        icon: <Icon.columns size={15} />,
        run: (event) => {
          if (onCanvas && !event.shiftKey) {
            api.openLineage({ focus: node.id, up: 99, down: 99, column, trace: 'both', columns: true });
          } else api.navigate({ kind: 'resource', id: node.id }, { hash: `col=${encodeURIComponent(column)}` });
        },
        menu: (event) => api.openMenu(event, columnMenu(api, node, column)),
      };
    }
  }, [api, project, query, onCanvas, onClose]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon.search size={16} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={onCanvas ? 'Add a model, source or column to the canvas' : 'Search models, sources, columns and commands'}
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-${active}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                items[active]?.run({ shiftKey: event.shiftKey });
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {items.map((item, index) => (
            <li
              key={item.key}
              id={`palette-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(index)}
              onClick={(event) => item.run({ shiftKey: event.shiftKey })}
              onContextMenu={(event) => {
                if (!item.menu) return;
                event.preventDefault();
                item.menu(event);
              }}
            >
              <span className="palette-icon">{item.icon}</span>
              <span className="palette-title mono">{item.title}</span>
              <span className="palette-detail">{item.detail}</span>
            </li>
          ))}
          {!items.length && <li className="palette-empty">No models, sources or columns match “{query}”.</li>}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd className="kbd">↵</kbd> {onCanvas ? 'add to canvas' : 'open'}
          </span>
          {onCanvas && (
            <span>
              <kbd className="kbd">⇧↵</kbd> open documentation
            </span>
          )}
          <span>
            <kbd className="kbd">Right-click</kbd> more actions
          </span>
        </div>
      </div>
    </div>
  );
}
