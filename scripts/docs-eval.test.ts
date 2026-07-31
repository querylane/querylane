import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

type EvalQuestion = {
	expected: string[];
	id: string;
	question: string;
	routes: string | string[];
	severity?: "error" | "warning";
	skip?: boolean;
};

type EvalsFile = {
	questions: EvalQuestion[];
	version: number;
};

const read = (path: string) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("defines a blocking eval suite for critical reader journeys", async () => {
	const evals = Bun.YAML.parse(await read("evals.yaml")) as EvalsFile;

	expect(evals.version).toBe(1);
	expect(evals.questions).toHaveLength(10);
	expect(evals.questions.map(({ id }) => id)).toEqual([
		"quickstart-docker-preview",
		"metadata-storage-choice",
		"instance-secret-key-stability",
		"register-instance-test",
		"production-access-boundary",
		"production-replicas",
		"backup-recovery-set",
		"upgrade-rollback",
		"least-privilege-role",
		"safe-data-export",
	]);

	for (const question of evals.questions) {
		expect(question.question.length).toBeGreaterThan(0);
		expect(question.expected.length).toBeGreaterThan(0);
		expect(
			typeof question.routes === "string"
				? question.routes
				: question.routes[0],
		).toStartWith("/");
		expect(question.severity ?? "error").toBe("error");
		expect(question.skip ?? false).toBe(false);
	}
});

test("exposes the blocking docs eval as a package script", async () => {
	const packageFile = JSON.parse(await read("package.json")) as {
		scripts?: Record<string, string>;
	};

	expect(packageFile.scripts?.["docs:eval"]).toBe(
		"blume eval --agent codex --json",
	);
});

test("keeps paid docs evals manual-only in isolated CI", async () => {
	const workflow = await read(".github/workflows/docs-eval.yml");

	expect(workflow).toContain("workflow_dispatch:");
	expect(workflow).not.toContain("pull_request:");
	expect(workflow).toContain("bun install --frozen-lockfile --ignore-scripts");
	expect(workflow).toContain("npm install --global @openai/codex@0.145.0");
	expect(workflow).toContain(`CODEX_API_KEY: \${{ secrets.OPENAI_API_KEY }}`);
	expect(workflow).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
	expect(workflow).toContain("bun run docs:eval");
});

test("documents how contributors run the docs eval suite", async () => {
	const readme = await read("README.md");

	expect(readme).toContain("bun run docs:eval");
	expect(readme).toContain("Codex CLI");
	expect(readme).toContain("OpenAI API key");
	expect(readme).toContain("evals.yaml");
	expect(readme).toContain("manual GitHub Actions workflow");
});
