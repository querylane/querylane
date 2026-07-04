import { describe, expect, it } from "vitest";

import { getMethodLabel } from "@/components/onboarding-wizard/mappers";
import { formatSetupMethod, toSslMode } from "@/lib/protobuf-enums";
import { PostgresConfig_SslMode } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { SetupMethod } from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

describe("onboarding method mapping", () => {
  it("maps setup methods to config methods", () => {
    expect(formatSetupMethod(SetupMethod.UI_CONFIGURED)).toBe("ui_configured");
    expect(formatSetupMethod(SetupMethod.MANUAL_YAML)).toBe("manual_yaml");
    expect(formatSetupMethod(SetupMethod.EMBEDDED)).toBe("embedded");
    expect(formatSetupMethod(SetupMethod.UNSPECIFIED)).toBeNull();
  });

  it("returns labels for config methods", () => {
    expect(getMethodLabel("ui_configured")).toBe("Configure via UI");
    expect(getMethodLabel("manual_yaml")).toBe("Configure YAML manually");
    expect(getMethodLabel("embedded")).toBe("Use embedded database");
  });
});

describe("ssl mode conversion", () => {
  it("maps known ssl values and falls back to prefer", () => {
    expect(toSslMode("disable")).toBe(PostgresConfig_SslMode.DISABLED);
    expect(toSslMode("allow")).toBe(PostgresConfig_SslMode.ALLOW);
    expect(toSslMode("require")).toBe(PostgresConfig_SslMode.REQUIRE);
    expect(toSslMode("verify-ca")).toBe(PostgresConfig_SslMode.VERIFY_CA);
    expect(toSslMode("verify-full")).toBe(PostgresConfig_SslMode.VERIFY_FULL);
    expect(toSslMode("unknown")).toBe(PostgresConfig_SslMode.PREFER);
  });
});
