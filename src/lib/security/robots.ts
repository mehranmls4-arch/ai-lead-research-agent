/** Minimal robots.txt evaluation: groups for "*" and our agent token, longest-match Allow/Disallow. */
export function isAllowedByRobots(robotsTxt: string, userAgent: string, path: string): boolean {
  const token = userAgent.split("/")[0].toLowerCase();
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      if (key === "disallow" && value === "") continue;
      cur.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = applicable.flatMap((g) => g.rules);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const pattern = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (pattern.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) {
      best = { allow: r.allow, len: r.path.length };
    }
  }
  return best ? best.allow : true;
}
