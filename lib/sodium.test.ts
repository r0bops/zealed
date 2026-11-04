import { describe, expect, it } from "vitest";
import {
  codeFingerprint,
  fingerprint,
  generateKeyPair,
  isPublicKey,
  keyPairFromBackup,
  open,
  seal,
} from "./sodium";
import { decodeContent, encodeContent } from "./payload";

describe("sodium", () => {
  it("rejects low-order recipient keys before a reward can be purchased", async () => {
    expect(await isPublicKey(Buffer.alloc(32).toString("base64url"))).toBe(false);
    expect(await isPublicKey(Buffer.from([1, ...new Array(31).fill(0)]).toString("base64url"))).toBe(false);
    expect(await isPublicKey((await generateKeyPair()).publicKey)).toBe(true);
  });
  it("seals to a public key and opens with the matching secret key", async () => {
    const buyer = await generateKeyPair();
    const content = encodeContent({ kind: "giftcard", code: "ABCD-EFGH-1234", pin: "9876" });
    const sealed = await seal(content, buyer.publicKey);

    expect(sealed).not.toContain("ABCD");
    const opened = decodeContent(await open(sealed, buyer.publicKey, buyer.secretKey));
    expect(opened).toMatchObject({ kind: "giftcard", code: "ABCD-EFGH-1234", pin: "9876" });
  });

  it("cannot be opened with a different key", async () => {
    const buyer = await generateKeyPair();
    const attacker = await generateKeyPair();
    const sealed = await seal("secret", buyer.publicKey);
    await expect(open(sealed, attacker.publicKey, attacker.secretKey)).rejects.toThrow();
  });

  it("restores the same key pair from the backup string", async () => {
    const kp = await generateKeyPair();
    const restored = await keyPairFromBackup(kp.backup);
    expect(restored.publicKey).toBe(kp.publicKey);
    expect(restored.secretKey).toBe(kp.secretKey);
    const sealed = await seal("hello", kp.publicKey);
    expect(await open(sealed, restored.publicKey, restored.secretKey)).toBe("hello");
  });

  it("produces stable, short fingerprints", async () => {
    const kp = await generateKeyPair();
    const fp = await fingerprint(kp.publicKey);
    expect(fp).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(await fingerprint(kp.publicKey)).toBe(fp);
  });

  it("detects duplicate codes regardless of formatting, without containing the code", async () => {
    const a = await codeFingerprint("Flipkart", "abcd efgh-1234");
    const b = await codeFingerprint("flipkart ", "ABCDEFGH1234");
    const c = await codeFingerprint("Flipkart", "ABCDEFGH1235");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("ABCD");
  });

  it("validates public keys", async () => {
    const kp = await generateKeyPair();
    expect(await isPublicKey(kp.publicKey)).toBe(true);
    expect(await isPublicKey("nope")).toBe(false);
    expect(await isPublicKey(123)).toBe(false);
  });
});
