import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  Sidebar,
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/querylane-ui/sidebar";
import { Button } from "@/components/ui/button";

const TEST_NUMBER_100 = 100;
const TEST_NUMBER_8 = 8;
const TEST_NUMBER_400 = 400;
const TEST_NUMBER_50 = 50;

function stubDesktopHoverViewport(canHover = true) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: canHover && query === "(hover: hover) and (pointer: fine)",
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  }));
}

function dispatchPointerMove(
  clientX: number,
  options: { clientY?: number; pointerType?: string } = {}
) {
  const event = new Event("pointermove");
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: options.clientY ?? TEST_NUMBER_100 },
    pointerType: { value: options.pointerType ?? "mouse" },
  });
  window.dispatchEvent(event);
}

function stubSidebarBounds(sidebarPanel: HTMLElement) {
  vi.spyOn(sidebarPanel, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({
      height: 720,
      width: 256,
      x: 0,
      y: 56,
    })
  );
}

function renderCollapsedOffcanvasSidebar() {
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible="offcanvas" data-testid="sidebar-panel">
        <SidebarMenuButton>{"Hidden navigation"}</SidebarMenuButton>
      </Sidebar>
      <SidebarInset>
        <Button type="button">{"Main action"}</Button>
      </SidebarInset>
    </SidebarProvider>
  );

  const sidebarPanel = screen.getByTestId("sidebar-panel");
  stubSidebarBounds(sidebarPanel);
  return sidebarPanel;
}

describe("Sidebar hover reveal", () => {
  test("temporarily reveals a collapsed off-canvas sidebar from the screen edge", async () => {
    stubDesktopHoverViewport();
    const sidebarPanel = renderCollapsedOffcanvasSidebar();

    expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("closed");

    act(() => dispatchPointerMove(TEST_NUMBER_8));

    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("open");
    });
  });

  test("retracts the temporary reveal after the pointer leaves the sidebar", async () => {
    stubDesktopHoverViewport();
    const sidebarPanel = renderCollapsedOffcanvasSidebar();

    act(() => dispatchPointerMove(TEST_NUMBER_8));
    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("open");
    });

    act(() => dispatchPointerMove(TEST_NUMBER_400));

    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("closed");
    });
  });

  test("retracts the temporary reveal after the pointer leaves vertically", async () => {
    stubDesktopHoverViewport();
    const sidebarPanel = renderCollapsedOffcanvasSidebar();

    act(() => dispatchPointerMove(TEST_NUMBER_8, { clientY: 100 }));
    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("open");
    });

    act(() => dispatchPointerMove(TEST_NUMBER_50, { clientY: 20 }));

    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("closed");
    });
  });

  test("skips hidden off-canvas controls in the keyboard tab path", async () => {
    stubDesktopHoverViewport();
    renderCollapsedOffcanvasSidebar();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Expand menu" })).toBe(
      document.activeElement
    );

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Main action" })).toBe(
      document.activeElement
    );
  });

  test("pins the off-canvas sidebar open from the edge trigger", async () => {
    stubDesktopHoverViewport();
    const sidebarPanel = renderCollapsedOffcanvasSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Expand menu" }));

    await waitFor(() => {
      expect(sidebarPanel.parentElement?.getAttribute("data-state")).toBe(
        "expanded"
      );
    });
    expect(
      screen
        .getByRole("button", { name: "Hidden navigation" })
        .getAttribute("tabindex")
    ).toBeNull();
  });

  test("allows mouse edge reveal on hybrid devices without a primary hover pointer", async () => {
    stubDesktopHoverViewport(false);
    const sidebarPanel = renderCollapsedOffcanvasSidebar();

    act(() => dispatchPointerMove(TEST_NUMBER_8, { pointerType: "mouse" }));

    await waitFor(() => {
      expect(sidebarPanel.getAttribute("data-hover-reveal")).toBe("open");
    });
  });
});
