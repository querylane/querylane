#!/usr/bin/env python3
"""Exercise the packaged executable, with no checkout assets or existing config."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import tarfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
import zipfile


def smoke(binary, expected_version=None, commands_only=False):
    binary = str(Path(binary).resolve())
    with tempfile.TemporaryDirectory(prefix="querylane-cli-") as directory:
        env = {key: value for key, value in os.environ.items() if not key.startswith("QUERYLANE_")}
        env.update(HOME=directory, USERPROFILE=directory)

        def invoke(*args):
            return subprocess.run(
                [binary, *args], cwd=directory, env=env,
                capture_output=True, text=True, timeout=20,
            )

        version = invoke("--version")
        assert version.returncode == 0, version.stderr
        if expected_version:
            assert version.stdout.strip() == expected_version, version.stdout
        help_result = invoke("--help")
        assert help_result.returncode == 0, help_result.stderr
        assert "server" in help_result.stdout
        assert invoke("--not-a-querylane-flag").returncode != 0
        if commands_only:
            print(f"PASS: {version.stdout.strip()} — version, help, invalid flag (server lifecycle not checked on Windows)")
            return

        config = Path(directory) / "config.yaml"
        config.write_text("http:\n  access_log: false\n")
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            port = reserved.getsockname()[1]
            reserved.listen()
            conflict = invoke("server", "start", "--config", str(config), "--host", "127.0.0.1", "--port", str(port))
            assert conflict.returncode != 0, "An occupied port must fail, not report success"
            assert (conflict.stdout + conflict.stderr).count("address already in use") == 1, "Listen failures must be reported once"

        invalid_config = Path(directory) / "invalid.yaml"
        invalid_config.write_text("http:\n  port: not-a-port\n")
        assert invoke("server", "start", "--config", str(invalid_config)).returncode != 0

        log_path = Path(directory) / "server.log"
        process = None
        with log_path.open("w+") as log:
            try:
                for attempt in range(3):
                    # Use a fresh port, not the one from the deliberate conflict check.
                    # A competing process can still bind it before us: retry only bind conflicts.
                    with socket.socket() as available:
                        available.bind(("127.0.0.1", 0))
                        port = available.getsockname()[1]
                    base = f"http://127.0.0.1:{port}"
                    log.seek(0)
                    log.truncate()
                    process = subprocess.Popen(
                        [binary, "server", "start", "--config", str(config), "--host", "127.0.0.1", "--port", str(port)],
                        cwd=directory, env=env, stdout=log, stderr=log,
                    )
                    deadline = time.monotonic() + 30
                    ready = False
                    while True:
                        if process.poll() is not None:
                            log.seek(0)
                            output = log.read()
                            if attempt < 2 and "bind:" in output and "address already in use" in output:
                                print("Retrying smoke server after a bind conflict", file=sys.stderr)
                                break
                            raise RuntimeError("Server exited before becoming ready")
                        try:
                            with urlopen(base, timeout=1) as response:
                                html = response.read().decode()
                                assert response.status == 200
                            ready = True
                            break
                        except URLError as error:
                            if time.monotonic() >= deadline:
                                raise RuntimeError("Server did not become ready") from error
                            time.sleep(0.1)
                    if ready:
                        break

                assert "querylane" in html.lower(), "Embedded UI is missing"
                assets = re.findall(r'<script[^>]+src="([^"]+)"', html)
                assert assets, "No bundled JavaScript assets"
                for asset in assets:
                    assert asset.startswith("/"), f"UI asset must be local: {asset}"
                    with urlopen(base + asset, timeout=5) as response:
                        assert "javascript" in response.headers["Content-Type"]
                        assert len(response.read()) > 0

                with urlopen(base + "/instances/local/databases/postgres", timeout=5) as response:
                    assert response.read().decode() == html, "SPA deep links must serve the UI"

                request = Request(
                    base + "/querylane.console.v1alpha1.OnboardingService/GetOnboardingState",
                    data=b"{}", headers={"Content-Type": "application/json"},
                )
                with urlopen(request, timeout=5) as response:
                    state = json.load(response)
                    assert not state.get("isConfigured", False), state

                process.terminate()
                assert process.wait(timeout=20) == 0, "Shutdown must succeed"
            except BaseException:
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
            finally:
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

        print(f"PASS: {version.stdout.strip()} — version, help, invalid input, occupied port, UI assets, SPA, onboarding, shutdown")


def smoke_archive(directory, target, version):
    windows = target.startswith("windows_")
    filename = f"querylane_{version}_{target}.{'zip' if windows else 'tar.gz'}"
    directory = Path(directory)
    matches = [line.split()[0] for line in (directory / "checksums.txt").read_text().splitlines()
               if len(line.split()) == 2 and line.split()[1].lstrip("*") == filename]
    archive_path = directory / filename
    assert len(matches) == 1, f"Expected one checksum for {filename}"
    assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == matches[0], f"Checksum mismatch: {filename}"
    with tempfile.TemporaryDirectory(prefix="querylane-archive-") as extracted:
        name = "querylane.exe" if windows else "querylane"
        binary = Path(extracted) / name
        # Extract only the executable: never materialize arbitrary archive paths.
        if windows:
            with zipfile.ZipFile(archive_path) as archive:
                binary.write_bytes(archive.read(name))
        else:
            with tarfile.open(archive_path) as archive:
                member = archive.getmember(name)
                assert member.isfile(), "Archive executable must be a regular file"
                with archive.extractfile(member) as source:
                    binary.write_bytes(source.read())
        binary.chmod(0o755)
        smoke(binary, version, commands_only=windows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", help="Executable, or artifact directory when --archive-target is used")
    parser.add_argument("version", nargs="?")
    parser.add_argument("--archive-target", choices=[f"{os}_{arch}" for os in ("darwin", "linux", "windows") for arch in ("amd64", "arm64")])
    args = parser.parse_args()
    if args.archive_target:
        if not args.version:
            parser.error("archive checks require an expected version")
        smoke_archive(args.binary, args.archive_target, args.version)
    else:
        smoke(args.binary, args.version, commands_only=os.name == "nt")
