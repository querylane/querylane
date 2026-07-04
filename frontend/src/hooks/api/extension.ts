import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createClient, type Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { buildDatabaseName } from "@/lib/console-resources";
import { paginateAll } from "@/lib/paginate-all";
import { RESOURCE_QUERY_OPTIONS } from "@/lib/query-policy";
import {
  ExtensionService,
  ListExtensionsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";
import type { listExtensions } from "@/protogen/querylane/console/v1alpha1/extension-ExtensionService_connectquery";

interface ListAllQueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

type ListExtensionsInput = MessageInitShape<(typeof listExtensions)["input"]>;

const EXTENSION_LIST_PAGE_SIZE = 50;

function getListAllExtensionsQueryKey(input: ListExtensionsInput) {
  return ["console", "extensions", "list-all", input] as const;
}

async function fetchAllExtensions(
  transport: Transport,
  input: ListExtensionsInput
) {
  const client = createClient(ExtensionService, transport);
  const extensions = await paginateAll(
    (pageToken) =>
      client.listExtensions({ ...input, pageToken: pageToken ?? "" }),
    (response) => response.extensions
  );

  return create(ListExtensionsResponseSchema, {
    extensions,
    nextPageToken: "",
  });
}

function listAllExtensionsQueryOptions({
  input,
  transport,
}: {
  input: ListExtensionsInput;
  transport: Transport;
}) {
  return queryOptions({
    queryFn: () => fetchAllExtensions(transport, input),
    queryKey: getListAllExtensionsQueryKey(input),
    ...RESOURCE_QUERY_OPTIONS.extensionList,
  });
}

function extensionsForDatabaseQueryInput({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return {
    orderBy: "installed desc",
    pageSize: EXTENSION_LIST_PAGE_SIZE,
    parent: buildDatabaseName(instanceId, databaseId),
  } as const satisfies ListExtensionsInput;
}

function useListAllExtensionsQuery(
  input: ListExtensionsInput,
  options?: ListAllQueryOptions
) {
  const transport = useTransport();

  return useQuery({
    enabled: options?.enabled ?? true,
    ...listAllExtensionsQueryOptions({ input, transport }),
    ...(options?.refetchOnWindowFocus === undefined
      ? {}
      : { refetchOnWindowFocus: options.refetchOnWindowFocus }),
  });
}

export {
  extensionsForDatabaseQueryInput,
  listAllExtensionsQueryOptions,
  useListAllExtensionsQuery,
};
