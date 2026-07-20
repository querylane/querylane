import { expect, test } from "bun:test";
import { shortenServiceTags } from "./openapi-labels";

test("shows service tags without the Service suffix", () => {
	const source = `paths:
  /querylane.console.v1alpha1.AdminService/GetMetricsStorageStats:
    post:
      tags:
        - AdminService
      operationId: AdminService_GetMetricsStorageStats
tags:
  - name: AdminService
    description: AdminService exposes operational introspection.
`;

	expect(shortenServiceTags(source)).toBe(`paths:
  /querylane.console.v1alpha1.AdminService/GetMetricsStorageStats:
    post:
      tags:
        - Admin
      operationId: AdminService_GetMetricsStorageStats
tags:
  - name: Admin
    description: AdminService exposes operational introspection.
`);
});
