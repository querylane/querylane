import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "@rstest/core";
import {
  autovacuumEligibility,
  formatAutovacuumScore,
} from "@/components/console-pages/autovacuum-priorities-model";
import { AutovacuumTablePrioritySchema } from "@/protogen/querylane/console/v1alpha1/database_pb";

describe("autovacuum priority presentation", () => {
  test("does not infer eligibility from a high score", () => {
    expect(
      autovacuumEligibility(
        create(AutovacuumTablePrioritySchema, { score: 500 })
      )
    ).toBe("Not currently eligible");
  });
  test("uses the observed maintenance flags", () => {
    expect(
      autovacuumEligibility(
        create(AutovacuumTablePrioritySchema, {
          doAnalyze: true,
          doVacuum: true,
          score: 0,
        })
      )
    ).toBe("Vacuum and analyze eligible");
    expect(
      autovacuumEligibility(
        create(AutovacuumTablePrioritySchema, { forWraparound: true })
      )
    ).toBe("Wraparound prevention");
  });
  test("does not fabricate zero from an invalid score", () => {
    expect(formatAutovacuumScore(Number.NaN)).toBe("Unknown");
    expect(formatAutovacuumScore(Number.POSITIVE_INFINITY)).toBe("Unknown");
    expect(formatAutovacuumScore(0)).toBe("0");
    expect(formatAutovacuumScore(0.000_000_005)).not.toBe("0");
  });
});
