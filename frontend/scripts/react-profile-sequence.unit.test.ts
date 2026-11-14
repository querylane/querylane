import { expect, test } from "@rstest/core";
import { profileSeries } from "./react-profile-sequence";

test("profiling collectors cannot overlap and preserve input order", async () => {
  const first = Promise.withResolvers<string>();
  const started: number[] = [];
  const result = profileSeries([0, 1], (item) => {
    started.push(item);
    return item === 0 ? first.promise : Promise.resolve("second");
  });
  await Promise.resolve();
  expect(started).toEqual([0]);
  first.resolve("first");
  expect(await result).toEqual(["first", "second"]);
  expect(started).toEqual([0, 1]);
});

test("a failed collector prevents later samples from starting", async () => {
  const started: number[] = [];
  const result = profileSeries([0, 1], (item) => {
    started.push(item);
    throw new Error("Collection unavailable");
  });
  await expect(result).rejects.toThrow("Collection unavailable");
  expect(started).toEqual([0]);
});
