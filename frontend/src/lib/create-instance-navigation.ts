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
}) {
  const instanceId = parseResourceLeafId(createdInstanceName ?? "");

  if (!instanceId) {
    return { replace: true, to: "/" } satisfies CreateInstanceSuccessTarget;
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
    } satisfies CreateInstanceSuccessTarget;
  }

  return {
    params: { databaseId, instanceId },
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  } satisfies CreateInstanceSuccessTarget;
}

export type { CreateInstanceSuccessTarget, DatabaseResource };
export { resolveCreateInstanceSuccessTarget };
