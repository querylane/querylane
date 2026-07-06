"use client";

import { AccessSummary } from "@/components/console-pages/role-detail-access-summary";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { RoleAttributesCard } from "@/components/console-pages/role-detail-shared";

function RoleOverviewTab({
  accessRows,
  databases,
  effectiveDb,
  effectiveDbId,
  rlsNote,
  role,
  setChosenDbId,
  setSection,
}: RoleDetailViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        A role&apos;s power has two sources: the access it&apos;s granted, and
        the attributes it holds itself.
      </p>
      <AccessSummary
        databaseName={effectiveDb?.name}
        databases={databases}
        onJump={setSection}
        onSelectDatabase={setChosenDbId}
        rlsNote={rlsNote}
        rows={accessRows}
        selectedDatabaseId={effectiveDbId ?? undefined}
      />
      <RoleAttributesCard role={role} />
    </div>
  );
}

export { RoleOverviewTab };
