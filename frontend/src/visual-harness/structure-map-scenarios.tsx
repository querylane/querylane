import { useState } from "react";
import { DatabaseStructureMap } from "@/features/database-visualization/database-structure-map";
import { HarnessProviders } from "@/visual-harness/harness-providers";
import {
  createStructureMapTransport,
  STRUCTURE_MAP_DATABASE_ID,
  STRUCTURE_MAP_INSTANCE_ID,
} from "@/visual-harness/structure-map-scenario-data";

// Shared by the rstest behavior test and the Playwright visual harness.
function DatabaseStructureMapScenario() {
  const [transport] = useState(createStructureMapTransport);

  return (
    <HarnessProviders
      routerPath={`/instances/${STRUCTURE_MAP_INSTANCE_ID}/databases/${STRUCTURE_MAP_DATABASE_ID}/explorer`}
      transport={transport}
    >
      <div className="h-[900px] w-[1180px] overflow-hidden rounded-2xl border border-border bg-background p-5 text-foreground">
        <DatabaseStructureMap
          activeSchemaName="public"
          databaseId={STRUCTURE_MAP_DATABASE_ID}
          databaseLabel={STRUCTURE_MAP_DATABASE_ID}
          instanceId={STRUCTURE_MAP_INSTANCE_ID}
          targetResource={{
            category: "tables",
            name: "orders",
            schemaName: "public",
          }}
        />
      </div>
    </HarnessProviders>
  );
}

export { DatabaseStructureMapScenario };
