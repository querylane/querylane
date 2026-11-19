type ResultsTab = "messages" | "plan" | "results";

function parseResultsTab(value: unknown) {
  return value === "messages" || value === "plan" ? value : "results";
}

export type { ResultsTab };
export { parseResultsTab };
