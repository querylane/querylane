import {
  AddressSchema,
  AutoFormExampleSchema,
  AutoFormUiMetadataExampleSchema,
  GeoPointSchema,
  NestedSettingSchema,
  ProfileSettingsSchema,
} from "./gen/auto-form-example_pb.js";
import { type ProtoAnnotations, registerProtoAnnotations } from "./index.js";

export const autoFormExampleAnnotations = {
  fields: {
    "protoform.v1.AutoFormExample.avatarBytes":
      "Optional avatar payload for attachment-based workflows.",
    "protoform.v1.AutoFormExample.bio":
      "Free-form summary shown on the profile card.",
    "protoform.v1.AutoFormExample.createdAt":
      "Timestamp captured when the record was created.",
    "protoform.v1.AutoFormExample.dashboardBlocks":
      "Ordered dashboard widgets stored as a dynamic list.",
    "protoform.v1.AutoFormExample.doNotContact":
      "Opt out of direct outreach entirely.",
    "protoform.v1.AutoFormExample.externalPayload":
      "External Any payload kept intentionally loose for edge-case coverage.",
    "protoform.v1.AutoFormExample.featuredValue":
      "Generic featured value for experiments and demos.",
    "protoform.v1.AutoFormExample.homepageUrl":
      "Optional personal or team homepage.",
    "protoform.v1.AutoFormExample.labels":
      "Flat metadata pairs for analytics and routing.",
    "protoform.v1.AutoFormExample.officeLocations":
      "Named office addresses keyed by a short slug.",
    "protoform.v1.AutoFormExample.preferences":
      "Arbitrary preference flags stored as a JSON-ish struct.",
    "protoform.v1.AutoFormExample.preferredEmail":
      "Route updates to an email inbox.",
    "protoform.v1.AutoFormExample.preferredPhone":
      "Route urgent notices to an E.164 phone number.",
    "protoform.v1.AutoFormExample.primaryEmail":
      "Main email address for notifications and login recovery.",
    "protoform.v1.AutoFormExample.reminderInterval":
      "Delay between reminder notifications.",
    "protoform.v1.AutoFormExample.resourceId":
      "UUID copied from an upstream system.",
    "protoform.v1.AutoFormExample.settings":
      "Nested support settings with their own CEL validation rule.",
    "protoform.v1.AutoFormExample.shippingAddress":
      "Shipping destination used for hardware deliveries.",
    "protoform.v1.AutoFormExample.tags":
      "Lightweight labels used for quick filtering.",
    "protoform.v1.AutoFormExample.username":
      "Public handle shown in mentions and admin lists.",
    "protoform.v1.AutoFormExample.writablePaths":
      "Fields the current actor is allowed to update.",
    "protoform.v1.AutoFormUiMetadataExample.apiToken":
      "API token for authenticating with the deployment service.",
    "protoform.v1.AutoFormUiMetadataExample.approvalTicket":
      "Approval or change-management ticket for the deployment.",
    "protoform.v1.AutoFormUiMetadataExample.clusterName":
      "Friendly cluster name shown in rollout summaries.",
    "protoform.v1.AutoFormUiMetadataExample.enableDryRun":
      "Keep a final dry-run toggle in the deploy step.",
    "protoform.v1.AutoFormUiMetadataExample.enableSupportMode":
      "Toggle the conditional support step on or off.",
    "protoform.v1.AutoFormUiMetadataExample.escalationReason":
      "Extra context only needed for platinum support requests.",
    "protoform.v1.AutoFormUiMetadataExample.maintenanceWindow":
      "Requested maintenance window for premium support coordination.",
    "protoform.v1.AutoFormUiMetadataExample.noFollowUp":
      "Explicitly avoid any follow-up contact.",
    "protoform.v1.AutoFormUiMetadataExample.provider":
      "Cloud provider where the request will be deployed.",
    "protoform.v1.AutoFormUiMetadataExample.region":
      "Region where the cluster will be created.",
    "protoform.v1.AutoFormUiMetadataExample.slackChannel":
      "Route follow-up through a Slack channel.",
    "protoform.v1.AutoFormUiMetadataExample.supportEmail":
      "Route follow-up through an email inbox.",
    "protoform.v1.AutoFormUiMetadataExample.supportTier":
      "Requested support tier for the deployment.",
  },
  messages: {
    "protoform.v1.Address":
      "Postal address used by several nested object fields and maps.",
    "protoform.v1.AutoFormExample":
      "Primary protobuf fixture for AutoForm. It intentionally mixes scalar, nested,\nrepeated, map, oneof, and well-known types so the form generator can exercise\nthe sketchier corners of descriptor-driven rendering.",
    "protoform.v1.AutoFormUiMetadataExample":
      "Focused protobuf fixture for proto UI metadata and UI CEL demos.",
    "protoform.v1.GeoPoint":
      "Latitude/longitude pair used by the nested Address message.",
    "protoform.v1.NestedSetting":
      "Small nested settings entry used inside a protobuf map.",
    "protoform.v1.ProfileSettings":
      "Support workflow settings nested under the main example message.",
  },
  oneofs: {
    "protoform.v1.AutoFormExample.preferredContact":
      "Exactly one preferred contact route can be selected at a time.",
    "protoform.v1.AutoFormUiMetadataExample.supportContact":
      "Pick exactly one support contact route once premium support is active.",
  },
} satisfies ProtoAnnotations;

for (const schema of [
  AddressSchema,
  AutoFormExampleSchema,
  AutoFormUiMetadataExampleSchema,
  GeoPointSchema,
  NestedSettingSchema,
  ProfileSettingsSchema,
]) {
  registerProtoAnnotations(schema, autoFormExampleAnnotations);
}
