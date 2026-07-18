const OBJECT_CATEGORIES = [
  { key: "routines", label: "Routines" },
  { key: "sequences", label: "Sequences" },
  { key: "types", label: "Types" },
  { key: "collations", label: "Collations" },
  { key: "fdwServers", label: "FDW servers" },
  { key: "replication", label: "Logical replication" },
  { key: "eventTriggers", label: "Event triggers" },
  { key: "cronJobs", label: "Cron jobs" },
] as const;

type OtherObjectCategory = (typeof OBJECT_CATEGORIES)[number]["key"];

interface OtherDatabaseObject {
  badge: string;
  category: OtherObjectCategory;
  detail: string;
  name: string;
  sortKey: string;
  status?: "failed" | "ok" | "warning" | undefined;
  summary: string;
}

export type { OtherDatabaseObject, OtherObjectCategory };
export { OBJECT_CATEGORIES };
