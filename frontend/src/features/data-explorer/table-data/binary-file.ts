type BinaryPreviewKind =
  | "audio"
  | "generic"
  | "image"
  | "pdf"
  | "svg"
  | "video";

interface BinaryFileMetadata {
  extension: string;
  kind: BinaryPreviewKind;
  label: string;
  mimeType: string;
}

interface BinaryHexPreview {
  contents: string;
  shownByteCount: number;
  truncated: boolean;
}

interface FixedSignature {
  file: BinaryFileMetadata;
  hex: string;
}

const SVG_SNIFF_BYTE_LIMIT = 2048;
const MEDIA_SIGNATURE_SNIFF_BYTE_LIMIT = 128;
const HEX_LINE_BYTE_COUNT = 16;
const HEX_RADIX = 16;
const HEX_BYTE_CHARACTER_COUNT = 2;
const PRINTABLE_ASCII_START = 0x20;
const PRINTABLE_ASCII_END = 0x7e;
const ISO_BOX_MIN_BYTE_COUNT = 12;
const ISO_BOX_TYPE_OFFSET = 4;
const ISO_BRAND_START_OFFSET = 8;
const ISO_BRAND_BYTE_COUNT = 4;
const ISO_BRAND_SNIFF_BYTE_LIMIT = 32;
const MP3_FRAME_FIRST_BYTE = 0xff;
const MP3_FRAME_SECOND_BYTE_MIN = 0xe0;
const SVG_PREFIX_PATTERN =
  /^(?:\uFEFF?\s*)(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i;

const PNG_FILE: BinaryFileMetadata = {
  extension: "png",
  kind: "image",
  label: "PNG image",
  mimeType: "image/png",
};
const JPEG_FILE: BinaryFileMetadata = {
  extension: "jpg",
  kind: "image",
  label: "JPEG image",
  mimeType: "image/jpeg",
};
const GIF_FILE: BinaryFileMetadata = {
  extension: "gif",
  kind: "image",
  label: "GIF image",
  mimeType: "image/gif",
};
const WEBP_FILE: BinaryFileMetadata = {
  extension: "webp",
  kind: "image",
  label: "WebP image",
  mimeType: "image/webp",
};
const AVIF_FILE: BinaryFileMetadata = {
  extension: "avif",
  kind: "image",
  label: "AVIF image",
  mimeType: "image/avif",
};
const BMP_FILE: BinaryFileMetadata = {
  extension: "bmp",
  kind: "image",
  label: "BMP image",
  mimeType: "image/bmp",
};
const ICO_FILE: BinaryFileMetadata = {
  extension: "ico",
  kind: "image",
  label: "ICO image",
  mimeType: "image/x-icon",
};
const SVG_FILE: BinaryFileMetadata = {
  extension: "svg",
  kind: "svg",
  label: "SVG image",
  mimeType: "image/svg+xml",
};
const PDF_FILE: BinaryFileMetadata = {
  extension: "pdf",
  kind: "pdf",
  label: "PDF document",
  mimeType: "application/pdf",
};
const MP3_FILE: BinaryFileMetadata = {
  extension: "mp3",
  kind: "audio",
  label: "MP3 audio",
  mimeType: "audio/mpeg",
};
const AAC_FILE: BinaryFileMetadata = {
  extension: "aac",
  kind: "audio",
  label: "AAC audio",
  mimeType: "audio/aac",
};
const WAV_FILE: BinaryFileMetadata = {
  extension: "wav",
  kind: "audio",
  label: "WAV audio",
  mimeType: "audio/wav",
};
const FLAC_FILE: BinaryFileMetadata = {
  extension: "flac",
  kind: "audio",
  label: "FLAC audio",
  mimeType: "audio/flac",
};
const OGG_AUDIO_FILE: BinaryFileMetadata = {
  extension: "ogg",
  kind: "audio",
  label: "Ogg audio",
  mimeType: "audio/ogg",
};
const M4A_FILE: BinaryFileMetadata = {
  extension: "m4a",
  kind: "audio",
  label: "M4A audio",
  mimeType: "audio/mp4",
};
const MP4_FILE: BinaryFileMetadata = {
  extension: "mp4",
  kind: "video",
  label: "MP4 video",
  mimeType: "video/mp4",
};
const QUICKTIME_FILE: BinaryFileMetadata = {
  extension: "mov",
  kind: "video",
  label: "QuickTime video",
  mimeType: "video/quicktime",
};
const WEBM_FILE: BinaryFileMetadata = {
  extension: "webm",
  kind: "video",
  label: "WebM media",
  mimeType: "video/webm",
};
const OGG_VIDEO_FILE: BinaryFileMetadata = {
  extension: "ogv",
  kind: "video",
  label: "Ogg video",
  mimeType: "video/ogg",
};
const ZIP_FILE: BinaryFileMetadata = {
  extension: "zip",
  kind: "generic",
  label: "ZIP archive",
  mimeType: "application/zip",
};
const GZIP_FILE: BinaryFileMetadata = {
  extension: "gz",
  kind: "generic",
  label: "Gzip archive",
  mimeType: "application/gzip",
};
const SEVEN_ZIP_FILE: BinaryFileMetadata = {
  extension: "7z",
  kind: "generic",
  label: "7z archive",
  mimeType: "application/x-7z-compressed",
};
const UNKNOWN_BINARY_FILE: BinaryFileMetadata = {
  extension: "bin",
  kind: "generic",
  label: "Binary data",
  mimeType: "application/octet-stream",
};

const FIXED_SIGNATURES: readonly FixedSignature[] = [
  { file: PNG_FILE, hex: "89504e470d0a1a0a" },
  { file: JPEG_FILE, hex: "ffd8ff" },
  { file: GIF_FILE, hex: "474946383761" },
  { file: GIF_FILE, hex: "474946383961" },
  { file: BMP_FILE, hex: "424d" },
  { file: ICO_FILE, hex: "00000100" },
  { file: PDF_FILE, hex: "255044462d" },
  { file: MP3_FILE, hex: "494433" },
  { file: AAC_FILE, hex: "fff1" },
  { file: AAC_FILE, hex: "fff9" },
  { file: FLAC_FILE, hex: "664c6143" },
  { file: WEBM_FILE, hex: "1a45dfa3" },
  { file: ZIP_FILE, hex: "504b0304" },
  { file: GZIP_FILE, hex: "1f8b" },
  { file: SEVEN_ZIP_FILE, hex: "377abcaf271c" },
];

const AVIF_BRANDS = new Set(["avif", "avis"]);
const M4A_BRANDS = new Set(["M4A ", "M4B ", "M4P "]);
const MP4_BRANDS = new Set([
  "avc1",
  "dash",
  "iso2",
  "isom",
  "mp41",
  "mp42",
  "M4V ",
]);
const QUICKTIME_BRANDS = new Set(["qt  "]);

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  const end = Math.min(bytes.length, offset + length);
  for (let index = offset; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function hasHexSignature(bytes: Uint8Array, signature: string): boolean {
  const byteCount = signature.length / HEX_BYTE_CHARACTER_COUNT;
  if (bytes.length < byteCount) {
    return false;
  }
  for (let index = 0; index < byteCount; index += 1) {
    const byte = bytes[index] ?? 0;
    const expected = signature.slice(
      index * HEX_BYTE_CHARACTER_COUNT,
      index * HEX_BYTE_CHARACTER_COUNT + HEX_BYTE_CHARACTER_COUNT
    );
    if (
      byte.toString(HEX_RADIX).padStart(HEX_BYTE_CHARACTER_COUNT, "0") !==
      expected
    ) {
      return false;
    }
  }
  return true;
}

function findFixedSignature(bytes: Uint8Array): BinaryFileMetadata | null {
  for (const signature of FIXED_SIGNATURES) {
    if (hasHexSignature(bytes, signature.hex)) {
      return signature.file;
    }
  }
  return null;
}

function hasIsoBaseMediaBrand(
  bytes: Uint8Array,
  brands: ReadonlySet<string>
): boolean {
  if (
    bytes.length < ISO_BOX_MIN_BYTE_COUNT ||
    asciiAt(bytes, ISO_BOX_TYPE_OFFSET, ISO_BRAND_BYTE_COUNT) !== "ftyp"
  ) {
    return false;
  }
  const brandEnd = Math.min(bytes.length, ISO_BRAND_SNIFF_BYTE_LIMIT);
  for (
    let offset = ISO_BRAND_START_OFFSET;
    offset + ISO_BRAND_BYTE_COUNT <= brandEnd;
    offset += ISO_BRAND_BYTE_COUNT
  ) {
    if (brands.has(asciiAt(bytes, offset, ISO_BRAND_BYTE_COUNT))) {
      return true;
    }
  }
  return false;
}

function detectIsoBaseMediaFile(bytes: Uint8Array): BinaryFileMetadata | null {
  if (hasIsoBaseMediaBrand(bytes, AVIF_BRANDS)) {
    return AVIF_FILE;
  }
  if (hasIsoBaseMediaBrand(bytes, M4A_BRANDS)) {
    return M4A_FILE;
  }
  if (hasIsoBaseMediaBrand(bytes, QUICKTIME_BRANDS)) {
    return QUICKTIME_FILE;
  }
  if (hasIsoBaseMediaBrand(bytes, MP4_BRANDS)) {
    return MP4_FILE;
  }
  return null;
}

function detectRiffFile(bytes: Uint8Array): BinaryFileMetadata | null {
  if (asciiAt(bytes, 0, ISO_BRAND_BYTE_COUNT) !== "RIFF") {
    return null;
  }
  const riffType = asciiAt(bytes, ISO_BRAND_START_OFFSET, ISO_BRAND_BYTE_COUNT);
  if (riffType === "WEBP") {
    return WEBP_FILE;
  }
  return riffType === "WAVE" ? WAV_FILE : null;
}

function includesAscii(bytes: Uint8Array, value: string): boolean {
  return asciiAt(
    bytes,
    0,
    Math.min(bytes.length, MEDIA_SIGNATURE_SNIFF_BYTE_LIMIT)
  ).includes(value);
}

function detectOggFile(bytes: Uint8Array): BinaryFileMetadata | null {
  if (asciiAt(bytes, 0, ISO_BRAND_BYTE_COUNT) !== "OggS") {
    return null;
  }
  if (includesAscii(bytes, "OpusHead") || includesAscii(bytes, "vorbis")) {
    return OGG_AUDIO_FILE;
  }
  return includesAscii(bytes, "theora") ? OGG_VIDEO_FILE : null;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(
    bytes.subarray(0, SVG_SNIFF_BYTE_LIMIT)
  );
  return SVG_PREFIX_PATTERN.test(prefix);
}

function detectBinaryFile(bytes: Uint8Array): BinaryFileMetadata {
  const fixedSignature = findFixedSignature(bytes);
  if (fixedSignature) {
    return fixedSignature;
  }
  const riffFile = detectRiffFile(bytes);
  if (riffFile) {
    return riffFile;
  }
  const isoBaseMediaFile = detectIsoBaseMediaFile(bytes);
  if (isoBaseMediaFile) {
    return isoBaseMediaFile;
  }
  const oggFile = detectOggFile(bytes);
  if (oggFile) {
    return oggFile;
  }
  if (
    bytes[0] === MP3_FRAME_FIRST_BYTE &&
    (bytes[1] ?? 0) >= MP3_FRAME_SECOND_BYTE_MIN
  ) {
    return MP3_FILE;
  }
  return looksLikeSvg(bytes) ? SVG_FILE : UNKNOWN_BINARY_FILE;
}

function formatBinaryHexPreview(
  bytes: Uint8Array,
  maxBytes: number
): BinaryHexPreview {
  const shownByteCount = Math.min(
    bytes.length,
    Math.max(0, Math.floor(maxBytes))
  );
  const lines: string[] = [];
  for (let offset = 0; offset < shownByteCount; offset += HEX_LINE_BYTE_COUNT) {
    const line = bytes.subarray(
      offset,
      Math.min(shownByteCount, offset + HEX_LINE_BYTE_COUNT)
    );
    const hexBytes: string[] = [];
    let ascii = "";
    for (const byte of line) {
      hexBytes.push(
        byte.toString(HEX_RADIX).padStart(HEX_BYTE_CHARACTER_COUNT, "0")
      );
      ascii +=
        byte >= PRINTABLE_ASCII_START && byte <= PRINTABLE_ASCII_END
          ? String.fromCharCode(byte)
          : ".";
    }
    lines.push(
      `${offset
        .toString(HEX_RADIX)
        .padStart(
          HEX_LINE_BYTE_COUNT / HEX_BYTE_CHARACTER_COUNT,
          "0"
        )}  ${hexBytes.join(" ")}  ${ascii}`
    );
  }
  return {
    contents: lines.join("\n"),
    shownByteCount,
    truncated: shownByteCount < bytes.length,
  };
}

export type { BinaryFileMetadata, BinaryHexPreview, BinaryPreviewKind };
export { detectBinaryFile, formatBinaryHexPreview };
