# Changelog

## v0.1.0 — 2026-05-27

- Initial release: `summarize(files, opts?)` → `FleetReport` with per-model counts + per-file coverage + finding list.
- 7 finding codes across 4 severity tiers:
  - 🔴 `missing-model-attribute`, `unauthorized-model` (whitelist), `high-error-rate` (configurable threshold)
  - 🟠 `missing-provider-attribute`, `token-volume-outlier` (input + output configurable)
  - 🟡 `missing-cost-annotation`, `missing-operation-name`
- Reads OTLP/JSON span exports per [OTel GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).
- Configurable: `allowedModels` whitelist, `errorRateThreshold`, `inputTokenOutlier`, `outputTokenOutlier`.
- Formatters: `toMarkdown(report)` (fleet stats + models-in-use table + per-file coverage table + findings) and `toSummary(report)`.
- CLI: `otel-genai-fleet-summary <dir>` with `--format json|markdown|summary`, `--allowed-models a,b,c`, `--error-rate-threshold N`, `--now <iso>`, `--fail-on-high`, `--out FILE`.
- 4 fixture traces: clean Claude span, missing-model span, unauthorized-model (shadow-IT) span, error-heavy 67%-fail file.
- **Closes the fleet-summary quintet** across all 5 governance surfaces (A2A / MCP / prompts / evidence / OTel).
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
