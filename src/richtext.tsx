import type { ReactNode } from "react";

export function renderRich(text: string, onLink?: (url: string) => void): ReactNode[] {
  const re = /(https?:\/\/[^\s]+)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const url = m[1];
      out.push(
        <span key={k++} className="lnk" onClick={onLink ? () => onLink(url) : undefined}>
          {url}
        </span>
      );
    } else if (m[2]) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k++}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={k++} className="code">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
