package storage

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/types"
)

const unreadableStorageMessage = "Stored credentials cannot be read. Re-enter the password to restore access."

// instanceMapper handles conversion between storage and protobuf types for instances.
type instanceMapper struct {
	secrets    *secretCipher
	secretsErr error
}

func (m instanceMapper) storageToProto(inst model.Instance) (*api.Instance, error) {
	// Map storage model to proto WITHOUT redaction.
	// Redaction is a presentation concern and should happen at the service layer.
	// We clone the config to avoid sharing pointers with the database model,
	// which can cause issues with proto.Merge during updates.
	var config *api.PostgresConfig
	if inst.Config.V != nil {
		config, _ = proto.Clone(inst.Config.V).(*api.PostgresConfig)
		if config != nil {
			if err := m.decryptConfigSecrets(config); err != nil {
				return newInstanceProto(inst, config), err
			}
		}
	}

	return newInstanceProto(inst, config), nil
}

func (m instanceMapper) storageToProtoForRead(inst model.Instance) (*api.Instance, error) {
	instance, err := m.storageToProto(inst)
	if err == nil {
		return instance, nil
	}

	if !errors.Is(err, ErrUnreadableInstanceCredentials) {
		return nil, err
	}

	RedactInstanceForAPI(instance)
	instance.CredentialState = api.Instance_CREDENTIAL_STATE_UNREADABLE
	instance.CredentialError = unreadableStorageMessage

	return instance, nil
}

func newInstanceProto(inst model.Instance, config *api.PostgresConfig) *api.Instance {
	// ConnectionState / ConnectionError / LastConnectionCheckTime are populated
	// by OverlayInstanceReader from instance_runtime_state, the single authority.
	instance := &api.Instance{
		Name:        "instances/" + inst.ID,
		DisplayName: inst.DisplayName,
		Labels:      inst.Labels.ToMap(),
		Config:      config,
	}

	instance.CreateTime = timestamppb.New(inst.CreatedAt)
	instance.UpdateTime = timestamppb.New(inst.UpdatedAt)

	return instance
}

func (m instanceMapper) protoToStorage(instance *api.Instance, instanceID string) (model.Instance, error) {
	now := time.Now()

	config, _ := proto.Clone(instance.GetConfig()).(*api.PostgresConfig)
	if config != nil {
		if err := m.encryptConfigSecrets(config); err != nil {
			return model.Instance{}, err
		}
	}

	return model.Instance{
		ID:          instanceID,
		DisplayName: instance.GetDisplayName(),
		Labels:      types.FromMap(instance.GetLabels()),
		Engine:      model.DatabaseEngine_DatabaseEnginePostgresql,
		Config:      types.EngineConfigJSON{V: config},
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
	}, nil
}

func (m instanceMapper) decryptConfigSecrets(config *api.PostgresConfig) error {
	password, err := m.decryptSecret(config.GetPassword())
	if err != nil {
		return err
	}

	config.Password = password

	if source := config.GetPasswordSource(); source != nil {
		if inline := source.GetInline(); inline != "" {
			decrypted, err := m.decryptSecret(inline)
			if err != nil {
				return err
			}

			config.PasswordSource = &api.SecretSource{Source: &api.SecretSource_Inline{Inline: decrypted}}
		}
	}

	return nil
}

func (m instanceMapper) encryptConfigSecrets(config *api.PostgresConfig) error {
	if password := config.GetPassword(); password != "" {
		encrypted, err := m.encryptSecret(password)
		if err != nil {
			return err
		}

		config.Password = encrypted
	}

	if source := config.GetPasswordSource(); source != nil {
		if inline := source.GetInline(); inline != "" {
			encrypted, err := m.encryptSecret(inline)
			if err != nil {
				return err
			}

			config.PasswordSource = &api.SecretSource{Source: &api.SecretSource_Inline{Inline: encrypted}}
		}
	}

	return nil
}

func (m instanceMapper) encryptSecret(value string) (string, error) {
	if value == "" {
		return value, nil
	}

	if m.secretsErr != nil {
		return "", m.secretsErr
	}

	return m.secrets.encrypt(value)
}

func (m instanceMapper) decryptSecret(value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, encryptedSecretPrefix) {
		return value, nil
	}

	if m.secretsErr != nil {
		return "", m.secretsErr
	}

	decrypted, err := m.secrets.decrypt(value)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrUnreadableInstanceCredentials, err)
	}

	return decrypted, nil
}

func (m instanceMapper) extractIDFromName(name string) (string, error) {
	return extractInstanceIDFromName(name)
}

// extractInstanceIDFromName parses an instance ID from a resource name like "instances/{id}".
func extractInstanceIDFromName(name string) (string, error) {
	parts := strings.Split(name, "/")
	if len(parts) != 2 || parts[0] != "instances" {
		return "", fmt.Errorf("invalid instance name format: %s", name)
	}

	return parts[1], nil
}

// connectionStateFromStorage converts storage connection state enum to protobuf enum.
func connectionStateFromStorage(state model.ConnectionState) api.Instance_ConnectionState {
	switch state {
	case model.ConnectionState_ConnectionStateValidating:
		return api.Instance_CONNECTION_STATE_VALIDATING
	case model.ConnectionState_ConnectionStateActive:
		return api.Instance_CONNECTION_STATE_ACTIVE
	case model.ConnectionState_ConnectionStateError:
		return api.Instance_CONNECTION_STATE_ERROR
	case model.ConnectionState_ConnectionStateUnspecified:
		return api.Instance_CONNECTION_STATE_UNSPECIFIED
	default:
		return api.Instance_CONNECTION_STATE_UNSPECIFIED
	}
}

// RedactInstanceForAPI redacts sensitive fields from an instance before returning it via API.
// This should be called once per instance right before returning to the client.
// It mutates the instance in-place for efficiency.
//
// Passwords and credentials should never be exposed through the API layer.
func RedactInstanceForAPI(instance *api.Instance) {
	if instance == nil || instance.Config == nil {
		return
	}

	// Wipe inline password values from config. References remain visible so users
	// can tell which provider-backed credential is configured.
	instance.Config.Password = ""
	if source := instance.Config.GetPasswordSource(); source != nil && source.GetInline() != "" {
		instance.Config.PasswordSource = nil
	}
}
