import type {
  DescMessage,
  DescMethodUnary,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { createConnectQueryKey } from "@connectrpc/connect-query-core";

interface ConnectMethodKeyOptions<
  Input extends DescMessage,
  Output extends DescMessage,
> {
  method: DescMethodUnary<Input, Output>;
  transport: Transport;
}

interface ConnectListAllQueryKeyOptions<
  Input extends DescMessage,
  Output extends DescMessage,
> extends ConnectMethodKeyOptions<Input, Output> {
  input?: MessageInitShape<Input> | undefined;
}

export function createConnectListAllQueryKey<
  Input extends DescMessage,
  Output extends DescMessage,
>({ input, method, transport }: ConnectListAllQueryKeyOptions<Input, Output>) {
  return [
    ...createConnectQueryKey({
      cardinality: undefined,
      input,
      schema: method,
      transport,
    }),
    "list-all",
  ] as const;
}

export function createConnectMethodQueryKey<
  Input extends DescMessage,
  Output extends DescMessage,
>({ method, transport }: ConnectMethodKeyOptions<Input, Output>) {
  return createConnectQueryKey({
    cardinality: undefined,
    schema: method,
    transport,
  });
}
