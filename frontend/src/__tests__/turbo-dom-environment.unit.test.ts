import { expect, rs, test } from "@rstest/core";
import { within } from "@testing-library/dom";

test("accessible names terminate when a checkbox references its containing label", () => {
  const label = document.createElement("label");
  label.id = "field";
  const checkbox = document.createElement("span");
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-labelledby", label.id);
  label.append(checkbox, document.createTextNode("measurement"));
  document.body.append(label);
  expect(within(label).getByRole("checkbox", { name: "measurement" })).toBe(
    checkbox
  );
});

test("the DOM window and defaultView share the test globals", () => {
  expect(globalThis.window).toBe(globalThis);
  expect(document.defaultView).toBe(globalThis.window);
  const customEvent = new CustomEvent("querylane", { detail: "draft" });
  expect(customEvent).toBeInstanceOf(Event);
});

test("programmatic clicks have the browser's synthetic pointer-event shape", () => {
  const control = document.createElement("button");
  let received: Event | undefined;
  control.addEventListener("click", (event) => {
    received = event;
  });
  control.click();
  expect(received).toBeInstanceOf(PointerEvent);
  expect(received).toMatchObject({
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 0,
    pointerId: -1,
    pointerType: "",
    view: globalThis.window,
  });
});

test("attribute handles stay live without being reused after removal or cloning", () => {
  const element = document.createElement("span");
  element.setAttribute("aria-label", "before");
  const attribute = element.getAttributeNode("aria-label");
  expect(attribute).not.toBeNull();
  element.setAttribute("aria-label", "after");
  expect(element.getAttributeNode("aria-label")).toBe(attribute);
  expect(attribute?.value).toBe("after");
  const clone = document.importNode(element);
  expect(clone.getAttributeNode("aria-label")?.value).toBe("after");
  expect(clone.getAttributeNode("aria-label")).not.toBe(attribute);
  element.removeAttribute("aria-label");
  expect(attribute?.ownerElement).toBeNull();
  element.setAttribute("aria-label", "replacement");
  expect(element.getAttributeNode("aria-label")).not.toBe(attribute);
});

test("native fetch and object URLs remain usable after installing the DOM", async () => {
  const blob = new Blob(["querylane"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  try {
    const response = await fetch(url);
    expect(await response.text()).toBe("querylane");
  } finally {
    URL.revokeObjectURL(url);
  }
});

test("animation frames use the runner's fake timers", () => {
  rs.useFakeTimers();
  try {
    const callback = rs.fn();
    requestAnimationFrame(callback);
    expect(callback).not.toHaveBeenCalled();
    rs.advanceTimersByTime(16);
    expect(callback).toHaveBeenCalledOnce();
  } finally {
    rs.useRealTimers();
  }
});

test("reported runtime errors reach the unexpected console guard", () => {
  const error = new Error("test runtime failure");
  const report = rs.spyOn(console, "error").mockImplementation(() => undefined);
  reportError(error);
  expect(report).toHaveBeenCalledWith(error);
});
