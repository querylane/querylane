import { expect, it, rs } from "@rstest/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

it("keeps controlled tabs keyboard reachable when the selected tab is removed", async () => {
  const user = userEvent.setup();
  const onValueChange = rs.fn();
  const view = render(
    <Tabs onValueChange={onValueChange} value="definition">
      <TabsList aria-label="Table details">
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="columns">Columns</TabsTrigger>
        <TabsTrigger value="definition">Definition</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Definition" })
  );

  view.rerender(
    <Tabs onValueChange={onValueChange} value="definition">
      <TabsList aria-label="Table details">
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="columns">Columns</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const dataTab = screen.getByRole("tab", { name: "Data" });
  const columnsTab = screen.getByRole("tab", { name: "Columns" });
  await waitFor(() => {
    expect([dataTab.tabIndex, columnsTab.tabIndex]).toEqual([0, -1]);
  });
  expect(dataTab.getAttribute("aria-selected")).toBe("false");
  expect(columnsTab.getAttribute("aria-selected")).toBe("false");
  expect(onValueChange).not.toHaveBeenCalled();

  await user.tab();
  expect(document.activeElement).toBe(dataTab);
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(columnsTab);
  await user.keyboard("{Enter}");
  expect(onValueChange).toHaveBeenCalledWith("columns", expect.anything());
});
