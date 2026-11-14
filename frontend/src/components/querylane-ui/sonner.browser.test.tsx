import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { afterEach, expect, rs, test } from "@rstest/core";
import { toast } from "sonner";
import { Toaster } from "@/components/querylane-ui/sonner";
import { Button } from "@/components/ui/button";
import { Toaster as BaseToaster } from "@/components/ui/sonner";
import { useTheme } from "@/theme-context";
import { ThemeProvider } from "@/theme-provider";

const DEFAULT_TOAST_CLASS = /cn-toast/u;
const CUSTOM_TOASTER_CLASS = /isolate/u;
const CUSTOM_TOAST_CLASS = /font-semibold/u;

function ThemeControls() {
  const { setTheme } = useTheme();
  return (
    <>
      <Button
        onClick={() => {
          setTheme("light");
        }}
      >
        Light
      </Button>
      <Button
        onClick={() => {
          setTheme("dark");
        }}
      >
        Dark
      </Button>
      <Button
        onClick={() => {
          setTheme("system");
        }}
      >
        System
      </Button>
    </>
  );
}

function controlSystemTheme() {
  const query = globalThis.window.matchMedia("(prefers-color-scheme: dark)");
  let dark = false;
  Object.defineProperty(query, "matches", { get: () => dark });
  rs.spyOn(globalThis.window, "matchMedia").mockReturnValue(query);
  return (matches: boolean) => {
    dark = matches;
    query.dispatchEvent(new MediaQueryListEvent("change", { matches }));
  };
}

afterEach(() => {
  toast.dismiss();
  localStorage.removeItem("sonner-test-theme");
});

test("replays and deduplicates pre-mount toasts while following app and system themes", async () => {
  const setSystemDark = controlSystemTheme();
  const action = rs.fn();
  toast.success("Connection saved", {
    id: "connection",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Open instance", onClick: action },
  });
  const view = await render(
    <ThemeProvider defaultTheme="light" storageKey="sonner-test-theme">
      <ThemeControls />
      <Toaster closeButton={true} />
    </ThemeProvider>
  );
  const toaster = page.locator("[data-sonner-toaster]");
  await expect.element(page.getByText("Connection saved")).toBeVisible();
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "light");
  toast.success("Connection saved", { id: "connection" });
  await expect.element(page.getByText("Connection saved")).toHaveCount(1);
  await expect
    .element(page.locator("[data-sonner-toast] .lucide-circle-check"))
    .toBeVisible();
  await expect
    .element(page.locator("[data-sonner-toast]"))
    .toHaveClass(DEFAULT_TOAST_CLASS);

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "dark");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "light");
  setSystemDark(true);
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "dark");
  setSystemDark(false);
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "light");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  setSystemDark(true);
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "light");
  await expect.element(page.getByText("Connection saved")).toHaveCount(1);
  await page.getByRole("button", { name: "Open instance" }).click();
  expect(action).toHaveBeenCalledTimes(1);
  await expect.element(page.getByText("Connection saved")).toHaveCount(0);
  await view.unmount();
});

test("preserves explicit theme, icons and toast options over app defaults", async () => {
  const view = await render(
    <ThemeProvider defaultTheme="dark" storageKey="sonner-test-theme">
      <Toaster
        className="isolate"
        closeButton={true}
        icons={{ success: <span>Custom success</span> }}
        position="top-left"
        theme="light"
        toastOptions={{
          duration: Number.POSITIVE_INFINITY,
          classNames: { toast: "font-semibold" },
        }}
      />
    </ThemeProvider>
  );
  toast.success("Override notification");
  await expect.element(page.getByText("Override notification")).toBeVisible();
  await expect
    .element(page.locator("[data-sonner-toaster]"))
    .toHaveAttribute("data-sonner-theme", "light");
  await expect
    .element(page.locator("[data-sonner-toaster]"))
    .toHaveClass(CUSTOM_TOASTER_CLASS);
  await expect
    .element(page.locator("[data-sonner-toast]"))
    .toHaveClass(CUSTOM_TOAST_CLASS);
  await expect
    .element(page.locator("[data-sonner-toaster]"))
    .toHaveAttribute("data-x-position", "left");
  await expect.element(page.getByText("Custom success")).toBeVisible();
  await page.getByRole("button", { name: "Close toast" }).click();
  await expect.element(page.getByText("Override notification")).toHaveCount(0);
  await view.unmount();
});

test("defaults the public registry wrapper to system without a separate provider", async () => {
  const setSystemDark = controlSystemTheme();
  const view = await render(<BaseToaster />);
  toast("System notification", { duration: Number.POSITIVE_INFINITY });
  const toaster = page.locator("[data-sonner-toaster]");
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "light");
  setSystemDark(true);
  await expect.element(toaster).toHaveAttribute("data-sonner-theme", "dark");
  await view.unmount();
});
