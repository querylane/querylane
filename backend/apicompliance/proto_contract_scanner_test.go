package apicompliance

import (
	"regexp"
	"sort"
	"strings"
)

var (
	messageStartPattern = regexp.MustCompile(`message\s+([A-Za-z0-9_]+)\s*\{`)
	rpcPattern          = regexp.MustCompile(`rpc\s+(Get|Create|Update|Delete)([A-Za-z0-9_]+)\s*\([^)]*\)\s*returns\s*\(([^)]*)\)`)
)

func findStandardMethodResponseExceptions(files map[string]string) []string {
	resourceMessages := map[string]struct{}{}

	for _, content := range files {
		for _, resource := range findResourceMessages(content) {
			resourceMessages[resource] = struct{}{}
		}
	}

	var found []string

	for path, content := range files {
		for _, rpc := range findStandardMethodRPCs(content) {
			if _, ok := resourceMessages[rpc.resource]; !ok {
				continue
			}

			canonical := rpc.resource
			if rpc.verb == "Delete" {
				canonical = "google.protobuf.Empty"
			}

			if rpc.response == canonical {
				continue
			}

			found = append(found, path+":"+rpc.verb+rpc.resource+"->"+rpc.response)
		}
	}

	sort.Strings(found)

	return found
}

func splitApprovedStandardMethodWrapperResponse(approved string) (string, string) {
	pathAndMethod, response, _ := strings.Cut(approved, "->")
	_, method, _ := strings.Cut(pathAndMethod, ":")

	return method, response
}

func approvedWrapperIsDocumented(doc string, method string, response string) bool {
	for line := range strings.Lines(doc) {
		if strings.Contains(line, "`"+method+"`") && strings.Contains(line, "`"+response+"`") {
			return true
		}
	}

	return false
}

type standardMethodRPC struct {
	verb     string
	resource string
	response string
}

func findResourceMessages(content string) []string {
	var resources []string

	for _, match := range messageStartPattern.FindAllStringSubmatchIndex(content, -1) {
		name := content[match[2]:match[3]]

		bodyStart := strings.IndexByte(content[match[0]:match[1]], '{')
		if bodyStart == -1 {
			continue
		}

		bodyStart += match[0]

		bodyEnd := findMatchingBrace(content, bodyStart)
		if bodyEnd == -1 {
			continue
		}

		if directMessageBodyHasResourceOption(content[bodyStart+1 : bodyEnd]) {
			resources = append(resources, name)
		}
	}

	return resources
}

func directMessageBodyHasResourceOption(body string) bool {
	for index := 0; index < len(body); {
		match := messageStartPattern.FindStringIndex(body[index:])
		if match == nil {
			return strings.Contains(body[index:], "option (google.api.resource)")
		}

		nestedStart := index + match[0]
		if strings.Contains(body[index:nestedStart], "option (google.api.resource)") {
			return true
		}

		nestedOpenBrace := index + match[1] - 1

		nestedEnd := findMatchingBrace(body, nestedOpenBrace)
		if nestedEnd == -1 {
			return false
		}

		index = nestedEnd + 1
	}

	return false
}

func findStandardMethodRPCs(content string) []standardMethodRPC {
	var rpcs []standardMethodRPC

	for _, match := range rpcPattern.FindAllStringSubmatch(content, -1) {
		response := strings.TrimSpace(match[3])
		if strings.HasPrefix(response, "stream ") {
			continue
		}

		rpcs = append(rpcs, standardMethodRPC{
			verb:     match[1],
			resource: match[2],
			response: response,
		})
	}

	return rpcs
}

func findMatchingBrace(content string, openBrace int) int {
	depth := 0

	for index := openBrace; index < len(content); index++ {
		switch content[index] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return index
			}
		}
	}

	return -1
}
