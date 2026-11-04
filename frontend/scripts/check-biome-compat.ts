import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { argv, exit } from "node:process";

// Biome 2.6.5 accepts these configured errors but omits them from its normal
// enabled-rule set (biome rage --linter). Explicit selectors run them correctly.
// Keep this supplemental pass until upstream restores normal rule selection.
const rules = [
  "noAccidentalBitwiseOperators",
  "noArgumentsCallerOrCallee",
  "noArraySortForMinMax",
  "noAstroConflictingSetDirectives",
  "noAstroSetHtmlDirective",
  "noAwaitInPromiseMethods",
  "noBooleanSortComparator",
  "noBunModules",
  "noChainedComparison",
  "noConsoleSpaces",
  "useWhileLoopCondition",
];
const args = argv.slice(2);
const result = spawnSync(
  join(import.meta.dirname, "../node_modules/.bin/biome"),
  [
    "lint",
    ...rules.map((rule) => `--only=nursery/${rule}`),
    ...(args.length > 0 ? args : ["."]),
  ],
  { cwd: join(import.meta.dirname, ".."), stdio: "inherit" }
);
if (result.error) {
  throw result.error;
}
exit(result.status ?? 1);
