import { describe, expect, it } from "@rstest/core";
import {
  describeCommandOutcome,
  gridEmptyState,
} from "@/features/sql-workbench/sql-command-outcome";

describe("gridEmptyState", () => {
  it("stays hidden while rows may still arrive or once rows exist", () => {
    expect(gridEmptyState({ rowCount: 0, status: "running" })).toBeUndefined();
    expect(gridEmptyState({ rowCount: 3, status: "success" })).toBeUndefined();
  });

  it("distinguishes an empty result from a cancelled one", () => {
    expect(gridEmptyState({ rowCount: 0, status: "success" })?.title).toBe(
      "No rows returned"
    );
    expect(gridEmptyState({ rowCount: 0, status: "cancelled" })?.title).toBe(
      "No rows received"
    );
  });
});

describe("describeCommandOutcome", () => {
  it("uses the command tag as the title for utility commands", () => {
    const outcome = describeCommandOutcome({
      commandTag: "SET",
      rowsAffected: 0,
    });
    expect(outcome.title).toBe("SET");
    expect(outcome.tag).toBe("SET");
    expect(outcome.description).toBe(
      "PostgreSQL ran the statement and returned no result set."
    );
  });

  it("reports affected rows when the tag carries a count", () => {
    const outcome = describeCommandOutcome({
      commandTag: "UPDATE 1200",
      rowsAffected: 1200,
    });
    expect(outcome.title).toBe("UPDATE 1200");
    expect(outcome.description).toBe(
      "1,200 rows affected. PostgreSQL returned no result set."
    );
  });

  it("singularises a single affected row", () => {
    const outcome = describeCommandOutcome({
      commandTag: "DELETE 1",
      rowsAffected: 1,
    });
    expect(outcome.description).toBe(
      "1 row affected. PostgreSQL returned no result set."
    );
  });

  it("falls back to a generic title when the driver reported no tag", () => {
    const outcome = describeCommandOutcome({
      commandTag: "",
      rowsAffected: undefined,
    });
    expect(outcome.title).toBe("Statement completed");
    expect(outcome.tag).toBeNull();
  });
});
