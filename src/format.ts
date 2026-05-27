import type { FindingSeverity, FleetReport } from "./types.js";

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  high: "🔴 high",
  medium: "🟠 medium",
  low: "🟡 low",
  info: "ℹ️  info"
};
const SEVERITY_RANK: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function toMarkdown(report: FleetReport): string {
  const lines: string[] = [];
  lines.push(report.ok ? `# OTel GenAI fleet summary ✅` : `# OTel GenAI fleet summary ❌`);
  lines.push(``);
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(``);
  lines.push(`## Fleet`);
  lines.push(``);
  lines.push(`- Files: **${report.files}** · Spans: **${report.totalSpans}** · Errors: ${report.totals.errors}`);
  lines.push(`- Input tokens: ${report.totals.inputTokens.toLocaleString()} · Output tokens: ${report.totals.outputTokens.toLocaleString()}`);

  const modelEntries = Object.entries(report.byModel).sort((a, b) => b[1] - a[1]);
  if (modelEntries.length > 0) {
    lines.push(``);
    lines.push(`## Models in use (${modelEntries.length})`);
    lines.push(``);
    lines.push(`| model | spans |`);
    lines.push(`|---|---:|`);
    for (const [m, n] of modelEntries) lines.push(`| \`${m}\` | ${n} |`);
  }

  if (report.files_.length > 0) {
    lines.push(``);
    lines.push(`## Per file`);
    lines.push(``);
    lines.push(`| source | spans | errored | provider% | model% | cost% | models |`);
    lines.push(`|---|---:|---:|---:|---:|---:|---|`);
    for (const f of report.files_) {
      const pct = (num: number) => (f.total > 0 ? `${((num / f.total) * 100).toFixed(0)}%` : "—");
      lines.push(`| \`${f.source}\` | ${f.total} | ${f.errored} | ${pct(f.withProvider)} | ${pct(f.withModel)} | ${pct(f.withCost)} | ${f.models.join(", ") || "—"} |`);
    }
  }

  const ranked = [...report.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  if (ranked.length > 0) {
    lines.push(``);
    lines.push(`## Findings (${ranked.length})`);
    lines.push(``);
    lines.push(`| severity | code | source | span | message |`);
    lines.push(`|---|---|---|---|---|`);
    for (const f of ranked) {
      lines.push(`| ${SEVERITY_LABEL[f.severity]} | \`${f.code}\` | \`${f.source}\` | ${f.span ?? "—"} | ${f.message} |`);
    }
  } else {
    lines.push(``);
    lines.push(`No findings.`);
  }
  return lines.join("\n");
}

export function toSummary(report: FleetReport): string {
  const counts: Record<FindingSeverity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of report.findings) counts[f.severity] += 1;
  return `${report.files} file${report.files === 1 ? "" : "s"} · ${report.totalSpans} spans · ${Object.keys(report.byModel).length} models · ${counts.high} high · ${counts.medium} medium (${report.ok ? "ok" : "fail"})`;
}
