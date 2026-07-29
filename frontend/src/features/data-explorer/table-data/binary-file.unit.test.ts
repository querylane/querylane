import { describe, expect, it } from "vitest";
import {
  type BinaryFileMetadata,
  detectBinaryFile,
  formatBinaryHexPreview,
} from "@/features/data-explorer/table-data/binary-file";

const encoder = new TextEncoder();

interface DetectionCase {
  bytes: Uint8Array;
  expected: BinaryFileMetadata;
  name: string;
}

function bytesFromHex(hex: string): Uint8Array {
  const bytes: number[] = [];
  for (let offset = 0; offset < hex.length; offset += 2) {
    bytes.push(Number.parseInt(hex.slice(offset, offset + 2), 16));
  }
  return new Uint8Array(bytes);
}

function isoBaseMediaBytes(...brands: string[]): Uint8Array {
  return new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x18,
    ...encoder.encode(`ftyp${brands.join("")}`),
  ]);
}

function riffBytes(type: string): Uint8Array {
  return new Uint8Array([
    ...encoder.encode("RIFF"),
    0x00,
    0x00,
    0x00,
    0x00,
    ...encoder.encode(type),
  ]);
}

function oggBytes(codecMarker: string): Uint8Array {
  return new Uint8Array([
    ...encoder.encode("OggS"),
    ...new Uint8Array(16),
    ...encoder.encode(codecMarker),
  ]);
}

const DETECTION_CASES: readonly DetectionCase[] = [
  {
    bytes: bytesFromHex("89504e470d0a1a0a"),
    expected: {
      extension: "png",
      kind: "image",
      label: "PNG image",
      mimeType: "image/png",
    },
    name: "PNG",
  },
  {
    bytes: bytesFromHex("ffd8ffe000104a464946"),
    expected: {
      extension: "jpg",
      kind: "image",
      label: "JPEG image",
      mimeType: "image/jpeg",
    },
    name: "JPEG",
  },
  {
    bytes: encoder.encode("GIF87a"),
    expected: {
      extension: "gif",
      kind: "image",
      label: "GIF image",
      mimeType: "image/gif",
    },
    name: "GIF87a",
  },
  {
    bytes: encoder.encode("GIF89a"),
    expected: {
      extension: "gif",
      kind: "image",
      label: "GIF image",
      mimeType: "image/gif",
    },
    name: "GIF89a",
  },
  {
    bytes: riffBytes("WEBP"),
    expected: {
      extension: "webp",
      kind: "image",
      label: "WebP image",
      mimeType: "image/webp",
    },
    name: "WebP",
  },
  {
    bytes: isoBaseMediaBytes("avif"),
    expected: {
      extension: "avif",
      kind: "image",
      label: "AVIF image",
      mimeType: "image/avif",
    },
    name: "AVIF",
  },
  {
    bytes: encoder.encode("BM"),
    expected: {
      extension: "bmp",
      kind: "image",
      label: "BMP image",
      mimeType: "image/bmp",
    },
    name: "BMP",
  },
  {
    bytes: bytesFromHex("00000100"),
    expected: {
      extension: "ico",
      kind: "image",
      label: "ICO image",
      mimeType: "image/x-icon",
    },
    name: "ICO",
  },
  {
    bytes: encoder.encode(
      '\uFEFF<?xml version="1.0"?><!--icon--><SVG xmlns="http://www.w3.org/2000/svg"></SVG>'
    ),
    expected: {
      extension: "svg",
      kind: "svg",
      label: "SVG image",
      mimeType: "image/svg+xml",
    },
    name: "SVG with XML preamble",
  },
  {
    bytes: encoder.encode("%PDF-1.7"),
    expected: {
      extension: "pdf",
      kind: "pdf",
      label: "PDF document",
      mimeType: "application/pdf",
    },
    name: "PDF",
  },
  {
    bytes: encoder.encode("ID3\u0004\u0000"),
    expected: {
      extension: "mp3",
      kind: "audio",
      label: "MP3 audio",
      mimeType: "audio/mpeg",
    },
    name: "MP3 with ID3",
  },
  {
    bytes: bytesFromHex("fffb9064"),
    expected: {
      extension: "mp3",
      kind: "audio",
      label: "MP3 audio",
      mimeType: "audio/mpeg",
    },
    name: "MP3 frame",
  },
  {
    bytes: bytesFromHex("fff15080"),
    expected: {
      extension: "aac",
      kind: "audio",
      label: "AAC audio",
      mimeType: "audio/aac",
    },
    name: "AAC MPEG-4 ADTS",
  },
  {
    bytes: bytesFromHex("fff95080"),
    expected: {
      extension: "aac",
      kind: "audio",
      label: "AAC audio",
      mimeType: "audio/aac",
    },
    name: "AAC MPEG-2 ADTS",
  },
  {
    bytes: riffBytes("WAVE"),
    expected: {
      extension: "wav",
      kind: "audio",
      label: "WAV audio",
      mimeType: "audio/wav",
    },
    name: "WAV",
  },
  {
    bytes: encoder.encode("fLaC"),
    expected: {
      extension: "flac",
      kind: "audio",
      label: "FLAC audio",
      mimeType: "audio/flac",
    },
    name: "FLAC",
  },
  {
    bytes: oggBytes("OpusHead"),
    expected: {
      extension: "ogg",
      kind: "audio",
      label: "Ogg audio",
      mimeType: "audio/ogg",
    },
    name: "Ogg Opus",
  },
  {
    bytes: oggBytes("vorbis"),
    expected: {
      extension: "ogg",
      kind: "audio",
      label: "Ogg audio",
      mimeType: "audio/ogg",
    },
    name: "Ogg Vorbis",
  },
  {
    bytes: isoBaseMediaBytes("M4A "),
    expected: {
      extension: "m4a",
      kind: "audio",
      label: "M4A audio",
      mimeType: "audio/mp4",
    },
    name: "M4A",
  },
  {
    bytes: isoBaseMediaBytes("isom"),
    expected: {
      extension: "mp4",
      kind: "video",
      label: "MP4 video",
      mimeType: "video/mp4",
    },
    name: "MP4",
  },
  {
    bytes: isoBaseMediaBytes("free", "qt  "),
    expected: {
      extension: "mov",
      kind: "video",
      label: "QuickTime video",
      mimeType: "video/quicktime",
    },
    name: "QuickTime compatible brand",
  },
  {
    bytes: bytesFromHex("1a45dfa39f428681"),
    expected: {
      extension: "webm",
      kind: "video",
      label: "WebM media",
      mimeType: "video/webm",
    },
    name: "WebM",
  },
  {
    bytes: oggBytes("theora"),
    expected: {
      extension: "ogv",
      kind: "video",
      label: "Ogg video",
      mimeType: "video/ogg",
    },
    name: "Ogg Theora",
  },
  {
    bytes: bytesFromHex("504b03041400"),
    expected: {
      extension: "zip",
      kind: "generic",
      label: "ZIP archive",
      mimeType: "application/zip",
    },
    name: "ZIP",
  },
  {
    bytes: bytesFromHex("1f8b0800"),
    expected: {
      extension: "gz",
      kind: "generic",
      label: "Gzip archive",
      mimeType: "application/gzip",
    },
    name: "Gzip",
  },
  {
    bytes: bytesFromHex("377abcaf271c0004"),
    expected: {
      extension: "7z",
      kind: "generic",
      label: "7z archive",
      mimeType: "application/x-7z-compressed",
    },
    name: "7z",
  },
];

const UNKNOWN_FILE: BinaryFileMetadata = {
  extension: "bin",
  kind: "generic",
  label: "Binary data",
  mimeType: "application/octet-stream",
};

describe("detectBinaryFile", () => {
  it.each(DETECTION_CASES)(
    "detects $name from its content signature",
    (entry) => {
      expect(detectBinaryFile(entry.bytes)).toEqual(entry.expected);
    }
  );

  it.each([
    { bytes: new Uint8Array(), name: "empty input" },
    { bytes: riffBytes("AVI "), name: "an unsupported RIFF type" },
    {
      bytes: isoBaseMediaBytes("zzzz"),
      name: "an unsupported ISO base media brand",
    },
    { bytes: oggBytes("unknown"), name: "an unsupported Ogg codec" },
    {
      bytes: encoder.encode("prefix <svg xmlns='http://www.w3.org/2000/svg'>"),
      name: "an SVG tag after non-preamble content",
    },
    {
      bytes: encoder.encode("<svgz xmlns='http://www.w3.org/2000/svg'>"),
      name: "an SVG-like tag name",
    },
    {
      bytes: new Uint8Array([
        ...new Uint8Array(2048).fill(0x20),
        ...encoder.encode("<svg>"),
      ]),
      name: "an SVG beyond the sniff limit",
    },
  ])("keeps $name as generic binary data", ({ bytes }) => {
    expect(detectBinaryFile(bytes)).toEqual(UNKNOWN_FILE);
  });
});

describe("formatBinaryHexPreview", () => {
  it("formats offsets, byte values, ASCII, and truncation independently", () => {
    expect(
      formatBinaryHexPreview(
        new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0xff, 0x21, 0x41]),
        8
      )
    ).toEqual({
      contents: "00000000  48 65 6c 6c 6f 00 ff 21  Hello..!",
      shownByteCount: 8,
      truncated: true,
    });
  });

  it("starts each 16-byte row with a conventional hexadecimal offset", () => {
    const bytes = Uint8Array.from({ length: 18 }, (_, index) => 0x30 + index);

    expect(formatBinaryHexPreview(bytes, bytes.length)).toEqual({
      contents:
        "00000000  30 31 32 33 34 35 36 37 38 39 3a 3b 3c 3d 3e 3f  0123456789:;<=>?\n" +
        "00000010  40 41  @A",
      shownByteCount: 18,
      truncated: false,
    });
  });

  it("clamps negative limits, floors fractional limits, and handles empty data", () => {
    expect(formatBinaryHexPreview(new Uint8Array([0x41]), -1)).toEqual({
      contents: "",
      shownByteCount: 0,
      truncated: true,
    });
    expect(formatBinaryHexPreview(new Uint8Array([0x41, 0x42]), 1.9)).toEqual({
      contents: "00000000  41  A",
      shownByteCount: 1,
      truncated: true,
    });
    expect(formatBinaryHexPreview(new Uint8Array(), 32)).toEqual({
      contents: "",
      shownByteCount: 0,
      truncated: false,
    });
  });
});
