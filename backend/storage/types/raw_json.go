package types

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

// RawJSON stores arbitrary JSONB payloads without imposing a schema.
//
//nolint:recvcheck // Scan needs a pointer receiver, Value/Clone follow the database/sql convention with value receivers.
type RawJSON json.RawMessage

// Scan implements sql.Scanner.
func (r *RawJSON) Scan(value any) error {
	if r == nil {
		return errors.New("RawJSON.Scan on nil receiver")
	}

	switch v := value.(type) {
	case nil:
		*r = RawJSON([]byte("{}"))
		return nil
	case []byte:
		if len(bytes.TrimSpace(v)) == 0 {
			*r = RawJSON([]byte("{}"))
			return nil
		}

		clone := append([]byte(nil), v...)
		*r = RawJSON(clone)

		return nil
	case string:
		return r.Scan([]byte(v))
	default:
		return fmt.Errorf("cannot scan %T into RawJSON", value)
	}
}

// Value implements driver.Valuer.
func (r RawJSON) Value() (driver.Value, error) {
	if len(bytes.TrimSpace(r)) == 0 {
		return []byte("{}"), nil
	}

	if !json.Valid(r) {
		return nil, errors.New("invalid RawJSON payload")
	}

	return []byte(r), nil
}

// Clone returns a detached copy of the payload.
func (r RawJSON) Clone() RawJSON {
	if len(r) == 0 {
		return RawJSON([]byte("{}"))
	}

	return RawJSON(append([]byte(nil), r...))
}
