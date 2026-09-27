import { Badge, type Tone } from "@/components/ui/badge";
import { TOOL_LABELS, type ToolCallView } from "./pipeline";

const STATUS_TONE: Record<string, Tone> = { success: "ok", warning: "warn", skipped: "neutral", failed: "danger", running: "accent" };

/** Safe operational log: tool, input/output summaries, status, time, duration. No model reasoning is stored or shown. */
export function ToolActivity({ calls, compact = false }: { calls: ToolCallView[]; compact?: boolean }) {
  if (!calls.length) return <p className="px-4 py-6 text-center text-[13px] text-muted">No tool calls recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Tool</th>
            <th>Input</th>
            <th>Output</th>
            <th>Status</th>
            {compact ? null : <th>Started</th>}
            <th className="text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.seq}>
              <td className="tabular text-muted">{c.seq}</td>
              <td className="whitespace-nowrap">
                <span className="font-medium">{TOOL_LABELS[c.tool] ?? c.tool}</span>
                <div className="text-xs text-muted">
                  {c.tool}
                  {c.selectedBy === "fallback" ? " (guardrail fallback)" : ""}
                </div>
              </td>
              <td className="max-w-[240px] text-[12.5px] text-ink-2">{c.input}</td>
              <td className="max-w-[320px] text-[12.5px] text-ink-2">{c.output ?? "…"}</td>
              <td>
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
              </td>
              {compact ? null : (
                <td className="tabular whitespace-nowrap text-xs text-muted">{new Date(c.startedAt).toISOString().slice(11, 19)} UTC</td>
              )}
              <td className="tabular text-right text-xs text-muted">{c.durationMs === null ? "…" : `${c.durationMs} ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
