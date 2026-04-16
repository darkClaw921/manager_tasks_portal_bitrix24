#!/usr/bin/env node
// ============================================================
// Sync LIVEKIT_API_KEY / LIVEKIT_API_SECRET from .env.local
// into infra/livekit.yaml (keys: map + webhook.api_key).
// Idempotent. Runs before `npm run dev:all`.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_FILE = resolve(ROOT, ".env.local");
const YAML_FILES = [
  resolve(ROOT, "infra/livekit.yaml"),
  resolve(ROOT, "infra/livekit.dev.yaml"),
];

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

let env;
try {
  env = parseEnv(readFileSync(ENV_FILE, "utf8"));
} catch {
  console.error(`[sync-livekit-keys] ${ENV_FILE} not found. Run scripts/deploy-dev.sh first.`);
  process.exit(1);
}

const KEY = env.LIVEKIT_API_KEY;
const SECRET = env.LIVEKIT_API_SECRET;

if (!KEY || !SECRET) {
  console.error("[sync-livekit-keys] LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing from .env.local");
  process.exit(1);
}

for (const file of YAML_FILES) {
  let yaml;
  try {
    yaml = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  yaml = yaml.replace(
    /(^keys:\s*\n)([ \t]+)([^\s:]+:\s*)([^\n]+)/m,
    (_, head, indent) => `${head}${indent}${KEY}: ${SECRET}`
  );
  yaml = yaml.replace(
    /(^webhook:\s*\n(?:[^\n]*\n)*?[ \t]+api_key:\s*)([^\n]+)/m,
    (_, head) => `${head}${KEY}`
  );
  writeFileSync(file, yaml);
  console.log(`[sync-livekit-keys] ${file.split("/").slice(-2).join("/")} updated (key=${KEY.slice(0, 8)}…)`);
}
