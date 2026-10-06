"""Exercise the smoke verifier's retry policy through its command-line seam."""

import os
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import tarfile
import unittest
import zipfile


@unittest.skipIf(os.name == "nt", "Full server smoke is Unix-only; Windows uses command checks")
class SmokeRetryTest(unittest.TestCase):
    def run_smoke(self, failure, archive_target=None, corrupt=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            attempts = root / "attempts"
            binary = root / "querylane"
            binary.write_text(f"#!{sys.executable}\n" + r'''
import os, signal, socket, sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
args = sys.argv[1:]
if args == ['--version']: print('1.2.3'); sys.exit(0)
if args == ['--help']: print('server'); sys.exit(0)
if args == ['--not-a-querylane-flag']: sys.exit(1)
if 'invalid.yaml' in args[args.index('--config') + 1]: sys.exit(1)
port = int(args[args.index('--port') + 1])
try:
    with socket.socket() as probe: probe.bind(('127.0.0.1', port))
except OSError:
    print('bind: address already in use', file=sys.stderr); sys.exit(1)
path = Path(os.environ['SMOKE_ATTEMPTS'])
attempt = int(path.read_text()) + 1 if path.exists() else 1
path.write_text(str(attempt))
failure = os.environ['SMOKE_FAILURE']
if failure == 'always' or (failure == 'once' and attempt == 1):
    print('bind: address already in use', file=sys.stderr); sys.exit(1)
if failure == 'other':
    print('config could not be read', file=sys.stderr); sys.exit(1)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript' if self.path == '/app.js' else 'text/html')
        self.end_headers()
        self.wfile.write(b'console.log(1)' if self.path == '/app.js' else b'<title>Querylane</title><script src="/app.js"></script>')
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.send_response(200); self.send_header('Content-Length', '2'); self.end_headers(); self.wfile.write(b'{}')
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
HTTPServer(('127.0.0.1', port), Handler).serve_forever()
''')
            binary.chmod(0o755)
            command = [sys.executable, "scripts/smoke-cli.py", str(binary), "1.2.3"]
            if archive_target:
                windows = archive_target.startswith("windows_")
                archive = root / f"querylane_1.2.3_{archive_target}.{'zip' if windows else 'tar.gz'}"
                if windows:
                    with zipfile.ZipFile(archive, "w") as package:
                        package.write(binary, "querylane.exe")
                else:
                    with tarfile.open(archive, "w:gz") as package:
                        package.add(binary, arcname="querylane")
                checksum = "0" * 64 if corrupt else hashlib.sha256(archive.read_bytes()).hexdigest()
                (root / "checksums.txt").write_text(f"{checksum}  {archive.name}\n")
                command = [sys.executable, "scripts/smoke-cli.py", str(root), "1.2.3", "--archive-target", archive_target]
            result = subprocess.run(
                command,
                env={**os.environ, "SMOKE_ATTEMPTS": str(attempts), "SMOKE_FAILURE": failure},
                capture_output=True, text=True, timeout=10,
            )
            return result, int(attempts.read_text()) if attempts.exists() else 0

    def test_retries_a_bind_conflict_on_a_new_port(self):
        result, attempts = self.run_smoke("once")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(attempts, 2)
        self.assertIn("PASS:", result.stdout)

    def test_stops_after_three_bind_conflicts(self):
        result, attempts = self.run_smoke("always")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(attempts, 3)
        self.assertIn("address already in use", result.stderr)

    def test_does_not_retry_unrelated_startup_errors(self):
        result, attempts = self.run_smoke("other")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(attempts, 1)
        self.assertIn("config could not be read", result.stderr)

    def test_runs_the_binary_from_a_checked_release_archive(self):
        result, attempts = self.run_smoke("none", archive_target="linux_amd64")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(attempts, 1)

    def test_windows_zip_runs_command_checks_without_server_lifecycle(self):
        result, attempts = self.run_smoke("none", archive_target="windows_amd64")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(attempts, 0)
        self.assertIn("server lifecycle not checked on Windows", result.stdout)

    def test_rejects_a_corrupted_archive_before_execution(self):
        result, attempts = self.run_smoke("none", archive_target="linux_amd64", corrupt=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(attempts, 0)
        self.assertIn("Checksum mismatch", result.stderr)


if __name__ == "__main__":
    unittest.main()
