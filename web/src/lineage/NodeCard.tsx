import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { createContext, memo, useContext } from 'react';
import { TYPE_LABEL } from '../data/project';
import type { Column, LineumNode } from '../types';
import { TypeIcon } from '../ui/icons';
import type { Direction } from './layout';
import { MAX_COLUMNS } from './layout';

export interface CardHandlers {
  expand(index: number, direction: 'up' | 'down'): void;
  columnMenu(event: React.MouseEvent, index: number, column: string): void;
  columnClick(index: number, column: string, event: React.MouseEvent): void;
  showAllColumns(index: number): void;
}

export const CardContext = createContext<CardHandlers | null>(null);

export type ColumnMark = 'subject' | 'up' | 'down';

export interface CardData extends Record<string, unknown> {
  index: number;
  node: LineumNode;
  title: string;
  subtitle: string;
  color: string;
  hiddenUp: number;
  hiddenDown: number;
  showColumns: boolean;
  allColumns: boolean;
  columns: Column[];
  marks: Map<string, ColumnMark> | null;
  linked: Set<string> | null; // columns with an edge drawn on the canvas
  role: 'focus' | 'trace' | 'dim' | 'hover-up' | 'hover-down' | null;
  critical: boolean;
  direction: Direction;
  tests: 'pass' | 'warn' | 'fail' | 'none';
}

export type CardNode = Node<CardData, 'card'>;

const TEST_TITLE = { pass: 'Tests pass', warn: 'A test warned', fail: 'A test failed', none: 'No tests' };

function NodeCardView({ data, selected }: NodeProps<CardNode>) {
  const handlers = useContext(CardContext)!;
  const { node, direction } = data;
  const horizontal = direction === 'LR';
  const shown = data.allColumns ? data.columns : data.columns.slice(0, MAX_COLUMNS);
  const classes = ['card', `role-${data.role ?? 'none'}`];
  if (selected) classes.push('is-selected');
  if (data.critical) classes.push('is-critical');
  if (data.showColumns) classes.push('has-columns');
  return (
    <div className={classes.join(' ')} style={{ '--node-color': data.color } as React.CSSProperties}>
      <Handle type="target" id="in" position={horizontal ? Position.Left : Position.Top} className="handle-node" isConnectable={false} />
      <Handle type="source" id="out" position={horizontal ? Position.Right : Position.Bottom} className="handle-node" isConnectable={false} />
      {data.hiddenUp > 0 && (
        <button
          type="button"
          className={`card-more card-more-up ${horizontal ? 'is-h' : 'is-v'}`}
          title={`Show ${data.hiddenUp} hidden parent${data.hiddenUp === 1 ? '' : 's'}`}
          onClick={(event) => {
            event.stopPropagation();
            handlers.expand(data.index, 'up');
          }}
        >
          +{data.hiddenUp}
        </button>
      )}
      {data.hiddenDown > 0 && (
        <button
          type="button"
          className={`card-more card-more-down ${horizontal ? 'is-h' : 'is-v'}`}
          title={`Show ${data.hiddenDown} hidden child${data.hiddenDown === 1 ? '' : 'ren'}`}
          onClick={(event) => {
            event.stopPropagation();
            handlers.expand(data.index, 'down');
          }}
        >
          +{data.hiddenDown}
        </button>
      )}
      <div className="card-head">
        <span className="card-type" title={TYPE_LABEL[node.type] ?? node.type}>
          <TypeIcon type={node.type} size={15} />
        </span>
        <span className="card-text">
          <span className="card-title" title={node.id}>
            {data.title}
          </span>
          <span className="card-sub">{data.subtitle}</span>
        </span>
        <span className={`card-test test-${data.tests}`} title={TEST_TITLE[data.tests]} />
      </div>
      {data.showColumns && (
        <ul className="card-columns nodrag nowheel">
          {shown.map((column) => {
            const mark = data.marks?.get(column.name.toLowerCase());
            const linked = data.linked?.has(column.name.toLowerCase());
            return (
              <li
                key={column.name}
                className={`card-col${mark ? ` mark-${mark}` : ''}${linked ? ' is-linked' : ''}`}
                onContextMenu={(event) => handlers.columnMenu(event, data.index, column.name)}
                onClick={(event) => handlers.columnClick(data.index, column.name, event)}
                title={column.description || column.name}
              >
                <Handle type="target" id={`in:${column.name.toLowerCase()}`} position={Position.Left} className="handle-col" isConnectable={false} />
                <span className="card-col-name">
                  {column.pk && <span className="card-col-pk" title="Primary key">key</span>}
                  {column.name}
                </span>
                <span className="card-col-type">{(column.type ?? '').toLowerCase()}</span>
                <Handle type="source" id={`out:${column.name.toLowerCase()}`} position={Position.Right} className="handle-col" isConnectable={false} />
              </li>
            );
          })}
          {!data.allColumns && data.columns.length > MAX_COLUMNS && (
            <li className="card-col card-col-more">
              <button type="button" onClick={() => handlers.showAllColumns(data.index)}>
                Show {data.columns.length - MAX_COLUMNS} more columns
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export const NodeCard = memo(NodeCardView);
