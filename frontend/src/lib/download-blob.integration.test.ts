import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { downloadBlob } from "@/lib/download-blob";

describe("downloadBlob", () => {
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockReturnValue(undefined);

    // spy on document.body.append to intercept anchor
    appendChildSpy = vi.spyOn(document.body, "append");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function requireAnchor(value: HTMLAnchorElement | null): HTMLAnchorElement {
    if (!value) {
      throw new Error("Expected download anchor to be captured.");
    }
    return value;
  }

  test("creates an anchor with the correct href and download attribute, then clicks and removes it", () => {
    let capturedAnchor: HTMLAnchorElement | null = null;

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const node = nodes[0];
      if (node instanceof HTMLAnchorElement) {
        capturedAnchor = node;
        clickSpy = vi.spyOn(node, "click").mockReturnValue(undefined);
        removeSpy = vi.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("export.csv", "col1,col2\n1,2", "text/csv");

    expect(createObjectUrlSpy).toHaveBeenCalledOnce();
    expect(capturedAnchor).not.toBeNull();

    const anchor = requireAnchor(capturedAnchor);
    expect(anchor.href).toBe("blob:fake-url");
    expect(anchor.download).toBe("export.csv");

    expect(clickSpy!).toHaveBeenCalledOnce();
    expect(removeSpy!).toHaveBeenCalledOnce();
  });

  test("revokes the object URL after a setTimeout(0) delay", () => {
    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const node = nodes[0];
      if (node instanceof HTMLAnchorElement) {
        vi.spyOn(node, "click").mockReturnValue(undefined);
        vi.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("data.json", "{}", "application/json");

    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectUrlSpy).toHaveBeenCalledOnce();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  test("creates a Blob with the provided contents and MIME type", () => {
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const node = nodes[0];
      if (node instanceof HTMLAnchorElement) {
        vi.spyOn(node, "click").mockReturnValue(undefined);
        vi.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("report.txt", "hello world", "text/plain");

    expect(BlobSpy).toHaveBeenCalledWith(["hello world"], {
      type: "text/plain",
    });
  });

  test("passes chunked contents through to Blob without joining first", () => {
    const BlobSpy = vi.spyOn(globalThis, "Blob");

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const node = nodes[0];
      if (node instanceof HTMLAnchorElement) {
        vi.spyOn(node, "click").mockReturnValue(undefined);
        vi.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("report.csv", ["id,name\n", "1,Ada\n"], "text/csv");

    expect(BlobSpy).toHaveBeenCalledWith(["id,name\n", "1,Ada\n"], {
      type: "text/csv",
    });
  });
});
