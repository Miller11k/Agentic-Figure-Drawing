# Benchmark Fixtures

Local deterministic fixtures for repeatable prototype evaluation.

- `benchmark-suite.json` defines XML compatibility, edit quality, latency, and recoverability checks.
- `xml-compatibility.drawio` is a grouped Draw.io diagram with labeled edges and mixed styles.
- `recoverability-missing-root.xml` is malformed-but-repairable XML for repair validation.

Manifest prompts exercise existing route handlers and traces, but live OpenAI calls remain explicit and are not run automatically by the test suite.
