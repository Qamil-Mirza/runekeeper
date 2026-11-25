---
name: lab-reporting
description: Use when posting protocols, reports, or pod run status to the owner's Lab dashboard with the lab CLI.
---

# Lab reporting

The `lab` command talks to the owner's Lab dashboard. Every command prints one
line, or `lab: <message>` and a non-zero exit on error. Read the message; it
says what went wrong.

## Advisor

- Post every protocol before asking the owner anything about it:
  `lab protocol post <file.md> --experiment E10 --title "..."`
- To revise a protocol, post again with
  `--revises <id from lab inbox or from the post>`: `lab inbox` prints each
  verdict's protocol id, and `lab protocol post` prints the new id.
- Post each report as one self-contained HTML file: plots inline as SVG or PNG
  data or inlined JS, no external URLs, at most 4 MB:
  `lab report post <file.html> --experiment E9 --title "..." --summary "..."`
- Run `lab inbox` before revising a protocol or starting new work. It prints
  each verdict and reply not yet seen. `lab inbox --all` reprints history.

## Executor

- `lab run start --experiment E9 --stage held-out --setup <setupId> --pod <podId> --cap 15`
  the moment a pod is created. It prints the run id.
- `lab run end <runId> --status done|failed|stopped [--note "..."]` when the
  pod is deleted or fails.
- An accepted protocol is not the go. Start a pod only after the owner's own
  typed line in your pane.

## Progress poller

- `lab run list` shows running runs with their ids, pod ids and stages.
- `lab run progress <runId> <pct> [--eta 18:10]` at least every 10 minutes
  while a run is running. `--eta` is a Pacific time (today or the next
  occurrence) or ISO 8601.

## Install (for the owner)

1. Copy `lab.mjs` into a directory on PATH as `lab`, and make it executable.
   It needs Node 20 or newer and has no dependencies.
2. Put the agent's token in a file (default `~/.config/lab/token`, or point
   `LAB_TOKEN_FILE` at it) and run `chmod 600` on it. The CLI refuses a file
   others can read. The advisor and executor use different tokens.
3. Set `LAB_URL` if the dashboard is not at `http://127.0.0.1:3000`.
4. Copy this skill into the agents' Claude skills directory.
