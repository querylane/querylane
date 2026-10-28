import { expect, test } from "@rstest/core";
import "./zod-locale";
import { z } from "zod/mini";

test("lean schemas keep all validation issues and English messages", () => {
  const schema = z.object({
    name: z.string().check(z.minLength(1)),
    port: z.int().check(z.minimum(1), z.maximum(65_535)),
  });
  const result = schema.safeParse({ name: "", port: 0 });

  expect(
    result.error?.issues.map(({ path, message }) => ({ path, message }))
  ).toEqual([
    {
      message: "Too small: expected string to have >=1 characters",
      path: ["name"],
    },
    { message: "Too small: expected number to be >=1", path: ["port"] },
  ]);
});
