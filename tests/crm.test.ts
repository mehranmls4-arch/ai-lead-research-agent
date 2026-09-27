import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition } from "@/lib/engine/crm";
import { CRM_STAGES } from "@/lib/domain/lead";

describe("CRM transitions", () => {
  it("allows the normal human sales flow", () => {
    const path = ["new", "researching", "qualified", "outreach_drafted", "approved", "contacted", "replied", "meeting", "won"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i], "human").ok, `${path[i - 1]}→${path[i]}`).toBe(true);
  });
  it("rejects invalid jumps and no-op moves", () => {
    expect(canTransition("new", "won", "human").ok).toBe(false);
    expect(canTransition("contacted", "won", "human").ok).toBe(false);
    expect(canTransition("won", "lost", "human").ok).toBe(false);
    expect(canTransition("qualified", "qualified", "human").ok).toBe(false);
  });
  it("never lets the AI or system mark leads Won, Lost, Approved or Contacted", () => {
    for (const from of CRM_STAGES) {
      for (const to of ["won", "lost", "approved", "contacted", "replied", "meeting"] as const) {
        expect(canTransition(from, to, "ai").ok).toBe(false);
        expect(canTransition(from, to, "system").ok).toBe(false);
      }
    }
    expect(allowedTransitions("replied", "ai")).toEqual([]);
    expect(allowedTransitions("replied", "human")).toContain("won");
  });
  it("lets the AI move leads through research stages only", () => {
    expect(canTransition("new", "researching", "ai").ok).toBe(true);
    expect(canTransition("researching", "qualified", "ai").ok).toBe(true);
    expect(canTransition("qualified", "outreach_drafted", "ai").ok).toBe(true);
    expect(canTransition("outreach_drafted", "researching", "ai").ok).toBe(true);
    expect(canTransition("contacted", "researching", "ai").ok).toBe(false);
  });
});
