import type { CrmStage } from "../domain/lead";

export type Actor = "human" | "ai" | "system";

const TRANSITIONS: Record<CrmStage, CrmStage[]> = {
  new: ["researching", "needs_review", "lost"],
  researching: ["qualified", "needs_review", "new", "lost"],
  qualified: ["outreach_drafted", "needs_review", "researching", "lost"],
  needs_review: ["researching", "qualified", "outreach_drafted", "lost"],
  outreach_drafted: ["approved", "needs_review", "qualified", "researching", "lost"],
  approved: ["contacted", "outreach_drafted", "lost"],
  contacted: ["replied", "meeting", "lost"],
  replied: ["meeting", "won", "lost"],
  meeting: ["won", "lost", "replied"],
  won: [],
  lost: ["new"],
};

/** Stages the AI/system pipeline may set on its own. Everything else requires a human. */
const AI_ALLOWED_TARGETS: CrmStage[] = ["researching", "qualified", "needs_review", "outreach_drafted"];

export function allowedTransitions(from: CrmStage, actor: Actor): CrmStage[] {
  const base = TRANSITIONS[from] ?? [];
  return actor === "human" ? base : base.filter((s) => AI_ALLOWED_TARGETS.includes(s));
}

export function canTransition(from: CrmStage, to: CrmStage, actor: Actor): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: `Lead is already in stage "${to}".` };
  if (actor !== "human" && !AI_ALLOWED_TARGETS.includes(to)) {
    return { ok: false, reason: `Only a human can move a lead to "${to}".` };
  }
  // The pipeline may re-run research from any non-terminal stage before outreach is approved.
  if (actor !== "human" && to === "researching" && ["new", "qualified", "needs_review", "outreach_drafted"].includes(from)) return { ok: true };
  if (!(TRANSITIONS[from] ?? []).includes(to)) {
    return { ok: false, reason: `Cannot move from "${from}" to "${to}".` };
  }
  return { ok: true };
}
