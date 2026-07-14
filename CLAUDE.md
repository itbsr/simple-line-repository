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

- Parsing is config-driven, not hard-coded to one LINE export format. A JSON config supplies:
  - `participants`: known speaker names, used to validate that a matched message-header line is real (guards against false positives from message content that happens to look like a header).
  - `dateHeaderPattern`: regex with named groups `year`, `month`, `day`, matching date-separator lines.
  - `messageLinePattern`: regex with named groups `hour`, `minute`, `user`, `content`, matching a message header line.
  - `timezone`: default `Asia/Tokyo`.
- A line only starts a new message when it matches `messageLinePattern` AND the captured `user` is present in `participants`. Otherwise treat the line as a continuation of the previous message's content (multi-line messages), or as ignorable preamble if no message has started yet.
- The deduplication key for stored messages is the exact tuple `(timestamp, username, content)`. Re-importing overlapping or previously-seen chat history must not create duplicate rows.

## Conventions

- Keep the parser (regex/matching logic) covered by unit tests — it is the highest-risk part of this tool, and format edge cases (multi-line messages, date-header lines, false-positive header matches) are easy to regress silently.
- Do not hard-code assumptions about the LINE export format into the parser; keep behavior driven by the JSON config so the user can adapt it to formatting variations without code changes.
- Do not add CLI features, output formats, or storage backends beyond what has been requested.

## Git Workflow

- Use GitHub Flow: branch off `main` for each unit of work, commit there, push, and open a PR. Do not commit directly to `main`.
- Keep PRs scoped to one coherent change (e.g. docs, parser, storage, CLI commands as separate PRs where reasonable).
- Suggested branch prefixes: `feat/`, `fix/`, `docs/`, `chore/`.
