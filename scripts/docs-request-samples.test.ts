import { expect, test } from "bun:test";
import config from "../blume.config";
import { querylaneSampleLanguages } from "../docs/components/openapi/request-samples";

test("offers Go instead of Python for API request samples", () => {
	expect(config.openapi?.codeSamples).toEqual(["curl", "js", "go"]);

	const languages = querylaneSampleLanguages(config.openapi?.codeSamples ?? []);
	expect(languages.map(({ id, label }) => ({ id, label }))).toEqual([
		{ id: "curl", label: "cURL" },
		{ id: "js", label: "JavaScript" },
		{ id: "go", label: "Go" },
	]);
});

test("builds a standard-library Go request with the generated body and headers", () => {
	const go = querylaneSampleLanguages(["go"])[0];
	expect(go).toBeDefined();

	const code = go?.build({
		body: '{"name":"instances/example"}',
		bodyValue: { name: "instances/example" },
		headers: {
			"Connect-Protocol-Version": "1",
			"Content-Type": "application/json",
		},
		method: "POST",
		url: "http://localhost:3000/querylane.InstanceService/GetInstance",
	});

	expect(code).toContain("package main");
	expect(code).toContain(
		'http.NewRequest("POST", "http://localhost:3000/querylane.InstanceService/GetInstance"',
	);
	expect(code).toContain('req.Header.Set("Connect-Protocol-Version", "1")');
	expect(code).toContain(
		'strings.NewReader("{\\"name\\":\\"instances/example\\"}")',
	);
	expect(code).toContain("http.DefaultClient.Do(req)");
});
