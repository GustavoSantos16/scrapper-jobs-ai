interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

/** Parses the rules that apply to `userAgent` (falls back to the "*" group). */
export function parseRobots(text: string, userAgent: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (key !== 'allow' && key !== 'disallow')) continue;
    if (!value) continue; // "Disallow:" (empty) allows everything
    const escaped = value
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\\\$$/, '$');
    current.rules.push({ allow: key === 'allow', pattern: new RegExp(`^${escaped}`), length: value.length });
  }
  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  return (specific ?? groups.find((g) => g.agents.includes('*')))?.rules ?? [];
}

/** Longest matching rule wins; ties favor allow (RFC 9309). */
export function isPathAllowed(rules: Rule[], pathWithQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.pattern.test(pathWithQuery)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
