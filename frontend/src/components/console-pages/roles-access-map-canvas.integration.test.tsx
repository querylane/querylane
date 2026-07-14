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
    {
      id: "role:app_writer->object:table:prod:public.invoices:owner",
      privileges: ["OWNER"],
      source: "role:app_writer",
      target: "object:table:prod:public.invoices",
      tone: "owner",
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
    {
      databaseId: "prod",
      id: "object:table:prod:public.invoices",
      kind: "table",
      subtitle: "table · public",
      title: "invoices",
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
    {
      id: "role:app_writer",
      kind: "login",
      roleId: "app_writer",
      subtitle: "user",
      title: "app_writer",
    },
  ],
};

function CanvasHarness({
  failedRequestCount = 0,
  isLoading = false,
  model = MODEL,
  partial = false,
}: {
  failedRequestCount?: number;
  isLoading?: boolean;
  model?: RolesAccessMapModel;
  partial?: boolean;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  return (
    <RolesAccessMapCanvas
      builtInRoleCount={0}
      failedRequestCount={failedRequestCount}
      isLoading={isLoading}
      model={model}
      onSelectNode={setSelectedNodeId}
      onShowBuiltInRolesChange={() => undefined}
      partial={partial}
      selectedNodeId={selectedNodeId}
      showBuiltInRoles={false}
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

  test("highlights selected node edges without opening a drawer", async () => {
    const user = userEvent.setup();
    const { container } = render(<CanvasHarness />);
    const selectedNode = screen.getByRole("button", {
      name: "Trace access for app_reader",
    });
    const mapSvg = container.querySelector<SVGElement>("svg.absolute");
    const [connectedEdge, unrelatedEdge] = Array.from(
      mapSvg?.querySelectorAll("path") ?? []
    );

    expect(connectedEdge?.classList.contains("opacity-15")).toBe(true);
    expect(unrelatedEdge?.classList.contains("opacity-15")).toBe(true);

    selectedNode.focus();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(selectedNode.getAttribute("aria-pressed")).toBe("true");

    expect(connectedEdge?.classList.contains("opacity-100")).toBe(true);
    expect(connectedEdge?.getAttribute("stroke-width")).toBe("2");
    expect(unrelatedEdge?.classList.contains("opacity-15")).toBe(true);
    expect(unrelatedEdge?.getAttribute("stroke-width")).toBe("1.5");

    await user.click(selectedNode);

    expect(selectedNode.getAttribute("aria-pressed")).toBe("false");
    expect(connectedEdge?.classList.contains("opacity-15")).toBe(true);
    expect(unrelatedEdge?.classList.contains("opacity-15")).toBe(true);
  });

  test("filters visible edge paths", async () => {
    const user = userEvent.setup();
    const { container } = render(<CanvasHarness />);
    const mapSvg = container.querySelector<SVGElement>("svg.absolute");

    expect(mapSvg?.querySelectorAll("path")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByRole("switch", { name: "Direct grants" }));

    expect(mapSvg?.querySelectorAll("path")).toHaveLength(1);
  });

  test("shows the empty object state", () => {
    render(<CanvasHarness model={{ ...MODEL, edges: [], objects: [] }} />);

    expect(
      within(screen.getByLabelText("Role access map")).getByText(
        "No object grants found for the visible roles."
      )
    ).toBeTruthy();
  });

  test("keeps partial empty results qualified in the expanded dialog", async () => {
    const user = userEvent.setup();
    render(
      <CanvasHarness
        model={{ ...MODEL, edges: [], objects: [] }}
        partial={true}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Maximize role access map" })
    );

    const dialog = screen.getByRole("dialog", {
      name: "Expanded role access map",
    });
    expect(within(dialog).getByRole("status")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Object grants may exist beyond the available results."
      )
    ).toBeTruthy();
    expect(
      within(dialog).queryByText(
        "No object grants found for the visible roles."
      )
    ).toBeNull();
  });

  test("keeps failed-only empty results qualified in the expanded dialog", async () => {
    const user = userEvent.setup();
    render(
      <CanvasHarness
        failedRequestCount={1}
        model={{ ...MODEL, edges: [], objects: [] }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Maximize role access map" })
    );

    const dialog = screen.getByRole("dialog", {
      name: "Expanded role access map",
    });
    expect(
      within(dialog).getByText(
        "1 access request could not be loaded. The map shows the available data."
      )
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Object grants may exist beyond the available results."
      )
    ).toBeTruthy();
    expect(
      within(dialog).queryByText(
        "No object grants found for the visible roles."
      )
    ).toBeNull();
  });
});
