import { describe, expect, test } from "@rstest/core";
import { injectSelectedResource } from "@/features/data-explorer/data-explorer-selected-resource";

describe("injectSelectedResource", () => {
  test("replaces a list projection with the selected full resource", () => {
    const name =
      "instances/prod/databases/app/schemas/public/views/daily_revenue";
    const resources = [
      {
        definition: "",
        displayName: "daily_revenue",
        name,
      },
    ];
    const selected = {
      definition: "SELECT current_date AS day",
      displayName: "daily_revenue",
      name,
    };

    expect(injectSelectedResource(resources, selected, "")).toEqual([selected]);
  });
});
