import { expect, test } from "@rstest/core";
import { shouldGuardApiRequest } from "./api-request-policy";

const API_BASE_URL = "https://api.example.test";
const UI_RPC_URL =
  "https://ui.example.test/querylane.console.v1alpha1.TableService/GetTablePartitionMetadata";

test.each([
  {
    url: UI_RPC_URL,
    method: "POST",
    contentType: "application/json",
    protocol: "1",
    expected: true,
  },
  {
    url: UI_RPC_URL,
    method: "POST",
    contentType: "application/proto",
    protocol: "1",
    expected: true,
  },
  {
    url: `${API_BASE_URL}/rpc`,
    method: "POST",
    contentType: "application/json",
    protocol: "",
    expected: true,
  },
  {
    url: "http://localhost:8080/rpc",
    method: "POST",
    contentType: "application/json",
    protocol: "",
    expected: true,
  },
  {
    url: "https://ui.example.test/telemetry",
    method: "POST",
    contentType: "application/json",
    protocol: "",
    expected: false,
  },
  {
    url: UI_RPC_URL,
    method: "GET",
    contentType: "application/json",
    protocol: "1",
    expected: false,
  },
])(
  "rpc guard policy: $method $url $contentType -> $expected",
  ({ url, method, contentType, protocol, expected }) => {
    expect(
      shouldGuardApiRequest({
        apiBaseUrl: API_BASE_URL,
        url,
        method,
        headers: {
          "content-type": contentType,
          "connect-protocol-version": protocol,
        },
      })
    ).toBe(expected);
  }
);
