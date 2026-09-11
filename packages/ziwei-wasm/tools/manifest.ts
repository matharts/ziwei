import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const generated = new URL("../generated/", import.meta.url);
const bytes = await readFile(new URL("ziwei_wasm_bg.wasm", generated));
const hash = createHash("sha256").update(bytes).digest("hex");
await writeFile(
  new URL("asset.ts", generated),
  `// Generated from the exact Wasm asset. Do not edit.\nexport const wasmSha256 = ${JSON.stringify(hash)};\nexport const wasmByteLength = ${bytes.byteLength};\n`,
);
console.log(`Wasm resource: ${bytes.byteLength} bytes, sha256 ${hash}`);
