import { toast } from "sonner";

function writeClipboard(value: string) {
  if (!navigator.clipboard) {
    toast.error("Clipboard isn't available in this browser");
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => {
      toast.success("Copied", { duration: 1500 });
    },
    () => {
      toast.error("Couldn't copy to clipboard");
    }
  );
}

// writeClipboardDeferred copies text that still has to be produced
// asynchronously (e.g. fetching a truncated cell's full value first).
// A promise-valued ClipboardItem keeps the user-gesture activation alive
// across the async gap — Safari rejects a plain writeText issued after
// an await. Browsers without ClipboardItem fall back to writeText and
// rely on the transient-activation window outlasting the fetch.
function writeClipboardDeferred(getText: () => Promise<string>) {
  if (!navigator.clipboard) {
    toast.error("Clipboard isn't available in this browser");
    return;
  }
  const onDone = () => toast.success("Copied", { duration: 1500 });
  const onError = () => toast.error("Couldn't copy the full value");
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard.write) {
    getText()
      .then((text) => navigator.clipboard.writeText(text))
      .then(onDone, onError);
    return;
  }
  const item = new ClipboardItem({
    "text/plain": getText().then(
      (text) => new Blob([text], { type: "text/plain" })
    ),
  });
  navigator.clipboard.write([item]).then(onDone, onError);
}

export { writeClipboard, writeClipboardDeferred };
