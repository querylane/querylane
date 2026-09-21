import { cva } from "class-variance-authority";

const roleTone = cva("", {
  variants: {
    roleKind: {
      builtin: "bg-reference-500/15 text-reference-700 dark:text-reference-400",
      group: "bg-muted text-muted-foreground",
      login: "bg-primary/10 text-primary",
      repl: "bg-permission-500/15 text-permission-700 dark:text-permission-400",
      super: "bg-warning-500/15 text-warning-700 dark:text-warning-400",
    },
  },
});

export { roleTone };
