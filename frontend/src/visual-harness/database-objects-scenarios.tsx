import type { ReactNode } from "react";
import { DatabaseObjectsPanel } from "@/components/console-pages/database-objects-section";
import {
  DATABASE_OBJECTS_DESIGN_EXTENSIONS,
  DATABASE_OBJECTS_DESIGN_OBJECTS,
  DATABASE_OBJECTS_PARAMS,
  toDatabaseObjectsSummary,
} from "@/visual-harness/database-objects-scenarios-data";

// The database objects panel is fed by streamed SQL (`ExecuteQuery`), which
// Playwright route mocks cannot serve, so its states render in isolation here.
// Shared by the rstest behavior test and the Playwright visual harness.

function DatabaseObjectsSurface({ children }: { children: ReactNode }) {
  return (
    <div className="w-[1060px] rounded-2xl bg-background p-8 text-foreground">
      {children}
    </div>
  );
}

function DatabaseObjectsGridScenario() {
  return (
    <DatabaseObjectsSurface>
      <DatabaseObjectsPanel
        extensions={DATABASE_OBJECTS_DESIGN_EXTENSIONS}
        extensionsPending={false}
        isLoading={false}
        params={DATABASE_OBJECTS_PARAMS}
        summary={toDatabaseObjectsSummary(DATABASE_OBJECTS_DESIGN_OBJECTS)}
      />
    </DatabaseObjectsSurface>
  );
}

function DatabaseObjectsLoadingScenario() {
  return (
    <DatabaseObjectsSurface>
      <DatabaseObjectsPanel
        extensions={[]}
        extensionsPending={true}
        isLoading={true}
        params={DATABASE_OBJECTS_PARAMS}
        summary={{}}
      />
    </DatabaseObjectsSurface>
  );
}

export { DatabaseObjectsGridScenario, DatabaseObjectsLoadingScenario };
