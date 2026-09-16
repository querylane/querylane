import { describe, expect, test } from "@rstest/core";
import {
  buildCreateInstanceRequest,
  canCreateInstance,
  createCreateInstanceWorkflowState,
  getConnectionFingerprint,
  getCreateInstanceNavigationTarget,
} from "@/features/new-instance-workflow";

describe("new instance workflow", () => {
  test("successful connection fingerprint enables create", () => {
    const initialState = createCreateInstanceWorkflowState({
      formState: {
        displayName: "Prod",
        host: "db.local",
        password: "secret",
      },
    });
    const state = {
      ...initialState,
      lastSuccessfulConnectionFingerprint: getConnectionFingerprint(
        initialState.formState
      ),
    };

    expect(canCreateInstance(state)).toBe(true);
  });

  test("failed connection keeps create blocked", () => {
    const state = createCreateInstanceWorkflowState({
      formState: { displayName: "Prod", host: "db.local", password: "secret" },
    });

    expect(canCreateInstance(state)).toBe(false);
  });

  test("create request trims identity fields and label keys", () => {
    const request = buildCreateInstanceRequest(
      createCreateInstanceWorkflowState({
        formState: {
          displayName: " Prod ",
          host: " db.local ",
          instanceId: " prod ",
          labels: [{ id: "1", key: " env ", value: "prod" }],
          password: "secret",
        },
      }).formState
    );

    expect(request.instanceId).toBe("prod");
    expect(request.spec.displayName).toBe("Prod");
    expect(request.spec.labels).toEqual({ env: "prod" });
    expect(request.spec.config?.host).toBe("db.local");
  });

  test("create and test requests carry SSL negotiation", () => {
    const request = buildCreateInstanceRequest(
      createCreateInstanceWorkflowState({
        formState: {
          displayName: "Prod",
          host: "db.local",
          password: "secret",
          sslMode: "require",
          sslNegotiation: "direct",
        },
      }).formState
    );

    expect(request.spec.config?.sslNegotiation).toBe(2);
  });

  test("request builders reject malformed ports defensively", () => {
    const state = createCreateInstanceWorkflowState({
      formState: {
        displayName: "Prod",
        host: "db.local",
        password: "secret",
        port: "5432abc",
      },
    });

    expect(() => buildCreateInstanceRequest(state.formState)).toThrow(
      "Port must be between 1 and 65535."
    );
    expect(canCreateInstance(state)).toBe(false);
  });

  test("navigation targets instance detail or home fallback", () => {
    expect(getCreateInstanceNavigationTarget("instances/prod")).toEqual({
      params: { instanceId: "prod" },
      search: {},
      to: "/instances/$instanceId",
    });
    expect(getCreateInstanceNavigationTarget()).toEqual({
      replace: true,
      to: "/",
    });
  });
});
