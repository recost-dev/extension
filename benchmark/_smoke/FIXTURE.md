# _smoke fixture

Hand-crafted minimal fixture for runner unit tests. Not vendored from any upstream.

**Scope:** 2 OpenAI calls (chat completion + embeddings in a loop) + 1 expected N+1 finding.

**Why this fixture exists:** The benchmark runner needs something to iterate against during development without cloning `extension_benchmark`. This fixture is deliberately small and stable.
