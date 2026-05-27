import type {
  Finding,
  FleetReport,
  OtlpAttribute,
  OtlpExport,
  OtlpSpan,
  SpanSummary,
  SummarizeOptions
} from "./types.js";

function attrString(attrs: OtlpAttribute[] | undefined, key: string): string | undefined {
  if (!attrs) return undefined;
  const a = attrs.find((x) => x.key === key);
  return a?.value?.stringValue;
}

function attrNumber(attrs: OtlpAttribute[] | undefined, key: string): number | undefined {
  if (!attrs) return undefined;
  const a = attrs.find((x) => x.key === key);
  const v = a?.value;
  if (!v) return undefined;
  if (typeof v.intValue === "number") return v.intValue;
  if (typeof v.intValue === "string") {
    const n = Number(v.intValue);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v.doubleValue === "number") return v.doubleValue;
  return undefined;
}

function* iterSpans(file: OtlpExport): Generator<OtlpSpan> {
  for (const rs of file.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const sp of ss.spans ?? []) yield sp;
    }
  }
}

export function summarize(
  files: Array<{ path: string; doc: OtlpExport }>,
  opts: SummarizeOptions = {}
): FleetReport {
  const generatedAt = opts.now ?? new Date().toISOString();
  const allowed = opts.allowedModels ? new Set(opts.allowedModels) : null;
  const errorThreshold = opts.errorRateThreshold ?? 0.05;
  const inputOutlier = opts.inputTokenOutlier ?? 100_000;
  const outputOutlier = opts.outputTokenOutlier ?? 50_000;

  const fileSummaries: SpanSummary[] = [];
  const findings: Finding[] = [];
  const byModel: Record<string, number> = {};
  let totalSpans = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalErrors = 0;

  for (const f of files) {
    const summary: SpanSummary = {
      source: f.path,
      total: 0,
      withProvider: 0,
      withModel: 0,
      withCost: 0,
      errored: 0,
      models: [],
      totalInputTokens: 0,
      totalOutputTokens: 0
    };
    const modelsSet = new Set<string>();

    for (const span of iterSpans(f.doc)) {
      summary.total += 1;
      totalSpans += 1;
      const provider = attrString(span.attributes, "gen_ai.provider.name");
      const model = attrString(span.attributes, "gen_ai.request.model");
      const cost = attrNumber(span.attributes, "gen_ai.usage.cost");
      const operation = attrString(span.attributes, "gen_ai.operation.name");
      const inputTokens = attrNumber(span.attributes, "gen_ai.usage.input_tokens") ?? 0;
      const outputTokens = attrNumber(span.attributes, "gen_ai.usage.output_tokens") ?? 0;
      summary.totalInputTokens += inputTokens;
      summary.totalOutputTokens += outputTokens;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      const errored = span.status?.code === 2; // ERROR
      if (errored) {
        summary.errored += 1;
        totalErrors += 1;
      }

      if (provider) summary.withProvider += 1;
      else {
        findings.push({
          code: "missing-provider-attribute",
          severity: "medium",
          message: "Span missing gen_ai.provider.name attribute.",
          source: f.path,
          span: span.name
        });
      }

      if (model) {
        summary.withModel += 1;
        modelsSet.add(model);
        byModel[model] = (byModel[model] ?? 0) + 1;
        if (allowed && !allowed.has(model)) {
          findings.push({
            code: "unauthorized-model",
            severity: "high",
            message: `Span uses model "${model}" which is not in the allowed-models whitelist.`,
            source: f.path,
            span: span.name,
            model
          });
        }
      } else {
        findings.push({
          code: "missing-model-attribute",
          severity: "high",
          message: "Span missing gen_ai.request.model attribute.",
          source: f.path,
          span: span.name
        });
      }

      if (cost !== undefined) summary.withCost += 1;
      else {
        findings.push({
          code: "missing-cost-annotation",
          severity: "low",
          message: "Span missing gen_ai.usage.cost annotation.",
          source: f.path,
          span: span.name,
          model
        });
      }

      if (!operation) {
        findings.push({
          code: "missing-operation-name",
          severity: "low",
          message: "Span missing gen_ai.operation.name attribute.",
          source: f.path,
          span: span.name
        });
      }

      if (inputTokens > inputOutlier) {
        findings.push({
          code: "token-volume-outlier",
          severity: "medium",
          message: `Input tokens (${inputTokens}) exceed outlier threshold (${inputOutlier}).`,
          source: f.path,
          span: span.name,
          model
        });
      }
      if (outputTokens > outputOutlier) {
        findings.push({
          code: "token-volume-outlier",
          severity: "medium",
          message: `Output tokens (${outputTokens}) exceed outlier threshold (${outputOutlier}).`,
          source: f.path,
          span: span.name,
          model
        });
      }
    }

    summary.models = [...modelsSet].sort();
    if (summary.total > 0 && summary.errored / summary.total > errorThreshold) {
      findings.push({
        code: "high-error-rate",
        severity: "high",
        message: `${summary.errored}/${summary.total} spans errored (${((summary.errored / summary.total) * 100).toFixed(1)}%), above threshold ${(errorThreshold * 100).toFixed(0)}%.`,
        source: f.path
      });
    }
    fileSummaries.push(summary);
  }

  fileSummaries.sort((a, b) => a.source.localeCompare(b.source));
  const ok = !findings.some((f) => f.severity === "high");

  return {
    generatedAt,
    files: fileSummaries.length,
    totalSpans,
    byModel,
    totals: {
      spans: totalSpans,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      errors: totalErrors
    },
    files_: fileSummaries,
    findings,
    ok
  };
}
