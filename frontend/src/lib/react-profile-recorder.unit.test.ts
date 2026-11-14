import { expect, test } from "@rstest/core";
import { createReactProfileRecorder } from "./react-profile-recorder";

test("invalid callback chronology cannot become a usable journey", () => {
  const recorder = createReactProfileRecorder();
  recorder.begin("journey:v1");
  recorder.handleRender("application", "update", 1, 1, 2, 1);
  expect(() => recorder.finish("journey:v1")).toThrow(
    "Invalid React profile timing"
  );
});

test("overflow is bounded and fails evidence instead of silently truncating", () => {
  const recorder = createReactProfileRecorder();
  recorder.begin("journey:v1");
  for (let index = 0; index < 2001; index += 1) {
    recorder.handleRender("application", "update", 1, 1, index, index);
  }
  expect(recorder.count).toBe(2000);
  expect(() => recorder.finish("journey:v1")).toThrow("commit limit exceeded");
});
