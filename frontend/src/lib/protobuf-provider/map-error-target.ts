import type { DescMessage } from "@bufbuild/protobuf";

interface FormErrorMessage {
  criterion?: string;
  message: string;
}

// Keep map keys in criteria, never in RHF paths: valid keys can contain dots,
// or names such as "constructor" that RHF deliberately refuses to assign.
function mapEntryCriteriaPrefix(key: readonly (string | number)[]): string {
  return `map:${JSON.stringify(key)}:`;
}

function formErrorTarget(schema: DescMessage, path: readonly (string | number)[]) {
  const [head, ...key] = path;
  const isMapEntry = key.length > 0 && schema.fields.some((field) => field.localName === head && field.fieldKind === "map");
  return isMapEntry
    ? { criterion: mapEntryCriteriaPrefix(key), path: String(head) }
    : { criterion: "", path: path.join(".") };
}

export type { FormErrorMessage };
export { formErrorTarget, mapEntryCriteriaPrefix };
