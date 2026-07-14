import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Database } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AsyncSectionState } from "@/components/async-section-state";
import { ConfigManagedEmptyState } from "@/components/config-managed-empty-state";
import { ConfigManagedNotice } from "@/components/config-managed-notice";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

const CONFIG_MANAGED_RE =
  /Instances are managed via the server configuration file/i;
const READ_ONLY_RE = /cannot be edited from the UI/i;

afterEach(() => cleanup());

describe("async and managed state integration", () => {
  it("shows a blocking loading state when content has not resolved", () => {
    render(
      <AsyncSectionState
        hasContent={false}
        isPending={true}
        loadingMessage="Loading databases..."
      >
        <div>{"database rows"}</div>
      </AsyncSectionState>
    );

    expect(screen.getByText("Loading databases...")).toBeTruthy();
    expect(screen.queryByText("database rows")).toBeNull();
  });

  it("never renders an empty state while content is unresolved", () => {
    render(
      <AsyncSectionState
        emptyState={
          <EmptyState
            description="No databases returned."
            icon={Database}
            title="No databases"
          />
        }
        hasContent={false}
        isPending={true}
        loadingMessage="Loading databases..."
      />
    );

    expect(screen.getByText("Loading databases...")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No databases" })).toBeNull();
  });

  it("keeps stale content visible while announcing background refresh", () => {
    render(
      <AsyncSectionState
        hasContent={true}
        isRefreshing={true}
        refreshingMessage="Refreshing roles..."
      >
        <div>{"replicator"}</div>
      </AsyncSectionState>
    );

    expect(screen.getByText("Refreshing roles...")).toBeTruthy();
    expect(screen.getByText("replicator")).toBeTruthy();
  });

  it("renders the provided empty state instead of empty children", () => {
    render(
      <AsyncSectionState
        emptyState={
          <EmptyState
            description="No databases returned."
            icon={Database}
            title="No databases"
          />
        }
        hasContent={false}
      />
    );

    expect(screen.getByRole("heading", { name: "No databases" })).toBeTruthy();
    expect(screen.getByText("No databases returned.")).toBeTruthy();
  });

  it("keeps empty state actions interactive for recovery flows", async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();

    render(
      <EmptyState
        action={
          <Button onClick={onRegister} type="button">
            {"Register instance"}
          </Button>
        }
        description="Connect a PostgreSQL server before browsing databases."
        icon={Database}
        title="No instances"
      />
    );

    await user.click(screen.getByRole("button", { name: "Register instance" }));

    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it("explains config-managed empty catalogs", () => {
    render(<ConfigManagedEmptyState />);

    expect(
      screen.getByRole("heading", { name: "No instances configured" })
    ).toBeTruthy();
    expect(screen.getByText(CONFIG_MANAGED_RE)).toBeTruthy();
  });

  it("shows config-managed path and copyable YAML snippet", async () => {
    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <ConfigManagedEmptyState configFilePath="/etc/querylane/config.yaml" />
      );

      expect(screen.getByText("/etc/querylane/config.yaml")).toBeTruthy();
      await user.click(
        screen.getByRole("button", { name: "Copy YAML snippet" })
      );

      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("instances:")
      );
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/etc/querylane/config.yaml")
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it("explains why config-managed instance fields are read-only", () => {
    render(<ConfigManagedNotice />);

    expect(screen.getByText("Managed via configuration file")).toBeTruthy();
    expect(screen.getByText(READ_ONLY_RE)).toBeTruthy();
  });
});
