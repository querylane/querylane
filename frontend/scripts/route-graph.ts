import {
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedImports,
  isPropertySignatureDeclaration,
  isStringLiteral,
  isTypeLiteralNode,
  isTypeQueryNode,
  type Node,
  type SourceFile,
  type TypeElement,
  type TypeLiteralNode,
} from "typescript/ast";
import { API } from "typescript/async";
import type { RouteDefinition } from "./route-byte-inventory";

const RELATIVE_PREFIX = /^\.\//u;
function routeImports(file: SourceFile) {
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (
      !(
        isImportDeclaration(statement) &&
        isStringLiteral(statement.moduleSpecifier)
      )
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!(bindings && isNamedImports(bindings))) {
      continue;
    }
    for (const element of bindings.elements) {
      imports.set(
        element.name.text,
        `${statement.moduleSpecifier.text.replace(RELATIVE_PREFIX, "src/")}.tsx`
      );
    }
  }
  return imports;
}
function sourceReference(type: TypeLiteralNode) {
  const loader = type.members.find(
    (property) =>
      isPropertySignatureDeclaration(property) &&
      isIdentifier(property.name) &&
      property.name.text === "preLoaderRoute"
  );
  if (
    !(
      loader &&
      isPropertySignatureDeclaration(loader) &&
      isTypeQueryNode(loader.type) &&
      isIdentifier(loader.type.exprName)
    )
  ) {
    throw new Error("Missing generated route source");
  }
  return loader.type.exprName.text;
}
function routeDefinition(
  member: TypeElement,
  imports: Map<string, string>
): RouteDefinition {
  if (
    !(
      isPropertySignatureDeclaration(member) &&
      isStringLiteral(member.name) &&
      isTypeLiteralNode(member.type)
    )
  ) {
    throw new Error("Invalid generated route entry");
  }
  const source = imports.get(sourceReference(member.type));
  if (source === undefined) {
    throw new Error(`Missing route import: ${member.name.text}`);
  }
  return { id: member.name.text, source };
}
function routesFromSource(file: SourceFile) {
  const imports = routeImports(file);
  const routes: RouteDefinition[] = [];
  function visit(node: Node) {
    if (isInterfaceDeclaration(node) && node.name.text === "FileRoutesByPath") {
      routes.push(
        ...node.members.map((member) => routeDefinition(member, imports))
      );
    }
    node.forEachChild(visit);
  }
  visit(file);
  if (routes.length === 0) {
    throw new Error("Missing installed generated route graph");
  }
  return routes.toSorted((a, b) => a.id.localeCompare(b.id));
}
// Parse the installed generator's emitted graph as data; never import/execute
// application route modules (including when comparing downloaded artifacts).
async function readGeneratedRoutes(text: string): Promise<RouteDefinition[]> {
  const api = new API();
  try {
    const lease = await api.createSourceFile("/routeTree.gen.ts", text);
    try {
      return routesFromSource(lease.sourceFile);
    } finally {
      await lease.dispose();
    }
  } finally {
    await api.close();
  }
}

export { readGeneratedRoutes };
