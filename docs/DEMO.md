# Demo walkthrough

Everything below runs in **mock mode** (`AI_PROVIDER=mock`, `RESEARCH_PROVIDER=mock`
— the default). No real company is researched and no external API is called; every
result is clearly marked **Demo**.

## 1. Start the app

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## 2. Sign in

Go to **Sign in** (or click **Run the demo** on the landing page, which takes you
there first if you're not logged in). Use the seeded admin account:

- Email: `admin@novaflow.demo`
- Password: whatever you set as `SEED_ADMIN_PASSWORD` in `.env`

If `SHOW_DEMO_CREDENTIALS=true`, the login page displays these credentials directly.

## 3. Open Leads → Analyze lead

From the sidebar, click **Analyze lead** (or go directly to `/demo`, which opens this
page with **Example Logistics** pre-selected).

## 4. Select Example Logistics

The left panel lists six built-in demo companies, each with a designed outcome
(strong fit, medium fit, poor fit, with and without buying signals). **Example
Logistics** is the only one left unanalysed by the seed data specifically so you can
watch it run live. Selecting it fills in the company name, website and contact.

## 5. Run the analysis

Click **Analyze Lead**. The right panel shows a 9-step pipeline (mapping the 11
underlying tool calls) updating live:

1. Research
2. Company profile
3. ICP match
4. Buying signals
5. Pain points
6. Automation opportunities
7. Lead score
8. Outreach draft
9. Human approval (waiting for you)

Below it, the **Agent activity** table shows each of the 11 tool calls as they
happen — tool name, a safe input/output summary, status and duration. No model
reasoning is shown or stored, only this operational log.

## 6. Inspect the research

Click **Research report** once the run finishes. You'll see, in order: executive
summary, company overview, business model, products/services, size, geography,
technology signals, buying signals, pain points, automation opportunities, ICP
analysis, lead score, score breakdown, recommended outreach angle, and sources.
Every claim shows a colored label (hover it for source, confidence and retrieval
time) — for Example Logistics, everything is labeled **Demo**, because it comes from
a fictional fixture in the mock research provider, not real research.

## 7. Inspect the ICP score

Back on the lead page, the **ICP qualification** panel shows each criterion
(industry, size, geography, business characteristics, technology signals) with its
own score, weight and a plain-language reason — not just a single number.

## 8. Inspect the lead score

The **Lead score breakdown** table shows all nine weighted factors, each with its
own evidence and explanation, always summing to the total shown at the top (with a
letter grade).

## 9. Inspect buying signals

Buying signals are listed with their evidence, source and confidence. If a signal
had no supporting evidence, it wouldn't appear here at all — the detector discards
anything it can't back up.

## 10. Inspect pain points

Pain points are phrased as hedged hypotheses ("Potential…", "Possible…"), each
citing the specific evidence it's based on.

## 11. Inspect automation opportunities

Each opportunity names the problem, the evidence for it, a proposed NovaFlow
solution, and an expected workflow — deliberately with no dollar figures or
percentages, since none of that would be something the system actually knows.

## 12. Inspect outreach

Scroll to **Outreach**. You'll see up to four drafts (cold email, LinkedIn note, two
follow-ups), each stamped **AI GENERATED — REQUIRES HUMAN APPROVAL**, with a
side-by-side **Quality check** panel showing PASS or NEEDS REVIEW and exactly which
checks passed or failed (company name correctness, personalization, no invented
numbers, no hallucinated technology, tone, length, and more).

## 13. Approve, edit or reject

- **Approve** moves a passing draft to Approved (and moves the lead's CRM stage
  forward). A draft that failed a check requires you to tick "I reviewed the
  validation findings" before it can be approved anyway.
- **Edit** lets you rewrite the text; saving re-runs the same validator immediately.
- **Reject** discards the draft.
- Once approved, **Mark as sent** records that you sent it yourself — the app has no
  email integration and never sends anything automatically.
- **Regenerate** re-runs the whole pipeline and forces new outreach drafts even if
  the lead wasn't otherwise going to get any (useful for a borderline lead).

## 14. View the CRM

Go to **Pipeline**. All leads are shown as cards across the 11 CRM stages. You can
move a card forward using its **Move to…** control, but only to stages a human is
allowed to set manually — the AI can only ever reach as far as *Outreach drafted* on
its own, and stages like Won and Lost always require a human, in order, with no
skipping.

## 15. View analytics

Go to **Analytics**. Every number and chart here is computed live from PostgreSQL:
totals, qualification rate, ICP match rate, research success rate, and distributions
by score, stage, industry, research status, outreach status and automation
opportunity. There's nothing hardcoded — running more leads through the pipeline
changes these numbers immediately.

## About the other five seeded companies

The seed also pre-analyzes five more demo companies so the CRM, analytics and
outreach screens aren't empty on first load:

| Company | Designed outcome |
|---|---|
| Meridian Health Admin Partners | Strong ICP fit — seeded through to *Replied* to show a completed pipeline |
| Harbor Realty Group | Strong fit, weaker buying signals |
| Ledgerline Advisory | Strong fit, below the target company-size range |
| Brightcart Home Goods | Medium fit (wrong geography) |
| Ironvale Steelworks | Poor fit (wrong industry, wrong geography, too large) |

Every one of them is labeled **Demo** throughout the UI.
