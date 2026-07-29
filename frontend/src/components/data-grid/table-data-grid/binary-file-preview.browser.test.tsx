import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BinaryFilePreview } from "@/components/data-grid/table-data-grid/binary-file-preview";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
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
const PREVIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="144" viewBox="0 0 240 144"><rect width="240" height="144" rx="18" fill="#0f172a"/><circle cx="72" cy="72" r="38" fill="#14b8a6"/><path d="M54 72h36M72 54v36" stroke="#ecfeff" stroke-width="8" stroke-linecap="round"/><rect x="128" y="44" width="70" height="14" rx="7" fill="#cbd5e1"/><rect x="128" y="68" width="52" height="10" rx="5" fill="#64748b"/><rect x="128" y="88" width="62" height="10" rx="5" fill="#64748b"/></svg>';
const BINARY_TABLE_NAME =
  "instances/demo/databases/app/schemas/public/tables/assets";

function decodeBase64Bytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
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

function createTruncatedBinaryCell(token: string, size: bigint) {
  return create(TableCellSchema, {
    fullSizeBytes: size,
    fullValueToken: token,
    truncated: true,
    value: create(TableValueSchema, {
      kind: { case: "bytesValue", value: new Uint8Array() },
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
      variant="detail"
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
      variant="detail"
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

test("SVG preview renders as a grid thumbnail", async () => {
  const safeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
  render(
    <BinaryFilePreview
      bytes={new TextEncoder().encode(safeSvg)}
      columnName="vector"
      variant="grid"
    />
  );

  const image = page.getByRole("img", { name: "vector preview" });
  await expect.element(image).toBeVisible();
  const thumbnail = await decodeImageElement(image.element(), "vector preview");
  expect(thumbnail.getBoundingClientRect().width).toBe(24);
});

test("grid binary data stays unloaded until preview is requested", async () => {
  const pngBytes = decodeBase64Bytes(ONE_PIXEL_PNG_BASE64);
  const column = createBinaryColumn("avatar");
  const cell = createBinaryCell(pngBytes);
  render(
    <DataCell cell={cell} column={column} tableName={BINARY_TABLE_NAME} />
  );

  const previewButton = page.getByRole("button", {
    name: "Preview avatar binary data",
  });
  await expect.element(previewButton).toBeVisible();
  expect(page.getByRole("img", { name: "avatar preview" }).elements()).toEqual(
    []
  );

  await previewButton.click();

  const image = page.getByRole("img", { name: "avatar preview" });
  await expect.element(image).toBeVisible();
  const thumbnail = await decodeImageElement(image.element(), "avatar preview");
  expect(thumbnail.getBoundingClientRect().width).toBe(24);
});

test("binary preview grid lifecycle matches its visual baseline", async () => {
  const pngBytes = decodeBase64Bytes(ONE_PIXEL_PNG_BASE64);
  const svgBytes = new TextEncoder().encode(PREVIEW_SVG);
  const pdfBytes = new TextEncoder().encode("%PDF-1.7");
  render(
    <ScreenshotFrame>
      <section className="w-[960px] rounded-xl border bg-background p-5">
        <h2 className="font-semibold text-base">Binary grid previews</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Explicit loading keeps large values out of the grid until requested.
        </p>
        <div className="mt-5 grid grid-cols-5 gap-3">
          {[
            {
              cell: createBinaryCell(new Uint8Array([0x48, 0x69])),
              column: createBinaryColumn("raw"),
              label: "Ready",
            },
            {
              cell: createBinaryCell(pngBytes),
              column: createBinaryColumn("avatar"),
              label: "Raster",
            },
            {
              cell: createBinaryCell(svgBytes),
              column: createBinaryColumn("vector"),
              label: "Sanitized SVG",
            },
            {
              cell: createBinaryCell(pdfBytes),
              column: createBinaryColumn("document"),
              label: "Detected media",
            },
            {
              cell: createTruncatedBinaryCell("failed-payload", 8192n),
              column: createBinaryColumn("failed"),
              label: "Retry",
            },
          ].map(({ cell, column, label }) => (
            <div className="min-w-0" key={column.columnName}>
              <p className="mb-1.5 font-medium text-xs">{label}</p>
              <div className="flex h-10 min-w-0 items-center rounded-md border bg-muted/30 px-2">
                <DataCell
                  cell={cell}
                  column={column}
                  tableName={BINARY_TABLE_NAME}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </ScreenshotFrame>
  );

  await page
    .getByRole("button", { name: "Preview avatar binary data" })
    .click();
  await page
    .getByRole("button", { name: "Preview vector binary data" })
    .click();
  await page
    .getByRole("button", { name: "Preview document binary data" })
    .click();
  await page
    .getByRole("button", { name: "Preview failed binary data" })
    .click();

  const avatar = page.getByRole("img", { name: "avatar preview" });
  const vector = page.getByRole("img", { name: "vector preview" });
  await expect.element(avatar).toBeVisible();
  await expect.element(vector).toBeVisible();
  await decodeImageElement(avatar.element(), "avatar preview");
  await decodeImageElement(vector.element(), "vector preview");
  await expect.element(page.getByText("PDF document")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Preview failed binary data" }))
    .toHaveTextContent("Retry");

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "binary-preview-grid-lifecycle"
  );
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
