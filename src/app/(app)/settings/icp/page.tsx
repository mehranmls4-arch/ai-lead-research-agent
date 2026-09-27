import { getDb } from "@/lib/db/client";
import { getActiveIcp } from "@/lib/services/icp";
import { requirePageUser } from "@/lib/auth/server";
import { DEFAULT_ICP, ICP_CHARACTERISTICS, SCORE_FACTOR_LABELS } from "@/lib/domain/icp";
import { TECH_CATEGORIES } from "@/lib/domain/profile";
import { PageHeader } from "@/components/page-header";
import { IcpForm } from "./icp-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "ICP & scoring" };

export default async function IcpPage() {
  const user = await requirePageUser("/settings/icp");
  const { config } = await getActiveIcp(getDb());
  return (
    <>
      <PageHeader
        title="ICP and scoring"
        description="The ideal customer profile and lead-score weights used by the deterministic engines. Changes apply to new research runs; existing results keep the ICP snapshot they were scored with."
      />
      <IcpForm
        initial={config}
        defaults={DEFAULT_ICP}
        canEdit={user.role === "admin"}
        characteristics={Object.entries(ICP_CHARACTERISTICS).map(([id, c]) => ({ id, label: c.label }))}
        techCategories={[...TECH_CATEGORIES]}
        scoreLabels={SCORE_FACTOR_LABELS}
      />
    </>
  );
}
