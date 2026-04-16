# Security Report: Local Private Key Exposure in `.venv`

Date: 2026-04-15
Severity: High
Status: Mitigated for future commits in this checkout

## Summary

Verification confirmed that the extension workspace contains a PEM-encoded private key inside a local Python virtual environment:

- Path: `extension/.venv/lib/python3.13/site-packages/tornado/test/test.key`
- Header: PEM private-key block (`BEGIN ... PRIVATE KEY`)

The originally reported risk was that `.venv` had been committed. In the current checkout, that claim is only partially reproducible:

- `extension/.venv` exists locally and contains sensitive key material.
- `extension/.gitignore` did not previously ignore `.venv/`.
- The current Git index does not track `.venv` in this checkout.

That still left a real prevention gap: a future `git add` could have staged the virtual environment and exposed the key.

## Changes Applied

The following guardrails were added:

1. `extension/.gitignore` now explicitly ignores `.venv/` and `venv/`.
2. `scripts/check-secrets.sh` was added to scan the repo for common PEM private-key headers.
3. `package.json` now exposes `npm run security:scan` for repeatable local checks.

## Validation

- `git check-ignore -v .venv/lib/python3.13/site-packages/tornado/test/test.key` now resolves to `extension/.gitignore`.
- `npm run security:scan` now passes from the repo root because the virtual environment is ignored and no non-ignored PEM private-key headers remain.

## Recommended Follow-Up

1. Remove the local virtual environment if it is not needed: `rm -rf extension/.venv`
2. If `.venv` or the key ever existed in prior commits or remote mirrors, purge history with `git filter-repo` or BFG Repo-Cleaner.
3. Rotate any secrets or trust relationships if this key was ever repurposed outside third-party test fixtures.
4. Consider wiring `npm run security:scan` into CI before packaging or release.
