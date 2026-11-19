import { Code, createClient } from "@connectrpc/connect";
import { afterEach, expect, test } from "@rstest/core";
import { HttpResponse, http } from "msw";
import { ConsoleService } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { SchemaService } from "@/protogen/querylane/console/v1alpha1/schema_pb";
import { useBlockingErrorStore } from "@/stores/blocking-error-store";
import {
  rpcJson,
  rpcPath,
  setupRpcServer,
  unaryRpc,
} from "@/test/connect.test-utils";
import { longRunningTransport, transport } from "./transport";
import { normalizeAppUiError } from "./ui-error";

const server = setupRpcServer();
const consoleClient = createClient(ConsoleService, transport);
const getConfig = ConsoleService.method.getConsoleConfig;

afterEach(() => {
  useBlockingErrorStore.getState().clearBlockingError();
});

test("both real transports propagate the correct deadline to the backend", async () => {
  const deadlines: (string | null)[] = [];
  server.use(
    unaryRpc(getConfig, (_input, request) => {
      deadlines.push(request.headers.get("connect-timeout-ms"));
      return {};
    })
  );

  await consoleClient.getConsoleConfig({});
  await createClient(ConsoleService, longRunningTransport).getConsoleConfig({});

  expect(deadlines).toEqual(["30000", "90000"]);
});

test("routes a decoded authorization failure to the app blocker", async () => {
  server.use(
    http.post(rpcPath(getConfig), () =>
      rpcJson({ code: "unauthenticated", message: "Sign-in expired" }, 401)
    )
  );

  await expect(consoleClient.getConsoleConfig({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
  expect(useBlockingErrorStore.getState().blockingError?.blockingReason).toBe(
    "unauthenticated"
  );
});

test("keeps proxy HTML out of recovery copy but retains it in technical details", async () => {
  const body = "<html>private upstream diagnostic</html>";
  server.use(
    http.post(rpcPath(getConfig), () => {
      const response = new HttpResponse(body, { status: 502 });
      response.headers.set("Content-Type", "application/json");
      return response;
    })
  );

  const error = await consoleClient
    .getConsoleConfig({})
    .catch(normalizeAppUiError);

  expect(error).toMatchObject({
    summary:
      "The server returned a gateway error page (HTTP 502) instead of an API response. The Querylane server may be down or restarting.",
    title: "Unexpected server response",
  });
  expect(error).toHaveProperty(
    "technicalDetails",
    expect.stringContaining(body)
  );
  expect(error).toHaveProperty(
    "technicalDetails",
    expect.stringContaining('"contentType": "application/json"')
  );
});

test("an unavailable instance cannot starve other instances or the meta database", async () => {
  const allAdmitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const primary = "instances/primary/databases/postgres";
  const replica = "instances/replica/databases/postgres";
  const received: string[] = [];
  server.use(
    unaryRpc(SchemaService.method.listSchemas, async ({ parent }) => {
      received.push(parent);
      if (parent === primary) {
        if (received.length === 4) {
          allAdmitted.resolve();
        }
        await release.promise;
      }
      return {};
    }),
    unaryRpc(getConfig, () => ({}))
  );

  const client = createClient(SchemaService, transport);
  const inFlight = Array.from({ length: 4 }, () =>
    client.listSchemas({ parent: primary })
  );
  const controller = new AbortController();
  const queued = createClient(SchemaService, longRunningTransport).listSchemas(
    { parent: primary },
    { signal: controller.signal }
  );
  const outcome = queued.catch((error: unknown) => error);
  try {
    await allAdmitted.promise;
    await client.listSchemas({ parent: replica });
    await consoleClient.getConsoleConfig({});
    controller.abort();

    expect(await outcome).toMatchObject({ code: Code.Canceled });
    expect(received).toEqual([primary, primary, primary, primary, replica]);
  } finally {
    controller.abort();
    release.resolve();
    await Promise.allSettled([...inFlight, outcome]);
  }

  await client.listSchemas({ parent: primary });
  expect(received).toHaveLength(6);
});
