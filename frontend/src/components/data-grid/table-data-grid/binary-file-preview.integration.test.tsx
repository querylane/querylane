import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("uses a PDF object, custom audio player, and native video controls", async () => {
    const view = render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("%PDF-1.7")}
        columnName="document"
      />
    );

    const pdf = await screen.findByLabelText("document pdf preview");
    expect(pdf.tagName).toBe("OBJECT");
    expect(pdf.getAttribute("type")).toBe("application/pdf");

    view.rerender(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000")}
        columnName="recording"
      />
    );
    const audioPlayer = await screen.findByRole("region", {
      name: "recording audio preview",
    });
    const audio = audioPlayer.querySelector("audio");
    expect(audio?.hasAttribute("controls")).toBe(false);
    expect(audio?.getAttribute("preload")).toBe("metadata");
    expect(screen.getByRole("button", { name: "Play recording" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek recording" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute recording" })).toBeTruthy();
    expect(
      screen.getByRole("slider", { name: "recording volume" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Playback speed, 1×" })
    ).toBeTruthy();

    view.rerender(
      <BinaryFilePreview
        bytes={
          new Uint8Array([
            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f,
            0x6d,
          ])
        }
        columnName="clip"
      />
    );
    const video = await screen.findByLabelText("clip video preview");
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("controls")).not.toBeNull();
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("auto");
  });
});

describe("BinaryFilePreview audio controls", () => {
  it("pauses another binary audio preview when playback starts", async () => {
    render(
      <>
        <BinaryFilePreview
          bytes={new TextEncoder().encode("ID3\u0004\u0000first")}
          columnName="first recording"
        />
        <BinaryFilePreview
          bytes={new TextEncoder().encode("ID3\u0004\u0000second")}
          columnName="second recording"
        />
      </>
    );

    const firstPlayer = await screen.findByRole("region", {
      name: "first recording audio preview",
    });
    const secondPlayer = screen.getByRole("region", {
      name: "second recording audio preview",
    });
    const firstAudio = firstPlayer.querySelector("audio");
    const secondAudio = secondPlayer.querySelector("audio");
    if (!(firstAudio && secondAudio)) {
      throw new Error("expected both audio playback engines");
    }
    const pauseFirst = vi
      .spyOn(firstAudio, "pause")
      .mockImplementation(() => fireEvent.pause(firstAudio));

    fireEvent.play(firstAudio);
    fireEvent.play(secondAudio);

    expect(pauseFirst).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Play first recording" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Pause second recording" })
    ).toBeTruthy();
  });

  it("exposes playback state and understandable slider values", async () => {
    const user = userEvent.setup();
    render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000")}
        columnName="recording"
      />
    );

    const player = await screen.findByRole("region", {
      name: "recording audio preview",
    });
    const audio = player.querySelector("audio");
    if (!audio) {
      throw new Error("expected an audio playback engine");
    }
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 65,
    });
    audio.currentTime = 4;
    fireEvent.loadedMetadata(audio);

    const seek = screen.getByRole("slider", { name: "Seek recording" });
    expect(seek.getAttribute("max")).toBe("65");
    expect(seek.getAttribute("aria-valuetext")).toBe("0:04 of 1:05");
    expect(
      screen
        .getByRole("slider", { name: "recording volume" })
        .getAttribute("aria-valuetext")
    ).toBe("100%");

    let paused = true;
    Object.defineProperty(audio, "paused", {
      configurable: true,
      get: () => paused,
    });
    const play = vi.spyOn(audio, "play").mockImplementation(() => {
      paused = false;
      fireEvent.play(audio);
      return Promise.resolve();
    });
    const pause = vi.spyOn(audio, "pause").mockImplementation(() => {
      paused = true;
      fireEvent.pause(audio);
    });

    await user.click(screen.getByRole("button", { name: "Play recording" }));
    expect(play).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Pause recording" })
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Pause recording" }));
    expect(pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Play recording" })).toBeTruthy();
  });

  it("resets playback state when the binary audio value changes", async () => {
    let objectUrlSequence = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      objectUrlSequence += 1;
      return `blob:audio-preview-${objectUrlSequence}`;
    });
    const view = render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000first")}
        columnName="recording"
      />
    );
    const firstPlayer = await screen.findByRole("region", {
      name: "recording audio preview",
    });
    const firstAudio = firstPlayer.querySelector("audio");
    if (!firstAudio) {
      throw new Error("expected an audio playback engine");
    }
    Object.defineProperty(firstAudio, "duration", {
      configurable: true,
      value: 65,
    });
    firstAudio.currentTime = 4;
    fireEvent.loadedMetadata(firstAudio);
    expect(
      screen
        .getByRole("slider", { name: "Seek recording" })
        .getAttribute("aria-valuetext")
    ).toBe("0:04 of 1:05");

    view.rerender(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000second")}
        columnName="recording"
      />
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole("region", { name: "recording audio preview" })
          .querySelector("source")
          ?.getAttribute("src")
      ).toBe("blob:audio-preview-2")
    );
    expect(
      screen
        .getByRole("slider", { name: "Seek recording" })
        .getAttribute("aria-valuetext")
    ).toBe("0:00 of 0:00");
  });

  it("surfaces audio buffering and playback failures while keeping controls usable", async () => {
    const user = userEvent.setup();
    render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode("ID3\u0004\u0000")}
        columnName="recording"
      />
    );
    const player = await screen.findByRole("region", {
      name: "recording audio preview",
    });
    const audio = player.querySelector("audio");
    if (!audio) {
      throw new Error("expected an audio playback engine");
    }

    fireEvent.waiting(audio);
    expect(screen.getByRole("status").textContent).toContain(
      "Buffering recording"
    );
    fireEvent.playing(audio);
    expect(screen.queryByRole("status")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mute recording" }));
    expect(audio.muted).toBe(true);
    expect(
      screen.getByRole("button", { name: "Unmute recording" })
    ).toBeTruthy();
    expect(
      screen
        .getByRole("slider", { name: "recording volume" })
        .getAttribute("aria-valuetext")
    ).toBe("Muted");

    await user.click(
      screen.getByRole("button", { name: "Playback speed, 1×" })
    );
    await user.click(
      await screen.findByRole("menuitemradio", { name: "1.5×" })
    );
    expect(audio.playbackRate).toBe(1.5);
    expect(
      screen.getByRole("button", { name: "Playback speed, 1.5×" })
    ).toBeTruthy();

    vi.spyOn(audio, "play").mockRejectedValue(new Error("unsupported codec"));
    await user.click(screen.getByRole("button", { name: "Play recording" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn’t play recording. Download the value instead."
    );
  });
});

describe("BinaryFilePreview fallbacks", () => {
  it("renders SVG through an isolated image blob instead of the page DOM", async () => {
    render(
      <BinaryFilePreview
        bytes={new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" onclick="alert(3)"/><a href="javascript:alert(4)">unsafe</a></svg>'
        )}
        columnName="vector"
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
    render(<BinaryFilePreview bytes={bytes} columnName="payload" />);

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
      />
    );
    const image = await screen.findByRole("img", { name: "avatar preview" });

    fireEvent.error(image);

    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn’t decode the PNG image"
    );
  });
});
