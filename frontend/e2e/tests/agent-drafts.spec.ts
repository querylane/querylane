import type { Page } from "playwright/test";
import {
  CONFIGURATION_URL,
  INSTANCE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { expect, test } from "./base";
import {
  mockOverviewSupportData,
  mockReadyAppWithInstance,
  mockRpc,
  sampleInstance,
} from "./helpers";

test.use({ launchOptions: { args: ["--enable-features=WebMCP"] } });

async function approve(page: Page) {
  await expect(
    page.getByRole("dialog", { name: "Approve one agent action?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve action" }).click();
}
async function agentEdit(page: Page, action: string, value: unknown) {
  const result = page.webmcp.callTool("act", {
    steps: [{ ref: "Instance draft", action, args: [value] }],
  });
  await approve(page);
  await expect(result).resolves.toMatchObject({ ok: true });
}

test("native WebMCP discovers the custom draft primitive and preserves human edits on undo", async ({
  page,
}) => {
  await mockConsoleResources(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/UpdateInstance")) {
      writes += 1;
    }
  });
  const agentChunks: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/agent-tools.")) {
      agentChunks.push(request.url());
    }
  });
  await page.goto(CONFIGURATION_URL);
  expect(agentChunks).toEqual([]);
  await expect(
    page.getByRole("textbox", { name: "Display name", exact: true })
  ).toBeVisible();
  expect(await page.webmcp.tools()).toEqual([]);
  expect(agentChunks).toEqual([]);
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  await expect(
    page.getByRole("region", { name: "Agent draft review" })
  ).toBeVisible();
  await expect
    .poll(async () => {
      const tools = await page.webmcp.tools();
      return tools.map((tool) => tool.name).toSorted();
    })
    .toEqual(["act", "query", "snapshot"]);
  expect(agentChunks.length).toBeGreaterThan(0);
  const snapshot: unknown = await page.webmcp.callTool("snapshot", {});
  expect(JSON.stringify(snapshot)).toContain("instance-draft");
  expect(snapshot).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        component: "instance-draft",
        actions: [
          "setDisplayName",
          "setLabels",
          "setSslMode",
          "setSslNegotiation",
        ],
      }),
    ])
  );
  const name = page.getByRole("textbox", { name: "Display name", exact: true });
  await agentEdit(page, "setDisplayName", "Agent draft name");
  await expect(name).toHaveValue("Agent draft name");
  await name.fill("Human draft name");
  await agentEdit(page, "setSslMode", "verify-full");
  await page
    .getByRole("button", { name: "Undo agent edits", exact: true })
    .click();
  await approve(page);
  await approve(page);
  await expect(name).toHaveValue("Human draft name");
  await expect(
    page.getByText(
      "Agent draft edits undone; later human edits are preserved. Nothing was saved.",
      { exact: true }
    )
  ).toBeVisible();
  await agentEdit(page, "setDisplayName", "");
  await expect(name).toHaveValue("Human draft name");
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "The agent request was refused: The instance display name cannot be empty.",
    })
  ).toBeVisible();
  await expect(
    page.webmcp.callTool("act", {
      steps: [{ ref: "Save changes", action: "press" }],
    })
  ).resolves.toMatchObject({ ok: false });
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Disable agent access" }).click();
  await expect.poll(() => page.webmcp.tools()).toEqual([]);
  await expect(
    page.getByRole("region", { name: "Agent draft review" })
  ).toBeHidden();
});

test.describe("animated draft review", () => {
  test.use({
    reducedMotion: "no-preference",
    colorScheme: "dark",
    viewport: { width: 1280, height: 900 },
  });

  test("draft previews can be kept, reverted, and sought without overwriting a later edit", async ({
    page,
  }, testInfo) => {
    await mockConsoleResources(page);
    let writes = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/UpdateInstance")) {
        writes += 1;
      }
    });
    await page.goto(CONFIGURATION_URL);
    const name = page.getByRole("textbox", {
      name: "Display name",
      exact: true,
    });
    await expect(name).toBeVisible();
    const original = await name.inputValue();
    await page
      .getByRole("button", { name: "Enable agent access for this tab" })
      .click();
    const review = page.getByRole("region", { name: "Agent draft review" });
    await expect(review).toBeVisible();
    await page.webmcp.callTool("snapshot", {});
    await page.webmcp.callTool("query", { text: "Instance draft" });
    const denied = page.webmcp.callTool("act", {
      steps: [
        {
          ref: "Instance draft",
          action: "setDisplayName",
          args: ["Denied draft"],
        },
      ],
    });
    await page
      .getByRole("dialog", { name: "Approve one agent action?" })
      .getByRole("button", { name: "Deny action" })
      .click();
    await expect(denied).resolves.toMatchObject({ ok: false });
    await agentEdit(
      page,
      "setDisplayName",
      "Operations — Déjà vu 🌊 / 本番 / فريق"
    );
    await name.fill("Human checkpoint");
    await page.getByRole("radio", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Start", exact: true })
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: "Preview revision", exact: true })
      .click();
    await approve(page);
    await expect(name).toHaveValue(original);
    await expect(
      page.getByRole("button", { name: "Revert preview", exact: true })
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Revert preview", exact: true })
      .click();
    await approve(page);
    await expect(name).toHaveValue("Human checkpoint");
    await expect(
      page.getByText("Preview reverted. Nothing was saved.", { exact: true })
    ).toBeVisible();

    await page.getByRole("radio", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Start", exact: true })
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: "Preview revision", exact: true })
      .click();
    await approve(page);
    await expect(name).toHaveValue(original);
    await page
      .getByRole("button", { name: "Keep current draft", exact: true })
      .click();
    await expect(
      page.getByText("Current draft kept. Saving remains manual.", {
        exact: true,
      })
    ).toBeVisible();
    await page.getByRole("radio", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Start", exact: true })
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: "Restore revision", exact: true })
      .click();
    await approve(page);
    await expect(
      page.getByText("Draft revision restored. Nothing was saved.", {
        exact: true,
      })
    ).toBeVisible();

    await name.fill("Human checkpoint");
    await page.getByRole("radio", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Start", exact: true })
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: "Preview revision", exact: true })
      .click();
    await approve(page);
    await expect(name).toHaveValue(original);
    await name.fill("Later human edit");
    await page
      .getByRole("button", { name: "Revert preview", exact: true })
      .click();
    await expect(
      page.getByText(
        "Some preview fields could not be reverted. Later edits, protected values, and refused changes were kept. Review the current draft.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(name).toHaveValue("Later human edit");
    await expect(
      page.getByRole("dialog", { name: "Approve one agent action?" })
    ).toBeHidden();
    const image = testInfo.outputPath("agent-draft-review.png");
    await review.screenshot({ path: image });
    await testInfo.attach("Native WebMCP draft review", {
      path: image,
      contentType: "image/png",
    });
    expect(writes).toBe(0);
  });
});

test("native observation and history exclude credentials and clear on revocation", async ({
  page,
}) => {
  await mockConsoleResources(page);
  await page.goto(CONFIGURATION_URL);
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  const review = page.getByRole("region", { name: "Agent draft review" });
  await expect(review).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("native-history-secret");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text"
  );
  const snapshot: unknown = await page.webmcp.callTool("snapshot", {});
  const queried: unknown = await page.webmcp.callTool("query", {
    text: "Password",
  });
  expect(JSON.stringify(snapshot)).not.toContain("native-history-secret");
  expect(JSON.stringify(queried)).toContain("[redacted]");
  expect(JSON.stringify(queried)).not.toContain("native-history-secret");
  await expect(review).not.toContainText("native-history-secret");
  await expect(review.getByRole("radio")).toHaveCount(1);
  await agentEdit(page, "setDisplayName", "Unsaved private-tab draft");
  await expect(review.getByRole("radio")).toHaveCount(2);
  await page.getByRole("button", { name: "Disable agent access" }).click();
  await expect.poll(() => page.webmcp.tools()).toEqual([]);
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  await expect(review).toBeVisible();
  await expect(review.getByRole("radio")).toHaveCount(1);
  await page.reload();
  await expect.poll(() => page.webmcp.tools()).toEqual([]);
  await expect(review).toBeHidden();
});

test("manual saves reset draft history and the review fits on a phone", async ({
  page,
  checkAccessibility,
}, testInfo) => {
  await mockOverviewSupportData(page);
  await mockReadyAppWithInstance(page);
  await mockRpc(page, "InstanceService/UpdateInstance", {
    instance: sampleInstance,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(CONFIGURATION_URL);
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  const review = page.getByRole("region", { name: "Agent draft review" });
  await expect(review).toBeVisible();
  await agentEdit(page, "setDisplayName", "Manually saved draft");
  await expect(review.getByRole("radio")).toHaveCount(2);
  const before = await review.boundingBox();
  expect(before).not.toBeNull();
  expect(before?.x).toBeGreaterThanOrEqual(0);
  expect((before?.x ?? 0) + (before?.width ?? 0)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Instance configuration saved.", { exact: true })
  ).toBeVisible();
  await expect(review.getByRole("radio")).toHaveCount(1);
  await checkAccessibility();
  await testInfo.attach("Draft review on a phone", {
    body: await review.screenshot(),
    contentType: "image/png",
  });
});

test("a canceled preview revert reports refusal instead of claiming success", async ({
  page,
}) => {
  await mockConsoleResources(page);
  await page.goto(CONFIGURATION_URL);
  const name = page.getByRole("textbox", { name: "Display name", exact: true });
  await expect(name).toBeVisible();
  const original = await name.inputValue();
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  await expect(
    page.getByRole("region", { name: "Agent draft review" })
  ).toBeVisible();
  await agentEdit(page, "setDisplayName", "Agent proposal");
  await name.fill("");
  await page.getByRole("radio", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Start", exact: true })
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Preview revision", exact: true })
    .click();
  await approve(page);
  await expect(name).toHaveValue(original);
  await page
    .getByRole("button", { name: "Revert preview", exact: true })
    .click();
  await approve(page);
  await expect(name).toHaveValue(original);
  await expect(
    page.getByText(
      "Some preview fields could not be reverted. Later edits, protected values, and refused changes were kept. Review the current draft.",
      { exact: true }
    )
  ).toBeVisible();
});

test("leaving the form cancels pending draft approval and forgets the history", async ({
  page,
}) => {
  await mockConsoleResources(page);
  await page.goto(INSTANCE_URL);
  await page.getByRole("link", { name: "Configuration", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CONFIGURATION_URL}$`, "u"));
  const name = page.getByRole("textbox", { name: "Display name", exact: true });
  await expect(name).toBeVisible();
  const original = await name.inputValue();
  await page
    .getByRole("button", { name: "Enable agent access for this tab" })
    .click();
  await expect(
    page.getByRole("region", { name: "Agent draft review" })
  ).toBeVisible();
  await agentEdit(page, "setDisplayName", "Unsaved previous form");
  await page.getByRole("radio", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Start", exact: true })
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Preview revision", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Approve one agent action?" })
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${INSTANCE_URL}$`, "u"));
  await expect(
    page.getByRole("dialog", { name: "Approve one agent action?" })
  ).toBeHidden();
  await page.getByRole("link", { name: "Configuration", exact: true }).click();
  await expect(name).toHaveValue(original);
  await expect(
    page.getByRole("region", { name: "Agent draft review" }).getByRole("radio")
  ).toHaveCount(1);
});
