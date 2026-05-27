#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { summarize } from "./summarize.js";
import { toMarkdown, toSummary } from "./format.js";
import type { OtlpExport } from "./types.js";

type Format = "json" | "markdown" | "summary";

interface Args {
  dir?: string;
  format: Format;
  now?: string;
  allowedModels?: string[];
  errorRateThreshold?: number;
  failOnHigh: boolean;
  out?: string;
  help: boolean;
}

const FORMATS: Format[] = ["json", "markdown", "summary"];

function parseArgs(argv: string[]): Args {
  const args: Args = { format: "json", failOnHigh: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--format") {
      const v = argv[++i] as Format;
      if (!FORMATS.includes(v)) throw new Error(`--format must be one of: ${FORMATS.join(", ")}`);
      args.format = v;
    } else if (a === "--now") args.now = argv[++i];
    else if (a === "--allowed-models") {
      args.allowedModels = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    } else if (a === "--error-rate-threshold") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`--error-rate-threshold must be in [0,1]`);
      args.errorRateThreshold = v;
    } else if (a === "--fail-on-high") args.failOnHigh = true;
    else if (a === "--out") args.out = argv[++i];
    else if (!a.startsWith("-")) args.dir = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

const HELP = `otel-genai-fleet-summary — fleet analyzer for OTel GenAI OTLP span exports

Usage:
  otel-genai-fleet-summary <traces-dir>
      [--format json|markdown|summary]
      [--allowed-models claude-sonnet-4,gpt-4o,...]
      [--error-rate-threshold 0.05]
      [--now <iso>] [--fail-on-high] [--out FILE]

Reads every *.json file in <traces-dir> as an OTLP export and emits:
  - per-model span counts
  - per-file coverage of provider / model / cost attrs
  - findings (high): missing-model-attribute, unauthorized-model, high-error-rate
  - findings (medium): missing-provider-attribute, token-volume-outlier
  - findings (low): missing-cost-annotation, missing-operation-name

Exit codes:
  0 — no high findings (or --fail-on-high not set)
  1 — high finding AND --fail-on-high set
  2 — usage / I/O error`;

function loadDir(dir: string): Array<{ path: string; doc: OtlpExport }> {
  const out: Array<{ path: string; doc: OtlpExport }> = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    const full = join(dir, entry);
    if (!statSync(full).isFile()) continue;
    out.push({ path: full, doc: JSON.parse(readFileSync(full, "utf8")) as OtlpExport });
  }
  return out;
}

export function run(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.dir) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }

  let files;
  try {
    files = loadDir(args.dir);
  } catch (e) {
    process.stderr.write(`error reading ${args.dir}: ${(e as Error).message}\n`);
    return 2;
  }

  const report = summarize(files, {
    now: args.now,
    allowedModels: args.allowedModels,
    errorRateThreshold: args.errorRateThreshold
  });

  let out: string;
  if (args.format === "json") out = JSON.stringify(report, null, 2);
  else if (args.format === "markdown") out = toMarkdown(report);
  else out = toSummary(report);

  if (args.out) writeFileSync(args.out, `${out}\n`, "utf8");
  else process.stdout.write(`${out}\n`);

  if (args.failOnHigh && !report.ok) return 1;
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    process.exit(2);
  }
}
