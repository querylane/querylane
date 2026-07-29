import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BinaryFilePreview } from "@/components/data-grid/table-data-grid/binary-file-preview";

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:media-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BinaryFilePreview", () => {
  it("embeds detected PDF, audio, and video with browser media controls", async () => {
    const view = render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("%PDF-1.7")}
        columnName="document"
        variant="detail"
      />
    );

    const pdf = await screen.findByLabelText("document pdf preview");
    expect(pdf.getAttribute("type")).toBe("application/pdf");

    view.rerender(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000")}
        columnName="recording"
        variant="detail"
      />
    );
    const audio = await screen.findByLabelText("recording audio preview");
    expect(audio.getAttribute("type")).toBe("audio/mpeg");

    view.rerender(
      <BinaryFilePreview
        bytes={
          new Uint8Array([
            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f,
            0x6d,
          ])
        }
        columnName="clip"
        variant="detail"
      />
    );
    const video = await screen.findByLabelText("clip video preview");
    expect(video.getAttribute("type")).toBe("video/mp4");
  });

  it("labels non-image grid previews without allocating unused media URLs", () => {
    render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("%PDF-1.7")}
        columnName="document"
        variant="grid"
      />
    );

    expect(screen.getByText("PDF document").getAttribute("title")).toBe(
      "PDF document, 8 B"
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("renders SVG through an isolated image blob instead of the page DOM", async () => {
    render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" onclick="alert(3)"/><a href="javascript:alert(4)">unsafe</a></svg>'
        )}
        columnName="vector"
        variant="detail"
      />
    );

    expect(
      await screen.findByRole("img", { name: "vector preview" })
    ).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) {
      throw new Error("expected a sanitized SVG blob");
    }
    expect(blob.type).toBe("image/svg+xml");
    expect(document.querySelector("object")).toBeNull();
    expect(screen.queryByLabelText("vector hex preview")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("[onload], [onclick]")).toBeNull();
  });

  it("shows detected metadata and a bounded hex fallback for unknown data", () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => index % 256);
    render(
      <BinaryFilePreview bytes={bytes} columnName="payload" variant="detail" />
    );

    expect(screen.getByText("Binary data")).toBeTruthy();
    expect(screen.getByText("application/octet-stream")).toBeTruthy();
    expect(screen.getByText("300 B")).toBeTruthy();
    const hexPreview = screen.getByRole("region", {
      name: "payload hex preview",
    });
    expect(hexPreview.textContent).toContain("000000f0");
    expect(hexPreview.textContent).not.toContain("00000100");
    expect(screen.getByText("Showing the first 256 B of 300 B.")).toBeTruthy();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes replaced and unmounted object URLs", async () => {
    let objectUrlSequence = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      objectUrlSequence += 1;
      return `blob:media-preview-${objectUrlSequence}`;
    });
    const view = render(
      <BinaryFilePreview
        bytes={new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])}
        columnName="avatar"
        variant="detail"
      />
    );
    expect(
      (await screen.findByRole("img", { name: "avatar preview" })).getAttribute(
        "src"
      )
    ).toBe("blob:media-preview-1");

    view.rerender(
      <BinaryFilePreview
        bytes={new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        )}
        columnName="vector"
        variant="detail"
      />
    );
    expect(
      (await screen.findByRole("img", { name: "vector preview" })).getAttribute(
        "src"
      )
    ).toBe("blob:media-preview-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media-preview-1");

    view.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media-preview-2");
  });

  it("surfaces an image decoding failure", async () => {
    render(
      <BinaryFilePreview
        bytes={new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])}
        columnName="avatar"
        variant="detail"
      />
    );
    const image = await screen.findByRole("img", { name: "avatar preview" });

    fireEvent.error(image);

    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn’t decode the PNG image"
    );
  });
});
