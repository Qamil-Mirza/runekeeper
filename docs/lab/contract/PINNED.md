# Pinned Lab Manager API contract

The files in this directory are unmodified copies from the Lab Manager repository (`the-lab`), directory `docs/api/`.

| | |
|---|---|
| Spec version | 1.0.0-draft.10 |
| Source commit | `e53977e` (branch `feat/m2-service-foundation` in the-lab) |
| SHA-256 of `openapi.yaml` | `37b69b3a60aac997f420bd242e6437dd652a27cf7a8293f021d8f507e69cd8ae` |
| SHA-256 of `binding-vectors.json` | `810a758e1c1d47be04f80d70d55dcda0137e1f74d0e186ec7bcde950bd0605e7` |
| Pinned on | 2026-10-11 |
| Status | Agreed by both sessions. Additive over draft.8 and draft.9. |

Previous pins: draft.9 at `657f691`, draft.8 at `5108015`, draft.6 at `8b4dd31`, draft.3 at `8e63b7a62b26b275e6d8f5eb8a031e507a30cdc7`, draft.4 at `9b7d41f`, draft.5 at `a1b8f3b`. Draft.4 replaced the signed-authorization scheme (`lab-authz-v2`: bindings, expiry, nonce) and added `binding` and `bindingHash` to approvals and jobs. Draft.5 is non-breaking: it defines `keyId`, documents the reasons for a rejected signature, and states that both sides read the service token from a file. Draft.6 is non-breaking: an approval binding's `experimentId` is exactly the job's; experiment, budget and other approvals are never created by a draft manager and a client offers only `denied` for them; approving a budget request never changes a limit by itself. The test vectors are unchanged.

Draft.8 is breaking for signing: the signed text is `lab-authz-v3`, the only signed actions are `approval.decision` and `budget.set` (a lab's spending limit, with the host policy hash in the binding), and no binding carries a dollar figure except the spending limit. Job retry and experiment conclusions are no longer signed. It adds tool input and output in transcripts, read-only workspace files, a three-block budget (runtime, spend, estimates) and policy, subscription and resource status in health. `Budget.limits`, `Budget.consumed` and `Job.usage.costUsd` are kept, deprecated, for one release.

Do not edit these copies. Contract changes are made in the-lab first, reviewed by both sessions, then re-pinned here with a new commit and checksums. After re-pinning, run `npm run lab:types` and `npm run test:lab`.

Draft.9 is additive: standing rules for manual mode that are set only in the Lab Manager's host configuration (`workspaceWrites`, `webSearch`, and refusing at once what no rule covers), reported in `Health.capabilities`, and a `standingRule` decision on a tool call may now be a refusal. Nothing signed changed; the test vectors are unchanged.

Draft.10 is additive: delegation. When the host allows it (`Health.capabilities.delegation`), in manual mode, each handoff the Orchestrator records while answering the owner is started by the manager as a task for the role it names, one hop only, up to `Health.limits.delegationsPerMessage`. `Job.origin` gains `delegated`; `Job.delegation` and `Job.delegations` link the two sides; the target sees a `delegatedInstruction` transcript item, never a human message.
