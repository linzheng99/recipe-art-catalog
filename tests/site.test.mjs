import { test } from "node:test";
import assert from "node:assert/strict";
import { createStaticServer } from "../scripts/serve.mjs";

test("仓库子路径下首页、脚本、样式、JSON、图片和许可证可读取", async () => {
  const server = createStaticServer({ basePath: "/recipe-art-catalog/" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/recipe-art-catalog/`;
  try {
    const html = await (await fetch(base)).text();
    const script = html.match(/src="([^"]+\.js)"/)[1];
    const stylesheet = html.match(/href="([^"]+\.css)"/)[1];
    assert.ok(script.startsWith("./assets/"), "构建脚本必须使用相对路径");
    assert.ok(stylesheet.startsWith("./assets/"), "构建样式必须使用相对路径");
    for (const [file, type] of [
      ["", "text/html"],
      [script, "text/javascript"],
      [stylesheet, "text/css"],
      ["THIRD_PARTY_NOTICES.md", "text/plain"],
      ["licenses/HOWTOCOOK-LICENSE.txt", "text/plain"],
      ["licenses/FRONTEND-DEPENDENCIES.txt", "text/plain"],
    ]) {
      const response = await fetch(new URL(file, base));
      assert.equal(response.status, 200, file);
      assert.ok(response.headers.get("content-type").startsWith(type), file);
    }
    const response = await fetch(new URL("manifest.json", base));
    const catalog = await response.json();
    const unchanged = await fetch(new URL("manifest.json", base), {
      headers: { "If-None-Match": response.headers.get("etag") },
    });
    assert.equal(unchanged.status, 304);
    const image = await fetch(
      new URL(
        catalog.artworks[0].variants["256"].path,
        new URL("manifest.json", base),
      ),
    );
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    assert.equal(
      (await image.arrayBuffer()).byteLength,
      catalog.artworks[0].variants["256"].bytes,
    );
    assert.equal(
      (await fetch(base + "missing.webp")).headers.get("cache-control"),
      "no-store",
    );
    assert.equal((await fetch(new URL("../package.json", base))).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
