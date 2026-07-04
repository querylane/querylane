import { beforeEach, describe, expect, test, vi } from "vitest";
import { useGetViewQuery, viewsForSchemaQueryInput } from "@/hooks/api/view";
import { ViewView } from "@/protogen/querylane/console/v1alpha1/view_pb";
import { getView } from "@/protogen/querylane/console/v1alpha1/view-ViewService_connectquery";

const { useQueryMock, useTransportMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useTransportMock: vi.fn(),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useQuery: useQueryMock,
  useTransport: useTransportMock,
}));

describe("view query option helpers", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useTransportMock.mockReset();
  });

  test("builds canonical view list input for a schema", () => {
    expect(
      viewsForSchemaQueryInput({
        databaseId: "postgres",
        instanceId: "local",
        schemaId: "public",
      })
    ).toEqual({
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres/schemas/public",
    });
  });

  test("includes the filter only when one is provided", () => {
    expect(
      viewsForSchemaQueryInput({
        databaseId: "postgres",
        filter: 'name:"report"',
        instanceId: "local",
        schemaId: "public",
      })
    ).toEqual({
      filter: 'name:"report"',
      orderBy: "name asc",
      pageSize: 100,
      parent: "instances/local/databases/postgres/schemas/public",
    });
  });

  test("requests the basic projection by default", () => {
    const name =
      "instances/local/databases/postgres/schemas/public/views/report";

    useGetViewQuery(name);

    expect(useQueryMock).toHaveBeenCalledWith(
      getView,
      { name, view: ViewView.BASIC },
      expect.objectContaining({ enabled: true })
    );
  });

  test("requests the full projection for selected view details", () => {
    const name =
      "instances/local/databases/postgres/schemas/public/views/report";

    useGetViewQuery(name, ViewView.FULL);

    expect(useQueryMock).toHaveBeenCalledWith(
      getView,
      { name, view: ViewView.FULL },
      expect.objectContaining({ enabled: true })
    );
  });
});
