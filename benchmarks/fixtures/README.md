# Benchmark Fixtures

These fixtures are intentionally local and deterministic. They are meant to support repeatable prototype evaluation without adding another model provider or external workflow runner.

- `benchmark-suite.json` is the manifest for XML compatibility, edit quality, latency, and recoverability checks.
- `xml-compatibility.drawio` is a grouped Draw.io diagram with labeled edges and mixed styles.
- `recoverability-missing-root.xml` is malformed-but-repairable XML used to validate repair behavior.

The prompts in the manifest are designed to exercise the existing OpenAI-backed route handlers and trace panel. They are not automatically executed by the test suite because live OpenAI calls should remain explicit.
