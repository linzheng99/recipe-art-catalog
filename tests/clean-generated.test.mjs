import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { cleanGenerated } from "../scripts/clean-generated.mjs";

const json = async (root, file, data) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), JSON.stringify(data) + "\n");
};
async function fixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "recipe-clean-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const files = {};
    for (const [key, directory] of [
      ["current", "recipe-details"],
      ["tracked", "recipe-details"],
      ["old", "nutrition"],
    ]) {
      const data = JSON.stringify({ key }) + "\n",
        sha = createHash("sha256").update(data).digest("hex");
      const file = `public/assets/${directory}/${key}.${sha.slice(0, 16)}.json`;
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), data);
      files[key] = file;
    }
    execFileSync("git", ["add", files.tracked], { cwd: root });
    const manifest = {
      schema_version: 1,
      version: "test",
      artworks: [
        { key: "current", recipe_details: { path: files.current.slice(7) } },
      ],
    };
    await json(root, "public/manifest.json", manifest);
    await json(root, "public/manifest-lite.json", manifest);
    await json(root, "public/nutrition/index.json", {
      schema_version: 1,
      profiles: [],
    });
    await fn(root, files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("详情清理默认预览，仅归档未引用且未跟踪的中间版本，可恢复且重跑不重复", () =>
  fixture(async (root, files) => {
    const preview = await cleanGenerated({ root });
    assert.equal(preview.mode, "preview");
    assert.equal(preview.files, 1);
    await access(path.join(root, files.old));
    const result = await cleanGenerated({ root, apply: true });
    assert.equal(result.files, 1);
    await access(path.join(root, files.current));
    await access(path.join(root, files.tracked));
    await assert.rejects(access(path.join(root, files.old)));
    assert.equal(
      JSON.parse(
        await readFile(path.join(root, result.archive, files.old), "utf8"),
      ).key,
      "old",
    );
    const inventory = JSON.parse(
      await readFile(path.join(root, result.archive, "inventory.json"), "utf8"),
    );
    assert.equal(inventory.status, "complete");
    assert.equal(inventory.entries[0].path, files.old);
    assert.equal((await cleanGenerated({ root, apply: true })).files, 0);
  }));

test("损坏入口不归档任何文件，摘要异常文件不当作可清理的生成产物", () =>
  fixture(async (root, files) => {
    const invalid = "public/assets/nutrition/custom.0000000000000000.json";
    await json(root, invalid, { user: "data" });
    assert.equal((await cleanGenerated({ root })).skipped, 1);
    await writeFile(
      path.join(root, "public/manifest-lite.json"),
      "broken json",
    );
    await assert.rejects(cleanGenerated({ root, apply: true }));
    await access(path.join(root, files.old));
    await access(path.join(root, invalid));
  }));
