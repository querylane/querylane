package sqlsvc

import (
	"errors"
	"strings"
	"unicode"

	"github.com/querylane/querylane/backend/engine"
)

var allowedReadOnlyStatementStarts = map[string]struct{}{
	"SELECT": {},
	"SHOW":   {},
	"VALUES": {},
	"WITH":   {},
}

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
	"SET":      {},
	"TRUNCATE": {},
	"UPDATE":   {},
	"VACUUM":   {},
}

var forbiddenReadOnlyStatementKeywords = map[string]struct{}{
	"DELETE": {},
	"INSERT": {},
	"INTO":   {},
	"UPDATE": {},
}

// validateReadOnlyStatement is a fast application-level guardrail for the SQL
// workbench. PostgreSQL still runs the statement inside a read-only
// transaction; this preflight gives users an immediate, explicit error for
// writes, transaction control, and multi-statement input.
func validateReadOnlyStatement(statement string) error {
	tokens, hasMultipleStatements, err := readSQLKeywords(statement)
	if err != nil {
		return engine.NewInvalidQueryError("statement", err.Error())
	}

	if len(tokens) == 0 {
		return engine.NewInvalidQueryError("statement", "enter a read-only SQL statement")
	}

	if hasMultipleStatements {
		return engine.NewInvalidQueryError("statement", "only one read-only SQL statement is allowed")
	}

	first := tokens[0]
	if _, blocked := blockedReadOnlyStatementStarts[first]; blocked {
		return engine.NewInvalidQueryError(
			"statement",
			strings.ToLower(first)+" statements are not allowed in the read-only workbench",
		)
	}

	if _, allowed := allowedReadOnlyStatementStarts[first]; !allowed {
		// PostgreSQL is the authority for syntax and extension-provided commands.
		// The engine still executes them inside a read-only transaction.
		return nil
	}

	for index, token := range tokens {
		if _, ok := forbiddenReadOnlyStatementKeywords[token]; ok {
			return engine.NewInvalidQueryError(
				"statement",
				strings.ToLower(token)+" is not allowed in the read-only workbench",
			)
		}

		if index > 0 && tokens[index-1] == "FOR" && token == "SHARE" {
			return engine.NewInvalidQueryError(
				"statement",
				"for share is not allowed in the read-only workbench",
			)
		}
	}

	return nil
}

func readSQLKeywords(statement string) ([]string, bool, error) {
	var (
		tokens                []string
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
				return nil, false, errors.New("unterminated block comment")
			}
		case char == '\'':
			var ok bool

			index, ok = skipSingleQuotedString(statement, index+1)
			if !ok {
				return nil, false, errors.New("unterminated string literal")
			}
		case char == '"':
			var ok bool

			index, ok = skipDoubleQuotedIdentifier(statement, index+1)
			if !ok {
				return nil, false, errors.New("unterminated quoted identifier")
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

			tokens = append(tokens, strings.ToUpper(statement[start:index]))
		default:
			if sawTerminator {
				sawMultipleStatements = true
			}

			index++
		}
	}

	return tokens, sawMultipleStatements, nil
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

func skipSingleQuotedString(statement string, index int) (int, bool) {
	for index < len(statement) {
		if statement[index] != '\'' {
			index++
			continue
		}

		if index+1 < len(statement) && statement[index+1] == '\'' {
			index += 2
			continue
		}

		return index + 1, true
	}

	return index, false
}

func skipDoubleQuotedIdentifier(statement string, index int) (int, bool) {
	for index < len(statement) {
		if statement[index] != '"' {
			index++
			continue
		}

		if index+1 < len(statement) && statement[index+1] == '"' {
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
