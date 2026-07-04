package types

import (
	"bytes"
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
)

// StringArray represents a one-dimensional PostgreSQL text[] column.
// It implements sql.Scanner and driver.Valuer for use with database/sql.
//
// Parsing logic is derived from github.com/lib/pq/array.go (MIT licensed);
// the upstream-faithful structure is preserved deliberately, so a few
// stylistic linters are silenced for this file.
//
//nolint:recvcheck // Scan needs a pointer receiver, Value follows database/sql convention with a value receiver.
type StringArray []string

// Scan implements sql.Scanner.
func (a *StringArray) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*a = nil
		return nil
	case []byte:
		return a.scanBytes(v)
	case string:
		return a.scanBytes([]byte(v))
	default:
		return fmt.Errorf("cannot convert %T to StringArray", src)
	}
}

//nolint:funcorder // helper kept adjacent to Scan for readability.
func (a *StringArray) scanBytes(src []byte) error {
	elems, err := scanLinearArray(src)
	if err != nil {
		return err
	}

	if *a != nil && len(elems) == 0 {
		*a = (*a)[:0]
	} else {
		b := make(StringArray, len(elems))
		for i, v := range elems {
			if v == nil {
				return fmt.Errorf("parsing array element index %d: cannot convert nil to string", i)
			}

			b[i] = string(v)
		}

		*a = b
	}

	return nil
}

// Value implements driver.Valuer.
func (a StringArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil //nolint:nilnil // database/sql treats (nil, nil) as SQL NULL.
	}

	if n := len(a); n > 0 {
		b := make([]byte, 1, 1+3*n)
		b[0] = '{'

		b = appendQuoted(b, []byte(a[0]))
		for i := 1; i < n; i++ {
			b = append(b, ',')
			b = appendQuoted(b, []byte(a[i]))
		}

		return string(append(b, '}')), nil
	}

	return "{}", nil
}

// appendQuoted appends a double-quoted, escaped element to b.
func appendQuoted(b, v []byte) []byte {
	b = append(b, '"')

	for {
		i := bytes.IndexAny(v, `"\`)
		if i < 0 {
			b = append(b, v...)
			break
		}

		if i > 0 {
			b = append(b, v[:i]...)
		}

		b = append(b, '\\', v[i])
		v = v[i+1:]
	}

	return append(b, '"')
}

// scanLinearArray parses a one-dimensional PostgreSQL text array literal.
// It returns the raw element byte slices, where nil means SQL NULL.
func scanLinearArray(src []byte) ([][]byte, error) {
	dims, elems, err := parseArray(src)
	if err != nil {
		return nil, err
	}

	if len(dims) > 1 {
		return nil, fmt.Errorf("cannot convert ARRAY%s to StringArray",
			strings.ReplaceAll(fmt.Sprint(dims), " ", "]["))
	}

	return elems, nil
}

// parseArray extracts the dimensions and elements of a PostgreSQL array
// represented in text format. Only representations emitted by the backend
// are supported. NULL is case-sensitive.
//
// See https://www.postgresql.org/docs/current/arrays.html#ARRAYS-IO
//
//nolint:gocyclo,gocritic,nonamedreturns // Mirrors lib/pq's parser; named returns and structure preserved to match upstream.
func parseArray(src []byte) (dims []int, elems [][]byte, err error) {
	var depth, i int

	del := []byte{','}

	if len(src) < 1 || src[0] != '{' {
		return nil, nil, fmt.Errorf("unable to parse array; expected %q at offset %d", '{', 0)
	}

open:
	for i < len(src) {
		switch src[i] {
		case '{':
			depth++
			i++
		case '}':
			elems = make([][]byte, 0)
			goto close
		default:
			break open
		}
	}

	dims = make([]int, i)

element:
	for i < len(src) {
		switch src[i] {
		case '{':
			if depth == len(dims) {
				break element
			}

			depth++
			dims[depth-1] = 0
			i++
		case '"':
			var (
				elem   []byte
				escape bool
			)

			for i++; i < len(src); i++ {
				if escape {
					elem = append(elem, src[i])
					escape = false
				} else {
					switch src[i] {
					default:
						elem = append(elem, src[i])
					case '\\':
						escape = true
					case '"':
						elems = append(elems, elem)
						i++

						break element
					}
				}
			}
		default:
			for start := i; i < len(src); i++ {
				if bytes.HasPrefix(src[i:], del) || src[i] == '}' {
					elem := src[start:i]
					if len(elem) == 0 {
						return nil, nil, fmt.Errorf("unable to parse array; unexpected %q at offset %d", src[i], i)
					}

					if bytes.Equal(elem, []byte("NULL")) {
						elem = nil
					}

					elems = append(elems, elem)

					break element
				}
			}
		}
	}

	for i < len(src) {
		if bytes.HasPrefix(src[i:], del) && depth > 0 {
			dims[depth-1]++
			i += len(del)

			goto element
		} else if src[i] == '}' && depth > 0 {
			dims[depth-1]++
			depth--
			i++
		} else {
			return nil, nil, fmt.Errorf("unable to parse array; unexpected %q at offset %d", src[i], i)
		}
	}

close: //nolint:predeclared // label name mirrors lib/pq parser; renaming would diverge from upstream.
	for i < len(src) {
		if src[i] == '}' && depth > 0 {
			depth--
			i++
		} else {
			return nil, nil, fmt.Errorf("unable to parse array; unexpected %q at offset %d", src[i], i)
		}
	}

	if depth > 0 {
		err = fmt.Errorf("unable to parse array; expected %q at offset %d", '}', i)
	}

	if err == nil {
		for _, d := range dims {
			if (len(elems) % d) != 0 {
				err = errors.New("multidimensional arrays must have elements with matching dimensions")
			}
		}
	}

	return dims, elems, err
}
