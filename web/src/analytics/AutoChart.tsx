import { useMemo, useState } from 'react';
import type { QueryResult } from './engine';

/** A result can be charted when it has a label column followed by at least one number column. */
export function chartable(result: QueryResult): boolean {
  if (result.columns.length < 2 || !result.rows.length) return false;
  return result.columns.slice(1).some((c) => c.numeric) && !result.columns[0].numeric;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

export function AutoChart({ result }: { result: QueryResult }) {
  const numericColumns = result.columns.map((c, i) => ({ ...c, i })).filter((c, i) => i > 0 && c.numeric);
  const [measure, setMeasure] = useState(numericColumns[0]?.i ?? 1);
  const label = result.columns[0];
  const temporal = label.temporal || result.rows.every((row) => typeof row[0] === 'string' && /^\d{4}-\d{2}(-\d{2})?/.test(row[0] as string));
  const points = useMemo(
    () =>
      result.rows
        .map((row) => ({ label: row[0] === null ? '(null)' : String(row[0]), value: Number(row[measure] ?? 0) }))
        .filter((p) => Number.isFinite(p.value)),
    [result, measure],
  );
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const min = Math.min(0, ...points.map((p) => p.value));
  const title = `${result.columns[measure]?.name} by ${label.name}`;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span>{title}</span>
        {numericColumns.length > 1 && (
          <label className="select select-small">
            <span className="visually-hidden">Measure</span>
            <select value={measure} onChange={(event) => setMeasure(Number(event.target.value))}>
              {numericColumns.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </figcaption>
      {temporal && points.length > 2 ? <LineChart points={points} max={max} min={min} /> : <BarChart points={points.slice(0, 40)} max={max} />}
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function BarChart({ points, max }: { points: { label: string; value: number }[]; max: number }) {
  return (
    <ul className="hbars" aria-hidden="true">
      {points.map((p) => (
        <li key={p.label}>
          <span className="hbar-label mono" title={p.label}>
            {p.label}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(0, (100 * p.value) / max)}%` }} />
          </span>
          <span className="hbar-value">{formatValue(p.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function LineChart({ points, max, min }: { points: { label: string; value: number }[]; max: number; min: number }) {
  const width = 720;
  const height = 240;
  const pad = { left: 52, right: 12, top: 12, bottom: 28 };
  const x = (i: number) => pad.left + (i / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${path}L${x(points.length - 1).toFixed(1)},${y(Math.max(min, 0))}L${x(0).toFixed(1)},${y(Math.max(min, 0))}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const every = Math.ceil(points.length / 8);
  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={pad.left - 8} y={y(t) + 4} className="chart-tick" textAnchor="end">
            {formatValue(t)}
          </text>
        </g>
      ))}
      <path d={area} className="chart-area" />
      <path d={path} className="chart-line" />
      {points.map((p, i) =>
        i % every === 0 ? (
          <text key={p.label} x={x(i)} y={height - 8} className="chart-tick" textAnchor="middle">
            {p.label.slice(0, 10)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
