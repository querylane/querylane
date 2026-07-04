import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useProtoForm } from "@/lib/use-proto-form";
import {
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

function renderPostgresConfigForm(password: string) {
  return renderHook(() => {
    const form = useProtoForm(PostgresConfigSchema, {
      defaultValues: {
        database: "querylane",
        host: "localhost",
        password,
        port: 5432,
        sslMode: PostgresConfig_SslMode.DISABLED,
        username: "querylane",
      },
      mode: "all",
    });
    // Read proxied form state during render so react-hook-form subscribes to
    // updates, matching how components consume the hook.
    return {
      errors: form.formState.errors,
      form,
      isValid: form.formState.isValid,
    };
  });
}

describe("useProtoForm", () => {
  test("computes initial validity without surfacing field errors", async () => {
    const { result } = renderPostgresConfigForm("");

    await waitFor(() => {
      expect(result.current.isValid).toBe(false);
    });

    expect(result.current.errors).toEqual({});
  });

  test("reports valid defaults as valid without errors", async () => {
    const { result } = renderPostgresConfigForm("secret");

    await waitFor(() => {
      expect(result.current.isValid).toBe(true);
    });

    expect(result.current.errors).toEqual({});
  });

  test("surfaces field errors once validation runs after mount", async () => {
    const { result } = renderPostgresConfigForm("");

    await waitFor(() => {
      expect(result.current.isValid).toBe(false);
    });

    await act(async () => {
      await result.current.form.trigger("password");
    });

    expect(result.current.errors.password?.message).toBeTruthy();
  });
});
