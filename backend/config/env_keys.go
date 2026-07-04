package config

import (
	"encoding"
	"reflect"
	"strings"
)

// knownConfigKeys reflects over a config struct type and returns a predicate
// reporting whether a flattened (dot-delimited, lowercased) koanf key
// corresponds to a real, env-settable field.
//
// It is used to filter environment variables before they reach the strict
// unmarshal (ErrorUnused). The process environment is a shared namespace: it
// commonly holds QUERYLANE_* variables consumed elsewhere via os.Getenv (for
// example the instance secret key or the config-file path). Without filtering,
// those map to unknown config keys and abort startup. File-based configuration
// keeps its strict typo detection (see DefaultLoader.Load and the File source).
//
// Only scalar and scalar-slice leaves are considered env-settable. Slices of
// structs (lists of sub-objects) are not addressable via flat env keys, so any
// key beneath them is treated as unknown.
func knownConfigKeys(t reflect.Type) func(key string) bool {
	leaves := make(map[string]struct{})
	collectConfigLeafKeys(t, "", leaves)

	return func(key string) bool {
		_, ok := leaves[key]

		return ok
	}
}

var textUnmarshalerType = reflect.TypeFor[encoding.TextUnmarshaler]()

func collectConfigLeafKeys(t reflect.Type, prefix string, leaves map[string]struct{}) {
	t = derefType(t)
	if t.Kind() != reflect.Struct {
		return
	}

	for field := range t.Fields() {
		name, ok := koanfFieldName(field)
		if !ok {
			continue
		}

		key := name
		if prefix != "" {
			key = prefix + "." + name
		}

		fieldType := derefType(field.Type)

		// Nested structs are containers: recurse. The exception is a type that
		// unmarshals itself from text (e.g. time.Time), which is a leaf value.
		if fieldType.Kind() == reflect.Struct && !implementsTextUnmarshaler(field.Type) {
			collectConfigLeafKeys(fieldType, key, leaves)

			continue
		}

		// Slices of structs can't be addressed through flat env keys; skip them
		// so keys beneath them are treated as unknown rather than accepted.
		if fieldType.Kind() == reflect.Slice && derefType(fieldType.Elem()).Kind() == reflect.Struct {
			continue
		}

		leaves[key] = struct{}{}
	}
}

func koanfFieldName(field reflect.StructField) (string, bool) {
	tag := field.Tag.Get("koanf")
	if tag == "" || tag == "-" {
		return "", false
	}

	if comma := strings.IndexByte(tag, ','); comma >= 0 {
		tag = tag[:comma]
	}

	if tag == "" {
		return "", false
	}

	return tag, true
}

func derefType(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}

	return t
}

func implementsTextUnmarshaler(t reflect.Type) bool {
	return t.Implements(textUnmarshalerType) || reflect.PointerTo(t).Implements(textUnmarshalerType)
}
