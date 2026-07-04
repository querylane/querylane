import { describe, expect, test } from "vitest";

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

import {
  formatConstraintType,
  formatPolicyCommand,
  formatPolicyMode,
  formatReferentialAction,
  formatReplicationRole,
  formatSetupMethod,
  formatSslMode,
  formatSslNegotiation,
  formatTableType,
  formatViewType,
  normalizeSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "./protobuf-enums";

describe("formatConstraintType", () => {
  test("formats primary key", () => {
    expect(formatConstraintType(ConstraintType.PRIMARY_KEY)).toBe(
      "Primary key"
    );
  });

  test("formats unique", () => {
    expect(formatConstraintType(ConstraintType.UNIQUE)).toBe("Unique");
  });

  test("formats foreign key", () => {
    expect(formatConstraintType(ConstraintType.FOREIGN_KEY)).toBe(
      "Foreign key"
    );
  });

  test("formats check", () => {
    expect(formatConstraintType(ConstraintType.CHECK)).toBe("Check");
  });

  test("formats exclusion", () => {
    expect(formatConstraintType(ConstraintType.EXCLUSION)).toBe("Exclusion");
  });

  test("returns Unknown for unrecognized value", () => {
    expect(formatConstraintType(999 as ConstraintType)).toBe("Unknown");
  });
});

describe("formatPolicyMode", () => {
  test("formats restrictive", () => {
    expect(formatPolicyMode(PolicyMode.RESTRICTIVE)).toBe("Restrictive");
  });

  test("formats permissive", () => {
    expect(formatPolicyMode(PolicyMode.PERMISSIVE)).toBe("Permissive");
  });

  test("defaults to Permissive for unrecognized value", () => {
    expect(formatPolicyMode(999 as PolicyMode)).toBe("Permissive");
  });
});

describe("formatPolicyCommand", () => {
  test.each([
    [PolicyCommand.ALL, "ALL"],
    [PolicyCommand.DELETE, "DELETE"],
    [PolicyCommand.INSERT, "INSERT"],
    [PolicyCommand.SELECT, "SELECT"],
    [PolicyCommand.UPDATE, "UPDATE"],
  ] as const)("formats %s", (command, expected) => {
    expect(formatPolicyCommand(command)).toBe(expected);
  });

  test("returns UNKNOWN for unrecognized value", () => {
    expect(formatPolicyCommand(999 as PolicyCommand)).toBe("UNKNOWN");
  });
});

describe("formatReferentialAction", () => {
  test.each([
    [ReferentialAction.CASCADE, "CASCADE"],
    [ReferentialAction.NO_ACTION, "NO ACTION"],
    [ReferentialAction.RESTRICT, "RESTRICT"],
    [ReferentialAction.SET_DEFAULT, "SET DEFAULT"],
    [ReferentialAction.SET_NULL, "SET NULL"],
  ] as const)("formats %s", (action, expected) => {
    expect(formatReferentialAction(action)).toBe(expected);
  });

  test("returns dash for unrecognized value", () => {
    expect(formatReferentialAction(999 as ReferentialAction)).toBe("—");
  });
});

describe("formatTableType", () => {
  test.each([
    [Table_TableType.BASE_TABLE, "Base table"],
    [Table_TableType.EXTERNAL, "External"],
    [Table_TableType.PARTITIONED, "Partitioned"],
    [Table_TableType.TEMPORARY, "Temporary"],
  ] as const)("formats %s", (tableType, expected) => {
    expect(formatTableType(tableType)).toBe(expected);
  });

  test("returns Unknown for unrecognized value", () => {
    expect(formatTableType(999 as Table_TableType)).toBe("Unknown");
  });
});

describe("formatViewType", () => {
  test("formats materialized", () => {
    expect(formatViewType(View_ViewType.MATERIALIZED)).toBe("Materialized");
  });

  test("formats standard", () => {
    expect(formatViewType(View_ViewType.STANDARD)).toBe("Standard");
  });

  test("returns Unknown for unrecognized value", () => {
    expect(formatViewType(999 as View_ViewType)).toBe("Unknown");
  });
});

describe("formatSslMode", () => {
  test.each([
    [PostgresConfig_SslMode.ALLOW, "allow"],
    [PostgresConfig_SslMode.DISABLED, "disable"],
    [PostgresConfig_SslMode.REQUIRE, "require"],
    [PostgresConfig_SslMode.VERIFY_CA, "verify-ca"],
    [PostgresConfig_SslMode.VERIFY_FULL, "verify-full"],
    [PostgresConfig_SslMode.PREFER, "prefer"],
  ] as const)("formats %s", (mode, expected) => {
    expect(formatSslMode(mode)).toBe(expected);
  });

  test("defaults to prefer for unrecognized value", () => {
    expect(formatSslMode(999 as PostgresConfig_SslMode)).toBe("prefer");
  });
});

describe("toSslMode", () => {
  test.each([
    ["disable", PostgresConfig_SslMode.DISABLED],
    ["allow", PostgresConfig_SslMode.ALLOW],
    ["require", PostgresConfig_SslMode.REQUIRE],
    ["verify-ca", PostgresConfig_SslMode.VERIFY_CA],
    ["verify-full", PostgresConfig_SslMode.VERIFY_FULL],
  ] as const)("maps %s to enum", (value, expected) => {
    expect(toSslMode(value)).toBe(expected);
  });

  test("defaults to PREFER for unrecognized value", () => {
    expect(toSslMode("unknown")).toBe(PostgresConfig_SslMode.PREFER);
  });

  test("defaults to PREFER for empty string", () => {
    expect(toSslMode("")).toBe(PostgresConfig_SslMode.PREFER);
  });

  test("roundtrips with formatSslMode", () => {
    for (const mode of [
      PostgresConfig_SslMode.ALLOW,
      PostgresConfig_SslMode.DISABLED,
      PostgresConfig_SslMode.REQUIRE,
      PostgresConfig_SslMode.VERIFY_CA,
      PostgresConfig_SslMode.VERIFY_FULL,
      PostgresConfig_SslMode.PREFER,
    ]) {
      expect(toSslMode(formatSslMode(mode))).toBe(mode);
    }
  });
});

describe("formatSslNegotiation", () => {
  test.each([
    [PostgresConfig_SslNegotiation.POSTGRES, "postgres"],
    [PostgresConfig_SslNegotiation.DIRECT, "direct"],
  ] as const)("formats %s", (mode, expected) => {
    expect(formatSslNegotiation(mode)).toBe(expected);
  });

  test("defaults to postgres for unrecognized value", () => {
    expect(formatSslNegotiation(999 as PostgresConfig_SslNegotiation)).toBe(
      "postgres"
    );
  });
});

describe("toSslNegotiation", () => {
  test.each([
    ["postgres", PostgresConfig_SslNegotiation.POSTGRES],
    ["direct", PostgresConfig_SslNegotiation.DIRECT],
  ] as const)("maps %s to enum", (value, expected) => {
    expect(toSslNegotiation(value)).toBe(expected);
  });

  test("defaults to POSTGRES for unrecognized value", () => {
    expect(toSslNegotiation("unknown")).toBe(
      PostgresConfig_SslNegotiation.POSTGRES
    );
  });
});

describe("normalizeSslNegotiation", () => {
  test.each([
    [
      PostgresConfig_SslNegotiation.UNSPECIFIED,
      PostgresConfig_SslNegotiation.POSTGRES,
    ],
    [
      PostgresConfig_SslNegotiation.POSTGRES,
      PostgresConfig_SslNegotiation.POSTGRES,
    ],
    [
      PostgresConfig_SslNegotiation.DIRECT,
      PostgresConfig_SslNegotiation.DIRECT,
    ],
    [undefined, PostgresConfig_SslNegotiation.POSTGRES],
  ] as const)("normalizes %s", (value, expected) => {
    expect(normalizeSslNegotiation(value)).toBe(expected);
  });
});

describe("formatReplicationRole", () => {
  test("formats primary", () => {
    expect(formatReplicationRole(ServerInfo_ReplicationRole.PRIMARY)).toBe(
      "Primary"
    );
  });

  test("formats replica", () => {
    expect(formatReplicationRole(ServerInfo_ReplicationRole.REPLICA)).toBe(
      "Replica"
    );
  });

  test("returns Unknown for unspecified", () => {
    expect(formatReplicationRole(ServerInfo_ReplicationRole.UNSPECIFIED)).toBe(
      "Unknown"
    );
  });

  test("returns Unknown for unrecognized value", () => {
    expect(formatReplicationRole(999 as ServerInfo_ReplicationRole)).toBe(
      "Unknown"
    );
  });
});

describe("formatSetupMethod", () => {
  test("formats UI configured", () => {
    expect(formatSetupMethod(SetupMethod.UI_CONFIGURED)).toBe("ui_configured");
  });

  test("formats manual YAML", () => {
    expect(formatSetupMethod(SetupMethod.MANUAL_YAML)).toBe("manual_yaml");
  });

  test("formats embedded", () => {
    expect(formatSetupMethod(SetupMethod.EMBEDDED)).toBe("embedded");
  });

  test("returns null for unrecognized value", () => {
    expect(formatSetupMethod(999 as SetupMethod)).toBeNull();
  });

  test("returns null for UNSPECIFIED", () => {
    expect(formatSetupMethod(SetupMethod.UNSPECIFIED)).toBeNull();
  });
});
