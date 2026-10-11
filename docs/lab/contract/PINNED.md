# Pinned Lab Manager API contract

The files in this directory are unmodified copies from the Lab Manager repository (`the-lab`), directory `docs/api/`.

| | |
|---|---|
| Spec version | 1.0.0-draft.6 |
| Source commit | `8b4dd31fc3a289b9bba634273af948f1c5d94dec` (branch `feat/m2-service-foundation` in the-lab, not pushed) |
| SHA-256 of `openapi.yaml` | `aa680fef039c0191acdb69cb87274ecc95b4997969b28954a5e7cd7bb9deb17e` |
| SHA-256 of `binding-vectors.json` | `b12a023aa5a56e975980b3b9a4d79f018fa835b4592434f7e4fc224f6a5bef50` |
| Pinned on | 2026-10-10 |
| Status | Agreed by both sessions; awaiting owner review. |

Previous pins: draft.3 at `8e63b7a62b26b275e6d8f5eb8a031e507a30cdc7`, draft.4 at `9b7d41f`, draft.5 at `a1b8f3b`. Draft.4 replaced the signed-authorization scheme (`lab-authz-v2`: bindings, expiry, nonce) and added `binding` and `bindingHash` to approvals and jobs. Draft.5 is non-breaking: it defines `keyId`, documents the reasons for a rejected signature, and states that both sides read the service token from a file. Draft.6 is non-breaking: an approval binding's `experimentId` is exactly the job's; experiment, budget and other approvals are never created by a draft manager and a client offers only `denied` for them; approving a budget request never changes a limit by itself. The test vectors are unchanged.

Do not edit these copies. Contract changes are made in the-lab first, reviewed by both sessions, then re-pinned here with a new commit and checksums. After re-pinning, run `npm run lab:types` and `npm run test:lab`.
