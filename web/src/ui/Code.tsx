import { type ReactNode, useMemo } from 'react';

const KEYWORDS = new Set(
  `select from where group by order having limit offset join left right inner outer full cross on using as and or not in is null
  case when then else end with recursive union all distinct over partition qualify window filter cast try_cast interval
  create table view insert into update delete set values returning between like ilike exists true false asc desc nulls first
  last lateral unnest pivot unpivot exclude replace summarize describe show tables coalesce if`
    .split(/\s+/)
    .filter(Boolean),
);

const TOKEN = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function highlightSql(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push(code.slice(last, index));
    const [text, comment, string, quoted, jinja, number, word] = match;
    let cls = '';
    if (comment) cls = 'tok-comment';
    else if (string) cls = 'tok-string';
    else if (quoted) cls = 'tok-ident';
    else if (jinja) cls = 'tok-jinja';
    else if (number) cls = 'tok-number';
    else if (word && KEYWORDS.has(word.toLowerCase())) cls = 'tok-keyword';
    else if (word && code[index + word.length] === '(') cls = 'tok-function';
    out.push(cls ? <span key={key++} className={cls}>{text}</span> : text);
    last = index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function Code({ code, lines = true, className }: { code: string; lines?: boolean; className?: string }) {
  const highlighted = useMemo(() => highlightSql(code), [code]);
  const count = useMemo(() => code.split('\n').length, [code]);
  return (
    <div className={`code${className ? ` ${className}` : ''}`}>
      {lines && (
        <pre className="code-lines" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => i + 1).join('\n')}
        </pre>
      )}
      <pre className="code-body">
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}
