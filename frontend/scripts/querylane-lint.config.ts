import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Extract<Parameters<RuleTester["run"]>[1], { create: unknown }>;
type Context = Parameters<Rule["create"]>[0];
type Node = Parameters<Context["sourceCode"]["getScope"]>[0];
const memoNames = new Set(["memo", "useMemo", "useCallback"]);

function propertyName(node: Node): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function accessedName(node: Node, computed: boolean): string | undefined {
  return computed && node.type !== "Literal" ? undefined : propertyName(node);
}

function isMemoAccess(node: Node, computed: boolean): boolean {
  const name = accessedName(node, computed);
  return (computed && name === undefined) || memoNames.has(name ?? "");
}

function namespaceDefinition(
  node: Node,
  context: Context,
  seen: Set<Node>
): boolean {
  if (node.type !== "Identifier") {
    return false;
  }
  let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
    context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) {
      return variable.defs.some((definition) => {
        const declaration = definition.parent;
        if (definition.type === "ImportBinding") {
          return (
            declaration?.type === "ImportDeclaration" &&
            declaration.source.value === "react" &&
            (definition.node.type === "ImportDefaultSpecifier" ||
              definition.node.type === "ImportNamespaceSpecifier")
          );
        }
        return (
          definition.node.type === "VariableDeclarator" &&
          definition.node.init !== null &&
          isReactNamespace(definition.node.init, context, seen)
        );
      });
    }
    scope = scope.upper;
  }
  return false;
}

function isReactNamespace(
  node: Node,
  context: Context,
  seen = new Set<Node>()
): boolean {
  let current = node;
  while (current.type === "AwaitExpression") {
    current = current.argument;
  }
  if (seen.has(current)) {
    return false;
  }
  seen.add(current);
  if (current.type === "ImportExpression") {
    return (
      current.source.type === "Literal" && current.source.value === "react"
    );
  }
  return namespaceDefinition(current, context, seen);
}

const noManualMemoization: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Let React Compiler own memoization, without banning namespace-based test mocks.",
    },
    schema: [],
    messages: {
      compiler:
        "React Compiler owns memoization; do not import or access memo, useMemo, or useCallback.",
    },
  },
  create(context) {
    return {
      ImportDeclaration: (node) => {
        if (node.source.value !== "react" || node.importKind === "type") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.importKind !== "type" &&
            memoNames.has(propertyName(specifier.imported) ?? "")
          ) {
            context.report({ node: specifier, messageId: "compiler" });
          }
        }
      },
      MemberExpression: (node) => {
        if (!isReactNamespace(node.object, context)) {
          return;
        }
        if (isMemoAccess(node.property, node.computed)) {
          context.report({ node, messageId: "compiler" });
        }
      },
      VariableDeclarator: (node) => {
        if (
          node.id.type !== "ObjectPattern" ||
          node.init === null ||
          !isReactNamespace(node.init, context)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          if (
            property.type === "Property" &&
            isMemoAccess(property.key, property.computed)
          ) {
            context.report({ node: property, messageId: "compiler" });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "querylane" },
  rules: { "no-manual-memoization": noManualMemoization },
};
