package storage

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// configInstanceSchema is deliberately left unbound to any SQL backend: this
// repository lists an in-memory slice of config-defined instances, using only
// aip.BuildPlan for token/order_by validation and schema.NextPageToken for
// cursor encoding — no SQL is ever compiled from it.
var configInstanceSchema = aip.NewSchema[*api.Instance](
	"console.querylane.dev/Instance",
	aip.Fields[*api.Instance]{
		"display_name": {
			Codec:    aip.StringCodec{},
			GetValue: func(inst **api.Instance) any { return (*inst).GetDisplayName() },
		},
		"create_time": {
			Codec:    aip.TimestampCodec{},
			GetValue: func(inst **api.Instance) any { return (*inst).GetCreateTime().AsTime() },
		},
		"id": {
			Codec: aip.StringCodec{},
			GetValue: func(inst **api.Instance) any {
				id, _ := extractInstanceIDFromName((*inst).GetName())
				return id
			},
		},
	},
	aip.WithDefaultOrder("display_name", aip.Asc),
	aip.WithTieBreaker("id", aip.Asc),
)

// ConfigInstanceRepository implements InstanceRepository by reading instances
// from the server configuration file. Mutation operations return ErrConfigManaged.
// Connection state is tracked in memory and re-synced by catalog on demand.
type ConfigInstanceRepository struct {
	// instances holds the pre-built protos keyed by instance ID.
	instances map[string]*api.Instance
	// ordered holds instance IDs sorted by display_name for stable listing.
	ordered []string
}

// NewConfigInstanceRepository creates a repository backed by config-defined instances.
// Each InstanceConfig is converted to a proto once at construction time.
func NewConfigInstanceRepository(configs []*serverconfig.InstanceConfig) *ConfigInstanceRepository {
	now := timestamppb.Now()
	instances := make(map[string]*api.Instance, len(configs))

	for _, cfg := range configs {
		instances[cfg.ID] = configToProto(cfg.ID, cfg, now)
	}

	// Sort by display_name, then ID as tiebreaker (matches PGInstanceRepository default order).
	type entry struct {
		id          string
		displayName string
	}

	entries := make([]entry, 0, len(instances))
	for id, inst := range instances {
		entries = append(entries, entry{id: id, displayName: inst.GetDisplayName()})
	}

	slices.SortFunc(entries, func(a, b entry) int {
		if c := strings.Compare(a.displayName, b.displayName); c != 0 {
			return c
		}

		return strings.Compare(a.id, b.id)
	})

	ordered := make([]string, len(entries))
	for i, e := range entries {
		ordered[i] = e.id
	}

	return &ConfigInstanceRepository{
		instances: instances,
		ordered:   ordered,
	}
}

// GetInstance returns the config-defined instance by resource name.
// Returns a deep clone to prevent callers from mutating cached state.
func (r *ConfigInstanceRepository) GetInstance(_ context.Context, name string) (*api.Instance, error) {
	id, err := extractInstanceIDFromName(name)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
	}

	inst, ok := r.instances[id]
	if !ok {
		return nil, ErrNotFound
	}

	clone, _ := proto.Clone(inst).(*api.Instance)

	return clone, nil
}

// ListInstances returns config-defined instances with the same AIP-132
// pagination, token validation, and order_by semantics as PGInstanceRepository.
// Filtering is not supported by either instance repository yet; the aip engine
// rejects a non-empty filter with ErrInvalidFilter because the schema declares
// no Filterable fields.
func (r *ConfigInstanceRepository) ListInstances(_ context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*api.Instance, string, error) {
	plan, err := aip.BuildPlan(configInstanceSchema, aip.Params{
		PageSize:  pageSize,
		PageToken: pageToken,
		Filter:    filter,
		OrderBy:   orderBy,
	})
	if err != nil {
		return nil, "", err
	}

	ordered := make([]*api.Instance, 0, len(r.ordered))
	for _, id := range r.ordered {
		clone, _ := proto.Clone(r.instances[id]).(*api.Instance)
		ordered = append(ordered, clone)
	}

	slices.SortFunc(ordered, func(a, b *api.Instance) int {
		return compareConfigInstances(a, b, plan.OrderBy)
	})

	if len(plan.CursorValues) > 0 {
		ordered = orderedAfterCursor(ordered, plan)
	}

	nextToken, err := configInstanceSchema.NextPageToken(plan, ordered)
	if err != nil {
		return nil, "", err
	}

	if nextToken == "" {
		return ordered, "", nil
	}

	return ordered[:plan.PageSize], nextToken, nil
}

func compareConfigInstances(a, b *api.Instance, orderBy aip.OrderBy) int {
	for _, field := range orderBy.Fields {
		cmp := compareConfigValue(configInstanceFieldValue(a, field.Path), configInstanceFieldValue(b, field.Path))
		if cmp == 0 {
			continue
		}

		if field.Direction == aip.Desc {
			return -cmp
		}

		return cmp
	}

	return 0
}

func orderedAfterCursor(instances []*api.Instance, plan *aip.Plan) []*api.Instance {
	for i, inst := range instances {
		if compareInstanceToCursor(inst, plan.OrderBy, plan.CursorValues) > 0 {
			return instances[i:]
		}
	}

	return nil
}

func compareInstanceToCursor(inst *api.Instance, orderBy aip.OrderBy, cursor []any) int {
	for i, field := range orderBy.Fields {
		cmp := compareConfigValue(configInstanceFieldValue(inst, field.Path), cursor[i])
		if cmp == 0 {
			continue
		}

		if field.Direction == aip.Desc {
			return -cmp
		}

		return cmp
	}

	return 0
}

func compareConfigValue(a, b any) int {
	switch av := a.(type) {
	case string:
		bv, ok := b.(string)
		if !ok {
			return 0
		}

		return strings.Compare(av, bv)
	case time.Time:
		bv, ok := b.(time.Time)
		if !ok {
			return 0
		}

		if av.Before(bv) {
			return -1
		}

		if av.After(bv) {
			return 1
		}

		return 0
	default:
		return 0
	}
}

func configInstanceFieldValue(inst *api.Instance, field string) any {
	switch field {
	case "display_name":
		return inst.GetDisplayName()
	case "create_time":
		return inst.GetCreateTime().AsTime()
	case "id":
		id, _ := extractInstanceIDFromName(inst.GetName())
		return id
	default:
		return ""
	}
}

// CreateInstance is not supported for config-managed instances.
func (r *ConfigInstanceRepository) CreateInstance(context.Context, *api.Instance, string) (*api.Instance, error) {
	return nil, ErrConfigManaged
}

// UpdateInstance is not supported for config-managed instances.
func (r *ConfigInstanceRepository) UpdateInstance(context.Context, *api.Instance, *fieldmaskpb.FieldMask) (*api.Instance, error) {
	return nil, ErrConfigManaged
}

// UpdateInstanceWithValidation is not supported for config-managed instances.
func (r *ConfigInstanceRepository) UpdateInstanceWithValidation(context.Context, *api.Instance, *fieldmaskpb.FieldMask, InstanceUpdateValidator) (*api.Instance, error) {
	return nil, ErrConfigManaged
}

// DeleteInstance is not supported for config-managed instances.
func (r *ConfigInstanceRepository) DeleteInstance(context.Context, string) error {
	return ErrConfigManaged
}

// configToProto converts an InstanceConfig to the proto representation.
func configToProto(id string, cfg *serverconfig.InstanceConfig, now *timestamppb.Timestamp) *api.Instance {
	return &api.Instance{
		Name:        "instances/" + id,
		DisplayName: cfg.DisplayName,
		Labels:      cfg.Labels,
		Config: &api.PostgresConfig{
			Host:           cfg.EffectiveHost(),
			Port:           int32(cfg.EffectivePort()), //nolint:gosec // G115: Port is validated 1-65535 by InstanceConfig.Validate
			Database:       cfg.EffectiveDatabase(),
			Username:       cfg.EffectiveUsername(),
			Password:       cfg.EffectivePassword(),
			SslMode:        sslModeStringToProto(cfg.EffectiveSSLMode()),
			SslNegotiation: sslNegotiationStringToProto(cfg.EffectiveSSLNegotiation()),
		},
		CreateTime: now,
		UpdateTime: now,
	}
}

// sslModeStringToProto converts a config SSL mode string to its proto enum.
// This is a local copy because service/internal/pgconv is not importable from storage.
func sslModeStringToProto(sslMode string) api.PostgresConfig_SslMode {
	switch sslMode {
	case "disable":
		return api.PostgresConfig_SSL_MODE_DISABLED
	case "allow":
		return api.PostgresConfig_SSL_MODE_ALLOW
	case "prefer":
		return api.PostgresConfig_SSL_MODE_PREFER
	case "require":
		return api.PostgresConfig_SSL_MODE_REQUIRE
	case "verify-ca":
		return api.PostgresConfig_SSL_MODE_VERIFY_CA
	case "verify-full":
		return api.PostgresConfig_SSL_MODE_VERIFY_FULL
	default:
		return api.PostgresConfig_SSL_MODE_UNSPECIFIED
	}
}

func sslNegotiationStringToProto(sslNegotiation string) api.PostgresConfig_SslNegotiation {
	switch sslNegotiation {
	case "postgres":
		return api.PostgresConfig_SSL_NEGOTIATION_POSTGRES
	case "direct":
		return api.PostgresConfig_SSL_NEGOTIATION_DIRECT
	default:
		return api.PostgresConfig_SSL_NEGOTIATION_UNSPECIFIED
	}
}

// Compile-time check.
var _ InstanceRepository = (*ConfigInstanceRepository)(nil)
