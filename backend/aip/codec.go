package aip

import (
	"fmt"
	"strconv"
	"time"

	"google.golang.org/protobuf/types/known/structpb"
)

// CursorCodec serializes and deserializes a single field value for storage
// inside the opaque page token. When a client requests the next page, the
// cursor values from the last row are encoded into the token (via ToProto)
// and decoded back on the next request (via FromProto) to construct the
// keyset WHERE clause. Encodings must be lossless because the decoded values
// are used for relational comparisons (>, <, =) in SQL.
type CursorCodec interface {
	ToProto(v any) (*structpb.Value, error)
	FromProto(*structpb.Value) (any, error)
}

// StringCodec serializes string values for cursor storage.
type StringCodec struct{}

// ToProto implements [CursorCodec].
func (StringCodec) ToProto(v any) (*structpb.Value, error) {
	s, ok := v.(string)
	if !ok {
		return nil, fmt.Errorf("expected string got %T", v)
	}

	return structpb.NewStringValue(s), nil
}

// FromProto implements [CursorCodec]. Rejects non-string token values so a
// corrupt or forged token errors instead of silently decoding to "".
func (StringCodec) FromProto(v *structpb.Value) (any, error) {
	sv, ok := v.GetKind().(*structpb.Value_StringValue)
	if !ok {
		return nil, fmt.Errorf("expected string token value, got %T", v.GetKind())
	}

	return sv.StringValue, nil
}

// BoolCodec serializes boolean cursor values.
type BoolCodec struct{}

// ToProto implements [CursorCodec].
func (BoolCodec) ToProto(v any) (*structpb.Value, error) {
	value, ok := v.(bool)
	if !ok {
		return nil, fmt.Errorf("expected bool got %T", v)
	}

	return structpb.NewBoolValue(value), nil
}

// FromProto implements [CursorCodec]. Rejects non-bool token values so a
// corrupt or forged token errors instead of silently decoding to false.
func (BoolCodec) FromProto(v *structpb.Value) (any, error) {
	bv, ok := v.GetKind().(*structpb.Value_BoolValue)
	if !ok {
		return nil, fmt.Errorf("expected bool token value, got %T", v.GetKind())
	}

	return bv.BoolValue, nil
}

// Int64Codec serializes integer cursor values. Stored as strings in the token
// to avoid float64 precision loss (protobuf's structpb.Value uses float64 for numbers).
type Int64Codec struct{}

// ToProto implements [CursorCodec]; the int64 is stringified to keep
// precision (structpb numbers are float64).
func (Int64Codec) ToProto(v any) (*structpb.Value, error) {
	value, ok := v.(int64)
	if !ok {
		return nil, fmt.Errorf("expected int64 got %T", v)
	}

	return structpb.NewStringValue(strconv.FormatInt(value, 10)), nil
}

// FromProto implements [CursorCodec].
func (Int64Codec) FromProto(v *structpb.Value) (any, error) {
	return strconv.ParseInt(v.GetStringValue(), 10, 64)
}

// TimestampCodec stores time.Time as RFC-3339-nano strings in the token.
// Always converts to UTC to avoid timezone-dependent cursor comparisons.
type TimestampCodec struct{}

// ToProto implements [CursorCodec]; the time is normalised to UTC so cursor
// comparisons remain stable across server timezone changes.
func (TimestampCodec) ToProto(v any) (*structpb.Value, error) {
	t, ok := v.(time.Time)
	if !ok {
		return nil, fmt.Errorf("expected time.Time got %T", v)
	}

	return structpb.NewStringValue(t.UTC().Format(time.RFC3339Nano)), nil
}

// FromProto implements [CursorCodec].
func (TimestampCodec) FromProto(v *structpb.Value) (any, error) {
	return time.Parse(time.RFC3339Nano, v.GetStringValue())
}
