import { expect, test } from "../journeys/browser.test-utils";
import { mockRpcError } from "../journeys/msw-network.test-utils";
import {
  mockApiManagedConsoleConfig,
  mockEmptyInstanceCatalog,
} from "../journeys/querylane-rpc.fixture";

const APP_VERSION_RE = /^Querylane \d/u;

test("boot failure keeps reachability guidance inside the app shell", async ({
  page,
}) => {
  await mockRpcError({
    page,
    method: "OnboardingService/GetOnboardingState",
    code: "deadline_exceeded",
    message: "deadline exceeded",
    status: 504,
  });
  await mockApiManagedConsoleConfig(page);
  await mockEmptyInstanceCatalog(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Cannot reach Querylane" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Check that the Querylane server is running and that your network or proxy can reach it, then retry."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await expect(page).toHaveScreenshot("boot-querylane-unreachable.png", {
    mask: [page.getByText(APP_VERSION_RE)],
  });
});
