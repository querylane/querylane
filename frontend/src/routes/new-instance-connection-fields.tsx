import { Link2 } from "lucide-react";
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
import { parsePostgresConnectionString } from "@/lib/postgres-connection-string";
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
        {connectionStringError ? (
          <p
            className="text-destructive text-sm"
            id={connectionStringErrorId}
            role="alert"
          >
            {connectionStringError}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            You’ll still pick a display name separately.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm" htmlFor={displayNameId}>
            Display name
          </label>
          <Input
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "displayName",
              displayNameId
            )}
            aria-invalid={formErrors.displayName ? true : undefined}
            id={displayNameId}
            onChange={(event) => updateField("displayName", event.target.value)}
            placeholder="Customer Analytics DB"
            value={formState.displayName}
          />
          {formErrors.displayName ? (
            <p
              className="text-destructive text-sm"
              id={`${displayNameId}-error`}
            >
              {formErrors.displayName}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={hostId}>
            Host
          </label>
          <Input
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "host",
              hostId
            )}
            aria-invalid={formErrors.host ? true : undefined}
            id={hostId}
            onChange={(event) => updateField("host", event.target.value)}
            placeholder="localhost"
            value={formState.host}
          />
          {formErrors.host ? (
            <p className="text-destructive text-sm" id={`${hostId}-error`}>
              {formErrors.host}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={portId}>
            Port
          </label>
          <Input
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "port",
              portId
            )}
            aria-invalid={formErrors.port ? true : undefined}
            id={portId}
            onChange={(event) => updateField("port", event.target.value)}
            value={formState.port}
          />
          {formErrors.port ? (
            <p className="text-destructive text-sm" id={`${portId}-error`}>
              {formErrors.port}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={databaseId}>
            Default database
          </label>
          <Input
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "database",
              databaseId
            )}
            aria-invalid={formErrors.database ? true : undefined}
            id={databaseId}
            onChange={(event) => updateField("database", event.target.value)}
            value={formState.database}
          />
          {formErrors.database ? (
            <p className="text-destructive text-sm" id={`${databaseId}-error`}>
              {formErrors.database}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={usernameId}>
            Username
          </label>
          <Input
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "username",
              usernameId
            )}
            aria-invalid={formErrors.username ? true : undefined}
            id={usernameId}
            onChange={(event) => updateField("username", event.target.value)}
            value={formState.username}
          />
          {formErrors.username ? (
            <p className="text-destructive text-sm" id={`${usernameId}-error`}>
              {formErrors.username}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={passwordId}>
            Password
          </label>
          <PasswordInput
            aria-describedby={getCreateInstanceFieldErrorDescription(
              formErrors,
              "password",
              passwordId
            )}
            aria-invalid={formErrors.password ? true : undefined}
            id={passwordId}
            onChange={(event) => updateField("password", event.target.value)}
            value={formState.password}
          />
          {formErrors.password ? (
            <p className="text-destructive text-sm" id={`${passwordId}-error`}>
              {formErrors.password}
            </p>
          ) : null}
        </div>
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
