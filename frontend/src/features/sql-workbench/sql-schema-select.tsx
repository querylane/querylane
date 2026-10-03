"use client";

import { useQuery } from "@connectrpc/connect-query";
import { keepPreviousData } from "@tanstack/react-query";
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
} from "@/components/querylane-ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/querylane-ui/popover";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { quoteFilterValue, SERVER_FILTER_DEBOUNCE_MS } from "@/lib/aip-filter";
import { buildDatabaseName } from "@/lib/console-resources";
import { cn } from "@/lib/utils";
import { listSchemas } from "@/protogen/querylane/console/v1alpha1/schema-SchemaService_connectquery";

/** Server page size: enough to browse; beyond that, people type to narrow. */
const SCHEMA_RESULT_LIMIT = 50;
/** PostgreSQL-internal namespaces nobody resolves table names against. */
const INTERNAL_SCHEMA_PATTERN = /^pg_(toast|temp)/;

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
    <CommandItem onSelect={() => onSelect(name)} title={name} value={name}>
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
            onSelect={() => onChoose(undefined)}
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

/**
 * Picks the schema unqualified names resolve against for the active tab. The
 * workbench runs every statement in its own transaction, so `SET search_path`
 * cannot carry over; this is sent with each statement instead.
 *
 * Searches the server rather than the catalog snapshot: the catalog stops at
 * 100 schemas, and schema-per-tenant databases can have thousands.
 */
function SqlSchemaSelect({
  databaseId,
  instanceId,
  onChange,
  value,
}: {
  databaseId: string;
  instanceId: string;
  onChange: (schema: string | undefined) => void;
  value: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim(), SERVER_FILTER_DEBOUNCE_MS);
  const schemas = useQuery(
    listSchemas,
    {
      filter: term ? `name:${quoteFilterValue(term)}` : "",
      orderBy: "name asc",
      pageSize: SCHEMA_RESULT_LIMIT,
      parent: buildDatabaseName(instanceId, databaseId),
    },
    { enabled: open, placeholderData: keepPreviousData }
  );
  const results = (schemas.data?.schemas ?? []).filter(
    (schema) => !INTERNAL_SCHEMA_PATTERN.test(schema.displayName)
  );
  const hasMore = Boolean(schemas.data?.nextPageToken);

  function choose(next: string | undefined) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Default schema"
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
      <PopoverContent align="end" className="w-72" presentation="detail">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={setSearch}
            placeholder="Search schemas…"
            value={search}
          />
          <CommandList presentation="search">
            <CommandEmpty presentation="compact">
              {schemas.isPending ? "Loading schemas…" : "No matching schema."}
            </CommandEmpty>
            <SchemaResults
              onChoose={choose}
              schemas={results}
              searching={term !== ""}
              value={value}
            />
            {hasMore ? (
              <p className="px-3 py-2 text-muted-foreground text-xs">
                Showing the first {SCHEMA_RESULT_LIMIT}. Type to search all
                schemas.
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { SqlSchemaSelect };
