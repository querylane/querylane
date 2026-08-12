import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  rs,
  test,
} from "@rstest/core";
import { downloadBlob } from "@/lib/download-blob";

describe("downloadBlob", () => {
  let createObjectUrlSpy: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectUrlSpy: MockInstance<typeof URL.revokeObjectURL>;
  let appendChildSpy: MockInstance<typeof document.body.append>;
  let clickSpy: MockInstance<HTMLAnchorElement["click"]> | undefined;
  let removeSpy: MockInstance<HTMLAnchorElement["remove"]> | undefined;

  beforeEach(() => {
    rs.useFakeTimers();

    createObjectUrlSpy = rs
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    revokeObjectUrlSpy = rs
      .spyOn(URL, "revokeObjectURL")
      .mockReturnValue(undefined);

    // spy on document.body.append to intercept anchor
    appendChildSpy = rs.spyOn(document.body, "append");
  });

  afterEach(() => {
    rs.restoreAllMocks();
    rs.useRealTimers();
  });

  function requireAnchor(value: HTMLAnchorElement | null): HTMLAnchorElement {
    if (!value) {
      throw new Error("Expected download anchor to be captured.");
    }
    return value;
  }

  function installBlobConstructorSpy() {
    const blobConstructorSpy = rs.fn();

    class TestBlob extends Blob {
      constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
        blobConstructorSpy(blobParts, options);
        super(blobParts, options);
      }
    }

    rs.stubGlobal("Blob", TestBlob);
    return blobConstructorSpy;
  }

  test("creates an anchor with the correct href and download attribute, then clicks and removes it", () => {
    let capturedAnchor: HTMLAnchorElement | null = null;

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const [node] = nodes;
      if (node instanceof HTMLAnchorElement) {
        capturedAnchor = node;
        clickSpy = rs.spyOn(node, "click").mockReturnValue(undefined);
        removeSpy = rs.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("export.csv", "col1,col2\n1,2", "text/csv");

    expect(createObjectUrlSpy).toHaveBeenCalledOnce();
    expect(capturedAnchor).not.toBeNull();

    const anchor = requireAnchor(capturedAnchor);
    expect(anchor.href).toBe("blob:fake-url");
    expect(anchor.download).toBe("export.csv");

    expect(clickSpy).toBeDefined();
    expect(removeSpy).toBeDefined();
    if (!(clickSpy && removeSpy)) {
      throw new Error("Expected download anchor spies to be installed.");
    }
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  test("revokes the object URL after a setTimeout(0) delay", () => {
    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const [node] = nodes;
      if (node instanceof HTMLAnchorElement) {
        rs.spyOn(node, "click").mockReturnValue(undefined);
        rs.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("data.json", "{}", "application/json");

    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();

    rs.runAllTimers();

    expect(revokeObjectUrlSpy).toHaveBeenCalledOnce();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  test("creates a Blob with the provided contents and MIME type", () => {
    const blobConstructorSpy = installBlobConstructorSpy();

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const [node] = nodes;
      if (node instanceof HTMLAnchorElement) {
        rs.spyOn(node, "click").mockReturnValue(undefined);
        rs.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("report.txt", "hello world", "text/plain");

    expect(blobConstructorSpy).toHaveBeenCalledWith(["hello world"], {
      type: "text/plain",
    });
  });

  test("passes chunked contents through to Blob without joining first", () => {
    const blobConstructorSpy = installBlobConstructorSpy();

    appendChildSpy.mockImplementation((...nodes: (Node | string)[]) => {
      const [node] = nodes;
      if (node instanceof HTMLAnchorElement) {
        rs.spyOn(node, "click").mockReturnValue(undefined);
        rs.spyOn(node, "remove").mockReturnValue(undefined);
      }
    });

    downloadBlob("report.csv", ["id,name\n", "1,Ada\n"], "text/csv");

    expect(blobConstructorSpy).toHaveBeenCalledWith(["id,name\n", "1,Ada\n"], {
      type: "text/csv",
    });
  });
});
