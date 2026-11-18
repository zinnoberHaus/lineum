import { useMemo, useState } from 'react';
import { Icon } from '../ui/icons';
import type { ColorMode, ColorValue } from './colors';
import type { Action } from './state';

interface LegendProps {
  mode: ColorMode;
  values: ColorValue[];
  visible: Set<number>;
  hiddenKeys: Set<string>;
  dispatch: React.Dispatch<Action>;
  compact?: boolean;
}

/** What each colour means, with counts in view. Click a row to select it, the eye to hide it. */
export function Legend({ mode, values, visible, hiddenKeys, dispatch, compact }: LegendProps) {
  const [open, setOpen] = useState(!compact);
  const rows = useMemo(() => {
    const groups = new Map<string, { value: ColorValue; nodes: number[] }>();
    for (const i of visible) {
      const value = values[i];
      if (!groups.has(value.key)) groups.set(value.key, { value, nodes: [] });
      groups.get(value.key)!.nodes.push(i);
    }
    return [...groups.values()].sort((a, b) => a.value.order - b.value.order || b.nodes.length - a.nodes.length || a.value.label.localeCompare(b.value.label));
  }, [values, visible]);

  return (
    <section className={`legend${open ? ' is-open' : ''}`} aria-label={`Legend: ${mode.label}`}>
      <button type="button" className="legend-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="legend-title">{mode.label}</span>
        <Icon.chevron size={12} className="legend-chevron" />
      </button>
      {open && (
        <>
          <p className="legend-describe">{mode.describe}</p>
          <ul className="legend-rows">
            {rows.slice(0, 14).map(({ value, nodes }) => {
              const hidden = hiddenKeys.has(value.key);
              return (
                <li key={value.key} className={hidden ? 'is-hidden' : ''}>
                  <button
                    type="button"
                    className="legend-row"
                    onClick={() => dispatch({ type: 'select', nodes })}
                    title={`Select the ${nodes.length} node${nodes.length === 1 ? '' : 's'} shown as “${value.label}”`}
                  >
                    <span className="legend-swatch" style={{ background: value.color }} />
                    <span className="legend-label">{value.label}</span>
                    <span className="legend-count">{nodes.length}</span>
                  </button>
                  <button
                    type="button"
                    className="legend-eye"
                    onClick={() => dispatch({ type: 'toggleKey', key: value.key })}
                    aria-label={hidden ? `Show ${value.label}` : `Hide ${value.label}`}
                    title={hidden ? 'Show on canvas' : 'Hide from canvas'}
                  >
                    {hidden ? <Icon.hide size={13} /> : <Icon.eye size={13} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
