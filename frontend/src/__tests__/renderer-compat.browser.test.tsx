import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { createElement, Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function EmbeddedCounter() {
  const [count, setCount] = useState(0);
  return (
    <svg height="100" width="320">
      <title>Embedded controls</title>
      <foreignObject height="100" width="320">
        <Button
          onClick={() => {
            setCount((value) => value + 1);
          }}
        >
          Increase count {count}
        </Button>
      </foreignObject>
    </svg>
  );
}

test("preserves native HTML button behavior inside SVG foreignObject", async () => {
  await render(<EmbeddedCounter />);
  expect(document.querySelector("button")?.namespaceURI).toBe(
    "http://www.w3.org/1999/xhtml"
  );
  await page.getByRole("button", { name: "Increase count 0" }).click();
  await expect
    .element(page.getByRole("button", { name: "Increase count 1" }))
    .toBeVisible();
});

test("normalizes focus events while preserving their native events", async () => {
  const events: string[][] = [];
  await render(
    <>
      <Input
        aria-label="First field"
        onBlur={(event) => {
          events.push([event.type, event.nativeEvent.type]);
        }}
        onFocus={(event) => {
          events.push([event.type, event.nativeEvent.type]);
        }}
      />
      <Input aria-label="Second field" />
    </>
  );
  await page.getByRole("textbox", { name: "First field" }).focus();
  await page.getByRole("textbox", { name: "Second field" }).focus();
  expect(events).toEqual([
    ["focus", "focusin"],
    ["blur", "focusout"],
  ]);
});

function FragmentToggle({
  depth = 1,
  fragmentKey,
}: {
  depth?: number;
  fragmentKey?: string | undefined;
}) {
  const [wrapped, setWrapped] = useState(false);
  const button = (
    <Button
      aria-pressed={wrapped}
      onClick={() => {
        setWrapped((value) => !value);
      }}
    >
      Toggle wrapper
    </Button>
  );
  if (!wrapped) {
    return button;
  }
  const fragment = createElement(
    Fragment,
    fragmentKey === undefined ? null : { key: fragmentKey },
    button
  );
  return depth === 1 ? fragment : createElement(Fragment, null, fragment);
}

test.each([
  { depth: 1, fragmentKey: undefined, retained: true },
  { depth: 2, fragmentKey: undefined, retained: false },
  { depth: 1, fragmentKey: "keyed", retained: false },
])(
  "preserves the React control identity contract at depth $depth with key $fragmentKey",
  async ({ depth, fragmentKey, retained }) => {
    await render(<FragmentToggle depth={depth} fragmentKey={fragmentKey} />);
    const originalButton = document.querySelector("button");
    await page.getByRole("button", { name: "Toggle wrapper" }).click();
    await expect
      .element(page.getByRole("button", { name: "Toggle wrapper" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("button") === originalButton).toBe(retained);
  }
);
