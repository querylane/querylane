import { expect, test } from "@rstest/core";
import { rejectedStream, streamOf } from "./async-stream";

test("streams ordered values and closes permanently when cancelled", async () => {
  const iterator = streamOf("first", "second")[Symbol.asyncIterator]();
  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: "first",
  });
  if (!iterator.return) {
    throw new Error("Expected cancellable stream");
  }
  await expect(iterator.return()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test("rejects on the first read and then closes", async () => {
  const error = new Error("Stream failed");
  const iterator = rejectedStream(error)[Symbol.asyncIterator]();
  await expect(iterator.next()).rejects.toBe(error);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});
