import { parseResourceLeafId } from "@/lib/console-resources";

interface DatabaseResource {
  name: string;
}

type CreateInstanceSuccessTarget =
  | {
      params: { databaseId: string; instanceId: string };
      to: "/instances/$instanceId/databases/$databaseId/explorer";
    }
  | {
      params: { instanceId: string };
      to: "/instances/$instanceId";
    }
  | {
      replace: true;
      to: "/";
    };

function resolveCreateInstanceSuccessTarget({
  databases,
  createdInstanceName,
  preferredDatabaseId,
}: {
  createdInstanceName: string | undefined;
  databases: DatabaseResource[];
  preferredDatabaseId: string;
}): CreateInstanceSuccessTarget {
  const instanceId = parseResourceLeafId(createdInstanceName ?? "");

  if (!instanceId) {
    return { replace: true, to: "/" };
  }

  const normalizedPreferredDatabaseId = preferredDatabaseId.trim();
  const preferredDatabase = databases.find(
    (database) =>
      parseResourceLeafId(database.name) === normalizedPreferredDatabaseId
  );
  const databaseId = parseResourceLeafId(
    (preferredDatabase ?? databases[0])?.name ?? ""
  );

  if (!databaseId) {
    return {
      params: { instanceId },
      to: "/instances/$instanceId",
    };
  }

  return {
    params: { databaseId, instanceId },
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  };
}

export type { CreateInstanceSuccessTarget, DatabaseResource };
export { resolveCreateInstanceSuccessTarget };
