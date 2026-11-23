import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  ASSET_KINDS, IMAGE_TYPES, MAX_IMAGE_BYTES, SCOPE, assetKeyValid, assetKindValid,
  assetPrefix, buildAssetMetadata, buildAssetRel, imageTypeFromFileName,
  moveAssetToTrash, readAssets, trashKey,
} from "../worker/asset-storage.mts";

const BUCKET_NAME = "novel-builder";
const DEFAULT_NOVEL = "nv_bt8y37enbg";
const commandOptions = {
  list: { scope: { type: "string" } },
  upload: {
    scope: { type: "string" },
    kind: { type: "string" },
    actor: { type: "string" },
    "caption-from-name": { type: "boolean" },
  },
  trash: { actor: { type: "string" } },
};

const usage = `npm run r2:assets -- <lệnh> [--novel ID] [--apply]

  list [--scope S]
  upload --scope S --kind K --actor EMAIL [--caption-from-name] FILE ["FILE=Chú thích" ...]
  trash --actor EMAIL KEY [KEY ...]

S: chung hoặc ID chương (ch_…)
K: ${ASSET_KINDS.join(", ")}
KEY: khóa tương đối, ví dụ ch_abc123/m0k-1234abcd-anh.png
Mặc định chỉ in thao tác dự kiến. Thêm --apply để truy cập R2 production.
`;

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function validateSize(path, size) {
  if (size === 0) throw new Error(`Tệp rỗng: ${path}`);
  if (size > MAX_IMAGE_BYTES) throw new Error(`Ảnh quá lớn (tối đa 15 MB): ${path}`);
}

async function planUpload(arg, novel, { scope, kind, actor, "caption-from-name": captionFromName }) {
  const separator = arg.indexOf("=");
  const path = separator === -1 ? arg : arg.slice(0, separator);
  const fileName = basename(path).trim();
  const contentType = imageTypeFromFileName(fileName);
  if (!contentType) throw new Error(`Chỉ nhận ảnh JPG, PNG, WebP, GIF hoặc AVIF: ${path}`);

  const file = await stat(path);
  if (!file.isFile()) throw new Error(`Cần đường dẫn đến tệp: ${path}`);
  validateSize(path, file.size);
  const caption = (separator === -1
    ? (captionFromName ? basename(fileName, extname(fileName)) : "")
    : arg.slice(separator + 1)).trim();
  const rel = buildAssetRel(scope, fileName, IMAGE_TYPES[contentType]);
  const metadata = buildAssetMetadata(contentType, kind, caption, fileName, new Date().toISOString(), actor);
  return { path, key: assetPrefix(novel) + rel, size: file.size, ...metadata };
}

function planTrash(novel, rel) {
  const key = assetKeyValid(novel, rel);
  if (!key) throw new Error(`Khóa ảnh không hợp lệ: ${rel}`);
  return { key, destination: trashKey(novel, rel) };
}

async function withRemoteBucket(action) {
  const dir = await mkdtemp(join(tmpdir(), "novel-builder-r2-assets-"));
  let proxy;
  try {
    const configPath = join(dir, "wrangler.json");
    await writeFile(configPath, JSON.stringify({
      name: "novel-builder-assets-cli",
      compatibility_date: "2026-10-01",
      r2_buckets: [{ binding: "BUCKET", bucket_name: BUCKET_NAME, remote: true }],
    }));
    process.env.WRANGLER_LOG ??= "error";
    const { getPlatformProxy } = await import("wrangler");
    proxy = await getPlatformProxy({ configPath, remoteBindings: true, persist: false });
    return await action(proxy.env.BUCKET);
  } finally {
    try {
      await proxy?.dispose();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

async function applyChanges(bucket, command, novel, objects, actor) {
  const keys = [];
  try {
    for (const object of objects) {
      if (command === "upload") {
        const { key, path, httpMetadata, customMetadata } = object;
        const data = await readFile(path);
        validateSize(path, data.byteLength);
        await bucket.put(key, data, { httpMetadata, customMetadata });
        keys.push(key);
      } else {
        const { key, destination } = object;
        if (!(await moveAssetToTrash(bucket, key, destination, actor))) {
          throw new Error(`Không tìm thấy ảnh: ${key}`);
        }
        keys.push(destination);
      }
    }
  } finally {
    printJson({ command, novel, keys, complete: keys.length === objects.length });
  }
}

async function main([command, ...args]) {
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (!Object.hasOwn(commandOptions, command)) throw new Error(`Lệnh không hợp lệ: ${command}`);
  const { values, positionals } = parseArgs({
    args,
    options: {
      novel: { type: "string", default: DEFAULT_NOVEL },
      apply: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      ...commandOptions[command],
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(usage);
    return;
  }

  const { novel, scope, kind, actor, apply } = values;
  if (!/^nv_[0-9a-z]{6,20}$/.test(novel)) throw new Error("ID bộ truyện không hợp lệ");
  if (scope !== undefined && !SCOPE.test(scope)) throw new Error("Phạm vi ảnh không hợp lệ");

  if (command === "list") {
    if (positionals.length) throw new Error("Lệnh list chỉ nhận tùy chọn");
    if (apply) {
      await withRemoteBucket(async (bucket) => {
        printJson({ command, novel, assets: await readAssets(bucket, novel, scope) });
      });
    } else {
      printJson({ dryRun: true, command, bucket: BUCKET_NAME, prefix: assetPrefix(novel) + (scope ? `${scope}/` : "") });
    }
    return;
  }

  if (!actor || !/^[^\s@]+@[^\s@]+$/.test(actor)) throw new Error("Cần email hợp lệ cho --actor");
  if (!positionals.length) throw new Error(command === "upload" ? "Cần ít nhất một tệp ảnh" : "Cần ít nhất một khóa ảnh");

  let objects;
  if (command === "upload") {
    if (!scope) throw new Error("Cần --scope khi tải ảnh");
    if (!assetKindValid(kind)) throw new Error(`Loại ảnh không hợp lệ. Chọn: ${ASSET_KINDS.join(", ")}`);
    objects = await Promise.all(positionals.map((arg) => planUpload(arg, novel, values)));
  } else {
    objects = [...new Set(positionals)].map((rel) => planTrash(novel, rel));
  }

  if (apply) {
    await withRemoteBucket((bucket) => applyChanges(bucket, command, novel, objects, actor));
  } else {
    const plan = { dryRun: true, command, bucket: BUCKET_NAME, novel, objects };
    if (command === "trash") {
      plan.operations = ["copy", "delete"];
      plan.deletedBy = actor;
      plan.deletedAt = "Thời điểm thực hiện (ISO)";
    }
    printJson(plan);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
