import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "@rstest/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProtoForm } from "@/hooks/use-proto-form/use-proto-form";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import {
  CreateInstanceSpecSchema,
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

function badRequestError(field: string) {
  return new ConnectError("invalid request", Code.InvalidArgument, undefined, [
    {
      desc: BadRequestSchema,
      value: create(BadRequestSchema, {
        fieldViolations: [{ description: "is required", field }],
      }),
    },
  ]);
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

  test("maps server errors from every supported request body prefix", () => {
    const { result } = renderHook(() => {
      const form = useProtoForm(PostgresConfigSchema, {
        serverPathPrefixes: ["spec", "instance"],
      });
      return { errors: form.formState.errors, form };
    });

    act(() => {
      result.current.form.setServerErrors(badRequestError("spec.host"));
      result.current.form.setServerErrors(badRequestError("instance.database"));
    });

    expect(result.current.errors.host?.message).toBeTruthy();
    expect(result.current.errors.database?.message).toBeTruthy();
  });

  test("retains multiple server violations on the same field", async () => {
    const { result } = renderPostgresConfigForm("secret");
    const error = new ConnectError(
      "invalid request",
      Code.InvalidArgument,
      undefined,
      [
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [
              { field: "host", description: "Host is not reachable" },
              { field: "host", description: "Host is not permitted" },
            ],
          }),
        },
      ]
    );

    await act(async () => {
      result.current.form.setServerErrors(error);
    });

    expect(Object.values(result.current.errors.host?.types ?? {})).toEqual([
      "Host is not reachable",
      "Host is not permitted",
    ]);
    expect(result.current.errors.host?.message).toBe("Host is not reachable");
  });

  test("resets an unregistered nested section to its default values", async () => {
    const { result } = renderHook(() => {
      const form = useProtoForm(CreateInstanceSpecSchema, {
        defaultValues: { config: { host: "localhost" } },
      });
      return { form, isDirty: form.formState.isDirty };
    });

    act(() => {
      result.current.form.setValue("config.host", "changed.internal", {
        shouldDirty: true,
      });
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      result.current.form.resetField("config");
    });

    expect(result.current.form.createMessage().config?.host).toBe("localhost");
    expect(result.current.isDirty).toBe(false);
  });

  test("validates and masks a modified field even when restored to its default", async () => {
    const { result } = renderHook(() => {
      const form = useProtoForm(PostgresConfigSchema, {
        defaultValues: { password: "" },
        mode: "onChange",
        validationScope: "modified-fields",
      });
      return { errors: form.formState.errors, form };
    });

    await act(async () => {
      result.current.form.setValue("password", "temporary", {
        shouldDirty: true,
        shouldValidate: true,
      });
      result.current.form.setValue("password", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      await result.current.form.trigger();
    });

    expect(result.current.errors.password?.message).toBeTruthy();
    expect(result.current.form.createUpdateMask().paths).toEqual(["password"]);
  });
});
