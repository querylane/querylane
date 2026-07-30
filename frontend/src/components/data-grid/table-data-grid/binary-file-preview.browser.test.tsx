import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BinaryFilePreview } from "@/components/data-grid/table-data-grid/binary-file-preview";
import { RecordField } from "@/components/data-grid/table-data-grid/record-field";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const tableDataApi = vi.hoisted(() => ({
  useReadCellValueMutation: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
}));

vi.mock("@/hooks/api/table-data", () => ({
  useReadCellValueMutation: tableDataApi.useReadCellValueMutation,
}));

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SHORT_MP4_BASE64 =
  "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";
const PREVIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="144" viewBox="0 0 240 144"><rect width="240" height="144" rx="18" fill="#0f172a"/><circle cx="72" cy="72" r="38" fill="#14b8a6"/><path d="M54 72h36M72 54v36" stroke="#ecfeff" stroke-width="8" stroke-linecap="round"/><rect x="128" y="44" width="70" height="14" rx="7" fill="#cbd5e1"/><rect x="128" y="68" width="52" height="10" rx="5" fill="#64748b"/><rect x="128" y="88" width="62" height="10" rx="5" fill="#64748b"/></svg>';
const BINARY_TABLE_NAME =
  "instances/demo/databases/app/schemas/public/tables/assets";

function decodeBase64Bytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function createSilentWavBytes(): Uint8Array {
  const sampleRate = 8000;
  const dataByteCount = sampleRate * 2 * 2;
  const bytes = new Uint8Array(44 + dataByteCount);
  const view = new DataView(bytes.buffer);
  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  }
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataByteCount, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataByteCount, true);
  return bytes;
}

async function decodeImageElement(
  element: Element,
  accessibleName: string
): Promise<HTMLImageElement> {
  if (!(element instanceof HTMLImageElement)) {
    throw new Error(`expected ${accessibleName} to be an image`);
  }
  await element.decode();
  return element;
}

async function waitForMediaState({
  accessibleName,
  element,
  readyEvent,
  readyState,
}: {
  accessibleName: string;
  element: Element;
  readyEvent: "loadeddata" | "loadedmetadata";
  readyState: number;
}) {
  if (!(element instanceof HTMLMediaElement)) {
    throw new Error(`expected ${accessibleName} to be a media element`);
  }
  if (element.error !== null || element.readyState >= readyState) {
    return;
  }
  await new Promise<void>((resolve) => {
    element.addEventListener(readyEvent, () => resolve(), { once: true });
    element.addEventListener("error", () => resolve(), { once: true });
    element
      .querySelector("source")
      ?.addEventListener("error", () => resolve(), { once: true });
    element.load();
  });
}

function releaseMediaElement(element: HTMLMediaElement) {
  element.pause();
  element.removeAttribute("src");
  for (const source of element.querySelectorAll("source")) {
    source.removeAttribute("src");
  }
  element.load();
}

function createBinaryColumn(columnName: string) {
  return create(TableResultColumnSchema, {
    columnName,
    dataType: DataType.BINARY,
    isNullable: false,
    rawType: "bytea",
  });
}

function createBinaryCell(bytes: Uint8Array) {
  return create(TableCellSchema, {
    value: create(TableValueSchema, {
      kind: { case: "bytesValue", value: bytes },
    }),
  });
}

beforeEach(() => {
  tableDataApi.useReadCellValueMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn().mockRejectedValue(new Error("Preview unavailable")),
  });
});

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

test("binary image preview decodes a blob URL in the browser", async () => {
  render(
    <BinaryFilePreview
      bytes={decodeBase64Bytes(ONE_PIXEL_PNG_BASE64)}
      columnName="avatar"
    />
  );

  const image = page.getByRole("img", { name: "avatar preview" });
  await expect.element(image).toBeVisible();
  const imageElement = await decodeImageElement(
    image.element(),
    "avatar preview"
  );
  expect(imageElement.naturalWidth).toBe(1);
  expect(imageElement.naturalHeight).toBe(1);
});

test("SVG preview renders only sanitized markup", async () => {
  const unsafeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="window.__svgXss=true"><script>window.__svgXss=true</script><style>rect{fill:url(https://example.com/tracker)}</style><rect width="10" height="10" fill="red" onclick="window.__svgXss=true"/><a href="javascript:window.__svgXss=true">unsafe</a><foreignObject><iframe srcdoc="<script>window.__svgXss=true</script>"></iframe></foreignObject></svg>';
  render(
    <BinaryFilePreview
      bytes={new TextEncoder().encode(unsafeSvg)}
      columnName="vector"
    />
  );

  const image = page.getByRole("img", { name: "vector preview" });
  await expect.element(image).toBeVisible();
  const imageElement = await decodeImageElement(
    image.element(),
    "vector preview"
  );
  expect(imageElement.naturalWidth).toBe(10);

  const sanitizedSvg = await fetch(imageElement.src).then((response) =>
    response.text()
  );
  expect(sanitizedSvg).toContain("<rect");
  expect(sanitizedSvg).not.toContain("<script");
  expect(sanitizedSvg).not.toContain("<style");
  expect(sanitizedSvg).not.toContain("onload");
  expect(sanitizedSvg).not.toContain("onclick");
  expect(sanitizedSvg).not.toContain("javascript:");
  expect(sanitizedSvg.toLowerCase()).not.toContain("foreignobject");
  expect(sanitizedSvg).not.toContain("<iframe");
});

test("MP4 preview uses the native video element", async () => {
  render(
    <BinaryFilePreview
      bytes={decodeBase64Bytes(SHORT_MP4_BASE64)}
      columnName="clip"
    />
  );

  const video = page.getByLabelText("clip video preview");
  await expect.element(video).toBeVisible();
  expect(video.element().tagName).toBe("VIDEO");
});

test("audio preview loads metadata into custom controls", async () => {
  render(
    <BinaryFilePreview bytes={createSilentWavBytes()} columnName="recording" />
  );

  const player = page.getByRole("region", {
    name: "recording audio preview",
  });
  await expect.element(player).toBeVisible();
  const audio = player.element().querySelector("audio");
  if (!audio) {
    throw new Error("expected an audio playback engine");
  }
  await waitForMediaState({
    accessibleName: "recording audio preview",
    element: audio,
    readyEvent: "loadedmetadata",
    readyState: HTMLMediaElement.HAVE_METADATA,
  });

  await expect
    .element(page.getByRole("slider", { name: "Seek recording" }))
    .toHaveAttribute("aria-valuetext", "0:00 of 0:02");
  await page.getByRole("button", { name: "Play recording" }).click();
  await expect
    .element(page.getByRole("button", { name: "Pause recording" }))
    .toBeVisible();
  expect(audio.paused).toBe(false);
  await page.getByRole("button", { name: "Pause recording" }).click();
  await expect
    .element(page.getByRole("button", { name: "Play recording" }))
    .toBeVisible();
  expect(audio.paused).toBe(true);
  releaseMediaElement(audio);
});

test("binary preview details match their visual baseline", async () => {
  const svgColumn = createBinaryColumn("vector");
  const payloadColumn = createBinaryColumn("payload");
  render(
    <ScreenshotFrame>
      <section className="w-[860px] rounded-xl border bg-background p-5">
        <h2 className="font-semibold text-base">Binary value details</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Detected type, MIME type, size, and a safe preview stay together.
        </p>
        <div className="mt-5 grid grid-cols-2 items-start gap-5">
          <RecordField
            cell={createBinaryCell(new TextEncoder().encode(PREVIEW_SVG))}
            column={svgColumn}
            isPrimaryKey={false}
            tableName={BINARY_TABLE_NAME}
          />
          <RecordField
            cell={createBinaryCell(
              new TextEncoder().encode(
                "Querylane binary payload\u0000with non-text bytes\u0001\u0002"
              )
            )}
            column={payloadColumn}
            isPrimaryKey={false}
            tableName={BINARY_TABLE_NAME}
          />
        </div>
      </section>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Preview vector" }).click();
  await page.getByRole("button", { name: "Preview payload" }).click();

  const vector = page.getByRole("img", { name: "vector preview" });
  await expect.element(vector).toBeVisible();
  const vectorElement = await decodeImageElement(
    vector.element(),
    "vector preview"
  );
  expect(vectorElement.naturalWidth).toBe(240);
  await expect.element(page.getByText("SVG image")).toBeVisible();
  await expect.element(page.getByText("image/svg+xml")).toBeVisible();
  await expect
    .element(page.getByRole("region", { name: "payload hex preview" }))
    .toBeVisible();

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "binary-preview-details"
  );
});

test("custom audio controls match their visual baseline", async () => {
  render(
    <ScreenshotFrame>
      <section className="w-[520px] rounded-xl border bg-background p-5">
        <h2 className="font-semibold text-base">Binary audio preview</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Consistent controls keep database audio inspectable.
        </p>
        <div className="mt-5">
          <BinaryFilePreview
            bytes={createSilentWavBytes()}
            columnName="recording"
          />
        </div>
      </section>
    </ScreenshotFrame>
  );

  const audioPlayer = page.getByRole("region", {
    name: "recording audio preview",
  });
  await expect.element(audioPlayer).toBeVisible();
  const audio = audioPlayer.element().querySelector("audio");
  if (!audio) {
    throw new Error("expected an audio playback engine");
  }
  expect(audioPlayer.element().tagName).toBe("SECTION");
  await waitForMediaState({
    accessibleName: "recording audio preview",
    element: audio,
    readyEvent: "loadedmetadata",
    readyState: HTMLMediaElement.HAVE_METADATA,
  });

  await expect
    .element(page.getByRole("button", { name: "Play recording" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("slider", { name: "Seek recording" }))
    .toHaveAttribute("aria-valuetext", "0:00 of 0:02");
  await expect
    .element(page.getByRole("button", { name: "Playback speed, 1×" }))
    .toBeVisible();

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "binary-preview-custom-audio"
  );
  releaseMediaElement(audio);
});
