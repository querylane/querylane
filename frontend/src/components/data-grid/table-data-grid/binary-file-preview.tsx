import DomPurify, { type Config } from "dompurify";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { BinaryFileMetadata } from "@/features/data-explorer/table-data/binary-file";
import {
  detectBinaryFile,
  formatBinaryHexPreview,
} from "@/features/data-explorer/table-data/binary-file";
import { formatBytes } from "@/lib/console-resources";

const HEX_PREVIEW_BYTE_LIMIT = 256;
const GRID_THUMBNAIL_SIZE = 24;
const DETAIL_IMAGE_SIZE_HINT = 384;
const SVG_SANITIZE_CONFIG: Config = {
  FORBID_TAGS: ["foreignobject", "script", "style"],
  USE_PROFILES: { svg: true, svgFilters: true },
};

function createBinaryBlob(bytes: Uint8Array, file: BinaryFileMetadata): Blob {
  if (file.kind !== "svg") {
    return new Blob([new Uint8Array(bytes)], { type: file.mimeType });
  }
  const svgSource = new TextDecoder().decode(bytes);
  const sanitizedSvg = DomPurify.sanitize(svgSource, SVG_SANITIZE_CONFIG);
  return new Blob([sanitizedSvg], { type: file.mimeType });
}

function useBinaryObjectUrl(
  bytes: Uint8Array | undefined,
  file: BinaryFileMetadata
): string {
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(
    function createBinaryObjectUrl() {
      if (!bytes) {
        setObjectUrl("");
        return;
      }
      const blob = createBinaryBlob(bytes, file);
      const nextObjectUrl = URL.createObjectURL(blob);
      setObjectUrl(nextObjectUrl);
      return () => {
        URL.revokeObjectURL(nextObjectUrl);
      };
    },
    [bytes, file]
  );

  return objectUrl;
}

function BinaryMediaLoadingStatus({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground text-xs" role="status">
      Loading {label.toLowerCase()} preview
    </span>
  );
}

function useImageDecodeError(objectUrl: string) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [failedObjectUrl, setFailedObjectUrl] = useState("");

  useEffect(
    function observeImageDecodeFailure() {
      const image = imageRef.current;
      if (!(image && objectUrl)) {
        return;
      }
      function recordDecodeFailure() {
        setFailedObjectUrl(objectUrl);
      }
      image.addEventListener("error", recordDecodeFailure);
      return () => image.removeEventListener("error", recordDecodeFailure);
    },
    [objectUrl]
  );

  return {
    hasDecodeError: failedObjectUrl === objectUrl,
    imageRef,
  };
}

function BinaryPreviewMetadata({
  byteCount,
  file,
}: {
  byteCount: number;
  file: BinaryFileMetadata;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="font-medium">{file.label}</span>
      <span className="font-mono text-muted-foreground">{file.mimeType}</span>
      <span className="text-muted-foreground">{formatBytes(byteCount)}</span>
    </div>
  );
}

function GridBinaryFilePreview({
  columnName,
  file,
  objectUrl,
  byteCount,
}: {
  byteCount: number;
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  const { hasDecodeError, imageRef } = useImageDecodeError(objectUrl);
  if (file.kind === "image" || file.kind === "svg") {
    if (objectUrl === "") {
      return <BinaryMediaLoadingStatus label={file.label} />;
    }
    if (hasDecodeError) {
      return (
        <span
          className="truncate text-destructive-foreground text-xs"
          title={`Couldn’t decode the ${file.label}`}
        >
          Preview unavailable
        </span>
      );
    }
    return (
      <img
        alt={`${columnName} preview`}
        className="size-6 rounded-sm border object-cover"
        height={GRID_THUMBNAIL_SIZE}
        ref={imageRef}
        src={objectUrl}
        width={GRID_THUMBNAIL_SIZE}
      />
    );
  }
  return (
    <span
      className="max-w-24 truncate text-muted-foreground text-xs"
      title={`${file.label}, ${formatBytes(byteCount)}`}
    >
      {file.label}
    </span>
  );
}

function PdfPreviewObject({
  columnName,
  file,
  objectUrl,
}: {
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  if (objectUrl === "") {
    return <BinaryMediaLoadingStatus label={file.label} />;
  }
  return (
    <object
      aria-label={`${columnName} pdf preview`}
      className="h-[32rem] max-h-[70dvh] w-full rounded-md border bg-background"
      data={objectUrl}
      type={file.mimeType}
    >
      <p className="p-3 text-muted-foreground text-sm">
        This browser couldn’t display the {file.label.toLowerCase()} preview.
        Download the value instead.
      </p>
    </object>
  );
}

function NativeAudioPreview({
  columnName,
  file,
  objectUrl,
}: {
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  if (objectUrl === "") {
    return <BinaryMediaLoadingStatus label={file.label} />;
  }
  return (
    <audio
      aria-label={`${columnName} audio preview`}
      className="min-h-14 w-full"
      controls={true}
      preload="metadata"
    >
      <source src={objectUrl} type={file.mimeType} />
      <track kind="captions" label="No captions supplied" srcLang="en" />
      <p className="p-3 text-muted-foreground text-sm">
        This browser couldn’t play the {file.label.toLowerCase()}. Download the
        value instead.
      </p>
    </audio>
  );
}

function NativeVideoPreview({
  columnName,
  file,
  objectUrl,
}: {
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  if (objectUrl === "") {
    return <BinaryMediaLoadingStatus label={file.label} />;
  }
  return (
    <video
      aria-label={`${columnName} video preview`}
      className="max-h-96 w-full rounded-md border bg-gray-950"
      controls={true}
      playsInline={true}
      preload="auto"
    >
      <source src={objectUrl} type={file.mimeType} />
      <track kind="captions" label="No captions supplied" srcLang="en" />
      <p className="p-3 text-muted-foreground text-sm">
        This browser couldn’t play the {file.label.toLowerCase()}. Download the
        value instead.
      </p>
    </video>
  );
}

function ImageDetailPreview({
  columnName,
  file,
  objectUrl,
}: {
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  const { hasDecodeError, imageRef } = useImageDecodeError(objectUrl);
  if (objectUrl === "") {
    return <BinaryMediaLoadingStatus label={file.label} />;
  }
  if (hasDecodeError) {
    return (
      <p className="text-destructive-foreground text-xs" role="alert">
        Couldn’t decode the {file.label}. Download the value instead.
      </p>
    );
  }
  return (
    <img
      alt={`${columnName} preview`}
      className="h-auto max-h-96 max-w-full self-start rounded-md border bg-muted object-contain"
      height={DETAIL_IMAGE_SIZE_HINT}
      ref={imageRef}
      src={objectUrl}
      width={DETAIL_IMAGE_SIZE_HINT}
    />
  );
}

function BinaryHexPreview({
  bytes,
  columnName,
}: {
  bytes: Uint8Array;
  columnName: string;
}) {
  const hex = formatBinaryHexPreview(bytes, HEX_PREVIEW_BYTE_LIMIT);
  return (
    <section aria-label={`${columnName} hex preview`} className="min-w-0">
      <pre className="max-h-64 w-full overflow-auto rounded-md border bg-background p-2 font-mono text-xs">
        {hex.contents}
      </pre>
      {hex.truncated ? (
        <p className="mt-1 text-muted-foreground text-xs">
          Showing the first {formatBytes(hex.shownByteCount)} of{" "}
          {formatBytes(bytes.length)}.
        </p>
      ) : null}
    </section>
  );
}

function DetailBinaryFilePreview({
  bytes,
  columnName,
  file,
  objectUrl,
}: {
  bytes: Uint8Array;
  columnName: string;
  file: BinaryFileMetadata;
  objectUrl: string;
}) {
  let preview: ReactNode;
  switch (file.kind) {
    case "image":
      preview = (
        <ImageDetailPreview
          columnName={columnName}
          file={file}
          objectUrl={objectUrl}
        />
      );
      break;
    case "audio":
      preview = (
        <NativeAudioPreview
          columnName={columnName}
          file={file}
          objectUrl={objectUrl}
        />
      );
      break;
    case "pdf":
      preview = (
        <PdfPreviewObject
          columnName={columnName}
          file={file}
          objectUrl={objectUrl}
        />
      );
      break;
    case "video":
      preview = (
        <NativeVideoPreview
          columnName={columnName}
          file={file}
          objectUrl={objectUrl}
        />
      );
      break;
    case "svg":
      preview = (
        <ImageDetailPreview
          columnName={columnName}
          file={file}
          objectUrl={objectUrl}
        />
      );
      break;
    case "generic":
      preview = <BinaryHexPreview bytes={bytes} columnName={columnName} />;
      break;
    default:
      return file.kind satisfies never;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <BinaryPreviewMetadata byteCount={bytes.length} file={file} />
      {preview}
    </div>
  );
}

function BinaryFilePreview({
  bytes,
  columnName,
  variant,
}: {
  bytes: Uint8Array;
  columnName: string;
  variant: "detail" | "grid";
}) {
  const file = detectBinaryFile(bytes);
  const needsObjectUrl =
    file.kind === "image" ||
    file.kind === "svg" ||
    (variant === "detail" &&
      (file.kind === "audio" || file.kind === "pdf" || file.kind === "video"));
  const objectUrl = useBinaryObjectUrl(
    needsObjectUrl ? bytes : undefined,
    file
  );

  if (variant === "grid") {
    return (
      <GridBinaryFilePreview
        byteCount={bytes.length}
        columnName={columnName}
        file={file}
        objectUrl={objectUrl}
      />
    );
  }
  return (
    <DetailBinaryFilePreview
      bytes={bytes}
      columnName={columnName}
      file={file}
      objectUrl={objectUrl}
    />
  );
}

export { BinaryFilePreview };
