"use client";

import { Fragment, useMemo } from "react";

const KEYWORDS =
  /\b(CREATE|TABLE|SCHEMA|IF|NOT|EXISTS|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|UNIQUE|CHECK|ALTER|ADD|ON|DELETE|UPDATE|CASCADE|RESTRICT|NO|ACTION|SET|NULL|DEFAULT|INDEX|COMMENT|IS|GENERATED|ALWAYS|AS|IDENTITY|DROP|INSERT|INTO|VALUES|SELECT|OVERRIDING|SYSTEM|VALUE|COALESCE|FROM|MAX|TRUE|FALSE|AND|OR|BETWEEN)\b/g;

function highlightLine(line: string, key: number) {
  if (line.trimStart().startsWith("--")) {
    return (
      <span key={key} className="text-ink-faint">
        {line}
      </span>
    );
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  KEYWORDS.lastIndex = 0;

  while ((match = KEYWORDS.exec(line)) !== null) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index));
    parts.push(
      <span key={`${key}-${match.index}`} className="font-semibold text-elephant">
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));

  return <Fragment key={key}>{parts}</Fragment>;
}

export function SqlCode({ code }: { code: string }) {
  const lines = useMemo(() => code.split("\n"), [code]);

  return (
    <div className="flex h-full overflow-auto bg-surface-2 font-mono text-[12px] leading-[1.55]">
      <div
        aria-hidden
        className="sticky left-0 shrink-0 select-none border-r border-line bg-surface px-2 py-3 text-right text-ink-faint"
      >
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre className="min-w-0 flex-1 px-3 py-3">
        <code>
          {lines.map((line, index) => (
            <Fragment key={index}>
              {highlightLine(line, index)}
              {"\n"}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
