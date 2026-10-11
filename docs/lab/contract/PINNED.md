# Pinned Lab Manager API contract

The files in this directory are unmodified copies from the Lab Manager repository (`the-lab`), directory `docs/api/`.

| | |
|---|---|
| Spec version | 1.0.0-draft.15 |
| Source commit | `9fa649d` (branch `feat/m2-service-foundation` in the-lab) |
| SHA-256 of `openapi.yaml` | `322dfa85e28f8ba46b013d32f88af6d8a98170307f79c54bde873f9fce0e22cf` |
| SHA-256 of `binding-vectors.json` | `810a758e1c1d47be04f80d70d55dcda0137e1f74d0e186ec7bcde950bd0605e7` |
| Pinned on | 2026-10-10 |
| Status | Agreed by both sessions. Additive over draft.8 to draft.11. |

Previous pins: draft.14 at `9fd203a`, draft.13 at `7918f04`, draft.11 at `5ddfdf3`, draft.9 at `657f691`, draft.8 at `5108015`, draft.6 at `8b4dd31`, draft.3 at `8e63b7a62b26b275e6d8f5eb8a031e507a30cdc7`, draft.4 at `9b7d41f`, draft.5 at `a1b8f3b`. Draft.4 replaced the signed-authorization scheme (`lab-authz-v2`: bindings, expiry, nonce) and added `binding` and `bindingHash` to approvals and jobs. Draft.5 is non-breaking: it defines `keyId`, documents the reasons for a rejected signature, and states that both sides read the service token from a file. Draft.6 is non-breaking: an approval binding's `experimentId` is exactly the job's; experiment, budget and other approvals are never created by a draft manager and a client offers only `denied` for them; approving a budget request never changes a limit by itself. The test vectors are unchanged.

Draft.8 is breaking for signing: the signed text is `lab-authz-v3`, the only signed actions are `approval.decision` and `budget.set` (a lab's spending limit, with the host policy hash in the binding), and no binding carries a dollar figure except the spending limit. Job retry and experiment conclusions are no longer signed. It adds tool input and output in transcripts, read-only workspace files, a three-block budget (runtime, spend, estimates) and policy, subscription and resource status in health. `Budget.limits`, `Budget.consumed` and `Job.usage.costUsd` are kept, deprecated, for one release.

Do not edit these copies. Contract changes are made in the-lab first, reviewed by both sessions, then re-pinned here with a new commit and checksums. After re-pinning, run `npm run lab:types` and `npm run test:lab`.

Draft.9 is additive: standing rules for manual mode that are set only in the Lab Manager's host configuration (`workspaceWrites`, `webSearch`, and refusing at once what no rule covers), reported in `Health.capabilities`, and a `standingRule` decision on a tool call may now be a refusal. Nothing signed changed; the test vectors are unchanged.

Draft.10 is additive: delegation. When the host allows it (`Health.capabilities.delegation`), in manual mode, each handoff the Orchestrator records while answering the owner is started by the manager as a task for the role it names, one hop only, up to `Health.limits.delegationsPerMessage`. `Job.origin` gains `delegated`; `Job.delegation` and `Job.delegations` link the two sides; the target sees a `delegatedInstruction` transcript item, never a human message.

Draft.11 is additive: a refused entry in `Job.delegations` carries `body`, the instructions the target would have been given, so the owner can read them and send them as their own instruction.

Draft.12 is additive: a lab can be archived and unarchived (nothing is deleted). Runekeeper does not surface it.

Draft.13 is additive: `DELETE /v1/labs/{labId}` removes a lab for good and returns a receipt of what was removed and what was kept (a tombstone and the lab's signed authorizations). It is refused with `lab_not_stopped` while an agent is up or a task is running.

Draft.14 is additive: three more host-set switches in `Health.capabilities`, each off by default and for manual mode only: `webFetch`, `skills` (from a directory on the host that agents cannot write) and `subagents`. A subagent's tool calls appear as ordinary items in the same agent's transcript and pass through the same rules.

Draft.15 is additive: a sandboxed shell for manual mode behind a host-set switch, off by default. `Health.capabilities.shell.<role>` says whether a role has it and why not; `Health.limits.shellAllowedDomains` lists the only internet hosts a command can reach. A Bash tool call is decided by the standing rule `shell`; a command that asks to leave the sandbox is refused.
