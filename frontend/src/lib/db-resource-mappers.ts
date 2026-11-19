import type { DbConnectionStatus } from "@/lib/console-resources";
import {
  buildDatabaseName,
  parseResourceLeafId,
  toConnectionStatus,
} from "@/lib/console-resources";
import type { Database } from "@/protogen/querylane/console/v1alpha1/database_pb";
import type { Instance } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { Instance_CredentialState } from "@/protogen/querylane/console/v1alpha1/instance_pb";

const DEFAULT_POSTGRES_PORT = 5432;

interface PostgresInstance {
  connectionError: string;
  credentialsUnreadable: boolean;
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
  error: unknown;
  hasData: boolean;
  hasResolved: boolean;
  isFetching: boolean;
  isPending: boolean;
  isSuppressed: boolean;
  status: ResourceCollectionQueryStatus;
  suppressedReason: ResourceCollectionSuppressedReason | null;
}

function mapInstance(instance: Instance) {
  const credentialsUnreadable =
    instance.credentialState !== Instance_CredentialState.UNSPECIFIED;

  return {
    connectionError: instance.connectionError,
    credentialsUnreadable,
    host: instance.config?.host ?? "",
    id: parseResourceLeafId(instance.name),
    name: instance.displayName || parseResourceLeafId(instance.name),
    port: instance.config?.port ?? DEFAULT_POSTGRES_PORT,
    resourceName: instance.name,
    status: credentialsUnreadable
      ? "error"
      : toConnectionStatus(instance.connectionState),
  } satisfies PostgresInstance;
}

function mapDatabase(database: Database) {
  return {
    characterSet: database.characterSet,
    collation: database.collation,
    id: parseResourceLeafId(database.name),
    isSystemDatabase: database.isSystemDatabase,
    name: database.displayName || parseResourceLeafId(database.name),
    owner: database.owner,
    resourceName: database.name,
  } satisfies PostgresDatabase;
}

function createFallbackDatabase(instanceId: string, databaseId: string) {
  return {
    characterSet: "",
    collation: "",
    id: databaseId,
    isSystemDatabase: false,
    name: databaseId,
    owner: "",
    resourceName: buildDatabaseName(instanceId, databaseId),
  } satisfies PostgresDatabase;
}

export type {
  PostgresDatabase,
  PostgresInstance,
  ResourceCollectionQueryState,
  ResourceCollectionQueryStatus,
  ResourceCollectionSuppressedReason,
};
export { createFallbackDatabase, mapDatabase, mapInstance };
