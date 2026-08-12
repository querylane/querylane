import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  type CreateInstanceFormState,
  getConnectionFingerprint,
} from "@/features/new-instance-workflow";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import { InstanceService } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { useCreateInstancePageController } from "@/routes/new-instance-page-controller";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

const routeState = rs.hoisted(() => ({
  navigate: rs.fn(async () => undefined),
}));

rs.mock("@tanstack/react-router", () => ({
  useNavigate: () => routeState.navigate,
}));

const focusState = rs.hoisted(() => ({
  focusFirstCreateInstanceInvalidField: rs.fn(),
}));

rs.mock("@/routes/new-instance-focus", () => focusState);

const FOCUS_FAILURE = "focus handoff failed";
const HOST_VIOLATION = "Could not resolve host db.internal.";

const SUBMITTABLE_FORM_STATE: CreateInstanceFormState = {
  database: "postgres",
  displayName: "Production",
  host: "db.internal",
  instanceId: "",
  labels: [],
  password: "secret",
  port: "5432",
  sslMode: "prefer",
  sslNegotiation: "postgres",
  username: "postgres",
};

function createSubmittableInitialState() {
  return {
    formState: SUBMITTABLE_FORM_STATE,
    lastSuccessfulConnectionFingerprint: getConnectionFingerprint(
      SUBMITTABLE_FORM_STATE
    ),
  };
}

function createWrapper(transport: Transport) {
  const queryClient = createTestQueryClient();
  return function ControllerTestWrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TransportProvider>
    );
  };
}

function renderController(
  createInstance: () => Promise<Record<string, never>>
) {
  const transport = createTestRouterTransport(({ service }) => {
    service(InstanceService, {
      createInstance,
      testInstanceConnection: async () => ({}),
    });
  });

  return renderHook(
    () => useCreateInstancePageController(createSubmittableInitialState()),
    { wrapper: createWrapper(transport) }
  );
}

function fieldViolationError() {
  return new ConnectError(
    "invalid CreateInstanceRequest",
    Code.InvalidArgument,
    undefined,
    [
      {
        desc: BadRequestSchema,
        value: createProto(BadRequestSchema, {
          fieldViolations: [
            { description: HOST_VIOLATION, field: "spec.config.host" },
          ],
        }),
      },
    ]
  );
}

beforeEach(() => {
  routeState.navigate.mockReset();
  routeState.navigate.mockResolvedValue(undefined);
  focusState.focusFirstCreateInstanceInvalidField.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("create instance page controller", () => {
  test("clears the pending flag once a rejected create is handled", async () => {
    const { result } = renderController(() =>
      Promise.reject(fieldViolationError())
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.formErrors.host).toBe(HOST_VIOLATION);
    expect(result.current.isPending).toBe(false);
  });

  // The submit button is gated on `isPending`, so anything that throws after
  // the awaited create must still release the flag or the form wedges for the
  // rest of the session with no way to retry.
  test("releases the pending flag when outcome handling throws", async () => {
    focusState.focusFirstCreateInstanceInvalidField.mockImplementation(() => {
      throw new Error(FOCUS_FAILURE);
    });
    const { result } = renderController(() =>
      Promise.reject(fieldViolationError())
    );

    await act(async () => {
      await expect(result.current.handleCreate()).rejects.toThrow(
        FOCUS_FAILURE
      );
    });

    expect(result.current.isPending).toBe(false);
  });
});
