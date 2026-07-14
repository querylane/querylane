#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { env, exit, stderr, stdout } from "node:process";
import { requiresFullStaticAnalysisFromBase } from "./lint-changed";

interface DoctorDiagnostic {
  category?: string;
  filePath?: string;
  line?: number;
  message?: string;
  rule?: string;
  severity?: string;
  tags?: string[];
  title?: string;
}

interface DoctorReport {
  diagnostics?: DoctorDiagnostic[];
  error?: string | null;
  ok?: boolean;
  projects?: Array<{
    score?: {
      label?: string;
      score?: number;
    };
  }>;
  summary?: {
    affectedFileCount?: number;
    errorCount?: number;
    score?: number;
    scoreLabel?: string;
    totalDiagnosticCount?: number;
    warningCount?: number;
  };
  version?: string;
}

interface PullRequestEvent {
  pull_request?: {
    head?: {
      sha?: string;
    };
    number?: number;
  };
}

const COMMENT_MARKER = "<!-- react-doctor:summary -->";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_JSON_MEDIA_TYPE = "application/vnd.github+json";
const MAX_COMMENT_DIAGNOSTICS = 20;
const SHORT_SHA_LENGTH = 7;
const runtimeEnv = new Map(Object.entries(env));

function getEnv(name: string) {
  return runtimeEnv.get(name);
}

function readPullRequestEvent() {
  const eventPath = getEnv("GITHUB_EVENT_PATH");
  if (!eventPath) {
    return null;
  }
  try {
    return JSON.parse(
      readFileSync(eventPath, "utf8")
    ) as PullRequestEvent | null;
  } catch (error) {
    stderr.write(`Could not read GitHub event payload: ${String(error)}\n`);
    return null;
  }
}

function readReport(rawOutput: string) {
  try {
    return JSON.parse(rawOutput) as DoctorReport;
  } catch (error) {
    stderr.write(
      `Could not parse React Doctor JSON output: ${String(error)}\n`
    );
    return null;
  }
}

function summarize(report: DoctorReport) {
  const summary = report.summary ?? {};
  const diagnostics = report.diagnostics ?? [];
  const score =
    summary.score ??
    report.projects?.find((project) => project.score)?.score?.score;
  const scoreLabel =
    summary.scoreLabel ??
    report.projects?.find((project) => project.score)?.score?.label ??
    "Unknown";
  return {
    affectedFileCount: summary.affectedFileCount ?? 0,
    diagnostics,
    errorCount: summary.errorCount ?? 0,
    score,
    scoreLabel,
    totalDiagnosticCount: summary.totalDiagnosticCount ?? diagnostics.length,
    warningCount: summary.warningCount ?? 0,
  };
}

function escapeTableCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderDiagnostic(diagnostic: DoctorDiagnostic) {
  const location = diagnostic.filePath
    ? `${diagnostic.filePath}${diagnostic.line ? `:${diagnostic.line}` : ""}`
    : "unknown";
  const tags =
    diagnostic.tags && diagnostic.tags.length > 0
      ? diagnostic.tags.join(", ")
      : "none";
  return `| ${escapeTableCell(diagnostic.severity ?? "unknown")} | ${escapeTableCell(diagnostic.rule ?? "unknown")} | ${escapeTableCell(tags)} | ${escapeTableCell(location)} | ${escapeTableCell(diagnostic.message ?? diagnostic.title ?? "")} |`;
}

function renderMarkdown(report: DoctorReport, commitSha: string | undefined) {
  const summary = summarize(report);
  const score =
    typeof summary.score === "number"
      ? `${summary.score} / 100 ${summary.scoreLabel}`
      : summary.scoreLabel;
  const lines = [
    COMMENT_MARKER,
    "",
    `**React Doctor** ${summary.totalDiagnosticCount === 0 ? "found no new issues. 🎉" : "found blocking diagnostics."}`,
    "",
    `Score: **${score}**`,
    `Errors: **${summary.errorCount}** · Warnings: **${summary.warningCount}** · Affected files: **${summary.affectedFileCount}**`,
  ];

  if (summary.diagnostics.length > 0) {
    lines.push(
      "",
      "| Severity | Rule | Tags | Location | Message |",
      "|---|---|---|---|---|",
      ...summary.diagnostics
        .slice(0, MAX_COMMENT_DIAGNOSTICS)
        .map(renderDiagnostic)
    );
    if (summary.diagnostics.length > MAX_COMMENT_DIAGNOSTICS) {
      lines.push(
        "",
        `Showing ${MAX_COMMENT_DIAGNOSTICS} of ${summary.diagnostics.length} diagnostics. See CI logs for the rest.`
      );
    }
  }

  lines.push(
    "",
    `<sub>Reviewed by [React Doctor](https://react.doctor)${commitSha ? ` for commit \`${commitSha.slice(0, SHORT_SHA_LENGTH)}\`` : ""}.</sub>`
  );

  return `${lines.join("\n")}\n`;
}

function buildStatusDescription(report: DoctorReport) {
  const summary = summarize(report);
  const score =
    typeof summary.score === "number"
      ? `${summary.score}/100`
      : summary.scoreLabel;
  return `Score ${score}, ${summary.errorCount} errors, ${summary.warningCount} warnings`;
}

function buildHeaders(token: string) {
  const headers = new Headers();
  headers.set("Accept", GITHUB_JSON_MEDIA_TYPE);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
  return headers;
}

async function githubRequest<T>(
  path: string,
  options: {
    body?: unknown;
    method?: string;
    token: string;
  }
) {
  const apiUrl = getEnv("GITHUB_API_URL") ?? "https://api.github.com";
  const requestInit: RequestInit = {
    headers: buildHeaders(options.token),
    method: options.method ?? "GET",
  };
  if (options.body) {
    requestInit.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${apiUrl}${path}`, requestInit);
  if (!response.ok) {
    throw new Error(
      `GitHub API ${options.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`
    );
  }
  return (await response.json()) as T;
}

function buildRunUrl(repository: string) {
  const serverUrl = getEnv("GITHUB_SERVER_URL");
  const runId = getEnv("GITHUB_RUN_ID");
  return serverUrl && runId
    ? `${serverUrl}/${repository}/actions/runs/${runId}`
    : undefined;
}

async function publishGitHubResult(report: DoctorReport, markdown: string) {
  const token = getEnv("GITHUB_TOKEN");
  const repository = getEnv("GITHUB_REPOSITORY");
  const event = readPullRequestEvent();
  const pullNumber = event?.pull_request?.number;
  const commitSha = event?.pull_request?.head?.sha ?? getEnv("GITHUB_SHA");

  if (!(token && repository && pullNumber)) {
    return;
  }

  const [owner, repo] = repository.split("/");
  const comments = await githubRequest<Array<{ body?: string; id: number }>>(
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`,
    { token }
  );
  const existingComment = comments.find((comment) =>
    comment.body?.includes(COMMENT_MARKER)
  );
  if (existingComment) {
    await githubRequest(
      `/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
      {
        body: { body: markdown },
        method: "PATCH",
        token,
      }
    );
  } else {
    await githubRequest(
      `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      {
        body: { body: markdown },
        method: "POST",
        token,
      }
    );
  }

  if (commitSha) {
    await githubRequest(`/repos/${owner}/${repo}/statuses/${commitSha}`, {
      body: {
        context: "React Doctor",
        description: buildStatusDescription(report),
        state: report.ok === false ? "failure" : "success",
        target_url: buildRunUrl(repository),
      },
      method: "POST",
      token,
    });
  }
}

const qualityBaseRef = getEnv("QUALITY_BASE_REF") ?? "origin/main";
const fullScanRequired = requiresFullStaticAnalysisFromBase(qualityBaseRef);
const analysisScope = fullScanRequired ? "full" : "changed";

const result = spawnSync(
  "bun",
  [
    "react-doctor",
    ".",
    "-y",
    "--scope",
    analysisScope,
    ...(fullScanRequired ? [] : ["--base", qualityBaseRef]),
    "--blocking",
    "warning",
    "--no-respect-inline-disables",
    "--supply-chain",
    "--no-score",
    "--json",
    "--json-compact",
  ],
  {
    encoding: "utf8",
  }
);

if (result.stderr) {
  stderr.write(result.stderr);
}

const doctorReport = readReport(result.stdout);
if (!doctorReport) {
  stdout.write(result.stdout);
  exit(result.status ?? 1);
}

const event = readPullRequestEvent();
const headCommitSha = event?.pull_request?.head?.sha ?? getEnv("GITHUB_SHA");
const summaryMarkdown = renderMarkdown(doctorReport, headCommitSha);
const stepSummaryPath = getEnv("GITHUB_STEP_SUMMARY");
if (stepSummaryPath) {
  appendFileSync(stepSummaryPath, summaryMarkdown);
}
stdout.write(summaryMarkdown);

try {
  await publishGitHubResult(doctorReport, summaryMarkdown);
} catch (error) {
  stderr.write(
    `Could not publish React Doctor GitHub result: ${String(error)}\n`
  );
  exit(1);
}

exit(result.status ?? (doctorReport.ok === false ? 1 : 0));
