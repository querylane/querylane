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

export { writeClipboard };
