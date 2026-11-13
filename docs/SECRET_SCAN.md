# Secret scan before making the repo public

13 Nov 2026, 17:13 TSİ, commit `HEAD` at the time (30 commits, all branches).

- Tool: gitleaks 8.30.1, official GitHub release `gitleaks_8.30.1_linux_x64.tar.gz`, sha256 checked against `gitleaks_8.30.1_checksums.txt` (OK).
- Command: `gitleaks git <repo> --redact --report-format json`.
- Result: 1 finding, a false positive: rule `generic-api-key` in `verifier/Cargo.lock` line 188 (commit `83866d9`), the dependency name `crypto_secretbox` next to a crate checksum. No secret.
- Extra checks (gitleaks has no NEAR key rule): `git log --all -p` searched for `ed25519:` strings of 60+ base58 characters (NEAR private keys are ~88): none. Keyword search for `private_key` / `secret_key` / `seed_phrase` / `mnemonic`: only code that reads the local keychain (`demo/config.ts`, `mcp/server.ts`). No `.env`, `.pem`, `*key.json` or credentials files ever committed.
- History was not rewritten. Re-run before the repo goes public if new commits land.
