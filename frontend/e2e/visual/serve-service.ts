import {
  type DescMethodUnary,
  type DescService,
  fromJson,
  isMessage,
  type JsonValue,
  toJson,
} from "@bufbuild/protobuf";
import { ConnectError, type ServiceImpl } from "@connectrpc/connect";
import {
  codeToHttpStatus,
  errorToJson,
} from "@connectrpc/connect/protocol-connect";
import type { Page } from "playwright/test";
import { z } from "zod";

const CONNECT_ENVELOPE_HEADER_BYTES = 5;
const END_STREAM_FLAG = 0b10;

/** Encodes the same Connect JSON envelopes used by the browser transport. */
function connectStreamBody(messages: JsonValue[], error?: ConnectError) {
  const endStream = error ? { error: errorToJson(error, undefined) } : {};
  const envelopes = [...messages, endStream].map((message, index) => {
    const payload = Buffer.from(JSON.stringify(message));
    const envelope = Buffer.alloc(
      CONNECT_ENVELOPE_HEADER_BYTES + payload.length
    );
    envelope.writeUInt8(index === messages.length ? END_STREAM_FLAG : 0, 0);
    envelope.writeUInt32BE(payload.length, 1);
    payload.copy(envelope, CONNECT_ENVELOPE_HEADER_BYTES);
    return envelope;
  });
  return Buffer.concat(envelopes);
}

type UnaryImpl = (request: unknown) => unknown;

function isUnaryImpl(value: unknown): value is UnaryImpl {
  return typeof value === "function";
}

/**
 * Serves unary Connect RPCs from the same service implementations rstest passes
 * to `createTestRouterTransport`, encoding requests and responses as proto3
 * JSON the way the browser transport does.
 */
export async function serveService<S extends DescService>(
  page: Page,
  service: S,
  implementation: Partial<ServiceImpl<S>>
) {
  const methods: readonly DescMethodUnary[] = service.methods.filter(
    (method): method is DescMethodUnary => method.methodKind === "unary"
  );
  const handlers = new Map(
    Object.entries(implementation).filter(([, impl]) => isUnaryImpl(impl))
  );

  await Promise.all(
    methods.map(async (method) => {
      const impl = handlers.get(method.localName);
      if (!isUnaryImpl(impl)) {
        return;
      }
      await page.route(
        `**/${service.typeName}/${method.name}`,
        async (route) => {
          const request = fromJson(
            method.input,
            z.json().parse(route.request().postDataJSON())
          );
          try {
            const response = await impl(request);
            if (!isMessage(response, method.output)) {
              throw new Error(
                `${service.typeName}/${method.name} must return ${method.output.typeName}`
              );
            }
            await route.fulfill({
              body: JSON.stringify(toJson(method.output, response)),
              contentType: "application/json",
            });
          } catch (error) {
            const connectError = ConnectError.from(error);
            await route.fulfill({
              body: JSON.stringify(errorToJson(connectError, undefined)),
              contentType: "application/json",
              status: codeToHttpStatus(connectError.code),
            });
          }
        }
      );
    })
  );
}

export { connectStreamBody };
