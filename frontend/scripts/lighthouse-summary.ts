#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

interface LighthouseAudit {
  displayValue?: unknown;
  numericValue?: unknown;
}

interface LighthouseCategory {
  score?: unknown;
}

interface LighthouseReportLike {
  audits?: unknown;
  categories?: unknown;
  fetchTime?: unknown;
  finalDisplayedUrl?: unknown;
  finalUrl?: unknown;
  requestedUrl?: unknown;
}

interface LighthouseSummaryRow {
  accessibility: string;
  bestPractices: string;
  cumulativeLayoutShift: string;
  fetchedAt: string;
  firstContentfulPaint: string;
  interactive: string;
  largestContentfulPaint: string;
  performance: string;
  seo: string;
  speedIndex: string;
  totalBlockingTime: string;
  url: string;
}

const REPORT_FILE_PATTERN = /\.report\.json$/;
const DEFAULT_REPORT_DIR = "dist/lighthouse";
const SCORE_SCALE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function getNumericScore(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readAudit(report: LighthouseReportLike, auditId: string) {
  if (!isRecord(report.audits)) {
    return;
  }

  const audit = report.audits[auditId];
  return isRecord(audit) ? (audit as LighthouseAudit) : undefined;
}

function readCategory(report: LighthouseReportLike, categoryId: string) {
  if (!isRecord(report.categories)) {
    return;
  }

  const category = report.categories[categoryId];
  return isRecord(category) ? (category as LighthouseCategory) : undefined;
}

function formatCategoryScore(report: LighthouseReportLike, categoryId: string) {
  const score = getNumericScore(readCategory(report, categoryId)?.score);
  if (score === undefined) {
    return "-";
  }

  return String(Math.round(score * SCORE_SCALE));
}

function formatAuditValue(report: LighthouseReportLike, auditId: string) {
  const audit = readAudit(report, auditId);
  const displayValue = getString(audit?.displayValue);
  if (displayValue) {
    return displayValue;
  }

  const numericValue = getNumericScore(audit?.numericValue);
  if (numericValue === undefined) {
    return "-";
  }

  return String(numericValue);
}

function getReportUrl(report: LighthouseReportLike) {
  return (
    getString(report.finalDisplayedUrl) ??
    getString(report.finalUrl) ??
    getString(report.requestedUrl) ??
    "unknown URL"
  );
}

function toSummaryRow(report: LighthouseReportLike): LighthouseSummaryRow {
  return {
    accessibility: formatCategoryScore(report, "accessibility"),
    bestPractices: formatCategoryScore(report, "best-practices"),
    cumulativeLayoutShift: formatAuditValue(report, "cumulative-layout-shift"),
    fetchedAt: getString(report.fetchTime) ?? "-",
    firstContentfulPaint: formatAuditValue(report, "first-contentful-paint"),
    interactive: formatAuditValue(report, "interactive"),
    largestContentfulPaint: formatAuditValue(
      report,
      "largest-contentful-paint"
    ),
    performance: formatCategoryScore(report, "performance"),
    seo: formatCategoryScore(report, "seo"),
    speedIndex: formatAuditValue(report, "speed-index"),
    totalBlockingTime: formatAuditValue(report, "total-blocking-time"),
    url: getReportUrl(report),
  };
}

function summarizeLighthouseReports(reports: readonly unknown[]) {
  const rows = reports.filter(isRecord).map(toSummaryRow);

  if (rows.length === 0) {
    return [
      "## Lighthouse Performance",
      "",
      "No Lighthouse report JSON files were found.",
    ].join("\n");
  }

  const markdown = [
    "## Lighthouse Performance",
    "",
    "Local Lighthouse snapshot using actual local Chrome timings, not throttled simulation. Bundle budgets remain the deterministic size guardrail.",
    "",
    "| URL | Perf | A11y | Best practices | SEO | FCP | LCP | Speed index | TBT | TTI | CLS |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    markdown.push(
      `| ${row.url} | ${row.performance} | ${row.accessibility} | ${row.bestPractices} | ${row.seo} | ${row.firstContentfulPaint} | ${row.largestContentfulPaint} | ${row.speedIndex} | ${row.totalBlockingTime} | ${row.interactive} | ${row.cumulativeLayoutShift} |`
    );
  }

  markdown.push(
    "",
    "Targets: scored Lighthouse categories must be 100/100; FCP ≤ 0.5 s; LCP ≤ 1.2 s; Speed index ≤ 0.7 s; TBT ≤ 50 ms; TTI ≤ 1.0 s; CLS ≤ 0.01."
  );

  return markdown.join("\n");
}

function loadLighthouseReports(reportDir: string) {
  if (!existsSync(reportDir)) {
    return [];
  }

  return readdirSync(reportDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REPORT_FILE_PATTERN.test(entry.name))
    .map((entry) => join(reportDir, entry.name))
    .sort()
    .flatMap((path) => {
      try {
        return [JSON.parse(readFileSync(path, "utf8")) as unknown];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Skipping invalid Lighthouse report ${path}: ${message}`);
        return [];
      }
    });
}

function runLighthouseSummaryCli(argv: readonly string[]) {
  const reportDir = argv[2] ?? DEFAULT_REPORT_DIR;
  console.log(summarizeLighthouseReports(loadLighthouseReports(reportDir)));
}

if (import.meta.main) {
  runLighthouseSummaryCli(process.argv);
}

export type { LighthouseSummaryRow };
export {
  loadLighthouseReports,
  runLighthouseSummaryCli,
  summarizeLighthouseReports,
};
