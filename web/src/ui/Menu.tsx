import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  tone?: 'up' | 'down' | 'accent';
  onSelect?: () => void;
  children?: MenuEntry[];
}

export type MenuEntry = MenuItem | { separator: true } | { heading: string; detail?: string };

export interface MenuRequest {
  x: number;
  y: number;
  entries: MenuEntry[];
  label?: string;
}

const isItem = (entry: MenuEntry): entry is MenuItem => 'label' in entry;

interface MenuListProps {
  entries: MenuEntry[];
  x: number;
  y: number;
  label?: string;
  onClose: () => void;
  depth: number;
  autoFocus?: boolean;
  onLeft?: () => void;
}

function MenuList({ entries, x, y, label, onClose, depth, autoFocus = true, onLeft }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState<{ index: number; x: number; y: number } | null>(null);
  const items = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => isItem(entry));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - margin) {
      nx = depth > 0 ? Math.max(margin, x - rect.width - 220) : window.innerWidth - rect.width - margin;
    }
    if (ny + rect.height > window.innerHeight - margin) ny = Math.max(margin, window.innerHeight - rect.height - margin);
    setPos({ x: Math.max(margin, nx), y: ny });
  }, [x, y, depth]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const openChild = (index: number) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setOpen({ index, x: rect.right + 2, y: rect.top - 4 });
  };

  const choose = (index: number) => {
    const entry = entries[index];
    if (!isItem(entry) || entry.disabled) return;
    if (entry.children) {
      openChild(index);
      return;
    }
    onClose();
    entry.onSelect?.();
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const position = items.findIndex((item) => item.index === active);
    let next = position;
    for (let step = 0; step < items.length; step += 1) {
      next = (next + delta + items.length) % items.length;
      const candidate = items[next].entry as MenuItem;
      if (!candidate.disabled) break;
    }
    setActive(items[next].index);
    setOpen(null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (open) return;
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'ArrowRight' && active >= 0 && (entries[active] as MenuItem).children) openChild(active);
    else if (event.key === 'ArrowLeft' && onLeft) onLeft();
    else if (event.key === 'Enter' || event.key === ' ') {
      if (active >= 0) choose(active);
    } else if (event.key === 'Escape') {
      if (onLeft) onLeft();
      else onClose();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const child = open ? (entries[open.index] as MenuItem) : null;

  return (
    <>
      <div
        ref={ref}
        className="menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={{ left: pos.x, top: pos.y }}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {entries.map((entry, index) => {
          if ('separator' in entry) return <div key={index} className="menu-sep" role="separator" />;
          if ('heading' in entry)
            return (
              <div key={index} className="menu-heading">
                <span className="menu-heading-title">{entry.heading}</span>
                {entry.detail && <span className="menu-heading-detail">{entry.detail}</span>}
              </div>
            );
          const item = entry;
          return (
            <button
              type="button"
              key={index}
              data-index={index}
              role="menuitem"
              aria-haspopup={item.children ? 'menu' : undefined}
              aria-expanded={item.children ? open?.index === index : undefined}
              aria-disabled={item.disabled || undefined}
              className={`menu-item${active === index ? ' is-active' : ''}${item.tone ? ` tone-${item.tone}` : ''}`}
              tabIndex={-1}
              onMouseEnter={() => {
                setActive(index);
                if (item.children) openChild(index);
                else setOpen(null);
              }}
              onClick={() => choose(index)}
            >
              <span className="menu-icon">{item.checked ? <Icon.check size={14} /> : item.icon}</span>
              <span className="menu-label">{item.label}</span>
              {item.hint && <kbd className="menu-hint">{item.hint}</kbd>}
              {item.children && <Icon.chevron size={12} className="menu-chevron" />}
            </button>
          );
        })}
      </div>
      {open && child?.children && (
        <MenuList
          entries={child.children}
          x={open.x}
          y={open.y}
          label={child.label}
          depth={depth + 1}
          onClose={onClose}
          onLeft={() => {
            setOpen(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

export function ContextMenu({ request, onClose }: { request: MenuRequest | null; onClose: () => void }) {
  useEffect(() => {
    if (!request) return;
    const close = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.menu')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [request, onClose]);
  if (!request) return null;
  return createPortal(
    <div className="menu-layer">
      <MenuList entries={request.entries} x={request.x} y={request.y} label={request.label} depth={0} onClose={onClose} />
    </div>,
    document.body,
  );
}
