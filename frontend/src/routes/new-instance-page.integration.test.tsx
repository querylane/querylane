import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import { InstanceService } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { CreateInstancePageInner } from "@/routes/new-instance-page";
import { createTestQueryClient } from "@/test/query-client";

const routeState = vi.hoisted(() => ({
  navigate: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routeState.navigate,
}));

const HOST_VIOLATION = "Could not resolve host db.internal.";
const INSTANCE_ID_VIOLATION = "Instance ID must start with a letter.";
const CONFIG_VIOLATION = "Connection failed before validation completed.";
const GENERIC_CREATE_ERROR_RE = /invalid CreateInstanceRequest/;
const INSTANCE_LIMIT_RE = /instance limit reached/;

function createInstanceBadRequestError({
  includeGeneralViolation = false,
}: {
  includeGeneralViolation?: boolean;
} = {}) {
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
            { description: INSTANCE_ID_VIOLATION, field: "instance_id" },
            ...(includeGeneralViolation
              ? [{ description: CONFIG_VIOLATION, field: "spec.config" }]
              : []),
          ],
        }),
      },
    ]
  );
}

function renderCreateInstancePage({
  createInstance,
  testInstanceConnection = async () => ({}),
}: {
  createInstance: () => Promise<Record<string, never>>;
  testInstanceConnection?: () => Promise<Record<string, never>>;
}) {
  const queryClient = createTestQueryClient();
  const transport = createRouterTransport(({ service }) => {
    service(InstanceService, {
      createInstance,
      testInstanceConnection,
    });
  });

  return render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <CreateInstancePageInner />
      </QueryClientProvider>
    </TransportProvider>
  );
}

async function fillAndTestConnection(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Production" },
  });
  fireEvent.change(screen.getByLabelText("Host"), {
    target: { value: "db.internal" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" },
  });

  await user.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() => {
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Create instance",
      }).disabled
    ).toBe(false);
  });
}

beforeEach(() => {
  routeState.navigate.mockReset();
  routeState.navigate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("create instance backend field violations", () => {
  test("maps BadRequest violations onto the matching form fields", async () => {
    const user = userEvent.setup();
    renderCreateInstancePage({
      createInstance: () => Promise.reject(createInstanceBadRequestError()),
    });

    await fillAndTestConnection(user);
    await user.click(screen.getByRole("button", { name: "Create instance" }));

    await waitFor(() => {
      expect(screen.getByText(HOST_VIOLATION)).toBeTruthy();
    });
    expect(screen.getByLabelText("Host").getAttribute("aria-invalid")).toBe(
      "true"
    );
    // The instance ID violation must expand the advanced section so the
    // error is visible.
    expect(screen.getByText(INSTANCE_ID_VIOLATION)).toBeTruthy();
    // Field violations render inline, not as a duplicated generic notice.
    expect(screen.queryByText(GENERIC_CREATE_ERROR_RE)).toBeNull();
  });

  test("shows unmapped BadRequest violations alongside field errors", async () => {
    const user = userEvent.setup();
    renderCreateInstancePage({
      createInstance: () =>
        Promise.reject(
          createInstanceBadRequestError({ includeGeneralViolation: true })
        ),
    });

    await fillAndTestConnection(user);
    await user.click(screen.getByRole("button", { name: "Create instance" }));

    await waitFor(() => {
      expect(screen.getByText(HOST_VIOLATION)).toBeTruthy();
    });
    expect(screen.getByText(new RegExp(CONFIG_VIOLATION))).toBeTruthy();
  });

  test("maps test-connection BadRequest violations onto connection fields", async () => {
    const user = userEvent.setup();
    const databaseViolation = "PostgreSQL could not find this database.";
    renderCreateInstancePage({
      createInstance: async () => ({}),
      testInstanceConnection: () =>
        Promise.reject(
          new ConnectError("database not found", Code.NotFound, undefined, [
            {
              desc: BadRequestSchema,
              value: createProto(BadRequestSchema, {
                fieldViolations: [
                  { description: databaseViolation, field: "config.database" },
                ],
              }),
            },
          ])
        ),
    });

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Production" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "db.internal" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(screen.getByText(databaseViolation)).toBeTruthy();
    });
    expect(
      screen.getByLabelText("Default database").getAttribute("aria-invalid")
    ).toBe("true");
    expect(screen.queryByText("database not found")).toBeNull();
  });

  test("keeps the inline notice for errors without field violations", async () => {
    const user = userEvent.setup();
    renderCreateInstancePage({
      createInstance: () =>
        Promise.reject(
          new ConnectError("instance limit reached", Code.FailedPrecondition)
        ),
    });

    await fillAndTestConnection(user);
    await user.click(screen.getByRole("button", { name: "Create instance" }));

    await waitFor(() => {
      expect(screen.getByText(INSTANCE_LIMIT_RE)).toBeTruthy();
    });
    expect(
      screen.getByLabelText("Host").getAttribute("aria-invalid")
    ).toBeNull();
  });
});
