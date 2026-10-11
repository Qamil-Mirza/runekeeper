import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  type KeyObject,
} from "crypto";
import { readSecretFile, type SecretReader } from "./secrets";

/**
 * Signed authorizations (`lab-authz-v3`): proof that an authenticated human
 * approved one specific action. Server-side only.
 *
 * The contract and its test vectors are pinned in docs/lab/contract/.
 */

export type AuthzAction = "approval.decision" | "budget.set";
export type AuthzOutcome = "approved" | "denied" | "set";

export interface SignedAuthorization {
  signedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
  keyId?: string;
}

export interface DecisionKey {
  key: KeyObject;
  /** First 16 hex characters of sha256 over the public key's SPKI DER. */
  keyId: string;
}

export interface AuthzFields {
  action: AuthzAction;
  targetId: string;
  bindingHash: string;
  outcome: AuthzOutcome;
  actorId: string;
  signedAt: string;
  expiresAt: string;
  nonce: string;
  /** The decision note; absent and empty are the same thing. */
  note?: string | null;
}

/** The manager rejects authorizations valid for longer than this. */
export const MAX_AUTHORIZATION_LIFETIME_MS = 5 * 60_000;

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * RFC 8785 canonical JSON for bindings. Bindings carry integers only: any
 * other quantity is a six-digit decimal string (see `toBindingDecimal`), so a
 * non-integer number here is a bug and is refused rather than serialized.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("bindings may contain integers only; use toBindingDecimal");
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`cannot canonicalize a ${typeof value}`);
}

/**
 * RFC 8785 canonical JSON for any parsed JSON value. Used for what an agent
 * asked for (the approval request), which may contain non-integer numbers;
 * JavaScript's own number formatting is the one RFC 8785 specifies.
 */
export function canonicalJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("not a JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJsonValue(v)}`).join(",")}}`;
  }
  throw new Error(`cannot canonicalize a ${typeof value}`);
}

export function bindingHash(binding: unknown): string {
  return sha256Hex(canonicalJson(binding));
}

/** How a non-integer quantity is written inside a binding. */
export function toBindingDecimal(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error("binding quantities must be finite and >= 0");
  return n.toFixed(6);
}

/** The exact text the signature covers: ten lines, no trailing newline. */
export function signedText(f: AuthzFields): string {
  return [
    "lab-authz-v3",
    f.action,
    f.targetId,
    f.bindingHash,
    f.outcome,
    f.actorId,
    f.signedAt,
    f.expiresAt,
    f.nonce,
    sha256Hex(f.note ?? ""),
  ].join("\n");
}

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function parseDecisionKey(pem: string): DecisionKey {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("the Lab decision key must be an Ed25519 private key");
  }
  const spki = createPublicKey(key).export({ type: "spki", format: "der" });
  return { key, keyId: createHash("sha256").update(spki).digest("hex").slice(0, 16) };
}

export type DecisionKeyResult =
  | { status: "absent" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; decisionKey: DecisionKey };

/**
 * Loads the decision-signing key from the file named by
 * LAB_DECISION_KEY_FILE. There is no environment-variable form of the key.
 */
export function loadDecisionKey(
  env: Record<string, string | undefined> = process.env,
  readSecret: SecretReader = readSecretFile
): DecisionKeyResult {
  const path = env.LAB_DECISION_KEY_FILE?.trim();
  if (!path) return { status: "absent" };
  const read = readSecret(path);
  if (!read.ok) return { status: "invalid", reason: `LAB_DECISION_KEY_FILE: ${read.reason}` };
  try {
    return { status: "ok", decisionKey: parseDecisionKey(read.value) };
  } catch {
    // Never include key material or parser detail in the reason.
    return { status: "invalid", reason: "LAB_DECISION_KEY_FILE is not an Ed25519 private key" };
  }
}

export function signAuthorization(
  key: KeyObject | DecisionKey,
  f: AuthzFields
): SignedAuthorization {
  const decisionKey = "keyId" in key ? key : { key, keyId: undefined };
  return {
    signedAt: f.signedAt,
    expiresAt: f.expiresAt,
    nonce: f.nonce,
    signature: sign(null, Buffer.from(signedText(f), "utf8"), decisionKey.key).toString("base64"),
    ...(decisionKey.keyId ? { keyId: decisionKey.keyId } : {}),
  };
}
