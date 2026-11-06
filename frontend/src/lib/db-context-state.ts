"use client";

import { createContext, use } from "react";
import type { AdminPageId } from "@/lib/admin-page";
import type { RouteSelectionIds, ScopeLevel } from "@/lib/db-navigation";
import type {
  PostgresDatabase,
  PostgresInstance,
  ResourceCollectionQueryState,
} from "@/lib/db-resource-mappers";

interface DbContextType {
  databases: PostgresDatabase[];
  instances: PostgresInstance[];
  navigateToDatabase: (
    database: PostgresDatabase,
    options?: { overridePage?: AdminPageId }
  ) => void;
  navigateToInstance: (instance: PostgresInstance) => void;
  navigationIds: RouteSelectionIds;
  queryStates: {
    databases: ResourceCollectionQueryState;
    instances: ResourceCollectionQueryState;
  };
  retryInstanceCatalog: () => Promise<void>;
  scopeLevel: ScopeLevel;
  selectedDatabase: PostgresDatabase | null;
  selectedInstance: PostgresInstance | null;
  viewLevel: ScopeLevel;
  viewOverview: (level: "instance" | "database") => void;
}

const DbContext = createContext<DbContextType | null>(null);

function useDb() {
  const context = use(DbContext);
  if (!context) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return context;
}

export type { DbContextType };
export { DbContext, useDb };
