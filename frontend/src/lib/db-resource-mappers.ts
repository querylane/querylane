import type { DbConnectionStatus } from "@/lib/console-resources";
import {
  buildDatabaseName,
  parseResourceLeafId,
  toConnectionStatus,
} from "@/lib/console-resources";
import type { Database } from "@/protogen/querylane/console/v1alpha1/database_pb";
import type { Instance } from "@/protogen/querylane/console/v1alpha1/instance_pb";

const DEFAULT_POSTGRES_PORT = 5432;

interface PostgresInstance {
  connectionError: string;
  host: string;
  id: string;
  name: string;
  port: number;
  resourceName: string;
  status: DbConnectionStatus;
}

interface PostgresDatabase {
  characterSet: string;
  collation: string;
  id: string;
  isSystemDatabase: boolean;
  name: string;
  owner: string;
  resourceName: string;
}

type ResourceCollectionQueryStatus = "error" | "idle" | "pending" | "success";
type ResourceCollectionSuppressedReason = "instance-not-connected";

interface ResourceCollectionQueryState {
  error: unknown | null;
  hasData: boolean;
  hasResolved: boolean;
  isFetching: boolean;
  isPending: boolean;
  isSuppressed: boolean;
  status: ResourceCollectionQueryStatus;
  suppressedReason: ResourceCollectionSuppressedReason | null;
}

function mapInstance(instance: Instance): PostgresInstance {
  return {
    connectionError: instance.connectionError,
    host: instance.config?.host ?? "",
    id: parseResourceLeafId(instance.name),
    name: instance.displayName || parseResourceLeafId(instance.name),
    port: instance.config?.port ?? DEFAULT_POSTGRES_PORT,
    resourceName: instance.name,
    status: toConnectionStatus(instance.connectionState),
  };
}

function mapDatabase(database: Database): PostgresDatabase {
  return {
    characterSet: database.characterSet,
    collation: database.collation,
    id: parseResourceLeafId(database.name),
    isSystemDatabase: database.isSystemDatabase,
    name: database.displayName || parseResourceLeafId(database.name),
    owner: database.owner,
    resourceName: database.name,
  };
}

function createFallbackDatabase(
  instanceId: string,
  databaseId: string
): PostgresDatabase {
  return {
    characterSet: "",
    collation: "",
    id: databaseId,
    isSystemDatabase: false,
    name: databaseId,
    owner: "",
    resourceName: buildDatabaseName(instanceId, databaseId),
  };
}

export type {
  PostgresDatabase,
  PostgresInstance,
  ResourceCollectionQueryState,
  ResourceCollectionQueryStatus,
  ResourceCollectionSuppressedReason,
};
export { createFallbackDatabase, mapDatabase, mapInstance };
