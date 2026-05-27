# otel-genai-fleet-summary

[![CI](https://github.com/mizcausevic-dev/otel-genai-fleet-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/mizcausevic-dev/otel-genai-fleet-summary/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)

Fleet-summary for [OTel GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) OTLP span exports. Walks a directory of OTLP JSON files, applies governance rules per the OTel GenAI semantic conventions, and surfaces high-leverage findings.

**Closes the fleet-summary quintet:**

- [`agent-card-fleet-summary`](https://github.com/mizcausevic-dev/agent-card-fleet-summary) — A2A AgentCards
- [`mcp-tool-card-fleet-summary`](https://github.com/mizcausevic-dev/mcp-tool-card-fleet-summary) — MCP Tool Cards
- [`prompt-provenance-fleet-summary`](https://github.com/mizcausevic-dev/prompt-provenance-fleet-summary) — prompt-provenance docs
- [`evidence-bundle-fleet-summary`](https://github.com/mizcausevic-dev/evidence-bundle-fleet-summary) — evidence bundles
- **`otel-genai-fleet-summary`** — OTel GenAI OTLP traces

Part of the [Kinetic Gain Suite](https://suite.kineticgain.com/).

---

## What it flags

| Code | Severity | Rule |
|---|---|---|
| `missing-model-attribute` | 🔴 | Span has no `gen_ai.request.model` — can't attribute usage / cost. |
| `unauthorized-model` | 🔴 | Span uses a model not in the `--allowed-models` whitelist. Shadow-IT signal. |
| `high-error-rate` | 🔴 | File's errored spans > threshold (default 5%). |
| `missing-provider-attribute` | 🟠 | Span has no `gen_ai.provider.name`. |
| `token-volume-outlier` | 🟠 | Span input or output tokens exceed configurable threshold (default 100K input / 50K output). |
| `missing-cost-annotation` | 🟡 | Span has no `gen_ai.usage.cost` — breaks FinOps rollups. |
| `missing-operation-name` | 🟡 | Span has no `gen_ai.operation.name`. |

## CLI

```bash
otel-genai-fleet-summary <traces-dir>
    [--format json|markdown|summary]
    [--allowed-models claude-sonnet-4,gpt-4o,...]
    [--error-rate-threshold 0.05]
    [--now <iso>] [--fail-on-high] [--out FILE]
```

Exit codes:

- `0` — no high findings (or `--fail-on-high` not set)
- `1` — high finding AND `--fail-on-high` set
- `2` — usage / I/O error

## Library API

```ts
import { summarize, toMarkdown } from "otel-genai-fleet-summary";

const report = summarize(files, {
  allowedModels: ["claude-sonnet-4", "gpt-4o"],
  errorRateThreshold: 0.05
});
console.log(report.byModel);        // per-model span counts
console.log(report.totals);         // spans + token totals + errors
console.log(report.findings);
console.log(toMarkdown(report));
```

## Composes with

- [**`otel-genai-validator`**](https://github.com/mizcausevic-dev/otel-genai-validator) — single-span conformance validation per OTel GenAI semconv.
- [**`otel-genai-rollup`**](https://github.com/mizcausevic-dev/otel-genai-rollup) — per-(date, provider, model) cost rollups.
- [**`otel-genai-diff`**](https://github.com/mizcausevic-dev/otel-genai-diff) — rollup-to-rollup drift detection.
- [**`otel-genai-test-vectors`**](https://github.com/mizcausevic-dev/otel-genai-test-vectors) — conformance corpus.
- [**`llm-cost-rollup-action`**](https://github.com/mizcausevic-dev/llm-cost-rollup-action) — PR-gating cost-budget guardrail.

## License

[AGPL-3.0-or-later](LICENSE)
