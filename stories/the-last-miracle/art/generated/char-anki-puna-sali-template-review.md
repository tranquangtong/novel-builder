# Character sheets: new template review

Generated using the built-in `image_gen.imagegen` tool; exact prompts are in `char-anki-puna-sali-template-prompts.json`. All inputs were read from this worktree. No nb.py, network lookup, other agents, source-image edits, or main-checkout file operations were used.

## Anki

- Attached: `../characters/char fei hong.png` (layout/style), `../characters/char anki.png` (identity).
- Saved: `char anki - template moi.png`; 1536 x 1024 PNG; 1 attempt.
- Visual check: template layout, main full body, three consistent turnarounds, large portrait, three framed expressions, three detail callouts, three swatches, Vietnamese labels and diacritics, and three-line info block without height all present.
- Identity check: black tousled hair, brown eyes, athletic muscular build, worn brown vest/cargo pants/boots, charcoal tank, ivory wraps, human ears, no tail, red fist mana preserved. No visible canon disagreement in the old sheet. Wrapped fists are the weapon shown by the reference; no separate weapon was invented.

## Puna

- Attached attempt 1: `../characters/char fei hong.png` (layout/style), `../characters/char puna.png` (identity). Attempt 2 additionally attached attempt 1 as the correction target.
- Saved: `char puna - template moi.png`; 1536 x 1024 PNG; 2 attempts.
- Visual check: layout, full bodies, portrait, expressions, callouts, swatches and requested Vietnamese text present; no height line. Ash-gray hair, face, navy/gold clothing, ivory cloak, right shoulder armor, sword and golden honeycomb shield retained.
- Old-sheet disagreement: scar runs vertically, contrary to the requested horizontal scar. Left ear tip loss is not clearly visible in the old reference. Canon corrections were explicitly requested in both prompts.
- Final side check: anatomical right eye remains amber, anatomical left eye cloudy/blind (viewer right in frontal faces); the detail shows the left ear truncated and right ear pointed.
- **REMAINING QC ISSUE:** retry added the horizontal scar across the left eye but retained a vertical forehead/cheek scar remnant in some portraits. This deliverable is a review candidate, not a full canon pass. Stopped after the single allowed retry; no third attempt.

## Sali

- Attached: `../characters/char fei hong.png` (layout/style), `../characters/char sali.png` (identity). Optional jade-mana image was not attached.
- Saved: `char sali - template moi.png`; 1536 x 1024 PNG; 1 attempt.
- Visual check: template layout, full bodies, portrait, expressions, callouts, swatches, requested Vietnamese labels and info without height all present.
- Identity check: youthful slender male, deep sea-blue tied hair, violet eyes, finlike ears, dark silver-trimmed suit, ivory shirt, violet patterned tie, pins/chains, buckled boots and purple-backed cards retained.
- Old-sheet disagreement corrected: green mana replaced by blue rippling waves around cards and hand.

## File and project checks

- Opened references and visually inspected every generation, including Puna retry. System.Drawing decoded all three final PNGs and confirmed exactly 1536 x 1024 pixels.
- `npm run check`: failed at lint because `eslint` is not installed/available; typecheck, tests and build did not run. Lead should install existing dependencies and run `npm run check` in an enabled environment.
- Git staging failed: cannot create `D:/Git Clones/novel-builder/.git/worktrees/codex-char-anki-puna-sali/index.lock` (permission denied). Files remain uncommitted; no push or merge attempted. Lead should stage only the three new PNGs and these two review/prompt files, then commit with `codex: char-anki-puna-sali`.
