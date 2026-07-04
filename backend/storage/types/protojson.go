package types

import (
	"bytes"
	"database/sql/driver"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// ProtoJSON is a database adapter for storing protobuf messages in JSONB columns.
//
// Usage:
//
//	type Instance struct {
//	  Config types.ProtoJSON[*consolev1.PostgresConfig] `sql:"config"`
//	}
//
//	// Writing
//	inst.Config = types.ProtoJSON[*consolev1.PostgresConfig]{V: cfg}
//
//	// Reading
//	cfg := inst.Config.V // *consolev1.PostgresConfig or nil
//
// The type T must be a pointer to a concrete protobuf message (e.g. *mypb.Foo).
// Marshals using protojson with stable field names. Returns JSON null for nil values.
type ProtoJSON[T proto.Message] struct {
	// V holds the protobuf message to be stored/loaded.
	// Use a *concrete* message type for T (e.g. *mypb.Foo), not an interface.
	V T
}

var (
	// Marshal using stable proto field names.
	_marshalOpts = protojson.MarshalOptions{
		UseProtoNames:   true,
		EmitUnpopulated: false,
	}
	// Unmarshal while discarding unknown fields for forward-compat.
	_unmarshalOpts = protojson.UnmarshalOptions{
		DiscardUnknown: true,
	}
)

// Value implements driver.Valuer.
// If V is nil, it returns the JSON literal `null`.
// NOTE: If your DB column is NOT NULL, consider returning `{}` instead.
func (p ProtoJSON[T]) Value() (driver.Value, error) {
	// We cannot write `p.V == nil` because T is a type parameter.
	// Use reflect to detect typed-nil pointers (the common proto case).
	rv := reflect.ValueOf(p.V)
	if !rv.IsValid() || rv.IsZero() {
		return []byte("null"), nil
	}

	b, err := _marshalOpts.Marshal(p.V)

	return b, err
}

// Scan implements sql.Scanner.
// Accepts []byte, string, or nil from the DB.
// `nil`, empty, or the literal `null` → sets V to nil (zero T).
// Otherwise, JSON is unmarshaled into a freshly allocated message of type T.
func (p *ProtoJSON[T]) Scan(src any) error {
	if p == nil {
		return errors.New("ProtoJSON.Scan on nil receiver")
	}

	// Normalize the raw input to a byte slice.
	var raw []byte

	switch v := src.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	case nil:
		// NULL at the DB level: set zero T (which is nil for pointer T)
		var zero T

		p.V = zero

		return nil
	default:
		return fmt.Errorf("ProtoJSON.Scan: unsupported src type %T", src)
	}

	trim := bytes.TrimSpace(raw)
	// Handle empty/`null` explicitly: leave V as zero (nil pointer)
	if len(trim) == 0 || strings.EqualFold(string(trim), "null") {
		var zero T

		p.V = zero

		return nil
	}

	// Obtain the reflect.Type for T robustly, even when the zero value is nil.
	var zero T

	t := reflect.TypeOf(zero)
	if t.Kind() != reflect.Pointer {
		// T must be a *concrete* protobuf message type.
		return fmt.Errorf("ProtoJSON: T must be a pointer to a protobuf message; got %v", t)
	}

	// Allocate a fresh *Msg (concrete type) and unmarshal into it.
	dst := reflect.New(t.Elem()).Interface() // -> *ConcreteMessage

	msg, ok := dst.(proto.Message)
	if !ok {
		// Should not happen because T: proto.Message, but guard anyway.
		return fmt.Errorf("ProtoJSON: allocated value does not implement proto.Message; got %T", dst)
	}

	if err := _unmarshalOpts.Unmarshal(trim, msg); err != nil {
		return err
	}

	// Assign back as T (which is *ConcreteMessage).
	var typeOK bool
	if p.V, typeOK = dst.(T); !typeOK {
		return fmt.Errorf("ProtoJSON: type assertion failed; expected %T, got %T", p.V, dst)
	}

	return nil
}
