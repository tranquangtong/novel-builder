# Collab config — Novel Builder

## Stack
- Next.js 16 (static export) + React 19, TypeScript; Cloudflare Worker (`worker/`) with R2 + D1
- Firebase auth; Vitest (unit), Playwright (E2E); CI/deploy: `.github/workflows/pages.yml`
- Novel "The Last Miracle" (Vietnamese) lives on the site, NOT in this repo; access via `.claude/novel/nb.py`

## Commands
- Install: `npm ci`
- Test: `npm test` (Vitest) · E2E: `npm run test:e2e` (needs build)
- Lint/typecheck: `npm run lint` · `npm run typecheck`
- All-in-one before done: `npm run check` (lint + typecheck + test + build)
- Run/dev: `npm run dev` · Worker local: `npx wrangler dev` (needs `.dev.vars`)
- Novel: `python3 .claude/novel/nb.py …` (word count: `nb.py wc <files>`)

## Roles (overrides global routing)
- lead: whoever the user is chatting with (usually Claude)
- codex: Worker/API + lib logic, tests, fixing CI/build, reviewing every code diff before merge
- agy: UI/CSS/components, docs; novel: drafting/revising chapters, second-opinion QC, canon lookups across many chapters

## Permissions
- codex: may edit (worktree, -w)
- agy: may edit (worktree, -w; file edits only)
- Never touch: no hard bans; still don't change deps/lockfile, `migrations/`, `wrangler.jsonc` or CI unless the task says so

## Project rules
- Code: `npm run check` must pass (lead runs it for agy's work) before reporting done.
- Follow `CLAUDE.md` + `templates/manuscript/AGENTS.md`; UI text and novel prose are Vietnamese.
- Novel content: canon in `.claude/novel/canon-checklist.md`; chapter ids never change.

## Workflow — novel content (overrides global)
1. Codex via `ask-codex` has project-scoped network access to
   `novel-builder.tongquangtran.workers.dev` (plus localhost for tests), in both read-only and
   write mode. The bridge inherits `NB_AGENT_TOKEN` or loads it from macOS Keychain
   (`ai-bridge.novel-builder`, account `novel-builder`); never print it or put it in prompts/logs.
   Set up the token with `~/.ai-bridge/bin/nb-access setup` (hidden native form); verify with
   `~/.ai-bridge/bin/nb-access check`. Codex can read chapters/notes directly with nb.py;
   read-only tasks use `project`/`get` to stdout, not `pull` to files.
   For teammates without direct access (including Antigravity), the lead still fetches needed
   chapters/notes into `.drafts/` and passes file paths (outline, prior chapters, canon checklist).
   If Codex has no token or the site is unavailable, use the same offline fallback.
2. `.drafts/` is gitignored, so with `-w` teammates write drafts to `<worktree>/.drafts/…`;
   the lead copies them back into the main repo's `.drafts/` before `ai-bridge clean`.
3. Every content change still goes through the mandatory 2-round QC in `CLAUDE.md`
   (QC 1 → fix → QC 2 → fix → lead self-check → report). A teammate may be the writer or a QC
   round, but the lead owns the round count and the final check.
4. Only the lead sends proposals to the site (nb.py) and reports to the author.
