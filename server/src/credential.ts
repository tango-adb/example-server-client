import { adbGeneratePublicKey, type AdbCredentialStore } from "@yume-chan/adb";
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { join } from "node:path";

export class AdbNodeJsCredentialStore implements AdbCredentialStore {
  #name;

  constructor(name = `${userInfo().username}@${hostname()}`) {
    this.#name = name;
  }

  #privateKeyPath() {
    return join(homedir(), ".android", "adbkey");
  }

  #publicKeyPath() {
    return join(homedir(), ".android", "adbkey.pub");
  }

  async generateKey() {
    const { privateKey: cryptoKey } = await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        // 65537
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-1",
      },
      true,
      ["sign", "verify"]
    );

    const privateKey = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", cryptoKey)
    );
    await writeFile(
      this.#privateKeyPath(),
      Buffer.from(privateKey).toString("utf8")
    );
    await writeFile(
      this.#publicKeyPath(),
      `${Buffer.from(adbGeneratePublicKey(privateKey)).toString("base64")} ${
        this.#name
      }\n`
    );

    return {
      buffer: privateKey,
      name: this.#name,
    };
  }

  async #readPubKeyName() {
    const content = await readFile(this.#publicKeyPath(), "utf8");
    const pubKeyName = content.split(" ")[1];
    return pubKeyName || `${userInfo().username}@${hostname()}`;
  }

  async *iterateKeys() {
    const content = await readFile(this.#privateKeyPath(), "utf8");
    const privateKey = Buffer.from(
      content.split("\n").slice(1, -2).join(""),
      "base64"
    );
    yield {
      buffer: privateKey,
      name: await this.#readPubKeyName(),
    };
  }
}
