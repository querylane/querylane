import { describe, expect, test } from "@rstest/core";
import { readRpcRequestBody } from "../e2e/tests/read-rpc-request-body";

describe("rpc fixture request boundary", () => {
  test("retains typed routing fields and endpoint-specific payloads", () => {
    expect(
      readRpcRequestBody({
        parent: "instances/demo",
        pageToken: "next",
        filter: "name = 'demo'",
        pageSize: 25,
      })
    ).toEqual({
      parent: "instances/demo",
      pageToken: "next",
      filter: "name = 'demo'",
      pageSize: 25,
    });
  });
  test("accepts omitted protobuf defaults", () => {
    expect(readRpcRequestBody({})).toEqual({});
  });
  test.each([
    { value: null },
    { value: [] },
    { value: { name: 5 } },
    { value: { pageToken: {} } },
  ])("rejects malformed request $value", ({ value }) => {
    expect(() => readRpcRequestBody(value)).toThrow();
  });
});
