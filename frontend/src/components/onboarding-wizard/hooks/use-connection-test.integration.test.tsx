import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";

import { useConnectionTest } from "@/components/onboarding-wizard/hooks/use-connection-test";
import {
  PostgresConfig_SslMode,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const { mutateAsyncMock } = rs.hoisted(() => ({
  mutateAsyncMock: rs.fn(),
}));

rs.mock("@/hooks/api/instance", () => ({
  useTestInstanceConnectionMutation: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}));

function buildPostgresConfig() {
  return createProto(PostgresConfigSchema, {
    database: "postgres",
    host: "localhost",
    password: "secret",
    port: 5432,
    sslMode: PostgresConfig_SslMode.DISABLED,
    username: "postgres",
  });
}

describe("useConnectionTest", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    rs.useFakeTimers();
  });

  afterEach(() => {
    rs.runOnlyPendingTimers();
    rs.useRealTimers();
  });

  it("submits a validate-only create instance request and reports temporary success", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      await result.current.testConnection(buildPostgresConfig());
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ host: "localhost" }),
      })
    );
    const request = mutateAsyncMock.mock.calls[0]?.[0];
    expect(request.config?.database).toBe("postgres");
    expect(request.config?.host).toBe("localhost");
    expect(result.current.status).toBe("success");
    expect(result.current.errorMessage).toBeNull();

    act(() => {
      rs.advanceTimersByTime(4000);
    });

    expect(result.current.status).toBe("idle");
  });

  it("surfaces ConnectError messages from failed connection tests", async () => {
    mutateAsyncMock.mockRejectedValue(
      new ConnectError("password authentication failed", Code.InvalidArgument)
    );
    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      await result.current.testConnection(buildPostgresConfig());
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("password authentication failed");
  });

  it("clears pending success timers and errors when reset", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      await result.current.testConnection(buildPostgresConfig());
    });

    expect(result.current.status).toBe("success");

    act(() => {
      result.current.resetTest();
      rs.advanceTimersByTime(4000);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.errorMessage).toBeNull();
  });
});
