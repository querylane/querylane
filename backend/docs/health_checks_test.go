package docs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
			if err != nil {
				t.Fatalf("read deployment docs: %v", err)
			}

			var healthChecks string

			for paragraph := range strings.SplitSeq(string(contents), "\n\n") {
				if strings.Contains(paragraph, "/livez") && strings.Contains(paragraph, "/readyz") {
					healthChecks = paragraph

					break
				}
			}

			if healthChecks == "" {
				t.Fatal("deployment docs must explain /livez and /readyz together")
			}

			for _, statusCode := range []string{"200", "503"} {
				if !strings.Contains(healthChecks, statusCode) {
					t.Errorf("health-check guidance missing status %s", statusCode)
				}
			}
		})
	}
}
