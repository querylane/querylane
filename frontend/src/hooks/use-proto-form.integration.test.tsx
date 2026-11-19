import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import { useProtoForm } from "@/hooks/use-proto-form/use-proto-form";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import {
  CreateInstanceSpecSchema,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

describe("useProtoForm", () => {
  test("retains multiple server violations on the same field", () => {
    const { result } = renderHook(() => {
      const form = useProtoForm(PostgresConfigSchema, {
        serverPathPrefixes: ["spec"],
      });
      return { errors: form.formState.errors, form };
    });
    const error = new ConnectError(
      "invalid request",
      Code.InvalidArgument,
      undefined,
      [
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [
              { field: "spec.host", description: "Host is not reachable" },
              { field: "spec.host", description: "Host is not permitted" },
            ],
          }),
        },
      ]
    );

    act(() => {
      result.current.form.setServerErrors(error);
    });

    expect(Object.values(result.current.errors.host?.types ?? {})).toEqual([
      "Host is not reachable",
      "Host is not permitted",
    ]);
    expect(result.current.errors.host?.message).toBe("Host is not reachable");
  });

  test("resets an unregistered nested section to its default values", () => {
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

    act(() => {
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
