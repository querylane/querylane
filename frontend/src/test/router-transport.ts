import {
  create,
  type DescMessage,
  type DescMethodStreaming,
  type DescMethodUnary,
  fromBinary,
  type MessageInitShape,
  type MessageShape,
  toBinary,
} from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  type ConnectRouter,
  createHandlerContext,
  createMethodImplSpec,
  createServiceImplSpec,
  type HandlerContext,
  type MethodImplSpec,
  type Transport,
} from "@connectrpc/connect";

function retypeMessage<S extends DescMessage, T extends DescMessage>(
  target: T,
  source: S,
  message: MessageInitShape<S>
): MessageShape<T> {
  return fromBinary(target, toBinary(source, create(source, message)));
}

async function firstMessage<T>(
  messages: AsyncIterable<T>
): Promise<T | undefined> {
  for await (const message of messages) {
    return message;
  }
  return undefined;
}

type TestHandlerContext = HandlerContext & {
  abort: (reason?: unknown) => void;
};

interface ResponseMessagesOptions<
  I extends DescMessage,
  O extends DescMessage,
> {
  context: TestHandlerContext;
  implementation: MethodImplSpec;
  messages: AsyncIterable<MessageInitShape<DescMessage>>;
  method: DescMethodStreaming<I, O>;
}

async function* responseMessages<I extends DescMessage, O extends DescMessage>({
  context,
  implementation,
  messages,
  method,
}: ResponseMessagesOptions<I, O>): AsyncIterable<MessageShape<O>> {
  try {
    for await (const message of messages) {
      throwIfAborted(context.signal);
      yield retypeMessage(method.output, implementation.method.output, message);
    }
    throwIfAborted(context.signal);
  } finally {
    context.abort();
  }
}

interface ContextOptions {
  contextValues: Parameters<Transport["unary"]>[5];
  header: HeadersInit | undefined;
  method: DescMethodStreaming | DescMethodUnary;
  signal: AbortSignal | undefined;
  timeoutMs: number | undefined;
}

function createContext({
  contextValues,
  header,
  method,
  signal,
  timeoutMs,
}: ContextOptions) {
  return createHandlerContext({
    method,
    protocolName: "connect",
    requestMethod: "POST",
    service: method.parent,
    url: `https://in-memory/${method.parent.typeName}/${method.name}`,
    ...(contextValues === undefined ? {} : { contextValues }),
    ...(header === undefined ? {} : { requestHeader: header }),
    ...(signal === undefined ? {} : { requestSignal: signal }),
    ...(timeoutMs === undefined || timeoutMs <= 0 ? {} : { timeoutMs }),
  });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw ConnectError.from(signal.reason, Code.Canceled);
  }
}

export function createTestRouterTransport(
  register: (router: ConnectRouter) => void
): Transport {
  const methods = new Map<object, MethodImplSpec>();
  const addMethod = (implementation: MethodImplSpec) => {
    methods.set(implementation.method, implementation);
  };
  const router: ConnectRouter = {
    handlers: [],
    rpc(method, implementation) {
      addMethod(createMethodImplSpec(method, implementation));
      return router;
    },
    service(service, implementation) {
      for (const method of Object.values(
        createServiceImplSpec(service, implementation).methods
      )) {
        addMethod(method);
      }
      return router;
    },
  };
  register(router);

  return {
    async stream(...args) {
      const [method, signal, timeoutMs, header, input, contextValues] = args;
      throwIfAborted(signal);
      const implementation = methods.get(method);
      if (!implementation) {
        throw new Error(`No test implementation for ${method.parent.typeName}`);
      }
      if (implementation.kind !== "server_streaming") {
        throw new Error(
          `Unsupported test RPC kind: ${implementation.method.methodKind}`
        );
      }

      const context = createContext({
        contextValues,
        header,
        method,
        signal,
        timeoutMs,
      });
      try {
        const request = await firstMessage(input);
        if (request === undefined) {
          throw new Error(`Missing request for ${method.parent.typeName}`);
        }
        const messages = implementation.impl(
          retypeMessage(implementation.method.input, method.input, request),
          context
        );

        return {
          header: context.responseHeader,
          message: responseMessages({
            context,
            implementation,
            messages,
            method,
          }),
          method,
          service: method.parent,
          stream: true,
          trailer: context.responseTrailer,
        };
      } catch (error) {
        context.abort(error);
        throw error;
      }
    },
    async unary(...args) {
      const [method, signal, timeoutMs, header, input, contextValues] = args;
      throwIfAborted(signal);
      const implementation = methods.get(method);
      if (!implementation) {
        throw new Error(`No test implementation for ${method.parent.typeName}`);
      }
      if (implementation.kind !== "unary") {
        throw new Error(
          `Unsupported test RPC kind: ${implementation.method.methodKind}`
        );
      }

      const context = createContext({
        contextValues,
        header,
        method,
        signal,
        timeoutMs,
      });
      try {
        const response = await implementation.impl(
          retypeMessage(implementation.method.input, method.input, input),
          context
        );

        return {
          header: context.responseHeader,
          message: retypeMessage(
            method.output,
            implementation.method.output,
            response
          ),
          method,
          service: method.parent,
          stream: false,
          trailer: context.responseTrailer,
        };
      } finally {
        context.abort();
      }
    },
  };
}
