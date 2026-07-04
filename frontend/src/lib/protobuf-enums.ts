import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import {
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  ServerInfo_ReplicationRole,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { SetupMethod } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  ConstraintType,
  PolicyCommand,
  PolicyMode,
  ReferentialAction,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { View_ViewType } from "@/protogen/querylane/console/v1alpha1/view_pb";

export function formatConstraintType(type: ConstraintType): string {
  switch (type) {
    case ConstraintType.PRIMARY_KEY:
      return "Primary key";
    case ConstraintType.UNIQUE:
      return "Unique";
    case ConstraintType.FOREIGN_KEY:
      return "Foreign key";
    case ConstraintType.CHECK:
      return "Check";
    case ConstraintType.EXCLUSION:
      return "Exclusion";
    default:
      return "Unknown";
  }
}

export function formatPolicyMode(mode: PolicyMode): string {
  return mode === PolicyMode.RESTRICTIVE ? "Restrictive" : "Permissive";
}

export function formatPolicyCommand(command: PolicyCommand): string {
  switch (command) {
    case PolicyCommand.ALL:
      return "ALL";
    case PolicyCommand.DELETE:
      return "DELETE";
    case PolicyCommand.INSERT:
      return "INSERT";
    case PolicyCommand.SELECT:
      return "SELECT";
    case PolicyCommand.UPDATE:
      return "UPDATE";
    default:
      return "UNKNOWN";
  }
}

export function formatReferentialAction(action: ReferentialAction): string {
  switch (action) {
    case ReferentialAction.CASCADE:
      return "CASCADE";
    case ReferentialAction.NO_ACTION:
      return "NO ACTION";
    case ReferentialAction.RESTRICT:
      return "RESTRICT";
    case ReferentialAction.SET_DEFAULT:
      return "SET DEFAULT";
    case ReferentialAction.SET_NULL:
      return "SET NULL";
    default:
      return "—";
  }
}

export function formatTableType(tableType: Table_TableType): string {
  switch (tableType) {
    case Table_TableType.BASE_TABLE:
      return "Base table";
    case Table_TableType.EXTERNAL:
      return "External";
    case Table_TableType.PARTITIONED:
      return "Partitioned";
    case Table_TableType.TEMPORARY:
      return "Temporary";
    default:
      return "Unknown";
  }
}

export function formatViewType(viewType: View_ViewType): string {
  switch (viewType) {
    case View_ViewType.MATERIALIZED:
      return "Materialized";
    case View_ViewType.STANDARD:
      return "Standard";
    default:
      return "Unknown";
  }
}

export function formatSslMode(mode: PostgresConfig_SslMode): string {
  switch (mode) {
    case PostgresConfig_SslMode.ALLOW:
      return "allow";
    case PostgresConfig_SslMode.DISABLED:
      return "disable";
    case PostgresConfig_SslMode.REQUIRE:
      return "require";
    case PostgresConfig_SslMode.VERIFY_CA:
      return "verify-ca";
    case PostgresConfig_SslMode.VERIFY_FULL:
      return "verify-full";
    default:
      return "prefer";
  }
}

export function toSslMode(value: string): PostgresConfig_SslMode {
  switch (value) {
    case "disable":
      return PostgresConfig_SslMode.DISABLED;
    case "allow":
      return PostgresConfig_SslMode.ALLOW;
    case "require":
      return PostgresConfig_SslMode.REQUIRE;
    case "verify-ca":
      return PostgresConfig_SslMode.VERIFY_CA;
    case "verify-full":
      return PostgresConfig_SslMode.VERIFY_FULL;
    default:
      return PostgresConfig_SslMode.PREFER;
  }
}

export function formatSslNegotiation(
  negotiation: PostgresConfig_SslNegotiation
): string {
  if (
    normalizeSslNegotiation(negotiation) ===
    PostgresConfig_SslNegotiation.DIRECT
  ) {
    return "direct";
  }
  return "postgres";
}

export function toSslNegotiation(value: string): PostgresConfig_SslNegotiation {
  switch (value) {
    case "direct":
      return PostgresConfig_SslNegotiation.DIRECT;
    case "postgres":
      return PostgresConfig_SslNegotiation.POSTGRES;
    default:
      return PostgresConfig_SslNegotiation.POSTGRES;
  }
}

export function normalizeSslNegotiation(
  negotiation: PostgresConfig_SslNegotiation | undefined
): PostgresConfig_SslNegotiation {
  if (negotiation === PostgresConfig_SslNegotiation.DIRECT) {
    return PostgresConfig_SslNegotiation.DIRECT;
  }
  return PostgresConfig_SslNegotiation.POSTGRES;
}

export function formatReplicationRole(
  role: ServerInfo_ReplicationRole
): string {
  switch (role) {
    case ServerInfo_ReplicationRole.PRIMARY:
      return "Primary";
    case ServerInfo_ReplicationRole.REPLICA:
      return "Replica";
    default:
      return "Unknown";
  }
}

export function formatSetupMethod(method: SetupMethod): ConfigMethod | null {
  if (method === SetupMethod.UI_CONFIGURED) {
    return "ui_configured";
  }

  if (method === SetupMethod.MANUAL_YAML) {
    return "manual_yaml";
  }

  if (method === SetupMethod.EMBEDDED) {
    return "embedded";
  }

  return null;
}
