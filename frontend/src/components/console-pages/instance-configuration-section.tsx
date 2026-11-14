"use client";

import { CatchBoundary } from "@tanstack/react-router";
import { announce, type ChangeDetails, type ChangeSource } from "@ui-sdk/core";
import { withSource } from "@ui-sdk/core/observe";
import { usePrimitive } from "@ui-sdk/react/primitive";
import { CircleCheck, CircleExclamationPoint, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { SectionCard } from "@/components/console-pages/console-layout";
import {
  type InstanceLabelEntry,
  type InstanceRecord,
  labelsToEntries,
  labelsToMap,
} from "@/components/console-pages/instance-config-model";
import {
  createInstanceFormDefaults,
  createInstanceUpdate,
  findFirstErrorMessage,
  type InstanceProtoForm,
  normalizeInstanceProtoForm,
} from "@/components/console-pages/instance-config-protoform";
import { FieldError } from "@/components/console-pages/instance-configuration-field-error";
import { InstanceConfigurationLabels } from "@/components/console-pages/instance-configuration-labels";
import { PasswordInput } from "@/components/password-input";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/querylane-ui/alert";
import {
  SslModeSelectItems,
  SslModeSelectValue,
} from "@/components/ssl-mode-select";
import {
  SslNegotiationSelectItems,
  SslNegotiationSelectValue,
} from "@/components/ssl-negotiation-select";
import { Button } from "@/components/ui/button";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import { useAgentDraftStore } from "@/features/agent-drafts/agent-draft-state";
import {
  agentDraftChangeError,
  type DraftKey,
  instanceDraft,
} from "@/features/agent-drafts/instance-draft";
import {
  formErrorMessages,
  labelRowErrors,
} from "@/features/instance-label-errors";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import type { UseProtoFormReturn } from "@/hooks/use-proto-form/use-proto-form";
import { useProtoForm } from "@/hooks/use-proto-form/use-proto-form";
import {
  formatSslMode,
  formatSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { isDirectSslNegotiationMode } from "@/lib/ssl-modes";
import { handleAsyncAction } from "@/lib/ui-action";
import { normalizeAppUiError } from "@/lib/ui-error";
import { isNonEmptyString } from "@/lib/value-guards";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import {
  Instance_CredentialState,
  InstanceSchema,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const LazyAgentDraftPanel = lazy(() =>
  import("@/features/agent-drafts/agent-draft-panel").then((module) => ({
    default: module.AgentDraftPanel,
  }))
);
function AgentDraftUnavailable() {
  return (
    <p
      className="mt-4 text-sm text-destructive"
      data-agent-hidden={true}
      role="alert"
    >
      Draft review is unavailable. Disable agent access and reload to try again.
      Existing draft fields have not been saved.
    </p>
  );
}

const REQUIRED_ERROR_BY_FIELD = {
  database: "Default database is required.",
  displayName: "Display name is required.",
  host: "Host is required.",
  password: "Password is required.",
  username: "Username is required.",
} as const;
const PORT_ERROR = "Port must be between 1 and 65535.";
const SSL_NEGOTIATION_ERROR =
  "Direct SSL negotiation requires SSL mode require, verify-ca, or verify-full.";

interface InstanceConfigurationFieldErrors {
  database: string | undefined;
  displayName: string | undefined;
  host: string | undefined;
  labels: string | undefined;
  password: string | undefined;
  port: string | undefined;
  sslMode: string | undefined;
  sslNegotiation: string | undefined;
  username: string | undefined;
}

function focusInstanceConfigurationInvalidField(field: string) {
  handleAsyncAction(() =>
    waitForNextFrame().then(() => {
      const fields = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-instance-config-field]"
        ),
      ].filter((element) => element.dataset["instanceConfigField"] === field);
      const target =
        fields.find(
          (element) => element.getAttribute("aria-invalid") === "true"
        ) ?? fields[0];
      target?.focus();

      return undefined;
    })
  )();
}

function getInstanceSaveDisabledReason({
  credentialKeyMissing,
  hasUnsavedChanges,
  needsReplacementPassword,
  pending,
}: {
  credentialKeyMissing: boolean;
  hasUnsavedChanges: boolean;
  needsReplacementPassword: boolean;
  pending: boolean;
}): string | null {
  if (credentialKeyMissing) {
    return "Configure QUERYLANE_INSTANCE_SECRET_KEY and restart Querylane before saving.";
  }
  if (needsReplacementPassword) {
    return "Re-enter the password before saving.";
  }
  return hasUnsavedChanges || pending ? null : "No changes to save.";
}

function InstanceCredentialAlert({
  credentialGuidanceId,
  credentialKeyMissing,
  credentialsUnreadable,
  instance,
}: {
  credentialGuidanceId: string;
  credentialKeyMissing: boolean;
  credentialsUnreadable: boolean;
  instance: InstanceRecord;
}) {
  if (!credentialsUnreadable) {
    return null;
  }
  const description = credentialKeyMissing
    ? instance.credentialError ||
      "Configure QUERYLANE_INSTANCE_SECRET_KEY and restart Querylane before replacing the password."
    : "Stored credentials can’t be read. Enter the password again to restore access.";
  return (
    <Alert presentation="responsive-action" variant="destructive">
      <CircleExclamationPoint aria-hidden="true" />
      <AlertTitle>Credentials need attention</AlertTitle>
      <AlertDescription id={credentialGuidanceId}>
        {description}
      </AlertDescription>
      {credentialKeyMissing ? null : (
        <AlertAction className="static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0">
          <Button
            onClick={() => {
              focusInstanceConfigurationInvalidField("password");
            }}
            size="sm"
            variant="outline"
          >
            Re-enter password
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

function localErrorMessage(
  error: unknown,
  fallback: string
): string | undefined {
  if (
    error === null ||
    error === undefined ||
    error === false ||
    error === "" ||
    error === 0
  ) {
    return undefined;
  }
  if (typeof error === "object" && "type" in error && error.type === "server") {
    return findFirstErrorMessage(error) ?? fallback;
  }
  return fallback;
}

function surfaceSaveError({
  error,
  form,
  onInvalidSave,
}: {
  error: unknown;
  form: InstanceProtoForm;
  onInvalidSave: (message?: string) => void;
}) {
  const serverOutcome = form.setServerErrors(error);
  if (serverOutcome.handled && serverOutcome.unmapped.length === 0) {
    onInvalidSave();
    return;
  }
  if (serverOutcome.unmapped.length > 0) {
    onInvalidSave(
      serverOutcome.unmapped.map((violation) => violation.description).join(" ")
    );
    return;
  }
  const uiError = normalizeAppUiError(error, {
    action: "save instance configuration",
    area: "console.instance.configuration",
    source: "mutation",
    surface: "inline",
  });
  onInvalidSave(uiError.message);
}

function InstanceConfigurationFields({
  credentialGuidanceId,
  credentialsUnreadable,
  fieldErrors,
  form,
  isConfigManaged,
  sslMode,
  sslNegotiation,
  onDraftFieldChange,
}: {
  credentialGuidanceId: string;
  credentialsUnreadable: boolean;
  fieldErrors: InstanceConfigurationFieldErrors;
  form: InstanceProtoForm;
  isConfigManaged: boolean;
  sslMode: string;
  sslNegotiation: string;
  onDraftFieldChange: (
    key: DraftKey,
    value: unknown,
    source: ChangeSource
  ) => boolean;
}) {
  const displayNameId = useId();
  const hostId = useId();
  const portId = useId();
  const databaseId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const sslModeId = useId();
  const sslNegotiationId = useId();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <label className="text-sm" htmlFor={displayNameId}>
          Display name
        </label>
        <Controller
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <Input
              aria-invalid={Boolean(fieldErrors.displayName)}
              data-instance-config-field="displayName"
              disabled={isConfigManaged}
              id={displayNameId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value, details) => {
                if (!onDraftFieldChange("displayName", value, details.source)) {
                  details.cancel();
                }
              }}
              ref={field.ref}
              value={field.value ?? ""}
            />
          )}
        />
        <FieldError error={fieldErrors.displayName} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={hostId}>
          Host
        </label>
        <Controller
          control={form.control}
          name="config.host"
          render={({ field }) => (
            <Input
              aria-invalid={Boolean(fieldErrors.host)}
              data-instance-config-field="host"
              disabled={isConfigManaged}
              id={hostId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              ref={field.ref}
              value={field.value ?? ""}
            />
          )}
        />
        <FieldError error={fieldErrors.host} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={portId}>
          Port
        </label>
        <Controller
          control={form.control}
          name="config.port"
          render={({ field }) => (
            <Input
              aria-invalid={Boolean(fieldErrors.port)}
              data-instance-config-field="port"
              disabled={isConfigManaged}
              id={portId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value) => {
                field.onChange(value === "" ? Number.NaN : Number(value));
              }}
              ref={field.ref}
              type="number"
              value={Number.isFinite(field.value) ? String(field.value) : ""}
            />
          )}
        />
        <FieldError error={fieldErrors.port} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={databaseId}>
          Default database
        </label>
        <Controller
          control={form.control}
          name="config.database"
          render={({ field }) => (
            <Input
              aria-invalid={Boolean(fieldErrors.database)}
              data-instance-config-field="database"
              disabled={isConfigManaged}
              id={databaseId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              ref={field.ref}
              value={field.value ?? ""}
            />
          )}
        />
        <FieldError error={fieldErrors.database} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={usernameId}>
          Username
        </label>
        <Controller
          control={form.control}
          name="config.username"
          render={({ field }) => (
            <Input
              aria-invalid={Boolean(fieldErrors.username)}
              data-instance-config-field="username"
              disabled={isConfigManaged}
              id={usernameId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              ref={field.ref}
              value={field.value ?? ""}
            />
          )}
        />
        <FieldError error={fieldErrors.username} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={passwordId}>
          Password
        </label>
        <Controller
          control={form.control}
          name="config.password"
          render={({ field }) => (
            <PasswordInput
              aria-describedby={
                credentialsUnreadable ? credentialGuidanceId : undefined
              }
              aria-invalid={Boolean(fieldErrors.password)}
              data-instance-config-field="password"
              disabled={isConfigManaged}
              id={passwordId}
              name={field.name}
              onBlur={() => {
                field.onBlur();
              }}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              ref={field.ref}
              value={field.value ?? ""}
            />
          )}
        />
        <FieldError error={fieldErrors.password} />
      </div>
      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm" htmlFor={sslModeId}>
            SSL mode
          </label>
          <Select
            disabled={isConfigManaged}
            onValueChange={(value, details) => {
              if (!onDraftFieldChange("sslMode", value, details.source)) {
                details.cancel();
              }
            }}
            value={sslMode}
          >
            <SelectTrigger
              aria-invalid={Boolean(fieldErrors.sslMode)}
              className="w-full"
              data-instance-config-field="sslMode"
              id={sslModeId}
            >
              <SslModeSelectValue value={sslMode} />
            </SelectTrigger>
            <SelectContent className="w-[22rem] max-w-(--available-width) min-w-0">
              <SslModeSelectItems />
            </SelectContent>
          </Select>
          <FieldError error={fieldErrors.sslMode} />
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={sslNegotiationId}>
            SSL negotiation
          </label>
          <Select
            disabled={isConfigManaged}
            onValueChange={(value, details) => {
              if (
                !onDraftFieldChange("sslNegotiation", value, details.source)
              ) {
                details.cancel();
              }
            }}
            value={sslNegotiation}
          >
            <SelectTrigger
              aria-invalid={Boolean(fieldErrors.sslNegotiation)}
              className="w-full"
              data-instance-config-field="sslNegotiation"
              id={sslNegotiationId}
            >
              <SslNegotiationSelectValue value={sslNegotiation} />
            </SelectTrigger>
            <SelectContent className="w-[22rem] max-w-(--available-width) min-w-0">
              <SslNegotiationSelectItems />
            </SelectContent>
          </Select>
          <FieldError error={fieldErrors.sslNegotiation} />
        </div>
      </div>
    </div>
  );
}

function configurationFieldErrors(
  errors: UseProtoFormReturn<typeof InstanceSchema>["formState"]["errors"],
  labelsError: string | undefined
) {
  const fieldErrors = {
    database: localErrorMessage(
      errors.config?.database,
      REQUIRED_ERROR_BY_FIELD.database
    ),
    displayName: localErrorMessage(
      errors.displayName,
      REQUIRED_ERROR_BY_FIELD.displayName
    ),
    host: localErrorMessage(errors.config?.host, REQUIRED_ERROR_BY_FIELD.host),
    labels:
      labelsError ?? (formErrorMessages(errors.labels).join("\n") || undefined),
    password: localErrorMessage(
      errors.config?.password,
      REQUIRED_ERROR_BY_FIELD.password
    ),
    port: localErrorMessage(errors.config?.port, PORT_ERROR),
    sslMode: findFirstErrorMessage(errors.config?.sslMode),
    sslNegotiation: localErrorMessage(
      errors.config?.sslNegotiation,
      SSL_NEGOTIATION_ERROR
    ),
    username: localErrorMessage(
      errors.config?.username,
      REQUIRED_ERROR_BY_FIELD.username
    ),
  };
  return fieldErrors;
}

function InstanceConfigurationSection({
  formNotice,
  instance,
  isConfigManaged,
  onInvalidSave,
  onSave,
  pending,
}: {
  formNotice: { message: string; variant: "error" | "success" } | null;
  instance: InstanceRecord;
  isConfigManaged: boolean;
  onInvalidSave: (message?: string) => void;
  onSave: (
    editedInstance: ReturnType<typeof createInstanceFormDefaults>,
    updatePaths: string[]
  ) => unknown;
  pending: boolean;
}) {
  const agentEnabled = useAgentAccessStore((state) => state.enabled);
  const [draftRefusal, setDraftRefusal] = useState<string | null>(null);
  const credentialGuidanceId = useId();
  const formDefaults = createInstanceFormDefaults(instance);
  const form = useProtoForm(InstanceSchema, {
    defaultValues: formDefaults,
    mode: "onChange",
    serverPathPrefix: "instance",
    validationScope: "modified-fields",
  });
  const values = useWatch({ control: form.control });
  // protobuf maps cannot represent a blank
  // key while the user is composing a new row; valid rows are synced below.
  const [labels, setLabels] = useState<InstanceLabelEntry[]>(() =>
    labelsToEntries(instance.labels)
  );
  const [labelsError, setLabelsError] = useState<string>();
  const [labelFocusRequest, setLabelFocusRequest] = useState(0);
  useEffect(
    function focusRejectedLabelAfterCommit() {
      if (labelFocusRequest > 0) {
        focusInstanceConfigurationInvalidField("labels");
      }
    },
    [labelFocusRequest]
  );
  const requestLabelFocus = () => {
    setLabelFocusRequest((request) => request + 1);
  };
  const credentialsUnreadable =
    instance.credentialState !== Instance_CredentialState.UNSPECIFIED;
  const credentialKeyMissing =
    instance.credentialState === Instance_CredentialState.KEY_MISSING;
  const needsReplacementPassword =
    instance.credentialState === Instance_CredentialState.UNREADABLE &&
    !isNonEmptyString(values.config?.password);
  const saveDisabledReason = getInstanceSaveDisabledReason({
    credentialKeyMissing,
    hasUnsavedChanges:
      createInstanceUpdate(form, instance).updatePaths.length > 0,
    needsReplacementPassword,
    pending,
  });
  const { errors } = form.formState;
  const fieldErrors = configurationFieldErrors(errors, labelsError);

  const sslMode = formatSslMode(
    values.config?.sslMode ?? PostgresConfig_SslMode.UNSPECIFIED
  );
  const sslNegotiation = formatSslNegotiation(
    values.config?.sslNegotiation ?? PostgresConfig_SslNegotiation.UNSPECIFIED
  );
  if (sslNegotiation === "direct" && !isDirectSslNegotiationMode(sslMode)) {
    fieldErrors.sslNegotiation ??= SSL_NEGOTIATION_ERROR;
  }

  const handleLabelsChange = (nextLabels: InstanceLabelEntry[]) => {
    setLabels(nextLabels);
    setLabelsError(undefined);
    form.setValue("labels", labelsToMap(nextLabels), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };
  const draftValue = {
    displayName: values.displayName ?? "",
    labels,
    sslMode,
    sslNegotiation,
  };
  function allowDraftChange(
    key: DraftKey,
    value: unknown,
    details: Pick<ChangeDetails, "source" | "cancel">
  ) {
    let reason: string | null = null;
    if (details.source === "agent") {
      reason = pending
        ? "Wait for the current save to finish."
        : agentDraftChangeError(draftValue, key, value);
    }
    if (reason !== null) {
      details.cancel();
      setDraftRefusal(
        `The agent request was refused: ${reason} Existing draft fields were kept.`
      );
      announce(reason);
      return false;
    }
    setDraftRefusal(null);
    return true;
  }
  const draft = usePrimitive(instanceDraft, {
    ...draftValue,
    disabled: isConfigManaged,
    pending,
    onDisplayNameChange(value, details) {
      if (allowDraftChange("displayName", value, details)) {
        form.setValue("displayName", value, {
          shouldDirty: true,
          shouldTouch: details.source === "agent",
          shouldValidate: true,
        });
      }
    },
    onLabelsChange(value, details) {
      if (allowDraftChange("labels", value, details)) {
        handleLabelsChange(value);
      }
    },
    onSslModeChange(value, details) {
      if (allowDraftChange("sslMode", value, details)) {
        form.setValue("config.sslMode", toSslMode(value), {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    onSslNegotiationChange(value, details) {
      if (allowDraftChange("sslNegotiation", value, details)) {
        form.setValue("config.sslNegotiation", toSslNegotiation(value), {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
  });
  function changeDraftField(
    key: DraftKey,
    value: unknown,
    source: ChangeSource
  ) {
    return withSource(source, () => {
      switch (key) {
        case "displayName":
          return draft.api.setDisplayName(value);
        case "labels":
          return draft.api.setLabels(value);
        case "sslMode":
          return draft.api.setSslMode(value);
        case "sslNegotiation":
          return draft.api.setSslNegotiation(value);
        default:
          return false;
      }
    });
  }
  const requestInvalidLabelFocus = () => {
    if (form.getFieldState("labels").invalid) {
      requestLabelFocus();
    }
  };
  const handleSaveClick = async () => {
    const hasBlankLabel = labels.some((label) => label.key.trim().length === 0);
    if (hasBlankLabel) {
      setLabelsError("Label keys cannot be empty.");
      onInvalidSave();
      requestLabelFocus();
      return;
    }
    normalizeInstanceProtoForm(form);
    const isValid = await form.trigger(undefined, { shouldFocus: true });
    if (!isValid) {
      onInvalidSave();
      requestInvalidLabelFocus();
      return;
    }
    const update = createInstanceUpdate(form, instance);
    if (update.updatePaths.length === 0) {
      return;
    }
    form.clearServerErrorContext();
    const clearSavedDraft = useAgentDraftStore.getState().clearDraft;
    const error = await onSave(update.instance, update.updatePaths);
    if (Boolean(error)) {
      surfaceSaveError({ error, form, onInvalidSave });
      requestInvalidLabelFocus();
    } else {
      clearSavedDraft?.();
    }
  };

  return (
    <SectionCard
      action={
        isConfigManaged ? null : (
          <DisabledReasonButton
            data-agent-confirm="Updates the saved instance connection. Ask the person to save these changes manually."
            disabled={pending}
            disabledReason={saveDisabledReason}
            onClick={handleAsyncAction(handleSaveClick)}
            size="sm"
          >
            <Save className="size-4" />
            Save changes
          </DisabledReasonButton>
        )
      }
      description={
        isConfigManaged
          ? "Connection details are read-only because this instance is managed in the server configuration file. Update that file and restart Querylane to make changes."
          : "Update the registered connection details used by Querylane."
      }
      title="Configuration"
    >
      <InstanceCredentialAlert
        credentialGuidanceId={credentialGuidanceId}
        credentialKeyMissing={credentialKeyMissing}
        credentialsUnreadable={credentialsUnreadable}
        instance={instance}
      />

      <InstanceConfigurationFields
        credentialGuidanceId={credentialGuidanceId}
        credentialsUnreadable={credentialsUnreadable}
        fieldErrors={fieldErrors}
        form={form}
        isConfigManaged={isConfigManaged}
        onDraftFieldChange={changeDraftField}
        sslMode={sslMode}
        sslNegotiation={sslNegotiation}
      />

      <InstanceConfigurationLabels
        error={fieldErrors.labels}
        isConfigManaged={isConfigManaged}
        labels={labels}
        onChange={(value, source = "programmatic") =>
          changeDraftField("labels", value, source)
        }
        rowErrors={labelRowErrors(errors.labels, labels, labelsError)}
      />

      {agentEnabled ? (
        <CatchBoundary
          errorComponent={AgentDraftUnavailable}
          getResetKey={() => instance.name}
          onCatch={() => {
            setDraftRefusal(
              "Draft review is unavailable. Agent access was disabled; existing fields have not been saved. Reload to try again."
            );
            useAgentAccessStore.getState().setEnabled(false);
          }}
        >
          <Suspense
            fallback={
              <p data-agent-hidden={true} role="status">
                Loading draft review…
              </p>
            }
          >
            <LazyAgentDraftPanel draft={draft} />
          </Suspense>
        </CatchBoundary>
      ) : null}
      {draftRefusal === null ? null : (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {draftRefusal}
        </p>
      )}
      <InstanceConfigurationNotice formNotice={formNotice} />
    </SectionCard>
  );
}

function InstanceConfigurationNotice({
  formNotice,
}: {
  formNotice: { message: string; variant: "error" | "success" } | null;
}) {
  if (!formNotice) {
    return null;
  }
  return (
    <Alert
      className="mt-4"
      variant={formNotice.variant === "error" ? "destructive" : "default"}
    >
      {formNotice.variant === "error" ? (
        <CircleExclamationPoint className="size-4" />
      ) : (
        <CircleCheck className="size-4 text-positive-600" />
      )}
      <AlertTitle>
        {formNotice.variant === "error" ? "Could not save" : "Saved"}
      </AlertTitle>
      <AlertDescription>{formNotice.message}</AlertDescription>
    </Alert>
  );
}

export { InstanceConfigurationSection };
