import { create as createProto } from "@bufbuild/protobuf";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Link2,
  Loader2,
  Unplug,
  X,
} from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { type UseFormSetValue, useWatch } from "react-hook-form";
import {
  type ConnectionTestStatus,
  useConnectionTest,
} from "@/components/onboarding-wizard/hooks/use-connection-test";
import { useOnboardingWizardControllerContext } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller-context";
import { LabeledInput } from "@/components/onboarding-wizard/shared/labeled-input";
import { WizardPage } from "@/components/onboarding-wizard/shared/wizard-page";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";
import {
  SslModeSelectItems,
  SslModeSelectValue,
} from "@/components/ssl-mode-select";
import {
  SslNegotiationSelectItems,
  SslNegotiationSelectValue,
} from "@/components/ssl-negotiation-select";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatUnsupportedPostgresConnectionParameters,
  parsePostgresConnectionString,
} from "@/lib/postgres-connection-string";
import {
  formatSslMode,
  formatSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { useProtoForm } from "@/lib/use-proto-form";
import {
  type PostgresConfig,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  PostgresConfigSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";

function getTestButtonIcon(status: ConnectionTestStatus) {
  switch (status) {
    case "testing":
      return <Loader2 className="size-5 animate-spin" />;
    case "success":
      return <Check className="size-5 text-emerald-400" />;
    case "error":
      return <X className="size-5 text-red-400" />;
    default:
      return <Unplug className="size-5" />;
  }
}
function getTestButtonLabel(status: ConnectionTestStatus) {
  switch (status) {
    case "testing":
      return "Testing...";
    case "success":
      return "Connected";
    case "error":
      return "Test failed";
    default:
      return "Test connection";
  }
}
function ConnectionTestButton({
  onClick,
  status,
}: {
  onClick: () => void;
  status: ConnectionTestStatus;
}) {
  return (
    <Button
      className="h-10 rounded-xl border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white disabled:text-white/30"
      disabled={status === "testing"}
      onClick={onClick}
      variant="ghost"
    >
      <span className="shrink-0">{getTestButtonIcon(status)}</span>
      {getTestButtonLabel(status)}
    </Button>
  );
}

// useWatch returns a deep-partial view of the values; fall back to proto
// zero values so the fingerprint input stays a complete message init.
function toPostgresConfig(values: {
  database?: string | undefined;
  host?: string | undefined;
  password?: string | undefined;
  port?: number | undefined;
  sslMode?: PostgresConfig_SslMode | undefined;
  sslNegotiation?: PostgresConfig_SslNegotiation | undefined;
  username?: string | undefined;
}) {
  return createProto(PostgresConfigSchema, {
    database: values.database ?? "",
    host: values.host ?? "",
    password: values.password ?? "",
    port: values.port ?? 0,
    sslMode: values.sslMode ?? PostgresConfig_SslMode.UNSPECIFIED,
    sslNegotiation:
      values.sslNegotiation ?? PostgresConfig_SslNegotiation.POSTGRES,
    username: values.username ?? "",
  });
}

function ConnectionTestResult({
  errorMessage,
  isCurrentConfigVerified,
  status,
}: {
  errorMessage: string | null;
  isCurrentConfigVerified: boolean;
  status: ConnectionTestStatus;
}) {
  if (status === "success" && isCurrentConfigVerified) {
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-4 py-3 text-emerald-100/92 text-sm">
        <div className="flex items-center gap-3">
          <Check className="size-4 shrink-0 text-emerald-400" />
          Connection successful. Ready to continue.
        </div>
      </div>
    );
  }

  if (status === "error" && errorMessage) {
    return (
      <div
        className="rounded-2xl border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-red-100/92 text-sm"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <X className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div className="space-y-1">
            <div className="font-medium">Connection failed</div>
            <div className="text-red-200/78 text-sm">{errorMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function InternalStorageSslOptions({
  contentId,
  modeId,
  onOpenChange,
  onSslModeChange,
  onSslNegotiationChange,
  open,
  sslModeValue,
  sslNegotiationId,
  sslNegotiationValue,
}: {
  contentId: string;
  modeId: string;
  onOpenChange: (open: boolean) => void;
  onSslModeChange: (value: string) => void;
  onSslNegotiationChange: (value: string) => void;
  open: boolean;
  sslModeValue: string;
  sslNegotiationId: string;
  sslNegotiationValue: string;
}) {
  return (
    <Collapsible onOpenChange={onOpenChange} open={open}>
      <div className="relative space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <label className="font-medium text-base text-white" htmlFor={modeId}>
          SSL mode
        </label>
        <CollapsibleTrigger
          aria-controls={contentId}
          aria-label="Advanced connection options"
          className="group/advanced-connection absolute top-4 right-5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-white/58 outline-none transition-colors hover:text-white focus-visible:border-[#4b73d7] focus-visible:ring-3 focus-visible:ring-[#4b73d7]/25"
        >
          Advanced
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-aria-expanded/advanced-connection:rotate-90" />
        </CollapsibleTrigger>
        <Select
          onValueChange={(nextValue) => {
            if (!nextValue) {
              return;
            }
            onSslModeChange(nextValue);
          }}
          value={sslModeValue}
        >
          <SelectTrigger
            className="h-11 w-full rounded-xl border-white/10 bg-white/[0.03] px-4 py-0 text-base text-white leading-none focus-visible:border-[#4b73d7] focus-visible:ring-[#4b73d7]/25 [&_svg]:size-4 [&_svg]:text-white/68"
            id={modeId}
          >
            <SslModeSelectValue
              iconClassName="text-white/68"
              value={sslModeValue}
            />
          </SelectTrigger>
          <SelectContent className="min-w-[24rem] rounded-[20px] border border-white/10 bg-[#070a11] p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <SslModeSelectItems
              descriptionClassName="mt-1 text-sm text-white/58"
              iconClassName="text-white/68"
              iconContainerClassName="bg-white/[0.06] text-white/68"
              itemClassName="rounded-xl px-4 py-3 text-white focus:bg-white/[0.07] focus:text-white"
            />
          </SelectContent>
        </Select>
        <p className="text-sm text-white/56 leading-6">
          Choose how Querylane negotiates TLS for its internal storage database.
        </p>
        {open ? (
          <CollapsibleContent className="pt-2">
            <section aria-label="Advanced connection options" id={contentId}>
              <div className="space-y-3">
                <label
                  className="font-medium text-sm text-white"
                  htmlFor={sslNegotiationId}
                >
                  SSL negotiation
                </label>
                <Select
                  onValueChange={(nextValue) => {
                    if (!nextValue) {
                      return;
                    }
                    onSslNegotiationChange(nextValue);
                  }}
                  value={sslNegotiationValue}
                >
                  <SelectTrigger
                    className="h-11 w-full rounded-xl border-white/10 bg-white/[0.03] px-4 py-0 text-base text-white leading-none focus-visible:border-[#4b73d7] focus-visible:ring-[#4b73d7]/25 [&_svg]:size-4 [&_svg]:text-white/68"
                    id={sslNegotiationId}
                  >
                    <SslNegotiationSelectValue value={sslNegotiationValue} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[24rem] rounded-[20px] border border-white/10 bg-[#070a11] p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                    <SslNegotiationSelectItems />
                  </SelectContent>
                </Select>
                <p className="text-sm text-white/56">
                  Use direct only when the server expects TLS immediately.
                </p>
              </div>
            </section>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  );
}

function ConnectionStringPasteForm({
  connectionStringError,
  connectionStringErrorId,
  connectionStringId,
  connectionStringInputRef,
  connectionStringValue,
  onApply,
  onErrorReset,
  onValueChange,
}: {
  connectionStringError: string | null;
  connectionStringErrorId: string;
  connectionStringId: string;
  connectionStringInputRef: RefObject<HTMLInputElement | null>;
  connectionStringValue: string;
  onApply: () => void;
  onErrorReset: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label
          className="font-medium text-base text-white"
          htmlFor={connectionStringId}
        >
          Connection string
        </label>
        <div className="flex gap-3">
          <Input
            aria-describedby={
              connectionStringError ? connectionStringErrorId : undefined
            }
            aria-invalid={connectionStringError ? true : undefined}
            autoComplete="off"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-0 font-mono text-sm text-white leading-none placeholder:text-white/32 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/25"
            id={connectionStringId}
            onChange={(e) => {
              onValueChange(e.target.value);
              onErrorReset();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onApply();
              }
            }}
            placeholder="postgres://user:password@host:5432/database"
            ref={connectionStringInputRef}
            type="text"
            value={connectionStringValue}
          />
          <Button
            className="h-11 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
            disabled={connectionStringValue.trim().length === 0}
            onClick={onApply}
          >
            Apply
          </Button>
        </div>
        {connectionStringError ? (
          <p
            className="text-red-300/90 text-sm"
            id={connectionStringErrorId}
            role="alert"
          >
            {connectionStringError}
          </p>
        ) : (
          <p className="text-sm text-white/44">
            Supported:
            postgres://user:password@host:port/database?sslmode=require
          </p>
        )}
      </div>
    </div>
  );
}

type ParsedStringField = "database" | "host" | "password" | "username";
interface ConnectionStringFeedback {
  error: string | null;
  warning: string | null;
}

type ParsedConnection = NonNullable<
  ReturnType<typeof parsePostgresConnectionString>
>;
const APPLIED_CONNECTION_FIELD_OPTIONS = {
  shouldDirty: true,
  shouldValidate: true,
} as const;

function applyParsedConnectionFields(
  parsed: ParsedConnection,
  setValue: UseFormSetValue<PostgresConfig>
) {
  const parsedStringFields: [ParsedStringField, string | undefined][] = [
    ["host", parsed.host],
    ["database", parsed.database],
    ["username", parsed.username],
    ["password", parsed.password],
  ];
  for (const [fieldName, fieldValue] of parsedStringFields) {
    if (fieldValue !== undefined) {
      setValue(fieldName, fieldValue, APPLIED_CONNECTION_FIELD_OPTIONS);
    }
  }
  if (parsed.port !== undefined) {
    setValue("port", parsed.port, APPLIED_CONNECTION_FIELD_OPTIONS);
  }
  if (parsed.sslMode !== undefined) {
    setValue(
      "sslMode",
      toSslMode(parsed.sslMode),
      APPLIED_CONNECTION_FIELD_OPTIONS
    );
  }
  setValue(
    "sslNegotiation",
    toSslNegotiation(parsed.sslNegotiation),
    APPLIED_CONNECTION_FIELD_OPTIONS
  );
}

function UiConfiguredContinueAction({
  canContinue,
  isValid,
  onContinue,
}: {
  canContinue: boolean;
  isValid: boolean;
  onContinue: () => void;
}) {
  const disabledReasonId = useId();
  const disabledReason = isValid
    ? "Test this connection before continuing."
    : "Complete the required connection fields before continuing.";
  const button = (
    <Button
      aria-describedby={canContinue ? undefined : disabledReasonId}
      className="h-10 rounded-xl bg-white px-4 font-medium text-[#11151f] text-sm hover:bg-white/90"
      disabled={!canContinue}
      onClick={onContinue}
    >
      Continue
      <ChevronRight className="size-4" />
    </Button>
  );

  if (canContinue) {
    return button;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex cursor-not-allowed" />}
        >
          {button}
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
      <span className="sr-only" id={disabledReasonId}>
        {disabledReason}
      </span>
    </>
  );
}

export function UiConfiguredPhase() {
  const connectionStringId = useId();
  const connectionStringErrorId = useId();
  const hostId = useId();
  const portId = useId();
  const databaseId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const sslModeId = useId();
  const sslNegotiationId = useId();
  const advancedConnectionOptionsId = useId();
  const startProgress = useOnboardingWizardStore(
    (state) => state.startProgress
  );
  const setSubmittedPostgresConfig = useOnboardingWizardStore(
    (state) => state.setSubmittedPostgresConfig
  );
  const { goBackToMethodSelection } = useOnboardingWizardControllerContext();
  const form = useProtoForm(PostgresConfigSchema, {
    defaultValues: {
      database: "querylane",
      host: "localhost",
      password: "",
      port: 5432,
      sslMode: PostgresConfig_SslMode.DISABLED,
      sslNegotiation: PostgresConfig_SslNegotiation.POSTGRES,
      username: "querylane",
    },
    mode: "all",
  });
  const { control, formState, register, setValue } = form;
  const { errors, isValid } = formState;
  const watchedValues = useWatch({ control });
  const sslMode = useWatch({ control, name: "sslMode" });
  const sslModeValue = formatSslMode(
    sslMode ?? PostgresConfig_SslMode.DISABLED
  );
  const sslNegotiation = useWatch({ control, name: "sslNegotiation" });
  const sslNegotiationValue = formatSslNegotiation(
    sslNegotiation ?? PostgresConfig_SslNegotiation.POSTGRES
  );
  const [connectionStringMode, setConnectionStringMode] = useState(false);
  const [connectionStringValue, setConnectionStringValue] = useState("");
  const [connectionStringFeedback, setConnectionStringFeedback] =
    useState<ConnectionStringFeedback>({ error: null, warning: null });
  const [advancedConnectionOptionsOpen, setAdvancedConnectionOptionsOpen] =
    useState(false);
  const connectionTest = useConnectionTest();
  const currentConnectionFingerprint = connectionTest.getConnectionFingerprint(
    toPostgresConfig(watchedValues)
  );
  const isCurrentConfigVerified =
    isValid &&
    connectionTest.verifiedConnectionFingerprint ===
      currentConnectionFingerprint;
  const canContinue = isCurrentConfigVerified;
  const connectionStringInputRef = useRef<HTMLInputElement>(null);
  const handleConnectionStringApply = () => {
    const parsed = parsePostgresConnectionString(connectionStringValue);
    if (!parsed) {
      setConnectionStringFeedback((current) => ({
        ...current,
        error:
          "Invalid connection string. Expected format: postgres://user:password@host:port/database",
      }));
      return;
    }
    const parsedConnection = parsed;
    const warning = formatUnsupportedPostgresConnectionParameters(
      parsedConnection.unsupportedParameters
    );
    setConnectionStringFeedback({ error: null, warning });
    applyParsedConnectionFields(parsedConnection, setValue);
    setAdvancedConnectionOptionsOpen(
      parsedConnection.sslNegotiation === "direct"
    );
    setConnectionStringMode(false);
    setConnectionStringValue("");
  };
  const handleTestConnection = () => {
    const values = form.getValues();
    connectionTest.testConnection(createProto(PostgresConfigSchema, values));
  };
  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    const values = form.getValues();
    setSubmittedPostgresConfig(createProto(PostgresConfigSchema, values));
    startProgress();
  };
  return (
    <WizardPage
      description="Enter credentials for Querylane internal storage: a PostgreSQL database used only for Querylane metadata, saved connection records, and query history. Do not use the application database you want to manage unless you intentionally want it to hold Querylane metadata."
      footer={
        <div className="flex items-center justify-between gap-4">
          <Button
            className="h-10 rounded-xl border-white/10 px-4 text-sm text-white/78 hover:bg-white/[0.04] hover:text-white"
            onClick={goBackToMethodSelection}
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <ConnectionTestButton
              onClick={handleTestConnection}
              status={
                isValid &&
                (connectionTest.status !== "success" || isCurrentConfigVerified)
                  ? connectionTest.status
                  : "idle"
              }
            />
            <UiConfiguredContinueAction
              canContinue={canContinue}
              isValid={isValid}
              onContinue={handleContinue}
            />
          </div>
        </div>
      }
      title="Querylane internal storage"
    >
      <div className="space-y-6">
        <SetupFlowExplainer tone="onboarding" variant="configure" />

        {/* Connection string toggle */}
        <div className="flex items-center gap-3">
          <Button
            className="h-9 rounded-lg border-white/10 px-3.5 text-sm text-white/68 hover:bg-white/[0.04] hover:text-white"
            onClick={() => {
              setConnectionStringMode((prev) => !prev);
              setConnectionStringFeedback((current) => ({
                ...current,
                error: null,
              }));
              if (!connectionStringMode) {
                requestAnimationFrame(() => {
                  connectionStringInputRef.current?.focus();
                });
              }
            }}
            variant="ghost"
          >
            <Link2 className="size-4" />
            {connectionStringMode
              ? "Switch to manual fields"
              : "Paste connection string"}
          </Button>
        </div>

        {connectionStringFeedback.warning ? (
          <p
            className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-amber-100/90 text-sm"
            role="status"
          >
            {connectionStringFeedback.warning}
          </p>
        ) : null}

        {connectionStringMode ? (
          <ConnectionStringPasteForm
            connectionStringError={connectionStringFeedback.error}
            connectionStringErrorId={connectionStringErrorId}
            connectionStringId={connectionStringId}
            connectionStringInputRef={connectionStringInputRef}
            connectionStringValue={connectionStringValue}
            onApply={handleConnectionStringApply}
            onErrorReset={() =>
              setConnectionStringFeedback((current) => ({
                ...current,
                error: null,
              }))
            }
            onValueChange={(value) => {
              setConnectionStringValue(value);
            }}
          />
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
              <LabeledInput
                error={errors.host?.message}
                id={hostId}
                label="Host"
                {...register("host")}
              />
              <LabeledInput
                error={errors.port?.message}
                id={portId}
                label="Port"
                {...register("port", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <LabeledInput
              error={errors.database?.message}
              id={databaseId}
              label="Database"
              {...register("database")}
            />
            <LabeledInput
              autoComplete="username"
              error={errors.username?.message}
              id={usernameId}
              label="Username"
              {...register("username")}
            />
            <LabeledInput
              autoComplete="current-password"
              error={errors.password?.message}
              id={passwordId}
              label="Password"
              type="password"
              {...register("password")}
            />
            <InternalStorageSslOptions
              contentId={advancedConnectionOptionsId}
              modeId={sslModeId}
              onOpenChange={setAdvancedConnectionOptionsOpen}
              onSslModeChange={(value) =>
                setValue("sslMode", toSslMode(value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              onSslNegotiationChange={(value) =>
                setValue("sslNegotiation", toSslNegotiation(value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              open={advancedConnectionOptionsOpen}
              sslModeValue={sslModeValue}
              sslNegotiationId={sslNegotiationId}
              sslNegotiationValue={sslNegotiationValue}
            />
          </>
        )}

        <ConnectionTestResult
          errorMessage={connectionTest.errorMessage}
          isCurrentConfigVerified={isCurrentConfigVerified}
          status={connectionTest.status}
        />
      </div>
    </WizardPage>
  );
}
