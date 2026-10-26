import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { root } from "./build.mjs";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** basePath模拟GitHub Pages仓库子目录；本地服务只公开静态发布目录。 */
export function createStaticServer({
  directory = path.join(root, "dist"),
  basePath = "/",
} = {}) {
  const base = path.resolve(directory);
  const prefix = "/" + basePath.split("/").filter(Boolean).join("/");
  return createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "If-None-Match");
    response.setHeader("Access-Control-Expose-Headers", "ETag");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
      response.end();
      return;
    }
    try {
      let pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (prefix !== "/") {
        if (pathname === prefix) {
          response.writeHead(302, { Location: prefix + "/" });
          response.end();
          return;
        }
        if (!pathname.startsWith(prefix + "/")) throw Error("outside site");
        pathname = pathname.slice(prefix.length);
      }
      const target = path.resolve(
        base,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!target.startsWith(base + path.sep) || !(await stat(target)).isFile())
        throw Error("invalid path");
      const data = await readFile(target);
      const etag = '"' + createHash("sha256").update(data).digest("hex") + '"';
      response.setHeader("ETag", etag);
      response.setHeader(
        "Cache-Control",
        target.endsWith(".webp")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
      );
      response.setHeader(
        "Content-Type",
        mimeTypes[path.extname(target)] ?? "application/octet-stream",
      );
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304);
        response.end();
        return;
      }
      response.setHeader("Content-Length", data.length);
      response.writeHead(200);
      response.end(request.method === "HEAD" ? undefined : data);
    } catch {
      response.setHeader("Cache-Control", "no-store");
      response.writeHead(404);
      response.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = path.join(root, "dist");
  const basePath = process.env.BASE_PATH || "/";
  const port = Number(process.env.PORT || 4174);
  const server = createStaticServer({ directory, basePath });
  server.listen(port, "0.0.0.0", () =>
    console.log(
      `预览：http://localhost:${server.address().port}${basePath.replace(/\/$/, "")}/`,
    ),
  );
}
