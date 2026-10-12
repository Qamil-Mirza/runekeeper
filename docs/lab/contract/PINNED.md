# Pinned Lab Manager API contract

The files in this directory are unmodified copies from the Lab Manager repository (`the-lab`), directory `docs/api/`.

| | |
|---|---|
| Spec version | 1.0.0-draft.23 |
| Source commit | `2236a92` (branch `feat/m2-service-foundation` in the-lab) |
| SHA-256 of `openapi.yaml` | `9e5474aaed4a10b8c9eb1c1a4d420341d81000da45d782a45f57ee722a2e92fd` |
| SHA-256 of `binding-vectors.json` | `810a758e1c1d47be04f80d70d55dcda0137e1f74d0e186ec7bcde950bd0605e7` |
| Pinned on | 2026-10-11 |
| Status | Agreed by both sessions. Additive over draft.8 to draft.11. |

Previous pins: draft.22 at `2f542ff`, draft.21 at `9004345`, draft.20 at `8566245`, draft.18 at `d31b733`, draft.17 at `3022502`, draft.16 at `7ca0439`, draft.15 at `9fa649d`, draft.14 at `9fd203a`, draft.13 at `7918f04`, draft.11 at `5ddfdf3`, draft.9 at `657f691`, draft.8 at `5108015`, draft.6 at `8b4dd31`, draft.3 at `8e63b7a62b26b275e6d8f5eb8a031e507a30cdc7`, draft.4 at `9b7d41f`, draft.5 at `a1b8f3b`. Draft.4 replaced the signed-authorization scheme (`lab-authz-v2`: bindings, expiry, nonce) and added `binding` and `bindingHash` to approvals and jobs. Draft.5 is non-breaking: it defines `keyId`, documents the reasons for a rejected signature, and states that both sides read the service token from a file. Draft.6 is non-breaking: an approval binding's `experimentId` is exactly the job's; experiment, budget and other approvals are never created by a draft manager and a client offers only `denied` for them; approving a budget request never changes a limit by itself. The test vectors are unchanged.

Draft.8 is breaking for signing: the signed text is `lab-authz-v3`, the only signed actions are `approval.decision` and `budget.set` (a lab's spending limit, with the host policy hash in the binding), and no binding carries a dollar figure except the spending limit. Job retry and experiment conclusions are no longer signed. It adds tool input and output in transcripts, read-only workspace files, a three-block budget (runtime, spend, estimates) and policy, subscription and resource status in health. `Budget.limits`, `Budget.consumed` and `Job.usage.costUsd` are kept, deprecated, for one release.

Do not edit these copies. Contract changes are made in the-lab first, reviewed by both sessions, then re-pinned here with a new commit and checksums. After re-pinning, run `npm run lab:types` and `npm run test:lab`.

Draft.9 is additive: standing rules for manual mode that are set only in the Lab Manager's host configuration (`workspaceWrites`, `webSearch`, and refusing at once what no rule covers), reported in `Health.capabilities`, and a `standingRule` decision on a tool call may now be a refusal. Nothing signed changed; the test vectors are unchanged.

Draft.10 is additive: delegation. When the host allows it (`Health.capabilities.delegation`), in manual mode, each handoff the Orchestrator records while answering the owner is started by the manager as a task for the role it names, one hop only, up to `Health.limits.delegationsPerMessage`. `Job.origin` gains `delegated`; `Job.delegation` and `Job.delegations` link the two sides; the target sees a `delegatedInstruction` transcript item, never a human message.

Draft.11 is additive: a refused entry in `Job.delegations` carries `body`, the instructions the target would have been given, so the owner can read them and send them as their own instruction.

Draft.12 is additive: a lab can be archived and unarchived (nothing is deleted). Runekeeper does not surface it.

Draft.13 is additive: `DELETE /v1/labs/{labId}` removes a lab for good and returns a receipt of what was removed and what was kept (a tombstone and the lab's signed authorizations). It is refused with `lab_not_stopped` while an agent is up or a task is running.

Draft.14 is additive: three more host-set switches in `Health.capabilities`, each off by default and for manual mode only: `webFetch`, `skills` (from a directory on the host that agents cannot write) and `subagents`. A subagent's tool calls appear as ordinary items in the same agent's transcript and pass through the same rules.

Draft.15 is additive: a sandboxed shell for manual mode behind a host-set switch, off by default. `Health.capabilities.shell.<role>` says whether a role has it and why not; `Health.limits.shellAllowedDomains` lists the only internet hosts a command can reach. A Bash tool call is decided by the standing rule `shell`; a command that asks to leave the sandbox is refused.

Draft.16 is additive: the network of sandboxed shell commands (`GET /v1/network/hosts`, `POST /v1/network/hosts/{host}/block` and `/trust`, with trust on first use as a host-set switch `Health.capabilities.networkTofu`); `Health.shellVerification`, under which a shell is granted only after the host check passed for the running Claude Code and Lab Manager versions; and `Health.resources.tempFolders`.

Draft.17 is additive: rented compute through a broker. `GET /v1/labs/{labId}/compute/runs`, `GET /v1/compute/runs/{runId}`, `POST /v1/compute/runs/{runId}/cancel`; `Budget.compute` (the lab's limit is set on the host and has no API); `Health.spend` gains the provider and its reported balance. Cost figures on a run and in the compute budget are the Lab Manager's own count; `providerBilledUsd` and the balance are the provider's.

Draft.18 changes `ComputeRun`, which no deployed manager served yet: a rented machine is a server the agent calls over HTTPS for one turn, not a batch job. The request carries `args` and `port` instead of `directory` and `command`; `exitCode` and `resultsDirectory` are gone; `url`, `usedByJobId` and `upAt` are new; the states `collecting` and `succeeded` are replaced by `finished`. The server's password is never in the API.

Draft.19 (`fd23efc`): a message can be sent to an agent while it works. The 202 answer carries `delivery` (`started`, `duringTask`, `queued`) and `job` is null when queued; `Agent.queuedMessages` and `TranscriptItem.queued` are new.

Draft.20 is additive: `Lab.brief` (the owner's description, given to every agent; accepted on create and PATCH); the Orchestrator sets the lab's objective and goals, with `Lab.objectiveSetBy` and `objectiveSetAt` (PATCH stays as the owner's override); `Agent.currentActivity` and richer `currentJob`; `Approval.requestedBy` gains `labName`, `sessionId`, `jobTitle`.

Draft.21 is additive: a lab can start from a GitHub repository (`repo` on create, `Lab.repo`, `Health.codeHost`), and agents' pushes and pull requests are listed at `GET /v1/labs/{labId}/git/ops`. There is no merge in the API; the owner merges on GitHub.

Draft.22 is additive: delegation continues in rounds. When every task the Orchestrator delegated has ended, the manager gives it a turn with the results (`Job.origin` and `purpose` `followUp`, `Job.followUp` {ofJobId, round}); its instructions are a `managerInstruction`, never the owner's words.

Draft.23 is additive: a `humanMessage` transcript item carries `unread` (sent into the running task, not yet taken up) beside `queued`, and `transcript.itemUpdated` fires when either changes.
