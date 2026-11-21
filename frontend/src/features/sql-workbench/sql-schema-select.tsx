"use client";

import { useTransport } from "@connectrpc/connect-query";
import { callUnaryMethod } from "@connectrpc/connect-query-core";
import { useAsyncOptions } from "@ui-sdk/react/async-options";
import { useFieldControl } from "@ui-sdk/react/field";
import { Check, ChevronDown, Folder } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandStatus,
} from "@/components/querylane-ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/querylane-ui/popover";
import { buildDatabaseName } from "@/lib/console-resources";
import {
  quoteFilterValue,
  SERVER_FILTER_DEBOUNCE_MS,
} from "@/lib/domain/aip-filter";
import { cn } from "@/lib/utils";
import { listSchemas } from "@/protogen/querylane/console/v1alpha1/schema-SchemaService_connectquery";

/** Server page size: enough to browse; beyond that, people type to narrow. */
const SCHEMA_RESULT_LIMIT = 50;
/** PostgreSQL-internal namespaces nobody resolves table names against. */
const INTERNAL_SCHEMA_PATTERN = /^pg_(?<capture1>toast|temp)/u;

function SchemaOption({
  name,
  onSelect,
  selected,
}: {
  name: string;
  onSelect: (name: string) => void;
  selected: boolean;
}) {
  return (
    <CommandItem
      onSelect={() => {
        onSelect(name);
      }}
      title={name}
      value={name}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Check
        aria-hidden="true"
        className={cn("size-4 shrink-0", !selected && "invisible")}
      />
    </CommandItem>
  );
}

function SchemaResults({
  onChoose,
  schemas,
  searching,
  value,
}: {
  onChoose: (schema: string | undefined) => void;
  schemas: readonly {
    displayName: string;
    isSystemSchema: boolean;
    name: string;
  }[];
  searching: boolean;
  value: string | undefined;
}) {
  const userSchemas = schemas.filter((schema) => !schema.isSystemSchema);
  const systemSchemas = schemas.filter((schema) => schema.isSystemSchema);
  return (
    <>
      {searching ? null : (
        <CommandGroup>
          <SchemaOption
            name="Default schema"
            onSelect={() => {
              onChoose(undefined);
            }}
            selected={value === undefined}
          />
        </CommandGroup>
      )}
      {userSchemas.length > 0 ? (
        <>
          {searching ? null : <CommandSeparator />}
          <CommandGroup>
            {userSchemas.map((schema) => (
              <SchemaOption
                key={schema.name}
                name={schema.displayName}
                onSelect={onChoose}
                selected={schema.displayName === value}
              />
            ))}
          </CommandGroup>
        </>
      ) : null}
      {systemSchemas.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup heading="System">
            {systemSchemas.map((schema) => (
              <SchemaOption
                key={schema.name}
                name={schema.displayName}
                onSelect={onChoose}
                selected={schema.displayName === value}
              />
            ))}
          </CommandGroup>
        </>
      ) : null}
    </>
  );
}

interface SqlSchemaSelectProps {
  databaseId: string;
  instanceId: string;
  onChange: (schema: string | undefined) => void;
  value: string | undefined;
}

function SchemaSearch({
  databaseId,
  instanceId,
  onChoose,
  value,
}: Omit<SqlSchemaSelectProps, "onChange"> & {
  onChoose: SqlSchemaSelectProps["onChange"];
}) {
  const transport = useTransport();
  // This transient popup owns its async options. Connect still owns the typed
  // RPC transport; no second query observer or debounce runs alongside it.
  const schemas = useAsyncOptions(
    async (query, { signal }) => {
      const term = query.trim();
      const response = await callUnaryMethod(
        transport,
        listSchemas,
        {
          filter: term ? `name:${quoteFilterValue(term)}` : "",
          orderBy: "name asc",
          pageSize: SCHEMA_RESULT_LIMIT,
          parent: buildDatabaseName(instanceId, databaseId),
        },
        { signal }
      );
      return {
        items: response.schemas.filter(
          (schema) => !INTERNAL_SCHEMA_PATTERN.test(schema.displayName)
        ),
        hasMore: response.nextPageToken !== "",
      };
    },
    { debounce: SERVER_FILTER_DEBOUNCE_MS, immediate: true }
  );

  const resultLabel = schemas.items.length === 1 ? "schema" : "schemas";

  return (
    <Command
      filter={false}
      onQueryChange={(next) => {
        schemas.setQuery(next);
      }}
      query={schemas.query}
      status={schemas.status}
    >
      <CommandInput placeholder="Search schemas…" />
      <CommandStatus aria-label="Schema search status">
        {schemas.status === "error" ? "Couldn't load schemas." : null}
        {schemas.status === "loading" ? "Loading schemas…" : null}
        {schemas.status === "idle"
          ? `${schemas.items.length} ${resultLabel} loaded.`
          : null}
      </CommandStatus>
      {schemas.status === "error" ? (
        <div className="px-3 pb-2">
          <Button
            onClick={() => {
              schemas.reload();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry schema search
          </Button>
        </div>
      ) : null}
      <CommandList presentation="search">
        {schemas.status === "idle" &&
        schemas.items.length === 0 &&
        schemas.query.trim() !== "" ? (
          <CommandEmpty presentation="compact">
            No matching schema.
          </CommandEmpty>
        ) : null}
        <SchemaResults
          onChoose={onChoose}
          schemas={schemas.items}
          searching={schemas.query.trim() !== ""}
          value={value}
        />
      </CommandList>
      {schemas.status === "idle" && schemas.hasMore ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Showing the first {SCHEMA_RESULT_LIMIT}. Type to search all schemas.
        </p>
      ) : null}
    </Command>
  );
}

function SchemaPicker({
  databaseId,
  field,
  instanceId,
  onChange,
  value,
}: SqlSchemaSelectProps & { field: ReturnType<typeof useFieldControl> }) {
  const [open, setOpen] = useState(false);
  const disabled = field?.disabled === true;
  const controlProps = { "aria-label": "Default schema", name: field?.name };

  function choose(next: string | undefined) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        {...(field ? field.props(controlProps) : controlProps)}
        disabled={disabled}
        render={
          <Button
            className="h-8 max-w-48"
            presentation="compact"
            size="sm"
            title={value ?? "Default schema (the role's search_path)"}
            type="button"
            variant="outline"
          >
            <Folder aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              {value ?? "Default schema"}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 opacity-60"
            />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        aria-label="Choose default schema"
        className="w-72"
        presentation="detail"
      >
        {open ? (
          <SchemaSearch
            databaseId={databaseId}
            instanceId={instanceId}
            onChoose={choose}
            value={value}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Picks the schema unqualified names resolve against for the active SQL tab.
 * Search is server-backed, not limited to the first catalog snapshot. A new
 * database or disabled field ends the popup session and aborts its work.
 */
function SqlSchemaSelect(props: SqlSchemaSelectProps) {
  const field = useFieldControl();
  const parent = buildDatabaseName(props.instanceId, props.databaseId);
  return (
    <SchemaPicker
      key={`${parent}:${field?.disabled === true ? "disabled" : "enabled"}`}
      {...props}
      field={field}
    />
  );
}

export { SqlSchemaSelect };
