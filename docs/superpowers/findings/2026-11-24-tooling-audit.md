# Tooling audit — 2026-11-24

Each plugin was cloned from its official repo (owner and name checked against the
plan), then its manifest, hook files and hook scripts were read **before**
anything was enabled. Plan rule: if a hook writes outside the project or sends
data off the machine, stop and ask the owner. Three of five trip that rule.

| Plugin | Repo | Commit | Version | Verdict |
|---|---|---|---|---|
| hallmark | Nutlope/hallmark | 04977e1 | 2.0.0 | **Installed.** No hooks, no MCP. |
| brag | latent-spaces/brag | 0637943 | 0.6.0 | **Installed.** No hooks, no MCP. |
| ponytail | DietrichGebert/ponytail | ebd8654 | 5.3.3 | **Held** for owner decision |
| impeccable | pbakaus/impeccable | b49177d | 4.10.0 | **Held** for owner decision |
| ECC | affaan-m/ECC | 4adeee6 | 2.2.3 | **Held** for owner decision |
| Graphify | Graphify-Labs/graphify (PyPI `graphifyy`) | — | 0.9.119 | **Installed** as a user skill |

## Installed

**hallmark and brag** register skills only. brag ships helper scripts
(`scripts/check-*.mjs`) that run only when its skill is invoked.

**Graphify.** PyPI metadata names `https://github.com/Graphify-Labs/graphify` as
the repository, matching the plan. Installed with `python -m pip install --user
graphifyy` (v0.9.119, uploaded the same day), then `graphify install --platform
claude`, which copied a skill to `~/.claude/skills/graphify` and touched nothing in
the repo. `graphify claude install` was **not** run: it edits the checked-in
`CLAUDE.md` and adds a hook. The executable is at
`...\Python312\Scripts\graphify.exe`, which is **not on PATH**; use the full path
or add that folder to PATH. Code is parsed locally; docs and images are sent to the
Claude API for extraction.

## Held, and why

**ponytail** — hooks on `SessionStart`, `SubagentStart`, `UserPromptSubmit` run
local Node scripts from the plugin folder; the mode tracker spawns a detached
helper. A "task board" (`userConfig.ledger`, **on by default**) writes a CSV row
(cost, turns, tokens) after every turn to `~/.config/ponytail/band/<project>.csv`:
**outside the project**. A webhook can send the same row off the machine, but it
is empty by default, https-only, and the code says nothing leaves with it empty.
*Safe setting:* install with `ledger` off and the webhook left blank.

**impeccable** — hooks on `SessionStart`, `PostToolUse` (every Edit/Write) and
`Stop` run `impeccable hook`. That script **downloads a prebuilt native binary**
from `github.com/pbakaus/impeccable/releases` (engine v0.1.27) into a cache folder
**outside the project**, verifies it against `engine-checksums.txt` shipped in the
same repo, and runs it. The checksum shares a trust root with the binary, so it
catches corruption, not a compromised repo. `live-browser.js` talks to `localhost`
only. *Safe setting:* install, but remove `hooks/hooks.json` from the cached copy
so nothing runs on every edit; run the design checks by hand during Plan 2.

**ECC** — 72 agents, 328 skills, 99 command shims, **25 hook entries** (PreToolUse
on every tool, UserPromptSubmit, PreCompact, Stop ×8, SessionEnd). Hooks write
outside the project (`~/.claude/metrics/costs.jsonl`, state under the home folder),
read home-folder MCP configs, and one library file makes an outbound HTTPS request
(`scripts/lib/nasiko-release.js`). `.mcp.json` starts `npx -y
chrome-devtools-mcp@1.10.1` (downloads and runs an npm package; gives browser
control). 328 skills also add a long skill list to every session's context.
*Safe setting:* project-scoped, `hooks_enabled` off, `.mcp.json` removed from the
cached copy. Or skip ECC: Superpowers already covers planning, TDD and review, and
much of ECC overlaps it.

## How these were checked

Manifests and `hooks.json` files read in full; hook commands listed per event;
scripts grepped for `fetch`, `http(s).request`, `curl`, `wget`, `child_process`
and home-folder paths. This was a targeted read, not a line-by-line review of every
script, so "no network call found" means none was found by that search.
