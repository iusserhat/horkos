# Secret scan before making the repo public

13 Nov 2026, 17:13 TSİ, commit `HEAD` at the time (30 commits, all branches).

- Tool: gitleaks 8.30.1, official GitHub release `gitleaks_8.30.1_linux_x64.tar.gz`, sha256 checked against `gitleaks_8.30.1_checksums.txt` (OK).
- Command: `gitleaks git <repo> --redact --report-format json`.
- Result: 1 finding, a false positive: rule `generic-api-key` in `verifier/Cargo.lock` line 188 (commit `83866d9`), the dependency name `crypto_secretbox` next to a crate checksum. No secret.
- Extra checks (gitleaks has no NEAR key rule): `git log --all -p` searched for `ed25519:` strings of 60+ base58 characters (NEAR private keys are ~88): none. Keyword search for `private_key` / `secret_key` / `seed_phrase` / `mnemonic`: only code that reads the local keychain (`demo/config.ts`, `mcp/server.ts`). No `.env`, `.pem`, `*key.json` or credentials files ever committed.
- History was not rewritten at that time.

## History rewrite and re-scan (13 Nov 2026, ~20:05 TSİ)

- Commit `1a6ea49` (hash before the rewrite) had added 16 Chrome profile folders that Lighthouse created under `web/` (`web/C:\Users\a\AppData\Local\lighthouse.*`, 2592 files); gitleaks found nothing in them. They were removed from all history with `git filter-repo --path-glob 'web/C:*' --invert-paths` after a `git clone --mirror` backup outside the repo, and pushed with `--force-with-lease`. Checked: 41 commits before and after, same messages, authors and dates; every commit's tree identical apart from those paths; final tree identical (`16cb919…`); packed size 19.68 MiB → 19.05 MiB. Commits from `1a6ea49` on have new hashes.
- Re-scan of all history (44 commits; gitleaks reports 43 scanned): the same single false positive (`verifier/Cargo.lock` line 188, commit `83866d9`). `ed25519:` strings of 60+ base58 characters: none. Keyword hits (`private_key`, `secret_key`, ...): code that reads the local keychain and this file only. No `.env`, `.pem`, `*key.json` or credentials files in any commit.
- Re-run before the repo goes public if new commits land.
