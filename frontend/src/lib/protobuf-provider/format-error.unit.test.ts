import {
  createRegistry,
  fromBinary,
  fromJson,
  toJson,
} from "@bufbuild/protobuf";
import { base64Decode } from "@bufbuild/protobuf/wire";
import { Code, ConnectError } from "@connectrpc/connect";
import { expect, test } from "@rstest/core";
import { file_google_rpc_error_details } from "@/protogen/google/rpc/error_details_pb";
import { StatusSchema } from "@/protogen/google/rpc/status_pb";
import {
  extractConnectErrorContext,
  extractFieldViolations,
  formatConnectError,
} from "./format-error";

// Independent wire fixture: official Go genproto errdetails/status at
// 08b0e4226688, protobuf v1.36.12, anypb.New + proto.Marshal. Expected values
// below are literal protocol/application contracts, not another TS encoder.
const GOOGLE_STATUS_WIRE =
  "CAMSD2ludmFsaWQgcmVxdWVzdBqOAQoodHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLkVycm9ySW5mbxJiChRJTlNUQU5DRV9VTlJFQUNIQUJMRRIVY29uc29sZS5xdWVyeWxhbmUuZGV2Gh4KCnJlcXVlc3RfaWQSEGZhbGxiYWNrLXJlcXVlc3QaEwoEaG9zdBILZGIuaW50ZXJuYWwatwEKKXR5cGUuZ29vZ2xlYXBpcy5jb20vZ29vZ2xlLnJwYy5CYWRSZXF1ZXN0EokBClwKFGluc3RhbmNlLmNvbmZpZy5ob3N0EhVIb3N0IGlzIG5vdCByZWFjaGFibGUaC1VOUkVBQ0hBQkxFIiAKBWVuLVVTEhdDaG9vc2UgYSByZWFjaGFibGUgaG9zdAopChVpbnN0YW5jZS5kaXNwbGF5X25hbWUSEE5hbWUgaXMgcmVxdWlyZWQaZwoydHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLlByZWNvbmRpdGlvbkZhaWx1cmUSMQovCgVTVEFURRIRaW5zdGFuY2VzL3ByaW1hcnkaE0luc3RhbmNlIGlzIG9mZmxpbmUafwordHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLlJlc291cmNlSW5mbxJQCh5jb25zb2xlLnF1ZXJ5bGFuZS5kZXYvSW5zdGFuY2USEWluc3RhbmNlcy9wcmltYXJ5GglvcGVyYXRvcnMiEFByaW1hcnkgZGF0YWJhc2UaNgoodHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLlJldHJ5SW5mbxIKCggIAhCAyrXuARpPCih0eXBlLmdvb2dsZWFwaXMuY29tL2dvb2dsZS5ycGMuRGVidWdJbmZvEiMKBGRpYWwKB2Nvbm5lY3QSEmNvbm5lY3Rpb24gcmVmdXNlZBqdAQordHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLlF1b3RhRmFpbHVyZRJuCmwKEWluc3RhbmNlcy9wcmltYXJ5EhBDb25uZWN0aW9uIGxpbWl0GhVjb25zb2xlLnF1ZXJ5bGFuZS5kZXYiC2Nvbm5lY3Rpb25zKgxwZXItaW5zdGFuY2UyDwoGcmVnaW9uEgVsb2NhbDgUQBkaRQoqdHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLlJlcXVlc3RJbmZvEhcKCnJlcXVlc3QtNDISCXJlcGxpY2EtYRpWCiN0eXBlLmdvb2dsZWFwaXMuY29tL2dvb2dsZS5ycGMuSGVscBIvCi0KD0Nvbm5lY3Rpb24gaGVscBIaaHR0cHM6Ly9xdWVyeWxhbmUuZGV2L2hlbHAaWgovdHlwZS5nb29nbGVhcGlzLmNvbS9nb29nbGUucnBjLkxvY2FsaXplZE1lc3NhZ2USJwoFZW4tR0ISHkNhbm5vdCBjb25uZWN0IHRvIHRoZSBpbnN0YW5jZQ==";

const expectedDetails = [
  {
    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
    reason: "INSTANCE_UNREACHABLE",
    domain: "console.querylane.dev",
    metadata: { request_id: "fallback-request", host: "db.internal" },
  },
  {
    "@type": "type.googleapis.com/google.rpc.BadRequest",
    fieldViolations: [
      {
        field: "instance.config.host",
        description: "Host is not reachable",
        reason: "UNREACHABLE",
        localizedMessage: {
          locale: "en-US",
          message: "Choose a reachable host",
        },
      },
      { field: "instance.display_name", description: "Name is required" },
    ],
  },
  {
    "@type": "type.googleapis.com/google.rpc.PreconditionFailure",
    violations: [
      {
        type: "STATE",
        subject: "instances/primary",
        description: "Instance is offline",
      },
    ],
  },
  {
    "@type": "type.googleapis.com/google.rpc.ResourceInfo",
    resourceType: "console.querylane.dev/Instance",
    resourceName: "instances/primary",
    owner: "operators",
    description: "Primary database",
  },
  { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2.500s" },
  {
    "@type": "type.googleapis.com/google.rpc.DebugInfo",
    stackEntries: ["dial", "connect"],
    detail: "connection refused",
  },
  {
    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
    violations: [
      {
        subject: "instances/primary",
        description: "Connection limit",
        apiService: "console.querylane.dev",
        quotaMetric: "connections",
        quotaId: "per-instance",
        quotaDimensions: { region: "local" },
        quotaValue: "20",
        futureQuotaValue: "25",
      },
    ],
  },
  {
    "@type": "type.googleapis.com/google.rpc.RequestInfo",
    requestId: "request-42",
    servingData: "replica-a",
  },
  {
    "@type": "type.googleapis.com/google.rpc.Help",
    links: [
      { description: "Connection help", url: "https://querylane.dev/help" },
    ],
  },
  {
    "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
    locale: "en-GB",
    message: "Cannot connect to the instance",
  },
];

test("decodes populated Google Any details from an independent backend wire fixture", () => {
  const registry = createRegistry(file_google_rpc_error_details);
  const status = fromBinary(StatusSchema, base64Decode(GOOGLE_STATUS_WIRE));
  expect(toJson(StatusSchema, status, { registry })).toEqual({
    code: Code.InvalidArgument,
    message: "invalid request",
    details: expectedDetails,
  });
  // Exercise registered Any JSON decoding, as used for partial RPC errors,
  // then the actual form/toast adapters' ConnectError binary detail path.
  const jsonStatus = fromJson(
    StatusSchema,
    {
      code: Code.InvalidArgument,
      message: "invalid request",
      details: expectedDetails,
    },
    { registry }
  );
  const error = new ConnectError(jsonStatus.message, Code.InvalidArgument);
  error.details = jsonStatus.details.map((detail) => ({
    type: detail.typeUrl.slice(detail.typeUrl.lastIndexOf("/") + 1),
    value: detail.value,
  }));
  expect(extractFieldViolations(error)).toEqual([
    { field: "instance.config.host", description: "Host is not reachable" },
    { field: "instance.display_name", description: "Name is required" },
  ]);
  expect(formatConnectError(error)).toBe(
    "invalid request — instance.config.host: Host is not reachable; instance.display_name: Name is required (code: invalid_argument)"
  );
  expect(extractConnectErrorContext(error)).toEqual({
    code: "invalid_argument",
    message: "Cannot connect to the instance",
    messageLocale: "en-GB",
    reason: "INSTANCE_UNREACHABLE",
    domain: "console.querylane.dev",
    metadata: { request_id: "fallback-request", host: "db.internal" },
    requestId: "request-42",
    retryAfterSeconds: 2.5,
    debug: { detail: "connection refused", stackEntries: ["dial", "connect"] },
    helpLinks: [
      { description: "Connection help", url: "https://querylane.dev/help" },
    ],
    preconditionViolations: [
      {
        type: "STATE",
        subject: "instances/primary",
        description: "Instance is offline",
      },
    ],
    quotaViolations: [
      { subject: "instances/primary", description: "Connection limit" },
    ],
    resource: {
      type: "console.querylane.dev/Instance",
      name: "instances/primary",
      description: "Primary database",
    },
    unmappedDetails: [],
  });
});
