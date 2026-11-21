import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { afterEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SqlSchemaSelect } from "@/features/sql-workbench/sql-schema-select";
import { SERVER_FILTER_DEBOUNCE_MS } from "@/lib/domain/aip-filter";
import {
  ListSchemasResponseSchema,
  SchemaService,
} from "@/protogen/querylane/console/v1alpha1/schema_pb";
import { actSynchronous } from "@/test/async-act";
import { createTestQueryClient } from "@/test/query-client";
import { QueryHookProviders } from "@/test/query-hook-providers";
import { createTestRouterTransport } from "@/test/router-transport";

const DEFAULT_SCHEMA_NAME = /^Default schema/u;

const clients: ReturnType<typeof createTestQueryClient>[] = [];
const onChange = rs.fn();

function picker(
  transport: Transport,
  {
    databaseId = "appdb",
    disabled = false,
    invalid = false,
  }: { databaseId?: string; disabled?: boolean; invalid?: boolean } = {}
) {
  const queryClient = createTestQueryClient();
  clients.push(queryClient);
  return (
    <QueryHookProviders queryClient={queryClient} transport={transport}>
      <Field disabled={disabled} invalid={invalid} name="schema">
        <FieldLabel>Default schema</FieldLabel>
        <FieldDescription>
          Resolve unqualified table names in this tab.
        </FieldDescription>
        <SqlSchemaSelect
          databaseId={databaseId}
          instanceId="production"
          onChange={onChange}
          value={undefined}
        />
      </Field>
    </QueryHookProviders>
  );
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear();
  }
  rs.useRealTimers();
});

test("the custom schema control inherits its field label, description, invalid and disabled states", () => {
  const list = rs.fn(() => ({}));
  const transport = createTestRouterTransport(({ service }) => {
    service(SchemaService, { listSchemas: list });
  });
  render(picker(transport, { disabled: true, invalid: true }));
  const trigger = screen.getByRole("button", { name: DEFAULT_SCHEMA_NAME });
  expect(trigger.hasAttribute("disabled")).toBe(true);
  expect(trigger.getAttribute("aria-invalid")).toBe("true");
  const description = screen.getByText(
    "Resolve unqualified table names in this tab."
  );
  expect(trigger.getAttribute("aria-describedby")?.split(" ")).toContain(
    description.id
  );
  expect(trigger.getAttribute("aria-labelledby")?.split(" ")).toContain(
    screen.getByText("Default schema", { selector: "label" }).id
  );
  fireEvent.click(trigger);
  expect(list).not.toHaveBeenCalled();
});

test("a failed schema search has an explicit retry that reuses the query and chooses a result", async () => {
  rs.useFakeTimers();
  const filters: string[] = [];
  const transport = createTestRouterTransport(({ service }) => {
    service(SchemaService, {
      listSchemas(request) {
        filters.push(request.filter);
        if (filters.length === 2) {
          throw new ConnectError("Unavailable", Code.Unavailable);
        }
        return {
          schemas: [
            {
              name: "instances/production/databases/appdb/schemas/sales",
              displayName: "sales",
            },
          ],
        };
      },
    });
  });
  render(picker(transport));
  await actSynchronous(act, () => {
    fireEvent.click(screen.getByRole("button", { name: DEFAULT_SCHEMA_NAME }));
  });
  fireEvent.input(screen.getByRole("combobox", { name: "Search schemas…" }), {
    target: { value: "sales" },
  });
  await act(async () => {
    await rs.advanceTimersByTimeAsync(SERVER_FILTER_DEBOUNCE_MS);
  });
  expect(
    screen.getByRole("status", { name: "Schema search status" }).textContent
  ).toContain("Couldn't load schemas.");
  await actSynchronous(act, () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Retry schema search" })
    );
  });
  fireEvent.click(screen.getByRole("option", { name: "sales" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("sales");
  expect(filters).toEqual(["", 'name:"sales"', 'name:"sales"']);
});

test("new search text aborts the previous RPC before debounce and ignores its late response", async () => {
  rs.useFakeTimers();
  const old =
    Promise.withResolvers<MessageInitShape<typeof ListSchemasResponseSchema>>();
  const latest =
    Promise.withResolvers<MessageInitShape<typeof ListSchemasResponseSchema>>();
  const requests: { filter: string; parent: string; signal: AbortSignal }[] =
    [];
  const transport = createTestRouterTransport(({ service }) => {
    service(SchemaService, {
      listSchemas(request, context) {
        requests.push({
          filter: request.filter,
          parent: request.parent,
          signal: context.signal,
        });
        return request.filter ? latest.promise : old.promise;
      },
    });
  });
  render(picker(transport));
  await actSynchronous(act, () => {
    fireEvent.click(screen.getByRole("button", { name: DEFAULT_SCHEMA_NAME }));
  });
  expect(requests).toHaveLength(1);
  fireEvent.input(screen.getByRole("combobox", { name: "Search schemas…" }), {
    target: { value: 'sales"team' },
  });
  expect(requests[0]?.signal.aborted).toBe(true);
  expect(requests).toHaveLength(1);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(SERVER_FILTER_DEBOUNCE_MS);
  });
  expect(requests.map(({ filter, parent }) => ({ filter, parent }))).toEqual([
    { filter: "", parent: "instances/production/databases/appdb" },
    {
      filter: 'name:"sales\\"team"',
      parent: "instances/production/databases/appdb",
    },
  ]);
  await actSynchronous(act, () => {
    latest.resolve(
      create(ListSchemasResponseSchema, {
        schemas: [{ name: "schemas/sales", displayName: "sales" }],
      })
    );
  });
  expect(screen.getByRole("option", { name: "sales" })).toBeTruthy();
  await actSynchronous(act, () => {
    old.resolve({
      schemas: [{ name: "schemas/old", displayName: "old result" }],
    });
  });
  expect(screen.queryByRole("option", { name: "old result" })).toBeNull();
  expect(screen.getByRole("option", { name: "sales" })).toBeTruthy();
});

test("closing, disabling, changing database and unmounting abort their popup sessions", async () => {
  const requests: {
    parent: string;
    signal: AbortSignal;
    response: ReturnType<
      typeof Promise.withResolvers<
        MessageInitShape<typeof ListSchemasResponseSchema>
      >
    >;
  }[] = [];
  const transport = createTestRouterTransport(({ service }) => {
    service(SchemaService, {
      listSchemas(request, context) {
        const response =
          Promise.withResolvers<
            MessageInitShape<typeof ListSchemasResponseSchema>
          >();
        requests.push({
          parent: request.parent,
          signal: context.signal,
          response,
        });
        return response.promise;
      },
    });
  });
  const view = render(picker(transport));
  async function open() {
    await actSynchronous(act, () => {
      fireEvent.click(
        screen.getByRole("button", { name: DEFAULT_SCHEMA_NAME })
      );
    });
  }
  try {
    await open();
    await actSynchronous(act, () => {
      fireEvent.keyDown(
        screen.getByRole("combobox", { name: "Search schemas…" }),
        { key: "Escape" }
      );
    });
    expect(requests[0]?.signal.aborted).toBe(true);
    await open();
    await actSynchronous(act, () => {
      view.rerender(picker(transport, { disabled: true }));
    });
    expect(requests[1]?.signal.aborted).toBe(true);
    expect(
      screen
        .getByRole("button", { name: DEFAULT_SCHEMA_NAME })
        .hasAttribute("disabled")
    ).toBe(true);
    await actSynchronous(act, () => {
      view.rerender(picker(transport));
    });
    expect(
      screen.queryByRole("combobox", { name: "Search schemas…" })
    ).toBeNull();
    await open();
    await actSynchronous(act, () => {
      view.rerender(picker(transport, { databaseId: "reporting" }));
    });
    expect(requests[2]?.signal.aborted).toBe(true);
    expect(
      screen.queryByRole("combobox", { name: "Search schemas…" })
    ).toBeNull();
    await open();
    expect(requests[3]?.parent).toBe(
      "instances/production/databases/reporting"
    );
    await actSynchronous(act, () => {
      view.unmount();
    });
    expect(requests[3]?.signal.aborted).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await actSynchronous(act, () => {
      for (const request of requests) {
        request.response.resolve({});
      }
    });
  }
});
