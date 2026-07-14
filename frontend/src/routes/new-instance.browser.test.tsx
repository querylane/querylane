import { create as createProto } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BadRequestSchema } from "@/protogen/google/rpc/error_details_pb";
import type { CreateInstancePageState } from "@/routes/new-instance-page";
import { CreateInstancePageInner } from "@/routes/new-instance-page";
import { createTestQueryClient } from "@/test/query-client";

const MANAGED_NOT_INTERNAL_STORAGE_RE = /not Querylane internal storage/;
const NAVIGATION_FAILURE_RE = /could not open it automatically/;
const INVALID_CONFIG_FIELD_RE = /invalid field "config"/;

const routeState = vi.hoisted(() => ({
  createInstance: vi.fn(async () => ({ instance: { name: "instances/prod" } })),
  listDatabases: vi.fn(async () => ({ databases: [] })),
  navigate: vi.fn(async () => undefined),
  queryClient: null as QueryClient | null,
  testInstanceConnection: vi.fn(async () => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  ...Object.fromEntries([
    ["Navigate", ({ to }: { to: string }) => <div>Redirecting to {to}</div>],
  ]),
  useNavigate: () => routeState.navigate,
}));

vi.mock("@connectrpc/connect-query", () => ({
  useQuery: vi.fn(),
  useTransport: () => ({}),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query"
  );
  return {
    ...actual,
    useQueryClient: () => ({
      ...routeState.queryClient,
      fetchQuery: routeState.listDatabases,
    }),
  };
});

vi.mock("@/hooks/api/console", () => ({
  useConfigManagedInstancesStatus: () => ({
    isConfigManaged: false,
    isLoaded: true,
  }),
  useIsConfigManagedInstances: () => false,
}));

vi.mock("@/hooks/api/instance", () => ({
  useCreateInstanceMutation: () => ({
    isPending: false,
    mutateAsync: routeState.createInstance,
  }),
  useTestInstanceConnectionMutation: () => ({
    isPending: false,
    mutateAsync: routeState.testInstanceConnection,
  }),
}));

function renderCreateInstance(initialState?: Partial<CreateInstancePageState>) {
  routeState.queryClient = createTestQueryClient();
  render(
    <ScreenshotFrame>
      <div
        className="w-[1120px] origin-top-left scale-90 rounded-2xl border border-border bg-background text-foreground"
        data-create-instance-visual-surface=""
        data-testid="create-instance-visual-surface"
      >
        <CreateInstancePageInner initialState={initialState} />
      </div>
    </ScreenshotFrame>
  );
}

async function fillRequiredConnectionFields() {
  await page.getByLabelText("Display name").fill("Production");
  await page.getByLabelText("Host").fill("localhost");
  await page.getByLabelText("Default database").fill("postgres");
  await page.getByLabelText("Username").fill("postgres");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
}

beforeEach(() => {
  routeState.createInstance.mockReset();
  routeState.createInstance.mockResolvedValue({
    instance: { name: "instances/prod" },
  });
  routeState.listDatabases.mockReset();
  routeState.listDatabases.mockResolvedValue({ databases: [] });
  routeState.navigate.mockReset();
  routeState.navigate.mockResolvedValue(undefined);
  routeState.testInstanceConnection.mockReset();
  routeState.testInstanceConnection.mockResolvedValue({});
});

test("create instance form keeps initial setup path visually stable", async () => {
  renderCreateInstance();

  await expect
    .element(page.getByRole("heading", { name: "Postgres server to manage" }))
    .toBeVisible();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-initial");
});

test("create instance form keeps DSN-prefilled advanced fields readable", async () => {
  renderCreateInstance({
    formNotice: null,
    formState: {
      database: "warehouse",
      displayName: "Production analytics writer",
      host: "analytics-writer.internal.querylane.test",
      instanceId: "",
      labels: [
        { id: "label-environment", key: "environment", value: "production" },
      ],
      password: "secret",
      port: "6543",
      sslMode: "verify-full",
      sslNegotiation: "postgres",
      username: "reporter",
    },
    isTesting: false,
    showAdvanced: true,
    testResult: null,
  });

  await expect
    .element(page.getByRole("heading", { name: "Postgres server to manage" }))
    .toBeVisible();
  await expect
    .element(page.getByText(MANAGED_NOT_INTERNAL_STORAGE_RE))
    .toBeVisible();

  await expect
    .element(page.getByLabelText("Host"))
    .toHaveValue("analytics-writer.internal.querylane.test");
  await expect.element(page.getByText("verify-full").first()).toBeVisible();
  await expect.element(page.getByText("Labels")).toBeVisible();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-dsn-advanced");
});

test("create instance form warns about DSN parameters it cannot apply", async () => {
  renderCreateInstance();

  await page
    .getByLabelText("Connection string")
    .fill(
      "postgresql://postgres:secret@[2001:db8::1]/postgres?sslmode=require&channel_binding=require"
    );
  await page.getByRole("button", { name: "Apply DSN" }).click();

  await expect.element(page.getByLabelText("Host")).toHaveValue("2001:db8::1");
  expect(
    page
      .getByLabelText("SSL mode")
      .element()
      .querySelector('[data-slot="ssl-mode-icon"][data-mode="require"]')
  ).not.toBeNull();
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("DSN parameters not applied: channel_binding.");

  await page
    .getByLabelText("Connection string")
    .fill("postgres://postgres:secret@localhost/postgres");
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("DSN parameters not applied: channel_binding.");
});

test("create instance SSL mode menu keeps descriptions readable", async () => {
  renderCreateInstance();

  await page.getByLabelText("SSL mode").click();
  await expect
    .element(
      page.getByText(
        "Require TLS and verify both the trusted CA and the server hostname."
      )
    )
    .toBeVisible();

  const popup = document.querySelector(
    '[data-slot="select-content"][data-open]'
  );
  const description = page
    .getByText(
      "Require TLS and verify both the trusted CA and the server hostname."
    )
    .element();

  expect(popup).toBeInstanceOf(HTMLElement);
  expect(description).toBeInstanceOf(HTMLElement);

  if (!(popup instanceof HTMLElement)) {
    throw new Error("SSL mode menu did not open.");
  }

  const popupRect = popup.getBoundingClientRect();
  const descriptionRect = description.getBoundingClientRect();

  expect(popupRect.width).toBeGreaterThanOrEqual(350);
  expect(descriptionRect.right).toBeLessThanOrEqual(popupRect.right - 28);
});

test("create instance SSL mode shows icons in the trigger and menu", async () => {
  renderCreateInstance();

  await expect
    .element(page.getByRole("heading", { name: "Postgres server to manage" }))
    .toBeVisible();

  const trigger = page.getByLabelText("SSL mode").element();
  expect(
    trigger.querySelector('[data-slot="ssl-mode-icon"][data-mode="prefer"]')
  ).toBeInstanceOf(SVGSVGElement);

  await page.getByLabelText("SSL mode").click();

  const renderedModes = Array.from(
    document.querySelectorAll('[data-slot="ssl-mode-icon"]')
  ).map((icon) => icon.getAttribute("data-mode"));

  expect(new Set(renderedModes)).toEqual(
    new Set([
      "disable",
      "allow",
      "prefer",
      "require",
      "verify-ca",
      "verify-full",
    ])
  );
});

test("connection test validation prevents invisible bad submits", async () => {
  renderCreateInstance();

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(page.getByText("Display name is required."))
    .toBeVisible();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-validation");
});

test("connection test validation shows per-field errors and focuses first invalid field", async () => {
  renderCreateInstance();

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(page.getByText("Display name is required."))
    .toBeVisible();
  await expect.element(page.getByText("Host is required.")).toBeVisible();
  await expect.element(page.getByText("Password is required.")).toBeVisible();
  await expect.element(page.getByLabelText("Display name")).toHaveFocus();
});

test("new instance creation is gated on successful connection test", async () => {
  renderCreateInstance();

  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .toBeDisabled();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  expect(routeState.testInstanceConnection).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        database: "postgres",
        host: "localhost",
        password: "secret",
        port: 5432,
        username: "postgres",
      }),
    })
  );
  expect(routeState.createInstance).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .not.toBeDisabled();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-connection-success");

  await page.getByRole("button", { name: "Create instance" }).click();

  expect(routeState.createInstance).toHaveBeenCalledWith(
    expect.objectContaining({ validateOnly: false })
  );
});

test("new instance creation navigates without waiting for database discovery", async () => {
  let resolveDatabases!: () => void;
  routeState.listDatabases.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveDatabases = () => resolve({ databases: [] });
      })
  );
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect.poll(() => routeState.navigate.mock.calls.length).toBe(1);
  expect(routeState.navigate).toHaveBeenCalledWith({
    params: { databaseId: "postgres", instanceId: "prod" },
    search: {},
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  });

  resolveDatabases();
});

test("new instance creation stays disabled until success navigation completes", async () => {
  let finishNavigation!: () => void;
  routeState.navigate.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        finishNavigation = () => resolve(undefined);
      })
  );
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .toBeDisabled();
  expect(routeState.createInstance).toHaveBeenCalledTimes(1);

  finishNavigation();

  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .not.toBeDisabled();
});

test("new instance creation shows inline feedback when success navigation fails", async () => {
  routeState.navigate.mockRejectedValueOnce(new Error("router unavailable"));
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect.element(page.getByText(NAVIGATION_FAILURE_RE)).toBeVisible();
  await expect.element(page.getByRole("alert")).toBeVisible();
});

test("new instance creation ignores cancelled success navigation", async () => {
  routeState.navigate.mockRejectedValueOnce(new Error("Navigation cancelled"));
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();

  await expect
    .element(page.getByText(NAVIGATION_FAILURE_RE))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .not.toBeDisabled();
});

test("new instance creation requires retest after connection fields change", async () => {
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .not.toBeDisabled();

  await page.getByLabelText("Display name").fill("Production renamed");
  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .not.toBeDisabled();

  await page.getByLabelText("Host").fill("db.internal");

  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .toBeDisabled();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-retest-required");
});

test("connection test result clears after editing connection fields", async () => {
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect.element(page.getByText("Connection successful.")).toBeVisible();
  await expect.element(page.getByRole("status")).toBeVisible();

  await page.getByLabelText("Host").fill("db.internal");

  await expect
    .element(page.getByText("Connection successful."))
    .not.toBeInTheDocument();
});

test("connection test failure keeps create blocked with inline feedback", async () => {
  routeState.testInstanceConnection.mockRejectedValueOnce(
    new Error("connection refused")
  );
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect.element(page.getByText("connection refused")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .toBeDisabled();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-connection-failure");
});

test("connection test failure keeps server field errors anchored to connection fields", async () => {
  routeState.testInstanceConnection.mockRejectedValueOnce(
    new ConnectError(
      "invalid CreateInstanceRequest",
      Code.InvalidArgument,
      undefined,
      [
        {
          desc: BadRequestSchema,
          value: createProto(BadRequestSchema, {
            fieldViolations: [
              {
                description:
                  "PostgreSQL is unreachable with these connection settings. Check the host and port, then try again.",
                field: "config.host",
              },
              {
                description:
                  "PostgreSQL is unreachable with these connection settings. Check the host and port, then try again.",
                field: "config.port",
              },
            ],
          }),
        },
      ]
    )
  );
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(
      page
        .getByText(
          "PostgreSQL is unreachable with these connection settings. Check the host and port, then try again."
        )
        .first()
    )
    .toBeVisible();
  await expect.element(page.getByLabelText("Host")).toHaveFocus();
  await expect
    .element(page.getByLabelText("Host"))
    .toHaveAttribute("aria-invalid", "true");
  await expect
    .element(page.getByLabelText("Port"))
    .toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-server-field-errors");
});

test("connection test failure shows actionable backend details", async () => {
  const connectionFailureMessage =
    "Could not connect to PostgreSQL with these settings. Check the host, port, database, username, password, and SSL mode. Details: dial tcp: lookup host: no such host";
  routeState.testInstanceConnection.mockRejectedValueOnce(
    new Error(connectionFailureMessage)
  );
  renderCreateInstance();

  await fillRequiredConnectionFields();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect.element(page.getByText(connectionFailureMessage)).toBeVisible();
  await expect
    .element(page.getByText(INVALID_CONFIG_FIELD_RE))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Create instance" }))
    .toBeDisabled();
});

test("connection test validation focuses empty advanced label keys", async () => {
  renderCreateInstance();

  await page.getByLabelText("Display name").fill("Prod");
  await page.getByLabelText("Host").fill("localhost");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
  await page.getByRole("button", { name: "Show advanced options" }).click();
  await page.getByRole("button", { name: "Add label" }).click();

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(page.getByText("Label keys cannot be empty."))
    .toBeVisible();
  await expect.element(page.getByPlaceholder("Key")).toHaveFocus();
  await expect
    .element(page.getByPlaceholder("Key"))
    .toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByTestId("create-instance-visual-surface")
  ).toMatchScreenshot("create-instance-advanced-label-error");
});

test("connection test validation expands advanced options for hidden label errors", async () => {
  renderCreateInstance();

  await page.getByLabelText("Display name").fill("Prod");
  await page.getByLabelText("Host").fill("localhost");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
  await page.getByRole("button", { name: "Show advanced options" }).click();
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByRole("button", { name: "Hide advanced options" }).click();

  await page.getByRole("button", { name: "Test connection" }).click();

  await expect
    .element(page.getByText("Label keys cannot be empty."))
    .toBeVisible();
  await expect.element(page.getByPlaceholder("Key")).toHaveFocus();
});

test("label edits preserve unrelated validation errors", async () => {
  renderCreateInstance();

  await page.getByRole("button", { name: "Test connection" }).click();
  await page.getByRole("button", { name: "Show advanced options" }).click();
  await page.getByRole("button", { name: "Add label" }).click();

  await expect
    .element(page.getByText("Display name is required."))
    .toBeVisible();
  await expect.element(page.getByText("Host is required.")).toBeVisible();
});
