"use client";

import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useId, useState } from "react";
import { SectionCard } from "@/components/console-pages/console-layout";
import {
  DEFAULT_POSTGRES_PORT,
  type InstanceFormErrors,
  type InstanceFormInvalidFieldName,
  type InstanceFormState,
  type InstanceRecord,
  labelsEqual,
  labelsToEntries,
  validateInstanceForm,
} from "@/components/console-pages/instance-config-model";
import { FieldError } from "@/components/console-pages/instance-configuration-field-error";
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
import {
  formatSslMode,
  formatSslNegotiation,
  normalizeSslNegotiation,
} from "@/lib/protobuf-enums";
import { waitForNextFrame } from "@/lib/wait-for-next-frame";
import {
  Instance_CredentialState,
  PostgresConfig_SslMode,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { InstanceConfigurationLabels } from "./instance-configuration-labels";

function createInstanceFormState(instance: InstanceRecord): InstanceFormState {
  return {
    database: instance.config?.database ?? "",
    dirtyFields: {},
    displayName: instance.displayName,
    host: instance.config?.host ?? "",
    labels: labelsToEntries(instance.labels ?? {}),
    password: instance.config?.password ?? "",
    port: String(instance.config?.port ?? DEFAULT_POSTGRES_PORT),
    sslMode: formatSslMode(
      instance.config?.sslMode ?? PostgresConfig_SslMode.PREFER
    ),
    sslNegotiation: formatSslNegotiation(
      normalizeSslNegotiation(instance.config?.sslNegotiation)
    ),
    username: instance.config?.username ?? "",
  };
}
function areInstanceFormStatesEqual(
  current: InstanceFormState,
  next: InstanceFormState
) {
  return (
    current.database === next.database &&
    current.displayName === next.displayName &&
    current.host === next.host &&
    labelsEqual(current.labels, next.labels) &&
    current.password === next.password &&
    current.port === next.port &&
    current.sslMode === next.sslMode &&
    current.sslNegotiation === next.sslNegotiation &&
    current.username === next.username
  );
}

interface InstanceConfigurationSaveOutcome {
  fieldErrors: InstanceFormErrors;
  firstInvalidField: InstanceFormInvalidFieldName | null;
}

function focusInstanceConfigurationInvalidField(
  field: InstanceFormInvalidFieldName
) {
  waitForNextFrame().then(() => {
    document
      .querySelector<HTMLElement>(`[data-instance-config-field="${field}"]`)
      ?.focus();
  });
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
  onInvalidSave: () => void;
  onSave: (
    formState: InstanceFormState
  ) =>
    | Promise<InstanceConfigurationSaveOutcome | undefined>
    | InstanceConfigurationSaveOutcome
    | undefined;
  pending: boolean;
}) {
  const displayNameId = useId();
  const hostId = useId();
  const portId = useId();
  const databaseId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const sslModeId = useId();
  const sslNegotiationId = useId();
  const credentialGuidanceId = `${passwordId}-credential-guidance`;
  const [formState, setFormState] = useState<InstanceFormState>(() =>
    createInstanceFormState(instance)
  );
  const [formErrors, setFormErrors] = useState<InstanceFormErrors>({});
  const persistedFormState = createInstanceFormState(instance);
  const hasUnsavedChanges = !areInstanceFormStatesEqual(
    formState,
    persistedFormState
  );
  const credentialsUnreadable =
    instance.credentialState === Instance_CredentialState.UNREADABLE;
  const needsReplacementPassword =
    credentialsUnreadable && !formState.dirtyFields?.password;
  let saveDisabledReason =
    hasUnsavedChanges || pending ? null : "No changes to save.";
  if (needsReplacementPassword) {
    saveDisabledReason = "Re-enter the password before saving.";
  }
  const handleSaveClick = async () => {
    const validation = validateInstanceForm(formState);
    setFormErrors(validation.errors);
    if (validation.firstInvalidField) {
      onInvalidSave();
      focusInstanceConfigurationInvalidField(validation.firstInvalidField);
      return;
    }
    const outcome = await onSave(formState);
    if (outcome?.fieldErrors) {
      setFormErrors(outcome.fieldErrors);
    }
    if (outcome?.firstInvalidField) {
      focusInstanceConfigurationInvalidField(outcome.firstInvalidField);
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
          ? "Connection details registered for this instance."
          : "Update the registered connection details used by Querylane."
      }
      title="Configuration"
    >
      {credentialsUnreadable ? (
        <Alert className="pr-44" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Credentials need attention</AlertTitle>
          <AlertDescription id={credentialGuidanceId}>
            Stored credentials can’t be read. Enter the password again to
            restore access.
          </AlertDescription>
          <AlertAction>
            <Button
              onClick={() => focusInstanceConfigurationInvalidField("password")}
              size="sm"
              variant="outline"
            >
              Re-enter password
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <InstanceConfigurationFields
        databaseId={databaseId}
        displayNameId={displayNameId}
        formErrors={formErrors}
        formState={formState}
        hostId={hostId}
        isConfigManaged={isConfigManaged}
        passwordDescriptionId={
          credentialsUnreadable ? credentialGuidanceId : undefined
        }
        passwordId={passwordId}
        portId={portId}
        setFormState={setFormState}
        sslModeId={sslModeId}
        sslNegotiationId={sslNegotiationId}
        usernameId={usernameId}
      />

      <InstanceConfigurationLabels
        formErrors={formErrors}
        formState={formState}
        isConfigManaged={isConfigManaged}
        setFormState={setFormState}
      />

      <InstanceConfigurationNotice formNotice={formNotice} />
    </SectionCard>
  );
}

function markInstanceFieldDirty(
  current: InstanceFormState,
  field: keyof NonNullable<InstanceFormState["dirtyFields"]>
): Pick<InstanceFormState, "dirtyFields"> {
  return { dirtyFields: { ...current.dirtyFields, [field]: true } };
}

function InstanceConfigurationFields({
  databaseId,
  displayNameId,
  formErrors,
  formState,
  hostId,
  isConfigManaged,
  passwordId,
  passwordDescriptionId,
  portId,
  setFormState,
  sslModeId,
  sslNegotiationId,
  usernameId,
}: {
  databaseId: string;
  displayNameId: string;
  formErrors: InstanceFormErrors;
  formState: InstanceFormState;
  hostId: string;
  isConfigManaged: boolean;
  passwordId: string;
  passwordDescriptionId?: string | undefined;
  portId: string;
  setFormState: Dispatch<SetStateAction<InstanceFormState>>;
  sslModeId: string;
  sslNegotiationId: string;
  usernameId: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <label className="text-sm" htmlFor={displayNameId}>
          Display name
        </label>
        <Input
          aria-invalid={Boolean(formErrors.displayName)}
          data-instance-config-field="displayName"
          disabled={isConfigManaged}
          id={displayNameId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "displayName"),
              displayName: event.target.value,
            }))
          }
          value={formState.displayName}
        />
        <FieldError error={formErrors.displayName} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={hostId}>
          Host
        </label>
        <Input
          aria-invalid={Boolean(formErrors.host)}
          data-instance-config-field="host"
          disabled={isConfigManaged}
          id={hostId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "host"),
              host: event.target.value,
            }))
          }
          value={formState.host}
        />
        <FieldError error={formErrors.host} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={portId}>
          Port
        </label>
        <Input
          aria-invalid={Boolean(formErrors.port)}
          data-instance-config-field="port"
          disabled={isConfigManaged}
          id={portId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "port"),
              port: event.target.value,
            }))
          }
          value={formState.port}
        />
        <FieldError error={formErrors.port} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={databaseId}>
          Default database
        </label>
        <Input
          aria-invalid={Boolean(formErrors.database)}
          data-instance-config-field="database"
          disabled={isConfigManaged}
          id={databaseId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "database"),
              database: event.target.value,
            }))
          }
          value={formState.database}
        />
        <FieldError error={formErrors.database} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={usernameId}>
          Username
        </label>
        <Input
          aria-invalid={Boolean(formErrors.username)}
          data-instance-config-field="username"
          disabled={isConfigManaged}
          id={usernameId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "username"),
              username: event.target.value,
            }))
          }
          value={formState.username}
        />
        <FieldError error={formErrors.username} />
      </div>
      <div className="space-y-2">
        <label className="text-sm" htmlFor={passwordId}>
          Password
        </label>
        <PasswordInput
          aria-describedby={passwordDescriptionId}
          aria-invalid={Boolean(formErrors.password)}
          data-instance-config-field="password"
          disabled={isConfigManaged}
          id={passwordId}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              ...markInstanceFieldDirty(current, "password"),
              password: event.target.value,
            }))
          }
          value={formState.password}
        />
        <FieldError error={formErrors.password} />
      </div>
      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm" htmlFor={sslModeId}>
            SSL mode
          </label>
          <Select
            disabled={isConfigManaged}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              setFormState((current) => ({
                ...current,
                ...markInstanceFieldDirty(current, "sslMode"),
                sslMode: value,
              }));
            }}
            value={formState.sslMode}
          >
            <SelectTrigger
              className="w-full"
              data-instance-config-field="sslMode"
              id={sslModeId}
            >
              <SslModeSelectValue value={formState.sslMode} />
            </SelectTrigger>
            <SelectContent className="min-w-[22rem]">
              <SslModeSelectItems />
            </SelectContent>
          </Select>
          <FieldError error={formErrors.sslMode} />
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={sslNegotiationId}>
            SSL negotiation
          </label>
          <Select
            disabled={isConfigManaged}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              setFormState((current) => ({
                ...current,
                ...markInstanceFieldDirty(current, "sslNegotiation"),
                sslNegotiation: value,
              }));
            }}
            value={formState.sslNegotiation}
          >
            <SelectTrigger
              aria-invalid={Boolean(formErrors.sslNegotiation)}
              className="w-full"
              data-instance-config-field="sslNegotiation"
              id={sslNegotiationId}
            >
              <SslNegotiationSelectValue value={formState.sslNegotiation} />
            </SelectTrigger>
            <SelectContent className="min-w-[22rem]">
              <SslNegotiationSelectItems />
            </SelectContent>
          </Select>
          <FieldError error={formErrors.sslNegotiation} />
        </div>
      </div>
    </div>
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
        <CheckCircle2 className="size-4 text-emerald-600" />
      )}
      <AlertTitle>
        {formNotice.variant === "error" ? "Could not save" : "Saved"}
      </AlertTitle>
      <AlertDescription>{formNotice.message}</AlertDescription>
    </Alert>
  );
}

export { InstanceConfigurationSection };
