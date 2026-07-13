package jet

import (
	"fmt"
	"strings"

	"github.com/go-jet/jet/v2/postgres"
)

func rawPredicate(where string, args []any) postgres.BoolExpression {
	if where == "" {
		return nil
	}

	namedArgs := make(postgres.RawArgs, len(args))
	// Replace in reverse so $1 cannot alter the prefix of $10.
	for i := len(args); i > 0; i-- {
		placeholder := fmt.Sprintf("$%d", i)
		namedPlaceholder := fmt.Sprintf("#aip_%d#", i)
		where = strings.ReplaceAll(where, placeholder, namedPlaceholder)
		namedArgs[namedPlaceholder] = args[i-1]
	}

	return postgres.RawBool(where, namedArgs)
}

func rawColumnExpression(column postgres.Column) string {
	name := quoteIdentifier(column.Name())
	if column.TableName() == "" {
		return name
	}

	return quoteIdentifier(column.TableName()) + "." + name
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}
