import type { Page } from "playwright/test";
import {
  CONFIGURATION_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { expect, test } from "./base";

interface BrowserAgentTool {
  execute: (input: unknown) => unknown;
  name: string;
}

declare global {
  interface Document {
    querylaneAgentTestTools?: Map<string, BrowserAgentTool>;
  }
}

interface AgentStep {
  action: string;
  args?: unknown[];
  ref: string;
}

function askAgent(page: Page, steps: AgentStep[]) {
  return page.evaluate((requestedSteps) => {
    const tool = document.querylaneAgentTestTools?.get("act");
    if (!tool) {
      throw new Error("Expected the registered WebMCP act tool");
    }
    return tool.execute({ steps: requestedSteps });
  }, steps);
}

test("agent access requires a person and never submits connection changes", async ({
  page,
}, testInfo) => {
  // Stub only the experimental browser API, not the SDK, app, or form state.
  await page.addInitScript(() => {
    const tools = new Map<string, BrowserAgentTool>();
    Object.defineProperty(document, "querylaneAgentTestTools", {
      value: tools,
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(
          tool: BrowserAgentTool,
          { signal }: { signal: AbortSignal }
        ) {
          tools.set(tool.name, tool);
          signal.addEventListener(
            "abort",
            () => {
              tools.delete(tool.name);
            },
            { once: true }
          );
          return Promise.resolve();
        },
      },
    });
  });
  await mockConsoleResources(page);
  let updates = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/UpdateInstance")) {
      updates += 1;
    }
  });
  await page.goto(CONFIGURATION_URL);
  const name = page.getByRole("textbox", { name: "Display name", exact: true });
  await expect(name).toBeVisible();
  const original = await name.inputValue();
  expect(
    await page.evaluate(() => document.querylaneAgentTestTools?.size)
  ).toBe(0);
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.querylaneAgentTestTools?.size))
    .toBe(3);

  const step = {
    ref: "Display name",
    action: "setValue",
    args: ["Agent preview (not saved)"],
  };
  const denied = askAgent(page, [step]);
  const approval = page.getByRole("dialog", {
    name: "Approve one agent action?",
  });
  await expect(approval).toBeVisible();
  await expect(name).toHaveValue(original);
  const screenshot = testInfo.outputPath("agent-approval.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("Agent approval on the configuration page", {
    path: screenshot,
    contentType: "image/png",
  });
  const visible = await page.evaluate(() =>
    document.querylaneAgentTestTools?.get("snapshot")?.execute({})
  );
  expect(JSON.stringify(visible)).not.toContain("Approve action");
  await page.getByRole("button", { name: "Deny action" }).click();
  await expect(denied).resolves.toMatchObject({ ok: false });
  await expect(approval).toBeHidden();
  await expect(name).toHaveValue(original);

  const approved = askAgent(page, [step]);
  await expect(approval).toBeVisible();
  await page.getByRole("button", { name: "Approve action" }).click();
  await expect(approved).resolves.toMatchObject({ ok: true });
  await expect(approval).toBeHidden();
  await expect(name).toHaveValue("Agent preview (not saved)");
  await expect(
    askAgent(page, [{ ref: "Save changes", action: "press" }])
  ).resolves.toMatchObject({ ok: false });
  expect(updates).toBe(0);
  await page.getByRole("button", { name: "Disable agent access" }).click();
  await expect
    .poll(() => page.evaluate(() => document.querylaneAgentTestTools?.size))
    .toBe(0);
});
