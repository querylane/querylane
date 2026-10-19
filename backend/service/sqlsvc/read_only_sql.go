package sqlsvc

import (
	"errors"
	"strings"
	"unicode"

	"github.com/querylane/querylane/backend/engine"
)

var blockedReadOnlyStatementStarts = map[string]struct{}{
	"ALTER":    {},
	"ANALYZE":  {},
	"BEGIN":    {},
	"CALL":     {},
	"COMMIT":   {},
	"CREATE":   {},
	"DELETE":   {},
	"DO":       {},
	"DROP":     {},
	"EXPLAIN":  {},
	"INSERT":   {},
	"MERGE":    {},
	"ROLLBACK": {},
	"SET":      {},
	"START":    {},
	"TRUNCATE": {},
	"UPDATE":   {},
	"VACUUM":   {},
}

// validateReadOnlyStatement is a fast application-level guardrail for the SQL
// workbench. PostgreSQL still runs the statement inside a read-only
// transaction; this preflight gives users an immediate, explicit error for
// obvious leading writes, transaction control, and multi-statement input.
func validateReadOnlyStatement(statement string) error {
	firstKeyword, hasMultipleStatements, err := inspectSQLStatement(statement)
	if err != nil {
		return engine.NewInvalidQueryError("statement", err.Error())
	}

	if firstKeyword == "" {
		return engine.NewInvalidQueryError("statement", "enter a read-only SQL statement")
	}

	if hasMultipleStatements {
		return engine.NewInvalidQueryError("statement", "only one read-only SQL statement is allowed")
	}

	if _, blocked := blockedReadOnlyStatementStarts[firstKeyword]; blocked {
		return engine.NewInvalidQueryError(
			"statement",
			strings.ToLower(firstKeyword)+" statements are not allowed in the read-only workbench",
		)
	}

	// PostgreSQL is the authority for syntax and for write-capable clauses
	// nested inside otherwise read-looking statements. The engine executes the
	// statement inside a read-only transaction, which rejects those cases
	// without confusing non-reserved keywords with identifiers.
	return nil
}

func inspectSQLStatement(statement string) (string, bool, error) {
	var (
		firstKeyword          string
		sawTerminator         bool
		sawMultipleStatements bool
	)

	for index := 0; index < len(statement); {
		char := statement[index]

		switch {
		case isSQLSpace(char):
			index++
		case char == '-' && index+1 < len(statement) && statement[index+1] == '-':
			index = skipLineComment(statement, index+2)
		case char == '/' && index+1 < len(statement) && statement[index+1] == '*':
			var ok bool

			index, ok = skipBlockComment(statement, index+2)
			if !ok {
				return "", false, errors.New("unterminated block comment")
			}
		case (char == 'e' || char == 'E') && index+1 < len(statement) && statement[index+1] == '\'':
			var ok bool

			index, ok = skipQuoted(statement, index+2, '\'', true)
			if !ok {
				return "", false, errors.New("unterminated escape string literal")
			}
		case char == '\'':
			var ok bool

			index, ok = skipQuoted(statement, index+1, '\'', false)
			if !ok {
				return "", false, errors.New("unterminated string literal")
			}
		case char == '"':
			var ok bool

			index, ok = skipQuoted(statement, index+1, '"', false)
			if !ok {
				return "", false, errors.New("unterminated quoted identifier")
			}
		case char == '$':
			end, ok := skipDollarQuotedString(statement, index)
			if ok {
				index = end
			} else {
				index++
			}
		case char == ';':
			if sawTerminator {
				sawMultipleStatements = true
			}

			sawTerminator = true
			index++
		case isIdentStart(char):
			start := index

			index++
			for index < len(statement) && isIdentPart(statement[index]) {
				index++
			}

			if sawTerminator {
				sawMultipleStatements = true
			}

			if firstKeyword == "" {
				firstKeyword = strings.ToUpper(statement[start:index])
			}
		default:
			if sawTerminator {
				sawMultipleStatements = true
			}

			index++
		}
	}

	return firstKeyword, sawMultipleStatements, nil
}

func isSQLSpace(char byte) bool {
	switch char {
	case ' ', '\t', '\n', '\r', '\f':
		return true
	default:
		return false
	}
}

func isIdentStart(char byte) bool {
	return char == '_' || unicode.IsLetter(rune(char))
}

func isIdentPart(char byte) bool {
	return char == '_' || char == '$' || unicode.IsLetter(rune(char)) || unicode.IsDigit(rune(char))
}

func skipLineComment(statement string, index int) int {
	for index < len(statement) && statement[index] != '\n' {
		index++
	}

	return index
}

func skipBlockComment(statement string, index int) (int, bool) {
	depth := 1

	for index < len(statement) {
		if statement[index] == '/' && index+1 < len(statement) && statement[index+1] == '*' {
			depth++
			index += 2

			continue
		}

		if statement[index] == '*' && index+1 < len(statement) && statement[index+1] == '/' {
			depth--

			index += 2
			if depth == 0 {
				return index, true
			}

			continue
		}

		index++
	}

	return index, false
}

func skipQuoted(statement string, index int, quote byte, backslashEscapes bool) (int, bool) {
	for index < len(statement) {
		if backslashEscapes && statement[index] == '\\' {
			index += min(2, len(statement)-index)
			continue
		}

		if statement[index] != quote {
			index++
			continue
		}

		if index+1 < len(statement) && statement[index+1] == quote {
			index += 2
			continue
		}

		return index + 1, true
	}

	return index, false
}

func skipDollarQuotedString(statement string, index int) (int, bool) {
	endTagStart := index + 1
	for endTagStart < len(statement) && statement[endTagStart] != '$' {
		char := statement[endTagStart]
		if char != '_' && !unicode.IsLetter(rune(char)) && !unicode.IsDigit(rune(char)) {
			return index, false
		}

		endTagStart++
	}

	if endTagStart >= len(statement) || statement[endTagStart] != '$' {
		return index, false
	}

	tag := statement[index : endTagStart+1]

	closing := strings.Index(statement[endTagStart+1:], tag)
	if closing < 0 {
		return index, false
	}

	return endTagStart + 1 + closing + len(tag), true
}
