import { expect, test } from "bun:test";
import { buildRequest } from "blume/components/openapi/request.ts";
import { sampleLanguages } from "blume/components/openapi/snippets.ts";
import config from "../blume.config";

test("offers all 18 API sample languages", () => {
	const reference = config.reference?.[0];
	expect(reference?.kind).toBe("openapi");
	if (reference?.kind !== "openapi") {
		throw new Error("Expected the native OpenAPI reference");
	}
	const expectedLanguages = [
		"curl",
		"python",
		"js",
		"node",
		"typescript",
		"php",
		"go",
		"java",
		"ruby",
		"powershell",
		"swift",
		"csharp",
		"dotnet",
		"c",
		"cpp",
		"kotlin",
		"rust",
		"dart",
	];
	expect(reference.options.codeSamples).toEqual(expectedLanguages);

	const languages = sampleLanguages(reference.options.codeSamples ?? []);
	expect(languages.map(({ id }) => id)).toEqual(expectedLanguages);
});

test("builds a standard-library Go request with the generated body and headers", () => {
	const go = sampleLanguages(["go"])[0];
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

test("builds every configured sample from the same playground request", () => {
	const request = buildRequest(
		{
			auth: [],
			authOptional: false,
			body: {
				contentType: "application/json",
				example: '{"name":"string"}',
				fields: [
					{
						name: "name",
						required: true,
						type: "string",
						value: "string",
					},
				],
			},
			method: "POST",
			params: [
				{
					in: "header",
					name: "Connect-Protocol-Version",
					required: true,
					type: "string",
					value: "1",
				},
			],
			path: "/querylane.InstanceService/GetInstance",
			servers: [],
		},
		{
			auth: {},
			body: JSON.stringify({ name: "instances/demo" }, null, 2),
			params: { "header:Connect-Protocol-Version": "1" },
			server: "",
		},
	);

	for (const { build } of sampleLanguages(
		config.reference?.[0]?.kind === "openapi"
			? (config.reference[0].options.codeSamples ?? [])
			: [],
	)) {
		const code = build(request);
		expect(code).toContain("instances/demo");
		expect(code).toContain("Connect-Protocol-Version");
	}
	const code = sampleLanguages(["go"])[0]?.build(request);
	expect(code).toContain("instances/demo");
	expect(code).toContain('req.Header.Set("Connect-Protocol-Version", "1")');
});
