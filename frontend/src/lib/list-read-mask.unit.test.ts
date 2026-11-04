import { expect, test } from "@rstest/core";
import { listReadMask } from "@/lib/list-read-mask";

test("read masks include hidden dependencies and canonicalize equivalent selections", () => {
  const fields = { title: ["display_name", "name"], size: ["size_bytes"] };
  expect(listReadMask(["title"], fields, ["name", "owner"]).paths).toEqual([
    "display_name",
    "name",
    "owner",
  ]);
  expect(listReadMask(["size", "title", "title"], fields, ["name"])).toEqual(
    listReadMask(["title", "size"], fields, ["name"])
  );
  expect(listReadMask(["removed"], fields, ["name"]).paths).toEqual([
    "display_name",
    "name",
    "size_bytes",
  ]);
});
