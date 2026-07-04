#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    errors: list[str] = []

    frontend_package_path = ROOT / "frontend/package.json"
    frontend_package = json.loads(frontend_package_path.read_text(encoding="utf-8"))

    package_manager = frontend_package.get("packageManager")
    if not isinstance(package_manager, str) or not package_manager.startswith("bun@"):
        errors.append(
            f"{frontend_package_path}: packageManager must pin Bun as bun@<version> for local/CI/docker alignment."
        )
        bun_version = None
    else:
        bun_version = package_manager.split("@", 1)[1]

    dockerfile_path = ROOT / "Dockerfile"
    dockerfile_lines = dockerfile_path.read_text(encoding="utf-8").splitlines()

    manifest_copy_line = find_line(
        dockerfile_lines,
        r"^COPY\s+frontend/package\.json\s+frontend/bun\.lock\s+\./\s*$",
    )
    patches_copy_line = find_line(
        dockerfile_lines,
        r"^COPY\s+frontend/patches\s+\./patches\s*$",
    )
    bun_install_line = find_instruction(
        dockerfile_lines,
        r"^RUN\s+--mount=type=cache,target=/root/\.bun/install/cache\s+bun install --frozen-lockfile --ignore-scripts\s*$",
    )
    go_mod_download_line = find_instruction(
        dockerfile_lines,
        r"^RUN\s+--mount=type=cache,target=/go/pkg/mod\s+go mod download\s*$",
    )
    go_build_line = find_instruction(
        dockerfile_lines,
        r"^RUN\s+--mount=type=cache,target=/go/pkg/mod\s+--mount=type=cache,target=/root/\.cache/go-build\s+CGO_ENABLED=0 go build -trimpath -ldflags=\"-s -w\" -tags embed_frontend -o /querylane \.\s*$",
    )
    full_frontend_copy_line = find_line(
        dockerfile_lines,
        r"^COPY\s+frontend/\s+\./\s*$",
    )

    require_line(
        errors,
        dockerfile_path,
        "copy frontend manifests before install",
        manifest_copy_line,
    )
    require_line(
        errors,
        dockerfile_path,
        "run cached bun install with --frozen-lockfile --ignore-scripts",
        bun_install_line,
    )
    require_line(
        errors,
        dockerfile_path,
        "run cached go mod download",
        go_mod_download_line,
    )
    require_line(
        errors,
        dockerfile_path,
        "run cached go build",
        go_build_line,
    )
    require_line(
        errors,
        dockerfile_path,
        "copy the full frontend tree after dependency installation",
        full_frontend_copy_line,
    )

    if bun_version:
        bun_image_line = find_line(
            dockerfile_lines,
            rf"^FROM\s+oven/bun:{re.escape(bun_version)}-alpine\s+AS\s+frontend-builder\s*$",
        )
        require_line(
            errors,
            dockerfile_path,
            f"pin Docker Bun image to oven/bun:{bun_version}-alpine",
            bun_image_line,
        )

    if manifest_copy_line and bun_install_line and manifest_copy_line > bun_install_line:
        errors.append(
            f"{dockerfile_path}:{manifest_copy_line}: frontend manifests must be copied before bun install."
        )

    if bun_install_line and full_frontend_copy_line and bun_install_line > full_frontend_copy_line:
        errors.append(
            f"{dockerfile_path}:{bun_install_line}: bun install must happen before copying the full frontend tree so dependency caching stays stable."
        )

    patched_dependencies = frontend_package.get("patchedDependencies") or {}
    if not isinstance(patched_dependencies, dict):
        errors.append(
            f"{frontend_package_path}: patchedDependencies must be an object when present."
        )
        patched_dependencies = {}

    for package_name, relative_patch_path in patched_dependencies.items():
        if not isinstance(relative_patch_path, str) or not relative_patch_path.startswith("patches/"):
            errors.append(
                f"{frontend_package_path}: patched dependency {package_name!r} must point at a frontend-local patches/... file."
            )
            continue

        patch_path = ROOT / "frontend" / relative_patch_path
        if not patch_path.is_file():
            errors.append(
                f"{frontend_package_path}: patched dependency {package_name!r} is missing patch file {patch_path}."
            )

    if patched_dependencies:
        require_line(
            errors,
            dockerfile_path,
            "copy frontend patches before bun install when patchedDependencies are present",
            patches_copy_line,
        )
        if patches_copy_line and bun_install_line and patches_copy_line > bun_install_line:
            errors.append(
                f"{dockerfile_path}:{patches_copy_line}: frontend patches must be copied before bun install."
            )

    dockerignore_path = ROOT / ".dockerignore"
    dockerignore_entries = read_dockerignore_entries(dockerignore_path, errors)
    required_dockerignore_entries = {
        ".git",
        ".build",
        ".claude",
        ".task",
        ".vscode",
        ".env",
        ".env.*",
        "postgres_data",
        "frontend/.claude",
        "frontend/.env*",
        "frontend/coverage",
        "frontend/dist",
        "frontend/node_modules",
        "frontend/playwright-report",
        "frontend/test-results",
    }
    for entry in sorted(required_dockerignore_entries):
        if entry not in dockerignore_entries:
            errors.append(f"{dockerignore_path}: missing required ignore entry {entry!r}.")

    dev_taskfile_path = ROOT / "taskfiles/dev.yaml"
    dev_taskfile = dev_taskfile_path.read_text(encoding="utf-8")
    required_dev_install = "bun install --frozen-lockfile"
    if dev_taskfile.count(required_dev_install) < 2:
        errors.append(
            f"{dev_taskfile_path}: expected local frontend dev tasks to use '{required_dev_install}' in both frontend entrypoints."
        )
    if re.search(r"\bbun install\b(?! --frozen-lockfile)", dev_taskfile):
        errors.append(
            f"{dev_taskfile_path}: found plain 'bun install'; local dev tasks should stay aligned with frozen-lockfile installs."
        )

    expected_bun_version_snippet = (
        f"BUN_VERSION: &bun_version {bun_version}"
        if bun_version
        else "BUN_VERSION: &bun_version"
    )

    workflow_expectations = {
        ROOT / ".github/workflows/frontend-ci.yml": [
            expected_bun_version_snippet,
            "bun install --frozen-lockfile",
        ],
        ROOT / ".github/workflows/release.yml": [
            expected_bun_version_snippet,
            "bun install --frozen-lockfile",
        ],
        ROOT / ".github/workflows/docker-image.yml": [
            "python3 .github/scripts/check-docker-setup.py",
            "outputs: type=cacheonly",
            "DOCKER_BUILD_RECORD_UPLOAD: false",
        ],
        ROOT / ".github/workflows/docker-ci.yml": [
            ".github/scripts/check-docker-setup.py",
            "taskfiles/docker.yaml",
            "uses: ./.github/workflows/docker-image.yml",
        ],
    }

    task_expectations = {
        ROOT / "Taskfile.yaml": [
            "docker: taskfiles/docker.yaml",
        ],
        ROOT / "taskfiles/docker.yaml": [
            "python3 {{.ROOT_DIR}}/.github/scripts/check-docker-setup.py",
            "docker build -f {{.ROOT_DIR}}/Dockerfile {{.ROOT_DIR}}",
            "docker build --no-cache -f {{.ROOT_DIR}}/Dockerfile {{.ROOT_DIR}}",
        ],
    }

    for workflow_path, expected_snippets in workflow_expectations.items():
        workflow_text = workflow_path.read_text(encoding="utf-8")
        for expected_snippet in expected_snippets:
            if expected_snippet not in workflow_text:
                errors.append(
                    f"{workflow_path}: missing expected snippet {expected_snippet!r}."
                )

    for task_path, expected_snippets in task_expectations.items():
        task_text = task_path.read_text(encoding="utf-8")
        for expected_snippet in expected_snippets:
            if expected_snippet not in task_text:
                errors.append(
                    f"{task_path}: missing expected snippet {expected_snippet!r}."
                )

    if errors:
        print("Docker guardrail checks failed:\n", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Docker guardrail checks passed.")
    return 0


def find_line(lines: list[str], pattern: str) -> int | None:
    regex = re.compile(pattern)
    for line_number, line in enumerate(lines, start=1):
        if regex.search(line.strip()):
            return line_number
    return None


def find_instruction(lines: list[str], pattern: str) -> int | None:
    regex = re.compile(pattern)
    for line_number, instruction in iter_docker_instructions(lines):
        if regex.search(instruction):
            return line_number
    return None


def iter_docker_instructions(lines: list[str]):
    start_line = 1
    parts: list[str] = []

    for line_number, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not parts:
            start_line = line_number

        if stripped.endswith("\\"):
            parts.append(stripped[:-1].strip())
            continue

        parts.append(stripped)
        yield start_line, " ".join(part for part in parts if part)
        parts = []

    if parts:
        yield start_line, " ".join(part for part in parts if part)


def require_line(errors: list[str], path: Path, description: str, line_number: int | None) -> None:
    if line_number is None:
        errors.append(f"{path}: missing required Dockerfile step to {description}.")


def read_dockerignore_entries(path: Path, errors: list[str]) -> set[str]:
    if not path.is_file():
        errors.append(f"{path}: file is required.")
        return set()

    entries: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        entries.add(line)
    return entries


if __name__ == "__main__":
    raise SystemExit(main())
