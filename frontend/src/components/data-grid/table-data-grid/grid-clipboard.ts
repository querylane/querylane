import { toast } from "sonner";

function writeClipboard(value: string) {
  if (!Boolean(navigator.clipboard)) {
    toast.error("Clipboard isn't available in this browser");
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => {
      toast.success("Copied", { duration: 1500 });

      return undefined;
    })
    .catch(() => {
      toast.error("Couldn't copy to clipboard");
    });
}

function writeClipboardDeferred(getText: () => Promise<string>) {
  if (!Boolean(navigator.clipboard)) {
    toast.error("Clipboard isn't available in this browser");
    return;
  }
  const onDone = () => toast.success("Copied", { duration: 1500 });
  const onError = () => toast.error("Couldn't copy the full value");
  if (
    typeof ClipboardItem === "undefined" ||
    typeof navigator.clipboard.write !== "function"
  ) {
    getText()
      .then((text) => navigator.clipboard.writeText(text))
      .then(onDone)
      .catch(onError);
    return;
  }
  const item = new ClipboardItem({
    "text/plain": getText().then(
      (text) => new Blob([text], { type: "text/plain" })
    ),
  });
  navigator.clipboard.write([item]).then(onDone).catch(onError);
}

export { writeClipboard, writeClipboardDeferred };
