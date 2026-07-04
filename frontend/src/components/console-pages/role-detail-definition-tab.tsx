"use client";

import { SectionCard } from "@/components/console-pages/console-layout";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";

function RoleDefinitionTab({ sql }: RoleDetailViewProps) {
  return (
    <SectionCard
      description="Reconstructed from the catalog — exact syntax may vary by PostgreSQL version."
      title="SQL definition"
    >
      <SqlCodeBlock sql={sql} />
    </SectionCard>
  );
}

export { RoleDefinitionTab };
