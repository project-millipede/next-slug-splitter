# Shared Docs Content

This directory is the shared MDX fixture for the multi-locale documentation
demos.

The App Router multi-locale demo, Pages Router demo, and their benchmark
heavy baselines intentionally read the same files from here. Keeping the MDX
content in one place makes the benchmark comparison about routing and bundle
behavior, not accidental content drift.

The single-locale App Router demo keeps its own content tree because it is a
separate, simpler fixture.
