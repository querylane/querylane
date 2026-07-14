import { Link2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useId, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import {
  SslModeSelectItems,
  SslModeSelectValue,
} from "@/components/ssl-mode-select";
import {
  SslNegotiationSelectItems,
  SslNegotiationSelectValue,
} from "@/components/ssl-negotiation-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import type { CreateInstanceFormState } from "@/features/new-instance-workflow";
import {
  formatUnsupportedPostgresConnectionParameters,
  parsePostgresConnectionString,
} from "@/lib/postgres-connection-string";
import type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
} from "@/routes/new-instance-validation";

function getCreateInstanceFieldErrorDescription(
  formErrors: CreateInstanceFormErrors,
  field: CreateInstanceFieldName,
  id: string
) {
  return formErrors[field] ? `${id}-error` : undefined;
}

function ConnectionStringFeedback({
  error,
  errorId,
  warning,
}: {
  error: string | null;
  errorId: string;
  warning: string | null;
}) {
  if (!(error || warning)) {
    return (
      <p className="text-muted-foreground text-xs">
        You’ll still pick a display name separately.
      </p>
    );
  }
  return (
    <>
      {error ? (
        <p className="text-destructive text-sm" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="text-amber-700 text-sm dark:text-amber-300" role="status">
          {warning}
        </p>
      ) : null}
    </>
  );
}

function CreateInstanceTextField({
  field,
  formErrors,
  formState,
  id,
  label,
  placeholder,
  type = "text",
  updateField,
}: {
  field: CreateInstanceFieldName;
  formErrors: CreateInstanceFormErrors;
  formState: CreateInstanceFormState;
  id: string;
  label: string;
  placeholder?: string | undefined;
  type?: "password" | "text" | undefined;
  updateField: (field: CreateInstanceFieldName, value: string) => void;
}) {
  const error = formErrors[field];
  const sharedProps = {
    "aria-describedby": getCreateInstanceFieldErrorDescription(
      formErrors,
      field,
      id
    ),
    "aria-invalid": error ? true : undefined,
    id,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      updateField(field, event.target.value),
    placeholder,
    value: formState[field],
  };
  return (
    <div className="space-y-2">
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
      {type === "password" ? (
        <PasswordInput {...sharedProps} />
      ) : (
        <Input {...sharedProps} />
      )}
      {error ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CreateInstanceConnectionFields({
  formErrors,
  formState,
  updateField,
}: {
  formErrors: CreateInstanceFormErrors;
  formState: CreateInstanceFormState;
  updateField: (field: CreateInstanceFieldName, value: string) => void;
}) {
  const connectionStringId = useId();
  const connectionStringErrorId = `${connectionStringId}-error`;
  const displayNameId = useId();
  const hostId = useId();
  const portId = useId();
  const databaseId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const [connectionStringError, setConnectionStringError] = useState<
    string | null
  >(null);
  const [connectionStringWarning, setConnectionStringWarning] = useState<
    string | null
  >(null);
  const [connectionStringValue, setConnectionStringValue] = useState("");
  const handleApplyConnectionString = () => {
    const parsed = parsePostgresConnectionString(connectionStringValue);
    if (!parsed) {
      setConnectionStringError(
        "Invalid DSN. Expected format: postgres://user:password@host:port/database"
      );
      return;
    }
    setConnectionStringError(null);
    setConnectionStringWarning(
      formatUnsupportedPostgresConnectionParameters(
        parsed.unsupportedParameters
      )
    );
    updateField("host", parsed.host);
    updateField("port", String(parsed.port));
    updateField("database", parsed.database);
    updateField("username", parsed.username);
    updateField("password", parsed.password);
    updateField("sslMode", parsed.sslMode);
    updateField("sslNegotiation", parsed.sslNegotiation);
    setConnectionStringValue("");
  };
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border border-border/70 bg-background p-2 text-muted-foreground">
            <Link2 className="size-4" />
          </div>
          <div className="space-y-1">
            <div className="font-medium text-sm">Paste a DSN to prefill</div>
            <p className="text-muted-foreground text-sm">
              Querylane will fill the host, port, database, username, password,
              and SSL mode from your PostgreSQL connection string.
            </p>
          </div>
        </div>
        <label className="text-sm" htmlFor={connectionStringId}>
          Connection string
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            aria-describedby={
              connectionStringError ? connectionStringErrorId : undefined
            }
            aria-invalid={connectionStringError ? true : undefined}
            id={connectionStringId}
            onChange={(event) => {
              setConnectionStringValue(event.target.value);
              setConnectionStringError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleApplyConnectionString();
              }
            }}
            placeholder="postgres://user:password@host:5432/database?sslmode=require"
            value={connectionStringValue}
          />
          <Button
            disabled={connectionStringValue.trim().length === 0}
            onClick={handleApplyConnectionString}
            type="button"
            variant="outline"
          >
            Apply DSN
          </Button>
        </div>
        <ConnectionStringFeedback
          error={connectionStringError}
          errorId={connectionStringErrorId}
          warning={connectionStringWarning}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CreateInstanceTextField
          field="displayName"
          formErrors={formErrors}
          formState={formState}
          id={displayNameId}
          label="Display name"
          placeholder="Customer Analytics DB"
          updateField={updateField}
        />
        <CreateInstanceTextField
          field="host"
          formErrors={formErrors}
          formState={formState}
          id={hostId}
          label="Host"
          placeholder="localhost"
          updateField={updateField}
        />
        <CreateInstanceTextField
          field="port"
          formErrors={formErrors}
          formState={formState}
          id={portId}
          label="Port"
          updateField={updateField}
        />
        <CreateInstanceTextField
          field="database"
          formErrors={formErrors}
          formState={formState}
          id={databaseId}
          label="Default database"
          updateField={updateField}
        />
        <CreateInstanceTextField
          field="username"
          formErrors={formErrors}
          formState={formState}
          id={usernameId}
          label="Username"
          updateField={updateField}
        />
        <CreateInstanceTextField
          field="password"
          formErrors={formErrors}
          formState={formState}
          id={passwordId}
          label="Password"
          type="password"
          updateField={updateField}
        />
        <CreateInstanceSslModeField
          formErrors={formErrors}
          formState={formState}
          updateField={updateField}
        />
        <CreateInstanceSslNegotiationField
          formErrors={formErrors}
          formState={formState}
          updateField={updateField}
        />
      </div>
    </div>
  );
}

function CreateInstanceSslModeField({
  formErrors,
  formState,
  updateField,
}: {
  formErrors: CreateInstanceFormErrors;
  formState: CreateInstanceFormState;
  updateField: (field: CreateInstanceFieldName, value: string) => void;
}) {
  const sslModeId = useId();
  return (
    <div className="space-y-2">
      <label className="text-sm" htmlFor={sslModeId}>
        SSL mode
      </label>
      <Select
        onValueChange={(value) => {
          if (value) {
            updateField("sslMode", value);
          }
        }}
        value={formState.sslMode}
      >
        <SelectTrigger
          aria-describedby={getCreateInstanceFieldErrorDescription(
            formErrors,
            "sslMode",
            sslModeId
          )}
          aria-invalid={formErrors.sslMode ? true : undefined}
          className="w-full"
          id={sslModeId}
        >
          <SslModeSelectValue value={formState.sslMode} />
        </SelectTrigger>
        <SelectContent className="min-w-[22rem]">
          <SslModeSelectItems />
        </SelectContent>
      </Select>
      {formErrors.sslMode ? (
        <p className="text-destructive text-sm" id={`${sslModeId}-error`}>
          {formErrors.sslMode}
        </p>
      ) : null}
    </div>
  );
}

function CreateInstanceSslNegotiationField({
  formErrors,
  formState,
  updateField,
}: {
  formErrors: CreateInstanceFormErrors;
  formState: CreateInstanceFormState;
  updateField: (field: CreateInstanceFieldName, value: string) => void;
}) {
  const sslNegotiationId = useId();
  return (
    <div className="space-y-2">
      <label className="text-sm" htmlFor={sslNegotiationId}>
        SSL negotiation
      </label>
      <Select
        onValueChange={(value) => {
          if (value) {
            updateField("sslNegotiation", value);
          }
        }}
        value={formState.sslNegotiation}
      >
        <SelectTrigger
          aria-describedby={getCreateInstanceFieldErrorDescription(
            formErrors,
            "sslNegotiation",
            sslNegotiationId
          )}
          aria-invalid={formErrors.sslNegotiation ? true : undefined}
          className="w-full"
          id={sslNegotiationId}
        >
          <SslNegotiationSelectValue value={formState.sslNegotiation} />
        </SelectTrigger>
        <SelectContent className="min-w-[22rem]">
          <SslNegotiationSelectItems />
        </SelectContent>
      </Select>
      {formErrors.sslNegotiation ? (
        <p
          className="text-destructive text-sm"
          id={`${sslNegotiationId}-error`}
        >
          {formErrors.sslNegotiation}
        </p>
      ) : null}
    </div>
  );
}

export { CreateInstanceConnectionFields };
