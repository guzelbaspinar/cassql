# cassql — release checklist (fetch-kit model)

Package: **`@guzelbaspinar/cassql`** (scoped, public). GitHub: **guzelbaspinar/cassql**. Workflow: `.github/workflows/publish.yml`.

The unscoped name `cassql` is blocked by npm (too similar to `mssql` / `casual`); use the scoped name above.

## One-time: first npm version (before Trusted Publisher)

Trusted Publisher on npmjs.com requires the package to exist.

```bash
npm login
npm run verify
npm publish --access public
npm view @guzelbaspinar/cassql version   # expect 0.1.0
```

## One-time: npm Trusted Publisher (OIDC, no `NPM_TOKEN`)

After **0.1.0** is visible on https://www.npmjs.com/package/@guzelbaspinar/cassql:

npmjs.com → **@guzelbaspinar/cassql** → Settings → **Trusted Publisher** → GitHub Actions:

| Field | Value |
|--------|--------|
| Organization or user | `guzelbaspinar` |
| Repository | `cassql` |
| Workflow filename | `publish.yml` |

**Allowed actions (cassql):** enable **Allow `npm publish`**. CI runs `npm publish --access public` via OIDC (direct publish; no staging step). fetch-kit still uses stage publish + npm approval.

**Publishing access:** align with fetch-kit (**Require two-factor authentication or a granular access token with bypass 2FA enabled**). OIDC trusted publishing is separate from classic tokens.

Do **not** add `NPM_TOKEN` to GitHub Secrets for this repo.

## GitHub: `main` ruleset (same as fetch-kit)

Repository **Rules → Protect main** (ruleset):

- PR required (0 approvals; unattributed-change rule on)
- Required checks: `test (20.x)`, `test (22.x)`, `coverage` (strict / up to date)
- Block branch deletion, non-fast-forward pushes, direct updates without PR
- Repository admin bypass for your user (emergency only)

Classic branch protection was removed in favor of this ruleset.

## Routine release (0.1.1+)

1. Bump `version` in `package.json` and `package-lock.json`.
2. Update `CHANGELOG.md`.
3. Open a PR to `main` → wait for **CI** (`test (20.x)`, `test (22.x)`, `coverage`).
4. Merge, then create a GitHub **Release** with tag `vX.Y.Z` matching `package.json`.
5. **Publish** workflow publishes to npm via OIDC (version is public when the job succeeds).

Emergency: **Actions → Publish → Run workflow** (`workflow_dispatch`).
