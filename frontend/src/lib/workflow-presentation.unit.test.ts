import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "vitest";
import {
  buildWorkflowListFilter,
  isDurableAccessDeniedError,
  isDurableNotInstalledError,
} from "@/lib/workflow-presentation";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import { WorkflowStatus } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

describe("workflow list presentation", () => {
  test("builds one server filter for search and selected statuses", () => {
    expect(
      buildWorkflowListFilter({
        query: String.raw`  docs "daily" \archive  `,
        statuses: [WorkflowStatus.RUNNING, WorkflowStatus.FAILED],
      })
    ).toBe(
      String.raw`(name:"docs \"daily\" \\archive" OR label:"docs \"daily\" \\archive") AND (status = "running" OR status = "failed")`
    );
  });

  test("classifies only the structured pg_durable absence precondition", () => {
    const notInstalled = new ConnectError(
      "pg_durable is not installed",
      Code.FailedPrecondition,
      undefined,
      [
        {
          desc: ErrorInfoSchema,
          value: create(ErrorInfoSchema, {
            metadata: { pg_durable_state: "not_installed" },
          }),
        },
      ]
    );

    expect(isDurableNotInstalledError(notInstalled)).toBe(true);
    expect(
      isDurableNotInstalledError(
        new ConnectError("transaction is read-only", Code.FailedPrecondition)
      )
    ).toBe(false);
  });

  test("classifies only structured pg_durable access denial", () => {
    const accessDenied = new ConnectError(
      "pg_durable access denied",
      Code.PermissionDenied,
      undefined,
      [
        {
          desc: ErrorInfoSchema,
          value: create(ErrorInfoSchema, {
            metadata: { pg_durable_state: "access_denied" },
          }),
        },
      ]
    );

    expect(isDurableAccessDeniedError(accessDenied)).toBe(true);
    expect(
      isDurableAccessDeniedError(
        new ConnectError("database connect denied", Code.PermissionDenied)
      )
    ).toBe(false);
  });
});
