const PASSWORD_ALGORITHM = "PBKDF2";
const PASSWORD_DIGEST = "SHA-256";
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_KEY_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_FORMAT = "pbkdf2-sha256";
const PASSWORD_VERSION = "v1";

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    PASSWORD_ALGORITHM,
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_ALGORITHM,
      hash: PASSWORD_DIGEST,
      salt,
      iterations,
    },
    key,
    PASSWORD_KEY_BYTES * 8,
  );

  return new Uint8Array(bits);
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must contain at least 12 characters.");
  if (password.length > 128) errors.push("Password must contain no more than 128 characters.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Password must include a number.");
  return errors;
}

export async function hashPassword(password: string): Promise<string> {
  const policyErrors = validatePasswordPolicy(password);
  if (policyErrors.length > 0) throw new Error(policyErrors[0]);

  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derived = await derivePasswordKey(password, salt, PASSWORD_ITERATIONS);
  return [
    PASSWORD_FORMAT,
    PASSWORD_VERSION,
    `i=${PASSWORD_ITERATIONS}`,
    bytesToBase64Url(salt),
    bytesToBase64Url(derived),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string | null): Promise<boolean> {
  if (!encodedHash || password.length > 128) return false;

  const [format, version, iterationPart, saltPart, hashPart, ...extra] = encodedHash.split("$");
  if (
    format !== PASSWORD_FORMAT
    || version !== PASSWORD_VERSION
    || extra.length > 0
    || !iterationPart?.startsWith("i=")
    || !saltPart
    || !hashPart
  ) {
    return false;
  }

  const iterations = Number(iterationPart.slice(2));
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;

  try {
    const salt = base64UrlToBytes(saltPart);
    const expected = base64UrlToBytes(hashPart);
    const actual = await derivePasswordKey(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(encodedHash: string | null): boolean {
  if (!encodedHash) return true;
  const [format, version, iterationPart] = encodedHash.split("$");
  return format !== PASSWORD_FORMAT
    || version !== PASSWORD_VERSION
    || iterationPart !== `i=${PASSWORD_ITERATIONS}`;
}

export function createOpaqueToken(byteLength = 32): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export function createSortableId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${createOpaqueToken(12)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprint(value: string | null | undefined, pepper = ""): Promise<string | null> {
  if (!value) return null;
  return sha256Hex(`${pepper}:${value}`);
}
