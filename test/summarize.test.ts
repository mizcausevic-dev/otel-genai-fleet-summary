import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { summarize } from "../src/summarize.js";
import { toMarkdown, toSummary } from "../src/format.js";
import type { OtlpExport } from "../src/types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const NOW = "2026-05-27T20:00:00Z";

function loadFleet(): Array<{ path: string; doc: OtlpExport }> {
  const dir = `${here}/../fixtures/traces`;
  return readdirSync(dir)
    .filter((e) => e.endsWith(".json"))
    .map((e) => ({ path: e, doc: JSON.parse(readFileSync(`${dir}/${e}`, "utf8")) as OtlpExport }));
}

describe("summarize", () => {
  it("counts spans + models across the fleet", () => {
    const r = summarize(loadFleet(), { now: NOW });
    expect(r.files).toBe(4);
    expect(r.totalSpans).toBe(6);
    expect(r.byModel["claude-sonnet-4"]).toBe(4);
    expect(r.byModel["shadow-llm-v0"]).toBe(1);
  });

  it("flags missing-model-attribute (high) on the missing-model file", () => {
    const r = summarize(loadFleet(), { now: NOW });
    const codes = r.findings.filter((f) => f.source.includes("missing-model")).map((f) => f.code);
    expect(codes).toContain("missing-model-attribute");
  });

  it("flags unauthorized-model (high) when --allowed-models excludes it", () => {
    const r = summarize(loadFleet(), { now: NOW, allowedModels: ["claude-sonnet-4", "gpt-4o"] });
    const codes = r.findings.filter((f) => f.source.includes("unauthorized-model")).map((f) => f.code);
    expect(codes).toContain("unauthorized-model");
  });

  it("does not flag unauthorized-model when allowedModels is omitted", () => {
    const r = summarize(loadFleet(), { now: NOW });
    const codes = r.findings.filter((f) => f.code === "unauthorized-model");
    expect(codes).toHaveLength(0);
  });

  it("flags high-error-rate when error rate exceeds threshold", () => {
    const r = summarize(loadFleet(), { now: NOW });
    const high = r.findings.filter((f) => f.code === "high-error-rate");
    expect(high.length).toBeGreaterThan(0);
    expect(high[0].source).toContain("error-heavy");
  });

  it("respects --error-rate-threshold", () => {
    const r = summarize(loadFleet(), { now: NOW, errorRateThreshold: 0.9 });
    const high = r.findings.filter((f) => f.code === "high-error-rate");
    expect(high).toHaveLength(0);
  });

  it("flags missing-cost-annotation (low) when gen_ai.usage.cost missing", () => {
    const r = summarize(loadFleet(), { now: NOW });
    expect(r.findings.some((f) => f.code === "missing-cost-annotation")).toBe(true);
  });

  it("flags missing-provider-attribute (medium) when span omits gen_ai.provider.name", () => {
    const span: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name: "no-provider",
                  status: { code: 1 },
                  attributes: [
                    { key: "gen_ai.request.model", value: { stringValue: "x" } },
                    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "1" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "1" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 0.01 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const r = summarize([{ path: "no-provider.json", doc: span }], { now: NOW });
    expect(r.findings.some((f) => f.code === "missing-provider-attribute")).toBe(true);
  });

  it("flags missing-operation-name (low) on the missing-model file (no op set)", () => {
    const r = summarize(loadFleet(), { now: NOW });
    expect(r.findings.some((f) => f.code === "missing-operation-name")).toBe(true);
  });

  it("flags token-volume-outlier when input tokens exceed threshold", () => {
    const span: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name: "big",
                  status: { code: 1 },
                  attributes: [
                    { key: "gen_ai.provider.name", value: { stringValue: "x" } },
                    { key: "gen_ai.request.model", value: { stringValue: "x" } },
                    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "500000" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "100" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 1.0 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const r = summarize([{ path: "big.json", doc: span }], { now: NOW });
    expect(r.findings.some((f) => f.code === "token-volume-outlier")).toBe(true);
  });

  it("accumulates totals + per-file summaries", () => {
    const r = summarize(loadFleet(), { now: NOW });
    expect(r.totals.spans).toBe(6);
    expect(r.totals.inputTokens).toBeGreaterThan(0);
    expect(r.files_.length).toBe(4);
    const clean = r.files_.find((f) => f.source.includes("clean"))!;
    expect(clean.total).toBe(1);
    expect(clean.withModel).toBe(1);
    expect(clean.withCost).toBe(1);
  });

  it("ok=false on the fleet (high findings present)", () => {
    expect(summarize(loadFleet(), { now: NOW }).ok).toBe(false);
  });

  it("ok=true on a clean single-file fleet", () => {
    const clean = loadFleet().filter((f) => f.path.includes("clean"));
    expect(summarize(clean, { now: NOW }).ok).toBe(true);
  });

  it("uses provided 'now' over Date.now()", () => {
    expect(summarize([], { now: "2030-01-01T00:00:00Z" }).generatedAt).toBe("2030-01-01T00:00:00Z");
  });

  it("handles empty fleet", () => {
    const r = summarize([], { now: NOW });
    expect(r.files).toBe(0);
    expect(r.totalSpans).toBe(0);
  });

  it("toMarkdown renders fleet + models + per-file + findings", () => {
    const md = toMarkdown(summarize(loadFleet(), { now: NOW }));
    expect(md).toContain("# OTel GenAI fleet summary ❌");
    expect(md).toContain("## Models in use");
    expect(md).toContain("## Per file");
    expect(md).toContain("## Findings");
  });

  it("toMarkdown renders success banner on clean fleet", () => {
    const md = toMarkdown(summarize(loadFleet().filter((f) => f.path.includes("clean")), { now: NOW }));
    expect(md).toContain("✅");
    expect(md).toContain("No findings.");
  });

  it("toSummary line-formats counts", () => {
    const s = toSummary(summarize(loadFleet(), { now: NOW }));
    expect(s).toContain("4 files");
    expect(s).toContain("6 spans");
    expect(s).toContain("(fail)");
  });

  it("toSummary handles singular", () => {
    const r = summarize([{ path: "x.json", doc: { resourceSpans: [] } }], { now: NOW });
    expect(toSummary(r)).toContain("1 file ·");
  });

  it("parses intValue as both string and number", () => {
    const span: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name: "x",
                  status: { code: 1 },
                  attributes: [
                    { key: "gen_ai.provider.name", value: { stringValue: "x" } },
                    { key: "gen_ai.request.model", value: { stringValue: "x" } },
                    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: 1000 } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "500" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 0.01 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const r = summarize([{ path: "x.json", doc: span }], { now: NOW });
    expect(r.totals.inputTokens).toBe(1000);
    expect(r.totals.outputTokens).toBe(500);
  });
});
