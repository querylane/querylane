package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"buf.build/go/protovalidate"
	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/rs/xid"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// instanceSchema defines the ordering and pagination behaviour for Instance resources.
// The GetValue functions eliminate the need for a manual extractCursorValues switch statement.
var instanceSchema = aipjet.Bind(
	aip.NewSchema[model.Instance](
		"console.querylane.dev/Instance",
		aip.Fields[model.Instance]{
			"display_name": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *model.Instance) any { return m.DisplayName },
			},
			"engine": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *model.Instance) any { return string(m.Engine) },
			},
			"create_time": {
				Codec:    aip.TimestampCodec{},
				GetValue: func(m *model.Instance) any { return m.CreatedAt },
			},
			"id": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *model.Instance) any { return m.ID },
			},
		},
		aip.WithDefaultOrder("display_name", aip.Asc),
		aip.WithTieBreaker("id", aip.Asc),
	),
	aipjet.Columns{
		"display_name": table.Instance.DisplayName,
		"engine":       table.Instance.Engine,
		"create_time":  table.Instance.CreatedAt,
		"id":           table.Instance.ID,
	},
)

// InstanceUpdateValidator runs after a partial update is merged into the locked current row,
// but before that merged instance is persisted.
type InstanceUpdateValidator func(context.Context, *api.Instance) error

// InstanceRepository defines the API for accessing the storage for instance resources.
type InstanceRepository interface {
	CreateInstance(ctx context.Context, instance *api.Instance, instanceID string) (*api.Instance, error)
	ListInstances(ctx context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*api.Instance, string, error)
	GetInstance(ctx context.Context, name string) (*api.Instance, error)
	DeleteInstance(ctx context.Context, name string) error
	UpdateInstance(ctx context.Context, instance *api.Instance, updateMask *fieldmaskpb.FieldMask) (*api.Instance, error)
	UpdateInstanceWithValidation(ctx context.Context, instance *api.Instance, updateMask *fieldmaskpb.FieldMask, validate InstanceUpdateValidator) (*api.Instance, error)
}

// InstanceReader provides read-only access to instance resources.
type InstanceReader interface {
	ListInstances(ctx context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*api.Instance, string, error)
	GetInstance(ctx context.Context, name string) (*api.Instance, error)
}

// PGInstanceRepository is the postgres implementation of the InstanceRepository interface.
type PGInstanceRepository struct {
	db     *sql.DB       // Original database connection
	exec   QueryExecutor // Current executor (either db or transaction)
	mapper instanceMapper
}

// NewInstanceRepository creates a new postgres repository for instance resources.
func NewInstanceRepository(db *sql.DB) (*PGInstanceRepository, error) {
	secrets, err := newSecretCipherFromEnv()
	if errors.Is(err, ErrMissingInstanceSecretKey) {
		err = nil
	}

	if err != nil {
		return nil, err
	}

	return &PGInstanceRepository{
		db:     db,
		exec:   db,
		mapper: instanceMapper{secrets: secrets},
	}, nil
}

// WithTx returns a new repository instance that uses the given transaction.
// This allows tests to use transaction-based isolation.
func (p *PGInstanceRepository) WithTx(tx *sql.Tx) *PGInstanceRepository {
	return &PGInstanceRepository{
		db:     p.db,
		exec:   tx,
		mapper: p.mapper,
	}
}

// CreateInstance creates a new instance resource.
// It accepts an instance proto, converts it to a database model, inserts it with
// INSERT ... RETURNING, and converts the result back to proto format.
// If instanceID is empty, a new unique ID will be generated.
// Returns the created instance with populated server-side fields or an error.
func (p *PGInstanceRepository) CreateInstance(ctx context.Context, instance *api.Instance, instanceID string) (*api.Instance, error) {
	if instance == nil {
		return nil, ErrInvalidInput
	}

	if instanceID == "" {
		instanceID = xid.New().String()
	}

	dbRow, err := p.mapper.protoToStorage(instance, instanceID)
	if err != nil {
		return nil, err
	}

	stmt := table.Instance.
		INSERT(
			table.Instance.ID,
			table.Instance.DisplayName,
			table.Instance.Labels,
			table.Instance.Engine,
			table.Instance.Config,
		).
		MODEL(dbRow).
		RETURNING(table.Instance.AllColumns)

	var created model.Instance
	if err := stmt.QueryContext(ctx, p.exec, &created); err != nil {
		if parseErr := ParsePostgresError(err, ErrAlreadyExists); !errors.Is(parseErr, err) {
			return nil, parseErr
		}

		return nil, fmt.Errorf("failed to create instance: %w", err)
	}

	result, err := p.mapper.storageToProto(created)
	if err != nil {
		return nil, err
	}

	return result, nil
}

// ListInstances returns a paginated list of instances.
// It supports custom ordering and cursor-based pagination.
// The pageSize parameter controls how many instances to return (default: 50 if <= 0).
// The pageToken enables cursor-based pagination for consistent results across requests.
// Filtering is not supported yet; the aip engine rejects a non-empty filter
// with ErrInvalidFilter because the schema declares no Filterable fields.
// Returns the list of instances, next page token (empty if no more pages), and any error.
func (p *PGInstanceRepository) ListInstances(ctx context.Context, pageSize int32, pageToken string, filter string, orderBy string) ([]*api.Instance, string, error) {
	baseQuery := postgres.SELECT(table.Instance.AllColumns).FROM(table.Instance)

	rows, nextToken, err := aipjet.ExecuteWithCondition(ctx, instanceSchema,
		aip.Params{PageSize: pageSize, PageToken: pageToken, Filter: filter, OrderBy: orderBy},
		baseQuery, table.Instance.DeletedAt.IS_NULL(), p.exec)
	if err != nil {
		return nil, "", err
	}

	result := make([]*api.Instance, len(rows))
	for i, instance := range rows {
		result[i], err = p.mapper.storageToProtoForRead(instance)
		if err != nil {
			return nil, "", err
		}
	}

	return result, nextToken, nil
}

// GetInstance retrieves a single instance by its fully qualified resource name.
// The name should follow the format "instances/{instance_id}".
// Returns the instance if found, or ErrNotFound if it doesn't exist or was deleted.
func (p *PGInstanceRepository) GetInstance(ctx context.Context, name string) (*api.Instance, error) {
	instanceID, err := p.mapper.extractIDFromName(name)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
	}

	stmt := postgres.SELECT(table.Instance.AllColumns).FROM(table.Instance).
		WHERE(
			table.Instance.ID.EQ(postgres.String(instanceID)).
				AND(table.Instance.DeletedAt.IS_NULL()),
		)

	var storedInstance model.Instance
	if err := stmt.QueryContext(ctx, p.exec, &storedInstance); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("failed to get instance: %w", err)
	}

	result, err := p.mapper.storageToProtoForRead(storedInstance)
	if err != nil {
		return nil, err
	}

	return result, nil
}

// DeleteInstance performs a soft delete of an instance by its fully qualified resource name.
// The name should follow the format "instances/{instance_id}".
// This operation sets the deleted_at timestamp rather than physically removing the record.
// Returns ErrNotFound if the instance doesn't exist or was already deleted.
func (p *PGInstanceRepository) DeleteInstance(ctx context.Context, name string) error {
	instanceID, err := p.mapper.extractIDFromName(name)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrInvalidInput, err)
	}

	stmt := table.Instance.UPDATE(table.Instance.DeletedAt).
		SET(time.Now()).
		WHERE(
			table.Instance.ID.EQ(postgres.String(instanceID)).
				AND(table.Instance.DeletedAt.IS_NULL()),
		)

	res, err := stmt.ExecContext(ctx, p.exec)
	if err != nil {
		return fmt.Errorf("failed to delete instance: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected on instance delete: %w", err)
	}

	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

// UpdateInstance updates specific fields of an instance based on the provided update mask.
func (p *PGInstanceRepository) UpdateInstance(ctx context.Context, reqInstance *api.Instance, mask *fieldmaskpb.FieldMask) (*api.Instance, error) {
	return p.UpdateInstanceWithValidation(ctx, reqInstance, mask, nil)
}

// UpdateInstanceWithValidation updates specific fields of an instance based on the provided update mask.
// The optional validator runs in the same transaction after the row lock and merge, before persistence.
func (p *PGInstanceRepository) UpdateInstanceWithValidation(ctx context.Context, reqInstance *api.Instance, mask *fieldmaskpb.FieldMask, validate InstanceUpdateValidator) (*api.Instance, error) {
	if reqInstance == nil || mask == nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidInput, errors.New("instance or fieldmask is missing in update request"))
	}

	validPaths, err := p.filterUpdateMask(mask)
	if err != nil {
		return nil, err
	}

	// AIP-134: If the mask resulted in no changes (e.g. user only tried to update 'create_time'), return current state.
	if len(validPaths) == 0 {
		return p.GetInstance(ctx, reqInstance.GetName())
	}

	instanceID, err := p.mapper.extractIDFromName(reqInstance.GetName())
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidInput, err)
	}

	tx, ownsTx, err := p.updateTx(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	if ownsTx {
		defer tx.Rollback() //nolint:errcheck // Rollback after commit is a no-op
	}

	stmt := postgres.SELECT(table.Instance.AllColumns).FROM(table.Instance).
		WHERE(
			table.Instance.ID.EQ(postgres.String(instanceID)).
				AND(table.Instance.DeletedAt.IS_NULL()),
		).
		FOR(postgres.UPDATE())

	var currentModel model.Instance
	if err := stmt.QueryContext(ctx, tx, &currentModel); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("failed to fetch current instance for update: %w", err)
	}

	currentProto, err := p.mapper.storageToProto(currentModel)
	if err != nil {
		credentialReplacement := slices.Contains(validPaths, "config") ||
			slices.Contains(validPaths, "config.password")
		if !errors.Is(err, ErrUnreadableInstanceCredentials) || !credentialReplacement {
			return nil, err
		}

		currentProto, err = p.mapper.storageToProtoForRead(currentModel)
		if err != nil {
			return nil, err
		}
	}

	patch, ok := proto.Clone(reqInstance).(*api.Instance)
	if !ok {
		return nil, fmt.Errorf("%w: cloned instance has unexpected type", ErrInvalidInput)
	}

	mergeInstanceUpdatePatch(currentProto, patch, validPaths)

	// The request interceptor skips deep Instance validation on partial update
	// payloads, so validate the merged full resource before persisting.
	if err := protovalidate.Validate(currentProto); err != nil {
		return nil, fmt.Errorf("%w: merged instance failed validation: %w", ErrInvalidInput, err)
	}

	if validate != nil {
		if err := validate(ctx, currentProto); err != nil {
			return nil, err
		}
	}

	updatedModel, err := p.mapper.protoToStorage(currentProto, instanceID)
	if err != nil {
		return nil, err
	}

	updateStmt := table.Instance.
		UPDATE(
			table.Instance.DisplayName,
			table.Instance.Labels,
			table.Instance.Config,
			table.Instance.UpdatedAt,
		).
		MODEL(updatedModel).
		WHERE(
			table.Instance.ID.EQ(postgres.String(instanceID)).
				AND(table.Instance.DeletedAt.IS_NULL()),
		).
		RETURNING(table.Instance.AllColumns)

	var resultModel model.Instance
	if err := updateStmt.QueryContext(ctx, tx, &resultModel); err != nil {
		return nil, fmt.Errorf("failed to update instance in db: %w", err)
	}

	if ownsTx {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("failed to commit update transaction: %w", err)
		}
	}

	result, err := p.mapper.storageToProto(resultModel)
	if err != nil {
		return nil, err
	}

	return result, nil
}

// updateTx returns the transaction to run an update in. When the repository
// was wrapped via WithTx the caller's transaction is reused and commit and
// rollback stay under the caller's control; otherwise a new transaction is
// started and owned by the update.
func (p *PGInstanceRepository) updateTx(ctx context.Context) (*sql.Tx, bool, error) {
	if tx, ok := p.exec.(*sql.Tx); ok {
		return tx, false, nil
	}

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}

	return tx, true, nil
}

// mergeInstanceUpdatePatch applies AIP-134 replace semantics: every masked
// field on currentProto is overwritten with the value from patch, and cleared
// when patch leaves it unset. Sub-messages of patch may end up aliased into
// currentProto, so callers must pass a patch they no longer mutate.
//
// One deliberate exception: API responses redact config.password to "" and
// clients round-trip that value back on update, so an empty inline password
// always means "keep the stored password", never "clear it".
func mergeInstanceUpdatePatch(currentProto *api.Instance, patch *api.Instance, validPaths []string) {
	configTouched := updateMaskTouchesRoot(validPaths, "config")
	storedPassword := currentProto.GetConfig().GetPassword()

	for _, path := range validPaths {
		replaceFieldPath(currentProto.ProtoReflect(), patch.ProtoReflect(), strings.Split(path, "."))
	}

	if configTouched && currentProto.GetConfig() != nil && currentProto.GetConfig().GetPassword() == "" {
		currentProto.Config.Password = storedPassword
	}
}

// replaceFieldPath replaces a single update-mask path on current with the
// value from patch, descending into sub-messages for nested paths. Unknown
// segments are ignored because filterUpdateMask already rejected unsupported
// paths.
func replaceFieldPath(current, patch protoreflect.Message, segments []string) {
	field := current.Descriptor().Fields().ByName(protoreflect.Name(segments[0]))
	if field == nil {
		return
	}

	if len(segments) == 1 {
		if patch.Has(field) {
			current.Set(field, patch.Get(field))
		} else {
			current.Clear(field)
		}

		return
	}

	if field.IsMap() || field.IsList() || field.Message() == nil {
		return
	}

	replaceFieldPath(current.Mutable(field).Message(), patch.Get(field).Message(), segments[1:])
}

func updateMaskTouchesRoot(paths []string, root string) bool {
	for _, path := range paths {
		pathRoot, _, _ := strings.Cut(path, ".")
		if pathRoot == root {
			return true
		}
	}

	return false
}

// filterUpdateMask cleans the client-provided mask according to AIP-134 and AIP-161.
// 1. It ignores immutable/output-only fields (does not error, just skips them).
// 2. It errors if the client tries to update a field we don't support yet.
// 3. It returns a "clean" list of paths that are safe to apply.
func (p *PGInstanceRepository) filterUpdateMask(mask *fieldmaskpb.FieldMask) ([]string, error) {
	if mask == nil || len(mask.Paths) == 0 {
		return nil, nil
	}

	var validPaths []string

	seen := make(map[string]struct{})

	for _, path := range mask.GetPaths() {
		if _, exists := seen[path]; exists {
			continue
		}

		seen[path] = struct{}{}

		root, _, _ := strings.Cut(path, ".")

		switch root {
		// Mutable fields (allow-list)
		case "display_name", "config":
			validPaths = append(validPaths, path)
		case "labels":
			if path != "labels" {
				return nil, fmt.Errorf("%w: field path %q is not supported for updates", ErrInvalidInput, path)
			}

			validPaths = append(validPaths, path)

		// Immutable or output only fields (ignore silently)
		// AIP-161 says we should NOT fail if these are present, just ignore them.
		case "name", "id", "engine", "create_time", "update_time",
			"connection_state", "connection_error", "credential_state", "credential_error", "engine_version",
			"last_connection_check_time":
			continue

		// Unknown or unsupported fields
		// If they try to update "internal_flags" or "future_field", fail hard.
		default:
			return nil, fmt.Errorf("%w: field path %q is not supported for updates", ErrInvalidInput, path)
		}
	}

	return validPaths, nil
}
