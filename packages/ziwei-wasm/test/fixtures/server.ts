import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { AddressInfo } from "node:net";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

export async function serveAssets(options: { dist?: string; csp?: string; base?: string } = {}) {
  const dist = options.dist ?? fileURLToPath(new URL("../../dist/", import.meta.url));
  const bytes = await readFile(new URL("../../generated/ziwei_wasm_bg.wasm", import.meta.url));
  const hits = new Map<string, number>();
  const recovered = new Set<string>();
  let retry = false;
  const server = createServer(async (request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const path =
      options.base && requestPath.startsWith(options.base)
        ? `/${requestPath.slice(options.base.length)}`
        : requestPath;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    if (options.csp !== undefined) response.setHeader("Content-Security-Policy", options.csp);
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    if (["/worker.js", "/browser.js", "/edge-worker.js", "/browser-edge.js"].includes(path)) {
      response.setHeader("Content-Type", "text/javascript");
      const source = await readFile(
        new URL(`.${path.replace(/\.js$/, ".ts")}`, import.meta.url),
        "utf8",
      );
      response.end(stripTypeScriptTypes(source, { mode: "strip" }));
      return;
    }
    if (path === "/" || path.endsWith(".html")) {
      response.setHeader("Content-Type", "text/html");
      try {
        response.end(await readFile(resolve(dist, "index.html")));
      } catch {
        response.end("<!doctype html><meta charset=utf-8><title>Ziwei consumer</title>");
      }
      return;
    }
    if (path === "/disconnect" && !recovered.has(path)) {
      request.socket.destroy();
      return;
    }
    if (path === "/interrupted" && !recovered.has(path)) {
      response.setHeader("Content-Type", "application/wasm");
      response.setHeader("Content-Length", bytes.length);
      response.write(bytes.subarray(0, 8));
      setImmediate(() => response.destroy());
      return;
    }
    if (path === "/missing" || (path === "/retry" && !retry)) {
      if (path === "/retry") retry = true;
      response.writeHead(404).end("missing");
      return;
    }
    if (
      [
        "/wasm",
        "/retry",
        "/wrong-mime",
        "/corrupt",
        "/oversized",
        "/cors",
        "/disconnect",
        "/interrupted",
      ].includes(path)
    ) {
      response.setHeader("Content-Type", path === "/wrong-mime" ? "text/html" : "application/wasm");
      if (path === "/cors") response.setHeader("Access-Control-Allow-Origin", "*");
      if (path === "/oversized") {
        response.end(Buffer.concat([bytes, Buffer.from([0])]));
      } else if (path === "/corrupt") {
        const corrupt = Buffer.from(bytes);
        corrupt[0] = (corrupt[0] ?? 0) ^ 1;
        response.end(corrupt);
      } else response.end(bytes);
      return;
    }
    try {
      const file = resolve(dist, `.${decodeURIComponent(path)}`);
      if (!file.startsWith(`${resolve(dist)}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      response.setHeader(
        "Content-Type",
        extname(file) === ".wasm" ? "application/wasm" : "text/javascript",
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end("missing");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    hits,
    recover: (path: string) => recovered.add(path),
    url: (path: string) => new URL(path, origin),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
