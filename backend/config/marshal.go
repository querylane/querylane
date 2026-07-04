package config

import (
	"fmt"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/structs"
	"github.com/knadh/koanf/v2"
)

// MarshalYAML serializes a config struct to YAML bytes using koanf.
// This ensures consistent serialization with the same field tags used for loading.
func MarshalYAML[T any](cfg T) ([]byte, error) {
	k := koanf.New(".")
	if err := k.Load(structs.Provider(cfg, "koanf"), nil); err != nil {
		return nil, fmt.Errorf("failed to load config into koanf: %w", err)
	}

	data, err := k.Marshal(yaml.Parser())
	if err != nil {
		return nil, fmt.Errorf("failed to marshal config to YAML: %w", err)
	}

	return data, nil
}
