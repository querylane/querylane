import { expect, test } from "bun:test";
import config from "../blume.config";

test.each([
	[
		"/api/admin/adminservice-getmetricsstoragestats",
		"/api/admin/admin-service-get-metrics-storage-stats",
	],
	[
		"/api/instance/instanceservice-getinstance",
		"/api/instance/instance-service-get-instance",
	],
])("permanently redirects the pre-1.6 API URL %s", (from, to) => {
	expect(config.redirects).toContainEqual({ from, to, status: 301 });
});
