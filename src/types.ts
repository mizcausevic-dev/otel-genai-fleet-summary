// Fleet-summary for OTel GenAI OTLP span exports.
// Walks a directory of OTLP JSON files, applies governance rules per the
// OTel GenAI semantic conventions, surfaces high-leverage findings.

export interface OtlpAttribute {
  key: string;
  value?: { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean };
}

export interface OtlpSpan {
  name?: string;
  kind?: number;
  attributes?: OtlpAttribute[];
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  status?: { code?: number; message?: string };
}

export interface OtlpScopeSpans {
  scope?: { name?: string; version?: string };
  spans?: OtlpSpan[];
}

export interface OtlpResourceSpans {
  resource?: { attributes?: OtlpAttribute[] };
  scopeSpans?: OtlpScopeSpans[];
}

export interface OtlpExport {
  resourceSpans?: OtlpResourceSpans[];
}

export type FindingSeverity = "high" | "medium" | "low" | "info";

export type FindingCode =
  | "missing-provider-attribute"
  | "missing-model-attribute"
  | "unauthorized-model"
  | "high-error-rate"
  | "missing-cost-annotation"
  | "token-volume-outlier"
  | "missing-operation-name";

export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  /** File path that produced the finding. */
  source: string;
  /** Span name when relevant. */
  span?: string;
  /** Model identifier when relevant. */
  model?: string;
}

export interface SpanSummary {
  source: string;
  total: number;
  withProvider: number;
  withModel: number;
  withCost: number;
  errored: number;
  /** Set of unique models observed across the file's spans. */
  models: string[];
  /** Sum of `gen_ai.usage.input_tokens` across spans in this file. */
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface FleetReport {
  generatedAt: string;
  files: number;
  totalSpans: number;
  /** Counts by model across the fleet. */
  byModel: Record<string, number>;
  /** Sum of input + output tokens across the fleet. */
  totals: { spans: number; inputTokens: number; outputTokens: number; errors: number };
  /** Per-file summaries sorted by source. */
  files_: SpanSummary[];
  findings: Finding[];
  ok: boolean;
}

export interface SummarizeOptions {
  now?: string;
  /** Allowed model identifiers (whitelist). Spans on other models trip `unauthorized-model`. */
  allowedModels?: string[];
  /** Fraction (0..1) of errored spans above which `high-error-rate` is flagged per file. Default 0.05 = 5%. */
  errorRateThreshold?: number;
  /** Spans with `gen_ai.usage.input_tokens` above this trip `token-volume-outlier`. Default 100_000. */
  inputTokenOutlier?: number;
  /** Spans with `gen_ai.usage.output_tokens` above this trip `token-volume-outlier`. Default 50_000. */
  outputTokenOutlier?: number;
}
