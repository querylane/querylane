import { formatDialect, postgresql } from "sql-formatter";

/** Pretty-prints SQL with PostgreSQL rules; returns the input when parsing fails. */
function formatSqlText(text: string): { ok: boolean; text: string } {
  try {
    return {
      ok: true,
      text: formatDialect(text, {
        dataTypeCase: "upper",
        dialect: postgresql,
        functionCase: "lower",
        keywordCase: "upper",
        linesBetweenQueries: 2,
      }),
    };
  } catch {
    return { ok: false, text };
  }
}

export { formatSqlText };
