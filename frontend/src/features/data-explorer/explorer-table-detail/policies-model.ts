import { PAGE_SIZE_OPTIONS, type PageSize } from "@/lib/pagination";
import { formatPolicyCommand } from "@/lib/protobuf-enums";
import type { TablePolicy } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  PolicyCommand,
  PolicyMode,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function policyModeLabel(mode: PolicyMode) {
  switch (mode) {
    case PolicyMode.RESTRICTIVE:
      return "RESTRICTIVE";
    case PolicyMode.PERMISSIVE:
      return "PERMISSIVE";
    default:
      return "UNKNOWN";
  }
}

function policyModeBadgeClassName(mode: PolicyMode) {
  return mode === PolicyMode.RESTRICTIVE
    ? "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "border-transparent bg-muted text-muted-foreground";
}

function policyRoles(policy: TablePolicy) {
  return policy.roles.length > 0 ? policy.roles : ["public"];
}

function formatPolicyRoles(policy: TablePolicy) {
  return policyRoles(policy).join(", ");
}

function collectPolicyRoles(policies: TablePolicy[]) {
  const roles: string[] = [];
  const seen = new Set<string>();
  for (const policy of policies) {
    for (const role of policyRoles(policy)) {
      if (!seen.has(role)) {
        seen.add(role);
        roles.push(role);
      }
    }
  }
  return roles.length > 0 ? roles : ["public"];
}

const POLICY_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
type PolicyPageSize = PageSize;

function isPolicyPageSize(value: number): value is PolicyPageSize {
  return POLICY_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
}

function policyAppliesToRole(policy: TablePolicy, role: string) {
  const roles = policyRoles(policy);
  return roles.includes("public") || roles.includes(role);
}

function policyAppliesToCommand(policy: TablePolicy, command: PolicyCommand) {
  return policy.command === PolicyCommand.ALL || policy.command === command;
}

function policyPredicateForCommand(
  policy: TablePolicy,
  command: PolicyCommand
) {
  const usingExpression = policy.usingExpression.trim();
  const checkExpression = policy.checkExpression.trim();
  switch (command) {
    case PolicyCommand.INSERT:
      return checkExpression || usingExpression || "true";
    case PolicyCommand.UPDATE:
    case PolicyCommand.DELETE:
    case PolicyCommand.SELECT:
      return usingExpression || "true";
    default:
      return usingExpression || checkExpression || "true";
  }
}

function wrapPolicyPredicate(predicate: string) {
  return predicate === "true" ? predicate : `(${predicate})`;
}

function joinPolicyPredicates(predicates: string[], operator: "AND" | "OR") {
  return predicates.map(wrapPolicyPredicate).join(`\n${operator} `);
}

interface RlsPreviewModel {
  appliedPolicies: TablePolicy[];
  hasRows: boolean;
  predicate: string;
  verdict: string;
}

function emptyRlsPreview(
  command: PolicyCommand,
  role: string,
  matchingPolicies: TablePolicy[]
): RlsPreviewModel {
  return {
    appliedPolicies: matchingPolicies,
    hasRows: false,
    predicate: "",
    verdict:
      command === PolicyCommand.INSERT
        ? `No permissive policy applies — RLS rejects every INSERT by ${role}.`
        : `No permissive policy applies — RLS returns zero rows for ${role} running ${formatPolicyCommand(command)}.`,
  };
}

function combineRlsPredicates(
  permissivePolicies: TablePolicy[],
  restrictivePolicies: TablePolicy[],
  command: PolicyCommand
): string {
  const permissivePredicate = joinPolicyPredicates(
    permissivePolicies.map((policy) =>
      policyPredicateForCommand(policy, command)
    ),
    "OR"
  );
  const restrictivePredicates = restrictivePolicies.map((policy) =>
    policyPredicateForCommand(policy, command)
  );
  if (restrictivePredicates.length === 0) {
    return permissivePredicate;
  }
  return [
    permissivePolicies.length === 1
      ? permissivePredicate
      : `(${permissivePredicate})`,
    ...restrictivePredicates.map(wrapPolicyPredicate),
  ].join("\nAND ");
}

function rlsPreviewVerdict({
  command,
  permissiveCount,
  restrictiveCount,
  role,
}: {
  command: PolicyCommand;
  permissiveCount: number;
  restrictiveCount: number;
  role: string;
}): string {
  const permissiveLabel =
    permissiveCount === 1
      ? "1 permissive policy applies"
      : `${permissiveCount.toLocaleString()} permissive policies apply`;
  const rowSubject = command === PolicyCommand.INSERT ? "a new row" : "a row";
  const matchCondition =
    permissiveCount === 1 ? "if it matches" : "if any one matches";
  const restrictiveCopy =
    restrictiveCount > 0
      ? ` ${restrictiveCount.toLocaleString()} restrictive ${
          restrictiveCount === 1 ? "policy" : "policies"
        } must also pass.`
      : "";
  const resultDescription =
    command === PolicyCommand.INSERT
      ? `New rows inserted by ${role} must satisfy:`
      : `Rows visible to ${role} are those where:`;
  return `${permissiveLabel} — ${rowSubject} passes ${matchCondition}.${restrictiveCopy} ${resultDescription}`;
}

function deriveRlsPreview({
  command,
  policies,
  role,
}: {
  command: PolicyCommand;
  policies: TablePolicy[];
  role: string;
}): RlsPreviewModel {
  const matchingPolicies = policies.filter(
    (policy) =>
      policyAppliesToRole(policy, role) &&
      policyAppliesToCommand(policy, command)
  );
  const permissivePolicies = matchingPolicies.filter(
    (policy) => policy.mode !== PolicyMode.RESTRICTIVE
  );
  const restrictivePolicies = matchingPolicies.filter(
    (policy) => policy.mode === PolicyMode.RESTRICTIVE
  );
  if (permissivePolicies.length === 0) {
    return emptyRlsPreview(command, role, matchingPolicies);
  }

  return {
    appliedPolicies: matchingPolicies,
    hasRows: true,
    predicate: combineRlsPredicates(
      permissivePolicies,
      restrictivePolicies,
      command
    ),
    verdict: rlsPreviewVerdict({
      command,
      permissiveCount: permissivePolicies.length,
      restrictiveCount: restrictivePolicies.length,
      role,
    }),
  };
}

export type { PolicyPageSize, RlsPreviewModel };
export {
  collectPolicyRoles,
  deriveRlsPreview,
  formatPolicyRoles,
  isPolicyPageSize,
  POLICY_PAGE_SIZE_OPTIONS,
  policyModeBadgeClassName,
  policyModeLabel,
};
