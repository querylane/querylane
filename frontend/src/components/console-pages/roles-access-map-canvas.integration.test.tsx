import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { RolesAccessMapCanvas } from "@/components/console-pages/roles-access-map-canvas";
import type { RolesAccessMapModel } from "@/components/console-pages/roles-access-map-model";

const MODEL: RolesAccessMapModel = {
  edges: [
    {
      id: "role:app_reader->object:table:prod:public.orders:direct",
      privileges: ["SELECT"],
      source: "role:app_reader",
      target: "object:table:prod:public.orders",
      tone: "direct",
    },
  ],
  objects: [
    {
      databaseId: "prod",
      id: "object:table:prod:public.orders",
      kind: "table",
      subtitle: "table · public",
      title: "orders",
    },
  ],
  roles: [
    {
      id: "role:app_reader",
      kind: "login",
      roleId: "app_reader",
      subtitle: "user",
      title: "app_reader",
    },
  ],
};

function CanvasHarness({ model = MODEL }: { model?: RolesAccessMapModel }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  return (
    <RolesAccessMapCanvas
      model={model}
      onSelectNode={setSelectedNodeId}
      selectedNodeId={selectedNodeId}
    />
  );
}

describe("RolesAccessMapCanvas", () => {
  test("opens node details and expands the map into a dialog", async () => {
    const user = userEvent.setup();
    const { container } = render(<CanvasHarness />);

    expect(screen.getByText("100%")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("115%")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("100%")).toBeTruthy();

    const viewport = container.querySelector(".rounded-2xl.overflow-auto");
    if (!(viewport instanceof HTMLElement)) {
      throw new Error("Expected the role access map viewport.");
    }
    Object.defineProperty(viewport, "clientWidth", { value: 920 });
    Object.defineProperty(viewport, "clientHeight", { value: 294 });
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByText("55%")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Maximize role access map" })
    );

    expect(
      screen.getByRole("heading", { name: "Expanded role access map" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Collapse role access map" })
    ).toBeTruthy();
  });

  test("opens the selected node drawer and filters visible edge paths", async () => {
    const user = userEvent.setup();
    const { container } = render(<CanvasHarness />);

    await user.click(
      screen.getByRole("button", { name: "Trace access for app_reader" })
    );

    expect(screen.getByRole("heading", { name: "app_reader" })).toBeTruthy();
    expect(screen.getByText("1 connection")).toBeTruthy();
    await user.keyboard("{Escape}");

    const mapSvg = container.querySelector<SVGElement>("svg.absolute");
    expect(mapSvg?.querySelectorAll("path")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByRole("switch", { name: "Direct grants" }));

    expect(mapSvg?.querySelectorAll("path")).toHaveLength(0);
  });

  test("shows the empty object state", () => {
    render(<CanvasHarness model={{ ...MODEL, edges: [], objects: [] }} />);

    expect(
      within(screen.getByLabelText("Role access map")).getByText(
        "No object grants found for the visible roles."
      )
    ).toBeTruthy();
  });
});
