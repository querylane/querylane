package aip

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "github.com/querylane/querylane/backend/protogen/querylane/common/v1"
)

// TokenMaxAge is the maximum age of a page token before it expires.
const TokenMaxAge = 24 * time.Hour

// EncodeToken creates a new base64-encoded page token from cursor values and
// request parameters. The executors call it via buildNextPageToken; it is also
// the low-level entry point for callers that paginate outside the executors
// (e.g. in-memory listings that sort and slice themselves).
func EncodeToken(
	resourceType string,
	cursorValues []any,
	orderBy OrderBy,
	filter string,
	fields map[string]CursorCodec,
) (string, error) {
	if len(cursorValues) != len(orderBy.Fields) {
		return "", fmt.Errorf("cursor values count (%d) does not match order fields count (%d)",
			len(cursorValues), len(orderBy.Fields))
	}

	// Convert []any to []*structpb.Value using codecs
	protoValues := make([]*structpb.Value, len(cursorValues))
	for i, value := range cursorValues {
		fieldPath := orderBy.Fields[i].Path

		codec, ok := fields[fieldPath]
		if !ok {
			return "", fmt.Errorf("no codec registered for field %q", fieldPath)
		}

		pv, err := codec.ToProto(value)
		if err != nil {
			return "", fmt.Errorf("failed to convert cursor value %d to protobuf: %w", i, err)
		}

		protoValues[i] = pv
	}

	// Convert OrderField to commonv1.OrderField for storage
	orderFields := make([]*commonv1.OrderField, len(orderBy.Fields))
	for i, f := range orderBy.Fields {
		direction := commonv1.OrderDirection_ORDER_DIRECTION_ASC
		if f.Direction == Desc {
			direction = commonv1.OrderDirection_ORDER_DIRECTION_DESC
		}

		orderFields[i] = &commonv1.OrderField{
			FieldName: f.Path,
			Direction: direction,
		}
	}

	token := &commonv1.PageToken{
		CreateTime:   timestamppb.Now(),
		ResourceType: resourceType,
		FilterHash:   hashFilter(filter),
		CursorValues: protoValues,
		OrderFields:  orderFields,
	}

	tokenBytes, err := proto.Marshal(token)
	if err != nil {
		return "", fmt.Errorf("failed to marshal page token: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(tokenBytes), nil
}

// NextPageToken creates the opaque next_page_token for a response. Executors
// fetch plan.PageSize+1 rows; if the extra row exists, the last row that will
// be RETURNED (rows[PageSize-1]) becomes the cursor in the token. Returns ""
// when rows fit in the page (no more pages).
func (s *Schema[M]) NextPageToken(plan *Plan, rows []M) (string, error) {
	size := int(plan.PageSize)
	if len(rows) <= size {
		return "", nil
	}

	cursorVals, err := s.extractCursorValues(&rows[size-1], plan.OrderBy)
	if err != nil {
		return "", fmt.Errorf("failed to extract cursor values: %w", err)
	}

	return EncodeToken(s.resourceType, cursorVals, plan.OrderBy, plan.Filter, s.codecs())
}

// decodeToken decodes a base64-encoded page token string back into a PageToken proto.
// Returns (nil, nil) for empty token strings (first page request).
func decodeToken(tokenStr string) (*commonv1.PageToken, error) {
	if tokenStr == "" {
		return nil, nil //nolint:nilnil // Empty token is valid (first page)
	}

	tokenBytes, err := base64.RawURLEncoding.DecodeString(tokenStr)
	if err != nil {
		return nil, errors.New("invalid page token: malformed base64")
	}

	var token commonv1.PageToken
	if err := proto.Unmarshal(tokenBytes, &token); err != nil {
		return nil, errors.New("invalid page token: malformed proto")
	}

	return &token, nil
}

// validateToken checks token expiration, resource type, and filter consistency.
func validateToken(token *commonv1.PageToken, resourceType, filter string) error {
	if token == nil {
		return nil
	}

	if time.Since(token.CreateTime.AsTime()) > TokenMaxAge {
		return errTokenExpired
	}

	if token.ResourceType != resourceType {
		return errTokenWrongResource
	}

	expectedHash := hashFilter(filter)
	if token.FilterHash != expectedHash {
		return ErrFilterMismatch
	}

	return nil
}

// hashFilter creates a SHA256 hash of the filter string for consistency checks.
func hashFilter(filter string) string {
	if filter == "" {
		return ""
	}

	hash := sha256.Sum256([]byte(filter))

	return base64.RawURLEncoding.EncodeToString(hash[:])
}
