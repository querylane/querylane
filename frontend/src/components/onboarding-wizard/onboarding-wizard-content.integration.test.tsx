import { create as createProto } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  InstanceService,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  GetOnboardingStateResponseSchema,
  SetupMethod,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  DEFAULT_WIZARD_SESSION_STATE,
  useOnboardingWizardStore,
} from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";
import { createTestQueryClient } from "@/test/query-client";
import { ThemeProvider } from "@/theme-provider";

const TEST_NUMBER_5433 = 5433;

const CONFIGURE_UI_RE = /Configure via UI/;
const CONFIGURE_YAML_RE = /Configure YAML manually/;
const EMBEDDED_RE = /Use embedded database/;
const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/;
const DIRECT_SSL_NEGOTIATION_OPTION_RE = /^direct /i;
const INVALID_CONNECTION_STRING_RE = /Invalid connection string/i;
const REFRESH_RE = /Refresh/;
const REQUIRE_SSL_MODE_OPTION_RE = /^require /i;
const SETUP_INTERNAL_STORAGE_RE = /Step 1 sets up Querylane internal storage/;
const VERIFY_FULL_RE = /verify-full/;
const SSL_MODE_VALUES = [
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
] as const;

let restoreLocalStorage: (() => void) | undefined;
const renderedQueryClients: QueryClient[] = [];

function getRenderedSslModeIconModes() {
  return new Set(
    Array.from(document.querySelectorAll('[data-slot="ssl-mode-icon"]')).map(
      (icon) => icon.getAttribute("data-mode")
    )
  );
}

function installLocalStorageStub() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "localStorage"
  );
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
      return;
    }

    Reflect.deleteProperty(window, "localStorage");
  };
}

function createOnboardingState(
  overrides: Partial<
    Parameters<typeof createProto<typeof GetOnboardingStateResponseSchema>>[1]
  > = {}
) {
  return createProto(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: createProto(AppDatabaseStatusSchema, {
      state: AppDatabaseStatus_State.NOT_CONFIGURED,
    }),
    availableMethods: [
      SetupMethod.UI_CONFIGURED,
      SetupMethod.MANUAL_YAML,
      SetupMethod.EMBEDDED,
    ],
    configFilePath: "/tmp/querylane/config.yaml",
    embeddedDataPath: "/tmp/querylane/embedded-postgres",
    homePath: "/tmp/querylane",
    isConfigured: false,
    isHomeWritable: true,
    ...overrides,
  });
}

function createController(
  overrides: Partial<OnboardingWizardController> = {}
): OnboardingWizardController {
  return {
    finishWizard: vi.fn(),
    goBackToConfigure: vi.fn(),
    goBackToMethodSelection: vi.fn(),
    refreshOnboardingState: vi.fn(async () => undefined),
    retryWatch: vi.fn(async () => undefined),
    setupRunning: false,
    watchIsRunning: false,
    watchManualRetryRequired: false,
    watchRetryPending: false,
    ...overrides,
  };
}

function renderWizard(controller = createController()) {
  const queryClient = createTestQueryClient();
  renderedQueryClients.push(queryClient);
  const transport = createRouterTransport(({ service }) => {
    service(InstanceService, {
      testInstanceConnection: vi.fn(async () => ({})),
    });
  });

  return {
    controller,
    ...render(
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="dark">
            <OnboardingWizardControllerProvider controller={controller}>
              <OnboardingWizardContent />
            </OnboardingWizardControllerProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </TransportProvider>
    ),
  };
}

function seedOnboardingState() {
  useSetupStore.setState({
    onboardingState: createOnboardingState(),
    refreshOnboardingState: vi.fn(async () => undefined),
    showWizardErrorBanner: false,
    status: "onboarding",
  });
}

function setFieldValue(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
}

function seedWizardPhase(
  phase: "configure_embedded" | "configure_ui" | "configure_yaml",
  selectedMethod: "embedded" | "manual_yaml" | "ui_configured"
) {
  seedOnboardingState();
  useOnboardingWizardStore.setState({
    phase,
    selectedMethod,
  });
}

beforeEach(() => {
  restoreLocalStorage = installLocalStorageStub();
});

afterEach(() => {
  cleanup();
  for (const queryClient of renderedQueryClients) {
    queryClient.clear();
  }
  renderedQueryClients.length = 0;
  restoreLocalStorage?.();
  restoreLocalStorage = undefined;
  useOnboardingWizardStore.setState(DEFAULT_WIZARD_SESSION_STATE);
  useSetupStore.setState({
    bootError: null,
    onboardingState: null,
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "booting",
    warningCode: null,
  });
});

describe("onboarding wizard content integration", () => {
  it("renders loading state and refresh action before onboarding state exists", async () => {
    const user = userEvent.setup();
    const refreshOnboardingState = vi.fn(async () => undefined);
    useSetupStore.setState({ onboardingState: null, refreshOnboardingState });

    renderWizard();

    expect(
      screen.getByRole("heading", { name: "Loading onboarding state" })
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: REFRESH_RE }));

    expect(refreshOnboardingState).toHaveBeenCalledTimes(1);
  });

  it("gates setup method progression until the user chooses a method", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderWizard();

    const continueButton = screen.getByRole("button", {
      name: "Continue",
    }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    expect(
      screen.getAllByText("Postgres server to manage").length
    ).toBeGreaterThan(0);
    expect(screen.getByText(SETUP_INTERNAL_STORAGE_RE)).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: CONFIGURE_UI_RE }));
    await user.click(continueButton);

    expect(
      screen.getByRole("heading", { name: "Querylane internal storage" })
    ).toBeTruthy();
    expect(
      screen.getAllByText("Postgres server to manage").length
    ).toBeGreaterThan(0);
  });

  it("explains when no setup methods are available", () => {
    useSetupStore.setState({
      onboardingState: createOnboardingState({ availableMethods: [] }),
      status: "onboarding",
    });

    renderWizard();

    expect(screen.getByText("No setup methods available")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("exposes setup method selection state to assistive tech", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderWizard();

    const uiMethod = screen.getByRole("radio", { name: CONFIGURE_UI_RE });
    expect(uiMethod.getAttribute("aria-checked")).toBe("false");

    await user.click(uiMethod);

    expect(uiMethod.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the config rail with the current database config shape", () => {
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    const configRail = screen.getByTestId("onboarding-config-rail");
    expect(configRail.textContent).toContain("database:");
    expect(configRail.textContent).toContain("ssl_mode:");
    expect(configRail.textContent).not.toContain("meta:");
  });

  it("surfaces previous setup failures while keeping method selection available", () => {
    useSetupStore.setState({
      onboardingState: createOnboardingState({
        appDatabaseStatus: createProto(AppDatabaseStatusSchema, {
          error: "migration failed",
          state: AppDatabaseStatus_State.ERROR,
        }),
      }),
      showWizardErrorBanner: true,
      status: "onboarding",
    });

    renderWizard();

    expect(screen.getByText("Previous setup attempt failed")).toBeTruthy();
    expect(screen.getByText("migration failed")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "How would you like to get started?",
      })
    ).toBeTruthy();
  });

  it("validates and applies a pasted metadata database connection string", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    await user.click(
      screen.getByRole("button", { name: "Paste connection string" })
    );
    setFieldValue("Connection string", "not-a-dsn");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText(INVALID_CONNECTION_STRING_RE)).toBeTruthy();

    setFieldValue(
      "Connection string",
      "postgres://meta:secret@metadata.internal:6543/querylane?sslmode=require&sslnegotiation=direct"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByLabelText("Host")).toHaveProperty(
      "value",
      "metadata.internal"
    );
    expect(screen.getByLabelText("Port")).toHaveProperty("value", "6543");
    expect(screen.getByLabelText("Database")).toHaveProperty(
      "value",
      "querylane"
    );
    expect(screen.getByLabelText("Username")).toHaveProperty("value", "meta");
    expect(
      screen.getByRole("combobox", { name: "SSL negotiation" }).textContent
    ).toContain("direct");
  });

  it("does not render internal storage fields in an error state before interaction", async () => {
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    // Let the mount-time validity check settle before asserting.
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByLabelText("Password").getAttribute("aria-invalid")
    ).toBeNull();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("clears stale field errors when applying a connection string", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    // Surface a password error through interaction first.
    setFieldValue("Password", "x");
    setFieldValue("Password", "");
    await waitFor(() => {
      expect(
        screen.getByLabelText("Password").getAttribute("aria-invalid")
      ).toBe("true");
    });

    await user.click(
      screen.getByRole("button", { name: "Paste connection string" })
    );
    setFieldValue(
      "Connection string",
      "postgres://meta:secret@metadata.internal:6543/querylane?sslmode=require"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Apply must validate the applied values so the stale error clears.
    expect(screen.getByLabelText("Password")).toHaveProperty("value", "secret");
    await waitFor(() => {
      expect(
        screen.getByLabelText("Password").getAttribute("aria-invalid")
      ).toBeNull();
    });
  });

  it("enables continue after applying a connection string and testing it", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    await user.click(
      screen.getByRole("button", { name: "Paste connection string" })
    );
    setFieldValue(
      "Connection string",
      "postgres://meta:secret@metadata.internal:6543/querylane?sslmode=require"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Continue" })
          .disabled
      ).toBe(false);
    });
  });

  it("renders the manual YAML path and sample config for file-managed setup", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderWizard();

    await user.click(screen.getByRole("radio", { name: CONFIGURE_YAML_RE }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { name: "YAML Configuration" })
    ).toBeTruthy();
    expect(
      screen.getAllByText("/tmp/querylane/config.yaml").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("QUERYLANE_CONFIG")).toBeTruthy();
    const configPreview = screen.getByTestId("manual-yaml-config-preview");
    expect(configPreview.textContent).toContain("database:");
    expect(configPreview.textContent).toContain("ssl_mode: disable");
    expect(configPreview.textContent).not.toContain("meta:");
  });

  it("renders embedded setup defaults from onboarding state", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderWizard();

    await user.click(screen.getByRole("radio", { name: EMBEDDED_RE }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { name: "Embedded PostgreSQL" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Port")).toHaveProperty("value", "5433");
    expect(screen.getByText("/tmp/querylane/embedded-postgres")).toBeTruthy();
  });

  it("persists UI metadata database config before entering setup progress", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    setFieldValue("Host", "metadata.internal");
    setFieldValue("Password", "secret");
    const sslModeTrigger = screen.getByRole("combobox", { name: "SSL mode" });
    expect(
      sslModeTrigger.querySelector(
        '[data-slot="ssl-mode-icon"][data-mode="disable"]'
      )
    ).toBeInstanceOf(SVGSVGElement);
    await user.click(sslModeTrigger);
    expect(getRenderedSslModeIconModes()).toEqual(new Set(SSL_MODE_VALUES));
    await user.click(screen.getByRole("option", { name: VERIFY_FULL_RE }));
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Continue" })
          .disabled
      ).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const state = useOnboardingWizardStore.getState();
    expect(state.phase).toBe("progress_running");
    expect(state.submittedPostgresConfig?.host).toBe("metadata.internal");
    expect(state.submittedPostgresConfig?.password).toBe("secret");
    expect(state.submittedPostgresConfig?.sslMode).toBe(
      PostgresConfig_SslMode.VERIFY_FULL
    );
  });
});

describe("onboarding wizard setup progression", () => {
  it("submits direct SSL negotiation from advanced connection options", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    expect(
      screen.queryByRole("combobox", { name: "SSL negotiation" })
    ).toBeNull();

    setFieldValue("Host", "metadata.internal");
    setFieldValue("Password", "secret");
    await user.click(
      screen.getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
    );
    await user.click(screen.getByRole("combobox", { name: "SSL mode" }));
    await user.click(
      screen.getByRole("option", { name: REQUIRE_SSL_MODE_OPTION_RE })
    );
    await user.click(screen.getByRole("combobox", { name: "SSL negotiation" }));
    await user.click(
      screen.getByRole("option", { name: DIRECT_SSL_NEGOTIATION_OPTION_RE })
    );
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Continue" })
          .disabled
      ).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const state = useOnboardingWizardStore.getState();
    expect(state.submittedPostgresConfig?.sslMode).toBe(
      PostgresConfig_SslMode.REQUIRE
    );
    expect(state.submittedPostgresConfig?.sslNegotiation).toBe(
      PostgresConfig_SslNegotiation.DIRECT
    );
  });

  it("starts file-watch progress from manual YAML setup", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_yaml", "manual_yaml");

    renderWizard();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(useOnboardingWizardStore.getState().phase).toBe(
      "progress_waiting_for_config"
    );
    expect(
      screen.getByRole("heading", { name: "Waiting for configuration" })
    ).toBeTruthy();
  });

  it("persists embedded setup defaults before starting embedded progress", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_embedded", "embedded");

    renderWizard();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    const state = useOnboardingWizardStore.getState();
    expect(state.phase).toBe("progress_running");
    expect(state.submittedEmbeddedConfig?.port).toBe(TEST_NUMBER_5433);
    expect(state.submittedEmbeddedConfig?.mode).toBe("persistent");
  });

  it("renders configure validation errors inline on the relevant configure step", () => {
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      configureError: normalizeAppUiError(new Error("password is required"), {
        area: "onboarding-setup",
        source: "setup",
      }),
      phase: "configure_ui",
      selectedMethod: "ui_configured",
    });

    renderWizard();

    expect(screen.getByText("password is required")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Querylane internal storage" })
    ).toBeTruthy();
  });

  it("shows waiting-for-config recovery controls for manual YAML setup", async () => {
    const user = userEvent.setup();
    const retryWatch = vi.fn(async () => undefined);
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      phase: "progress_waiting_for_config",
      selectedMethod: "manual_yaml",
      watchNotice: "No valid config detected yet.",
    });

    renderWizard(createController({ retryWatch }));

    expect(
      screen.getByRole("heading", { name: "Waiting for configuration" })
    ).toBeTruthy();
    expect(screen.getByText("No valid config detected yet.")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "I've saved the file" })
    );

    expect(retryWatch).toHaveBeenCalledTimes(1);
  });

  it("renders successful setup completion and calls finish action", async () => {
    const user = userEvent.setup();
    const finishWizard = vi.fn();
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      phase: "progress_success",
      progressEvents: [
        createProto(SetupProgressEventSchema, {
          displayName: "Migrate metadata",
          state: StepState.SUCCEEDED,
          stepId: SetupStep.MIGRATING,
        }),
      ],
      selectedMethod: "ui_configured",
    });

    renderWizard(createController({ finishWizard }));

    expect(screen.getByText("Ready to go!")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(finishWizard).toHaveBeenCalledTimes(1);
  });

  it("classifies connection setup failures as reconfigurable", async () => {
    const user = userEvent.setup();
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      failedEvent: createProto(SetupProgressEventSchema, {
        displayName: "Connect to metadata database",
        error: "connection refused",
        state: StepState.FAILED,
        stepId: SetupStep.CONNECTING,
      }),
      phase: "error_summary",
      progressEvents: [
        createProto(SetupProgressEventSchema, {
          displayName: "Connect to metadata database",
          error: "connection refused",
          state: StepState.FAILED,
          stepId: SetupStep.CONNECTING,
        }),
      ],
      selectedMethod: "ui_configured",
      streamError: normalizeAppUiError(new Error("connection refused"), {
        area: "onboarding-setup",
        source: "setup_stream",
      }),
    });

    renderWizard();

    expect(screen.getByRole("heading", { name: "Setup failed" })).toBeTruthy();
    expect(screen.getByText("Likely a configuration issue")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reconfigure" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Querylane internal storage" })
      ).toBeTruthy();
    });
  });
});
