package config

import (
	"reflect"
	"testing"

	"github.com/stretchr/testify/assert"
)

type envKeysConfig struct {
	Name     string          `koanf:"name"`
	Nested   envKeysNested   `koanf:"nested"`
	Optional *envKeysNested  `koanf:"optional"`
	Tags     []string        `koanf:"tags"`
	Children []*envKeysChild `koanf:"children"`
	Ignored  string          `koanf:"-"`
	Untagged string
}

type envKeysNested struct {
	Value string `koanf:"value"`
}

type envKeysChild struct {
	ID string `koanf:"id"`
}

func TestKnownConfigKeys(t *testing.T) {
	t.Parallel()

	known := knownConfigKeys(reflect.TypeFor[*envKeysConfig]())

	accepted := []string{
		"name",           // scalar leaf
		"nested.value",   // nested struct leaf
		"optional.value", // recurses through a pointer-to-struct
		"tags",           // scalar slice leaf
	}
	for _, key := range accepted {
		assert.Truef(t, known(key), "expected %q to be a known config key", key)
	}

	rejected := []string{
		"unknown",             // not a field
		"nested.missing",      // not a nested field
		"children",            // slice of structs is not env-addressable
		"children.id",         // ...nor are keys beneath it
		"ignored",             // koanf:"-"
		"untagged",            // no koanf tag
		"instance.secret.key", // the reserved QUERYLANE_INSTANCE_SECRET_KEY shape
	}
	for _, key := range rejected {
		assert.Falsef(t, known(key), "expected %q to be rejected", key)
	}
}
