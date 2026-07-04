function downloadBlob(
  filename: string,
  contents: BlobPart | readonly BlobPart[],
  mimeType: string
) {
  const blobParts = Array.isArray(contents) ? contents : [contents];
  const blob = new Blob(blobParts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export { downloadBlob };
