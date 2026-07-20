const HIDDEN_CONNECT_HEADERS = new Set([
	"connect-protocol-version",
	"connect-timeout-ms",
]);

export const visibleOperationParameters = <
	T extends { in?: string; name?: string },
>(
	parameters: T[],
): T[] =>
	parameters.filter(
		(parameter) =>
			parameter.in !== "header" ||
			!HIDDEN_CONNECT_HEADERS.has(parameter.name?.toLowerCase() ?? ""),
	);
