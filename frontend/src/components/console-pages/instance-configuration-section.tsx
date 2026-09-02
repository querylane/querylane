"use client";

import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
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
  SslModeSelectItems,
  SslModeSelectValue,
} from "@/components/ssl-mode-select";
import {
  SslNegotiationSelectItems,
  SslNegotiationSelectValue,
} from "@/components/ssl-negotiation-select";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DisabledReasonButton } from "@/components/ui/disabled-reason-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import { useProtoForm } from "@/hooks/use-proto-form";
import {
  formatSslMode,
  formatSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { isDirectSslNegotiationMode } from "@/lib/ssl-modes";
import { normalizeAppUiError } from "@/lib/ui-error";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import {
  Instance_CredentialState,
  InstanceSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

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
  waitForNextFrame().then(() => {
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-instance-config-field]"
    )) {
      if (element.dataset["instanceConfigField"] === field) {
        element.focus();
        return;
      }
    }
  });
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
    <Alert
      className="has-data-[slot=alert-action]:pr-4 sm:has-data-[slot=alert-action]:pr-44"
      variant="destructive"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Credentials need attention</AlertTitle>
      <AlertDescription id={credentialGuidanceId}>
        {description}
      </AlertDescription>
      {credentialKeyMissing ? null : (
        <AlertAction className="static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0">
          <Button
            onClick={() => focusInstanceConfigurationInvalidField("password")}
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
  if (!error) {
    return;
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
}: {
  credentialGuidanceId: string;
  credentialsUnreadable: boolean;
  fieldErrors: InstanceConfigurationFieldErrors;
  form: InstanceProtoForm;
  isConfigManaged: boolean;
  sslMode: string;
  sslNegotiation: string;
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
        <Input
          aria-invalid={Boolean(fieldErrors.displayName)}
          data-instance-config-field="displayName"
          disabled={isConfigManaged}
          id={displayNameId}
          {...form.register("displayName")}
        />
        <FieldError error={fieldErrors.displayName} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={hostId}>
          Host
        </label>
        <Input
          aria-invalid={Boolean(fieldErrors.host)}
          data-instance-config-field="host"
          disabled={isConfigManaged}
          id={hostId}
          {...form.register("config.host")}
        />
        <FieldError error={fieldErrors.host} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={portId}>
          Port
        </label>
        <Input
          aria-invalid={Boolean(fieldErrors.port)}
          data-instance-config-field="port"
          disabled={isConfigManaged}
          id={portId}
          type="number"
          {...form.register("config.port", { valueAsNumber: true })}
        />
        <FieldError error={fieldErrors.port} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={databaseId}>
          Default database
        </label>
        <Input
          aria-invalid={Boolean(fieldErrors.database)}
          data-instance-config-field="database"
          disabled={isConfigManaged}
          id={databaseId}
          {...form.register("config.database")}
        />
        <FieldError error={fieldErrors.database} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={usernameId}>
          Username
        </label>
        <Input
          aria-invalid={Boolean(fieldErrors.username)}
          data-instance-config-field="username"
          disabled={isConfigManaged}
          id={usernameId}
          {...form.register("config.username")}
        />
        <FieldError error={fieldErrors.username} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={passwordId}>
          Password
        </label>
        <PasswordInput
          aria-describedby={
            credentialsUnreadable ? credentialGuidanceId : undefined
          }
          aria-invalid={Boolean(fieldErrors.password)}
          data-instance-config-field="password"
          disabled={isConfigManaged}
          id={passwordId}
          {...form.register("config.password")}
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
            onValueChange={(value) => {
              if (value) {
                form.setValue("config.sslMode", toSslMode(value), {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
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
            <SelectContent className="min-w-[22rem]">
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
            onValueChange={(value) => {
              if (value) {
                form.setValue(
                  "config.sslNegotiation",
                  toSslNegotiation(value),
                  {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  }
                );
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
            <SelectContent className="min-w-[22rem]">
              <SslNegotiationSelectItems />
            </SelectContent>
          </Select>
          <FieldError error={fieldErrors.sslNegotiation} />
        </div>
      </div>
    </div>
  );
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
  ) => Promise<unknown | undefined> | unknown | undefined;
  pending: boolean;
}) {
  const credentialGuidanceId = useId();
  const formDefaultsRef = useRef<ReturnType<
    typeof createInstanceFormDefaults
  > | null>(null);
  if (formDefaultsRef.current === null) {
    formDefaultsRef.current = createInstanceFormDefaults(instance);
  }
  const formDefaults = formDefaultsRef.current;
  const form = useProtoForm(InstanceSchema, {
    defaultValues: formDefaults,
    mode: "onChange",
    serverPathPrefix: "instance",
    validationScope: "modified-fields",
  });
  const values = useWatch({ control: form.control });
  // allow: proto-form-parallel-state protobuf maps cannot represent a blank
  // key while the user is composing a new row; valid rows are synced below.
  const [labels, setLabels] = useState<InstanceLabelEntry[]>(() =>
    labelsToEntries(instance.labels)
  );
  const [labelsError, setLabelsError] = useState<string>();
  const credentialsUnreadable =
    instance.credentialState !== Instance_CredentialState.UNSPECIFIED;
  const credentialKeyMissing =
    instance.credentialState === Instance_CredentialState.KEY_MISSING;
  const needsReplacementPassword =
    instance.credentialState === Instance_CredentialState.UNREADABLE &&
    !values.config?.password;
  const saveDisabledReason = getInstanceSaveDisabledReason({
    credentialKeyMissing,
    hasUnsavedChanges:
      createInstanceUpdate(form, instance).updatePaths.length > 0,
    needsReplacementPassword,
    pending,
  });
  const { errors } = form.formState;
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
    labels: labelsError ?? findFirstErrorMessage(errors.labels),
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
  const sslMode = formatSslMode(values.config?.sslMode ?? 0);
  const sslNegotiation = formatSslNegotiation(
    values.config?.sslNegotiation ?? 0
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
  const handleSaveClick = async () => {
    const hasBlankLabel = labels.some((label) => label.key.trim().length === 0);
    if (hasBlankLabel) {
      setLabelsError("Label keys cannot be empty.");
      onInvalidSave();
      focusInstanceConfigurationInvalidField("labels");
      return;
    }
    normalizeInstanceProtoForm(form);
    const isValid = await form.trigger(undefined, { shouldFocus: true });
    if (!isValid) {
      onInvalidSave();
      return;
    }
    const update = createInstanceUpdate(form, instance);
    if (update.updatePaths.length === 0) {
      return;
    }
    form.clearServerErrorContext();
    const error = await onSave(update.instance, update.updatePaths);
    if (error) {
      surfaceSaveError({ error, form, onInvalidSave });
    }
  };

  return (
    <SectionCard
      action={
        isConfigManaged ? null : (
          <DisabledReasonButton
            disabled={pending}
            disabledReason={saveDisabledReason}
            onClick={handleSaveClick}
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
        sslMode={sslMode}
        sslNegotiation={sslNegotiation}
      />

      <InstanceConfigurationLabels
        error={fieldErrors.labels}
        isConfigManaged={isConfigManaged}
        labels={labels}
        onChange={handleLabelsChange}
      />

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
        <AlertCircle className="size-4" />
      ) : (
        <CheckCircle2 className="size-4 text-success" />
      )}
      <AlertTitle>
        {formNotice.variant === "error" ? "Could not save" : "Saved"}
      </AlertTitle>
      <AlertDescription>{formNotice.message}</AlertDescription>
    </Alert>
  );
}

export { InstanceConfigurationSection };
