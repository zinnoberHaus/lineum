import { useEffect, useMemo, useRef, useState } from 'react';
import type { LineumNode } from '../types';
import { Icon, TypeIcon } from '../ui/icons';
import { useApp } from './context';
import { nodeMenu } from './menus';

interface Group {
  id: string;
  label: string;
  layer: string;
  folders: { name: string; nodes: LineumNode[] }[];
  count: number;
}

const OPEN_KEY = 'lineum-tree';

function readOpen(): Set<string> | null {
  try {
    const value = sessionStorage.getItem(OPEN_KEY);
    return value ? new Set(JSON.parse(value) as string[]) : null;
  } catch {
    return null;
  }
}

/** The project tree: layers, then folders, then nodes. Every item has the node menu on right-click. */
export function Sidebar({ current }: { current?: string }) {
  const api = useApp();
  const { project } = api;
  const [filter, setFilter] = useState('');
  const currentNode = current ? project.node(current) : undefined;
  const [open, setOpen] = useState<Set<string>>(() => readOpen() ?? new Set(currentNode ? [currentNode.layer] : ['marts']));
  const list = useRef<HTMLDivElement>(null);

  const groups = useMemo<Group[]>(() => {
    const q = filter.trim().toLowerCase();
    return project.payload.layers
      .map((layer) => {
        const byFolder = new Map<string, LineumNode[]>();
        for (const node of project.nodes) {
          if (node.layer !== layer.id) continue;
          if (q && !project.displayName(node).toLowerCase().includes(q) && !(node.label ?? '').toLowerCase().includes(q)) continue;
          const folder = node.type === 'source' ? ((node.x?.source_name as string) ?? '') : (node.folder ?? '');
          if (!byFolder.has(folder)) byFolder.set(folder, []);
          byFolder.get(folder)!.push(node);
        }
        const folders = [...byFolder.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, nodes]) => ({ name, nodes: nodes.sort((a, b) => a.name.localeCompare(b.name)) }));
        return { id: layer.id, label: layer.label, layer: layer.id, folders, count: folders.reduce((n, f) => n + f.nodes.length, 0) };
      })
      .filter((g) => g.count > 0);
  }, [project, filter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (!currentNode) return;
    setOpen((value) => (value.has(currentNode.layer) ? value : new Set(value).add(currentNode.layer)));
    requestAnimationFrame(() => list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
  }, [currentNode]);

  const toggle = (id: string) =>
    setOpen((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const searching = filter.trim().length > 0;

  return (
    <nav className="sidebar" aria-label="Project">
      <label className="filter sidebar-filter">
        <Icon.search size={13} />
        <span className="visually-hidden">Filter the project tree</span>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter" />
      </label>
      <div className="tree" ref={list}>
        {groups.map((group) => {
          const expanded = searching || open.has(group.id);
          return (
            <section key={group.id} className="tree-group">
              <button type="button" className="tree-layer" aria-expanded={expanded} onClick={() => toggle(group.id)}>
                <Icon.chevron size={11} className="tree-chevron" />
                <span className="tree-swatch" style={{ background: `var(--ln-layer-${group.layer}, var(--none))` }} />
                <span className="tree-label">{group.label}</span>
                <span className="tree-count">{group.count}</span>
              </button>
              {expanded && (
                <div className="tree-items">
                  {group.folders.map((folder) => (
                    <div key={folder.name || '_'} className="tree-folder">
                      {folder.name && group.folders.length > 1 && <div className="tree-folder-name mono">{folder.name}</div>}
                      <ul>
                        {folder.nodes.map((node) => (
                          <li key={node.id}>
                            <a
                              className="tree-item"
                              href={api.router.href({ kind: 'resource', id: node.id })}
                              aria-current={node.id === current ? 'page' : undefined}
                              title={node.id}
                              onClick={(event) => {
                                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                                event.preventDefault();
                                api.navigate({ kind: 'resource', id: node.id });
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                api.openMenu(event, nodeMenu(api, node));
                              }}
                            >
                              <TypeIcon type={node.type} size={13} />
                              <span className="tree-name">{node.type === 'source' ? node.name : node.label && node.type === 'exposure' ? node.label : node.name}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && <p className="muted small tree-empty">Nothing matches “{filter}”.</p>}
      </div>
      <a className="sidebar-credit" href="https://github.com/zinnoberHaus/lineum" target="_blank" rel="noopener noreferrer">
        Made with Lineum {project.payload.meta.lineumVersion}
      </a>
    </nav>
  );
}
