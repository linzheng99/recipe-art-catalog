import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { compressNutritionCache } from "../scripts/nutrition-compress.mjs";
import {
  readJSON,
  atomicJSON,
  sha256,
  createUSDAClient,
  nutritionRoot,
} from "../scripts/nutrition-usda.mjs";

test("压缩缓存可逐字节恢复，保留原始与压缩摘要，重跑不重复且不改变原始记录", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "recipe-compress-"));
  try {
    for (const dir of ["queries", "usda"])
      await mkdir(path.join(root, "sources/nutrition", dir), {
        recursive: true,
      });
    const file = path.join(root, "sources/nutrition/usda/171287.json");
    const record = await readJSON(
      path.join(nutritionRoot, "sources/nutrition/usda/171287.json"),
    );
    const original = Buffer.from(JSON.stringify(record, null, 2) + "\n");
    await writeFile(file, original);
    assert.equal((await compressNutritionCache({ root })).changed, 1);
    assert.deepEqual(await readFile(file), original);
    assert.equal(
      (await compressNutritionCache({ root, apply: true })).changed,
      1,
    );
    const bytes = await readFile(file + ".gz");
    assert.deepEqual(gunzipSync(bytes), original);
    const inventory = await readJSON(
      path.join(root, "sources/nutrition/cache-archive.json"),
    );
    assert.equal(inventory.entries[0].original_sha256, sha256(original));
    assert.equal(inventory.entries[0].sha256, sha256(bytes));
    assert.equal(
      (await compressNutritionCache({ root, apply: true })).changed,
      0,
    );
    assert.deepEqual(await readFile(file + ".gz"), bytes);
    assert.deepEqual(await readJSON(file), record);
    assert.deepEqual(await readJSON(file + ".gz"), record);
    const client = createUSDAClient({
      root,
      fetchImpl: () => {
        throw new Error("缓存不应请求上游");
      },
    });
    assert.deepEqual(await client.food(171287), record);
    await writeFile(file + ".gz", "corrupt gzip");
    await assert.rejects(() => client.food(171287));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("新来源缓存默认gzip，普通JSON继续可读，不一致副本保留且拒绝压缩", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "recipe-compress-"));
  try {
    for (const dir of ["queries", "usda"])
      await mkdir(path.join(root, "sources/nutrition", dir), {
        recursive: true,
      });
    const file = path.join(root, "sources/nutrition/usda/1.json");
    await atomicJSON(file, { value: 1, unknown: null });
    assert.deepEqual(await readdir(path.dirname(file)), ["1.json.gz"]);
    await writeFile(file, '{"value":2}');
    await assert.rejects(
      () => compressNutritionCache({ root, apply: true }),
      /不一致/,
    );
    assert.equal(await readFile(file, "utf8"), '{"value":2}');
    assert.deepEqual(await readJSON(file + ".gz"), { value: 1, unknown: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
