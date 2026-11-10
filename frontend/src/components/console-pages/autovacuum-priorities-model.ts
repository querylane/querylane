import type { AutovacuumTablePriority } from "@/protogen/querylane/console/v1alpha1/database_pb";

const scoreFormatter = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 4,
});

export function autovacuumEligibility(table: AutovacuumTablePriority): string {
  if (table.forWraparound) {
    return "Wraparound prevention";
  }
  if (table.doVacuum && table.doAnalyze) {
    return "Vacuum and analyze eligible";
  }
  if (table.doVacuum) {
    return "Vacuum eligible";
  }
  return table.doAnalyze ? "Analyze eligible" : "Not currently eligible";
}

export function formatAutovacuumScore(value: number): string {
  return Number.isFinite(value) && value >= 0
    ? scoreFormatter.format(value)
    : "Unknown";
}
