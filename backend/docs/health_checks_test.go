package docs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeploymentDocsUseHealthEndpoints(t *testing.T) {
	t.Parallel()

	docPaths := []string{
		"docs/site/get-started/(deploy-and-maintain)/production-deployment.mdx",
		"docs/site/operations/deployment-recipes.mdx",
		"charts/querylane/README.md",
	}

	for _, docPath := range docPaths {
		t.Run(docPath, func(t *testing.T) {
			t.Parallel()

			contents, err := os.ReadFile(filepath.Join(repositoryRoot(t), docPath))
			require.NoError(t, err, "read deployment docs")

			var healthChecks string

			for paragraph := range strings.SplitSeq(string(contents), "\n\n") {
				if strings.Contains(paragraph, "/livez") && strings.Contains(paragraph, "/readyz") {
					healthChecks = paragraph

					break
				}
			}

			require.NotEmpty(t, healthChecks, "deployment docs must explain /livez and /readyz together")

			for _, statusCode := range []string{"200", "503"} {
				assert.Contains(t, healthChecks, statusCode, "health-check guidance missing status")
			}
		})
	}
}
