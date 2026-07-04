import { describe, expect, test } from "vitest";
import {
  buildCreateInstanceRequest,
  canCreateInstance,
  createCreateInstanceWorkflowState,
  createInstanceWorkflowReducer,
  getConnectionFingerprint,
  getCreateInstanceNavigationTarget,
  validateWorkflowSubmit,
} from "@/features/new-instance-workflow";

describe("new instance workflow", () => {
  test("invalid submit exposes errors and expands advanced label errors", () => {
    const state = createCreateInstanceWorkflowState({
      formState: {
        displayName: "",
        host: "",
        labels: [{ id: "1", key: "", value: "prod" }],
      },
    });
    const validation = validateWorkflowSubmit(state);
    const next = createInstanceWorkflowReducer(state, {
      firstInvalidField: validation.firstInvalidField,
      formErrors: validation.errors,
      type: "setFormErrors",
    });

    expect(next.firstInvalidField).toBe("displayName");
    expect(next.formErrors.labels).toBe("Label keys cannot be empty.");
    expect(next.showAdvanced).toBe(false);
  });

  test("label-focused validation expands advanced options", () => {
    const state = createCreateInstanceWorkflowState({
      formState: {
        database: "postgres",
        displayName: "Prod",
        host: "db.local",
        labels: [{ id: "1", key: "", value: "prod" }],
        password: "secret",
        port: "5432",
        username: "postgres",
      },
    });
    const validation = validateWorkflowSubmit(state);
    const next = createInstanceWorkflowReducer(state, {
      firstInvalidField: validation.firstInvalidField,
      formErrors: validation.errors,
      type: "setFormErrors",
    });

    expect(next.firstInvalidField).toBe("labels");
    expect(next.showAdvanced).toBe(true);
  });

  test("successful connection enables create until connection fields change", () => {
    let state = createCreateInstanceWorkflowState({
      formState: {
        displayName: "Prod",
        host: "db.local",
        password: "secret",
      },
    });
    state = createInstanceWorkflowReducer(state, {
      result: { message: "Connection successful.", variant: "success" },
      type: "setTestResult",
    });
    state = createInstanceWorkflowReducer(state, {
      fingerprint: getConnectionFingerprint(state.formState),
      type: "setLastSuccessfulConnectionFingerprint",
    });

    expect(canCreateInstance(state)).toBe(true);

    state = createInstanceWorkflowReducer(state, {
      field: "displayName",
      type: "updateField",
      value: "Prod renamed",
    });

    expect(canCreateInstance(state)).toBe(true);

    state = createInstanceWorkflowReducer(state, {
      field: "host",
      type: "updateField",
      value: "db2.local",
    });

    expect(state.testResult).toBeNull();
    expect(canCreateInstance(state)).toBe(false);
  });

  test("failed connection keeps create blocked", () => {
    const state = createCreateInstanceWorkflowState({
      formState: { displayName: "Prod", host: "db.local", password: "secret" },
    });
    const next = createInstanceWorkflowReducer(state, {
      fingerprint: null,
      type: "setLastSuccessfulConnectionFingerprint",
    });

    expect(canCreateInstance(next)).toBe(false);
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
