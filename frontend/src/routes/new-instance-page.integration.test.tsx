import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import { InstanceService } from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { CreateInstancePageInner } from "@/routes/new-instance-page";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";

const routeState = rs.hoisted(() => ({
  navigate: rs.fn(async () => undefined),
}));

rs.mock("@tanstack/react-router", () => ({
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
  const transport = createTestRouterTransport(({ service }) => {
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
  test("rejects malformed labels locally and focuses the invalid row", async () => {
    const user = userEvent.setup();
    const testConnection = rs.fn(async () => ({}));
    renderCreateInstancePage({
      createInstance: async () => ({}),
      testInstanceConnection: testConnection,
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Staging" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "db.example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    await user.click(
      screen.getByRole("button", { name: "Show advanced options" })
    );
    await user.click(screen.getByRole("button", { name: "Add label" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Label key 1" }), {
      target: { value: "invalid key" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Label value 1" }), {
      target: { value: "x".repeat(256) },
    });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert")
          .map((alert) => alert.textContent)
          .join(" ")
      ).toContain("255")
    );
    expect(
      screen
        .getAllByRole("alert")
        .map((alert) => alert.textContent)
        .join(" ")
    ).toContain("regex pattern");
    expect(testConnection).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("textbox", { name: "Label key 1" })
        .getAttribute("aria-invalid")
    ).toBe("true");
    expect(
      screen
        .getByRole("textbox", { name: "Label value 1" })
        .getAttribute("aria-invalid")
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Label key 1" })
    );
  });

  test.each(["team.example/owner", "constructor"])(
    "keeps every server label violation associated with the %s row",
    async (key) => {
      const user = userEvent.setup();
      renderCreateInstancePage({
        createInstance: () =>
          Promise.reject(
            new ConnectError(
              "invalid labels",
              Code.InvalidArgument,
              undefined,
              [
                {
                  desc: BadRequestSchema,
                  value: createProto(BadRequestSchema, {
                    fieldViolations: [
                      {
                        field: `spec.labels[${JSON.stringify(key)}]`,
                        description: "This label is reserved.",
                      },
                      {
                        field: `spec.labels[${JSON.stringify(key)}]`,
                        description: "Label value is not allowed here.",
                      },
                    ],
                  }),
                },
              ]
            )
          ),
      });
      await fillAndTestConnection(user);
      await user.click(
        screen.getByRole("button", { name: "Show advanced options" })
      );
      await user.click(screen.getByRole("button", { name: "Add label" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Label key 1" }), {
        target: { value: "env" },
      });
      await user.click(screen.getByRole("button", { name: "Add label" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Label key 2" }), {
        target: { value: key },
      });
      await user.click(screen.getByRole("button", { name: "Create instance" }));
      await waitFor(() =>
        expect(
          screen.getByText("Label value is not allowed here.")
        ).toBeTruthy()
      );
      expect(screen.getByText("This label is reserved.")).toBeTruthy();
      const rejected = screen.getByRole("textbox", { name: "Label key 2" });
      expect(rejected.getAttribute("aria-invalid")).toBe("true");
      expect(
        screen
          .getByRole("textbox", { name: "Label key 1" })
          .getAttribute("aria-invalid")
      ).not.toBe("true");
      expect(document.activeElement).toBe(rejected);
      expect(rejected.getAttribute("aria-describedby")).toBeTruthy();
    }
  );

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

  test("focuses the rejected field even when a frame fires before React commits", async () => {
    // A loaded device can run the next animation frame before React commits
    // the error render; focus must wait for the commit, not the frame.
    rs.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const user = userEvent.setup();
    renderCreateInstancePage({
      createInstance: async () => ({}),
      testInstanceConnection: () =>
        Promise.reject(
          new ConnectError("unreachable", Code.InvalidArgument, undefined, [
            {
              desc: BadRequestSchema,
              value: createProto(BadRequestSchema, {
                fieldViolations: [
                  { description: HOST_VIOLATION, field: "config.host" },
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
      expect(document.activeElement).toBe(screen.getByLabelText("Host"));
    });
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

test("valid prototype-like label keys cannot bypass value validation", async () => {
  const user = userEvent.setup();
  const testConnection = rs.fn(async () => ({}));
  renderCreateInstancePage({
    createInstance: async () => ({}),
    testInstanceConnection: testConnection,
  });
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Staging" },
  });
  fireEvent.change(screen.getByLabelText("Host"), {
    target: { value: "db.example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" },
  });
  await user.click(
    screen.getByRole("button", { name: "Show advanced options" })
  );
  await user.click(screen.getByRole("button", { name: "Add label" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Label key 1" }), {
    target: { value: "constructor" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Label value 1" }), {
    target: { value: "x".repeat(256) },
  });
  await user.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("alert")
        .map((alert) => alert.textContent)
        .join(" ")
    ).toContain("255")
  );
  expect(testConnection).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Label key 1" })
  );
});
