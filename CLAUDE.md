# repoLine Agent Instructions

This repository implements `repoLine`, a CLI tool that parses LINE chat history pasted by the user, stores it, and lets the user retrieve previously parsed conversations.

## Instruction Authority

- `CLAUDE.md` (this file) is the single source of truth for agent instructions in this repository.
- `AGENTS.md` here is a local, gitignored symlink to `CLAUDE.md` for tools that look for that filename. Do not track it in git, edit it, or replace it with a real file — edit `CLAUDE.md` instead.
- If a `GEMINI.md` symlink is needed later, point it to `CLAUDE.md` as well and keep it gitignored, matching `AGENTS.md`.

## Project Summary

See `README.md` for the user-facing description, config format, and planned CLI usage. Keep `README.md` in sync whenever the design or CLI surface changes.

## Tech Stack Decisions

- Language/runtime: TypeScript on Node.js.
- Storage: SQLite (single-file database).

## Design Overview

- The date-header and message-header line formats (`2026.06.01 Monday`, `HH:MM <name> <content>`) are fixed constants in `src/parser.ts` (`DATE_HEADER_PATTERN`, `TIME_PREFIX_PATTERN`), not config fields — only one real LINE message-copy format has been observed (the user selects a range of messages in the LINE app's talk screen and copies it — there's no formal "export" feature involved), so making the regex shapes configurable added validation complexity (regex compilation, named-group checks) without a concrete second format to justify it. If a genuinely different copied format ever needs support, change these constants (and their tests) rather than reintroducing a config field for them.
- A JSON config (`ParserConfig` in `src/types.ts`) supplies only what actually varies per conversation:
  - `participants`: known speaker names. A line only starts a new message when it matches `TIME_PREFIX_PATTERN` AND the text right after the matched prefix starts with one of these names followed by a separator (a single half-width space; a name with nothing after it does not count). Names are matched as literal strings (not regex), so the config never needs regex escaping.
  - The separator is a half-width space only — confirmed against real LINE data copied from the app, where tabs and full-width spaces only ever occur inside message bodies, never as the header separator. Widening it (e.g. to tabs or full-width spaces) would only add false-positive risk.
  - `timezone`: UTC offset in hours (e.g. `9`), not an IANA zone name — this tool only ever needs a fixed offset, so there's no reason to pay for zone-name resolution. Defaults to `9` when omitted.
- A line matching `DATE_HEADER_PATTERN` is only treated as a genuine date header (`matchConfirmedDateHeader` in `src/parser.ts`) when the next line (or end of input) matches a message header. This exists because a quoted date inside message content — e.g. someone pasting/forwarding an interview date — is byte-identical to a real date header; there's no participant-style whitelist to disambiguate it the way `matchMessageHeader` has. A line that fails this check is not an error: it's simply not classified as a date header, and falls through to be treated like any other line (continuation content of an open message, most likely).
- Confirmed date headers must not move backward in time relative to the previously confirmed one; a real single LINE paste is always chronological, so a backward jump means either an unrelated quoted date slipped through or the paste isn't contiguous. Forward jumps of any size are allowed (multi-day gaps between messages are normal), which means a quoted date that (a) is coincidentally later than the running date, (b) has a coincidentally-correct weekday, and (c) is immediately followed by a real message header will still misread as a genuine day change — this is an accepted, undetectable-by-heuristic limitation of parsing plain pasted text, not a bug to keep chasing. See issue #4.
- The pasted text's first line must be a message-header line or a confirmed date-header line. Elsewhere, a line that is neither a confirmed header nor a continuation of a currently open message (i.e. nothing is open to attach it to) is also an error. Any error, from any line, rejects the entire parse (`ok: false`, no messages returned) — errors are collected across the whole input rather than stopping at the first one, so a single parse can surface multiple independent problems at once.
- A message that never had a preceding confirmed date-header line in this parse (e.g. the paste starts mid-day) is returned with `date: null` ("unresolved"). The parser itself never touches the DB — resolving an unresolved message is the storage layer's job: hash `(hour, minute, username, content)` (no date) and look it up against previously stored messages. A hit means it's already known (skip); a miss means the import as a whole must be rejected as an error, since the message's real date can't be determined.
- The deduplication key for a fully-resolved stored message is a hash of `(timestamp, username, content)`. Re-importing overlapping or previously-seen chat history must not create duplicate rows. Import is all-or-nothing: if any line produces an error, nothing from that import is written to the DB.

## Conventions

- Keep the parser (regex/matching logic) covered by unit tests — it is the highest-risk part of this tool, and format edge cases (multi-line messages, date-header lines, false-positive header matches) are easy to regress silently.
- Data that varies per conversation (`participants`) belongs in the JSON config. The copied text's format (date/time regex patterns) is a code-level constant, not a config field — see Design Overview.
- Do not add CLI features, output formats, or storage backends beyond what has been requested.
- Default to no comments. Only add one for a non-obvious WHY: a hidden constraint, a subtle invariant, a workaround for a specific bug, or a design choice a reader would otherwise second-guess (e.g. why `SEPARATOR` is half-width-space-only, why `matchDateHeader` doesn't itself validate semantics). Never write a comment that narrates an edit ("removed X", "was previously Y") — state the current fact/reason only, since a reader with no diff context can't make sense of a reference to a past state.

## Git Workflow

- Use GitHub Flow: branch off `main` for each unit of work, commit there, push, and open a PR. Do not commit directly to `main`.
- Keep PRs scoped to one coherent change (e.g. docs, parser, storage, CLI commands as separate PRs where reasonable).
- Suggested branch prefixes: `feat/`, `fix/`, `docs/`, `chore/`.
