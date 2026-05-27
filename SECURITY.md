# Security Policy

`otel-genai-fleet-summary` is a pure-transform library and CLI: it reads OTLP JSON files from a directory and emits structured findings + Markdown. No network listener, no remote fetch, no execution of user-supplied code.

The input may include internal model identifiers, span names, and prompt content that are sensitive in your environment. The output includes those values verbatim — be deliberate about where you publish the rendered report.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/otel-genai-fleet-summary/security/advisories/new)

Do not file public issues for security reports.
