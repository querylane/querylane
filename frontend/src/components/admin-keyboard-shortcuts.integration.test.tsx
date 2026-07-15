import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AdminKeyboardShortcuts } from "@/components/admin-keyboard-shortcuts";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { SidebarProvider, useSidebar } from "@/components/querylane-ui/sidebar";

const navigateMock = vi.fn(() => Promise.resolve());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    navigationIds: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
  }),
}));

beforeEach(() => {
  navigateMock.mockClear();
});

function SidebarState() {
  const { state } = useSidebar();
  return <output aria-label="Sidebar state">{state}</output>;
}

test("g then d navigates to Data Explorer", async () => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <SidebarProvider>
        <AdminKeyboardShortcuts />
      </SidebarProvider>
    </KeyboardShortcutsProvider>
  );

  await user.keyboard("gd");

  expect(navigateMock).toHaveBeenCalledWith({
    params: {
      databaseId: "customer-events",
      instanceId: "prod-analytics",
    },
    search: expect.any(Function),
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  });
});

test.each([
  [
    "go",
    "/instances/$instanceId/databases/$databaseId",
    { databaseId: "customer-events", instanceId: "prod-analytics" },
  ],
  ["gr", "/instances/$instanceId/roles", { instanceId: "prod-analytics" }],
  [
    "ge",
    "/instances/$instanceId/databases/$databaseId/extensions",
    { databaseId: "customer-events", instanceId: "prod-analytics" },
  ],
  [
    "gc",
    "/instances/$instanceId/configuration",
    { instanceId: "prod-analytics" },
  ],
  ["gi", "/instances/$instanceId", { instanceId: "prod-analytics" }],
] as const)("%s navigates to its canonical page", async (sequence, to, params) => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <SidebarProvider>
        <AdminKeyboardShortcuts />
      </SidebarProvider>
    </KeyboardShortcutsProvider>
  );

  await user.keyboard(sequence);

  expect(navigateMock).toHaveBeenCalledWith({
    params,
    search: expect.any(Function),
    to,
  });
});

test("primary-modifier b toggles the sidebar once", async () => {
  const user = userEvent.setup();
  render(
    <KeyboardShortcutsProvider>
      <SidebarProvider>
        <AdminKeyboardShortcuts />
        <SidebarState />
      </SidebarProvider>
    </KeyboardShortcutsProvider>
  );

  expect(
    screen.getByRole("status", { name: "Sidebar state" }).textContent
  ).toBe("expanded");

  await user.keyboard("{Control>}b{/Control}");

  expect(
    screen.getByRole("status", { name: "Sidebar state" }).textContent
  ).toBe("collapsed");
});
