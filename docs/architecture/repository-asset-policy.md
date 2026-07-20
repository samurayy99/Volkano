# Repository Asset Policy

The repository must produce a working experience from a fresh checkout. Runtime
binaries and canonical authored sources therefore live in Git when they are
required to load, rebuild, or verify the current product.

## Versioned in Git

- active world film encodes and their selected source masters;
- runtime GLBs, posters, case media, and canonical visual references;
- final or review-relevant Blender sources, generators, verifiers, reports, and
  compact inspection packs;
- immutable binary filenames carrying an explicit version.

## Kept local

- Blender backups (`.blend1`), Python caches, browser logs, and duplicate agent
  installations;
- superseded binary iterations and reproducible frame dumps;
- third-party example models that are not runtime dependencies.

Do not blanket-ignore `.glb`, `.blend`, or `.mp4`: those extensions can contain
required product assets. A new individual asset above 50 MB requires a separate
storage decision before it enters repository history. Replacing an active binary
means adding a new versioned filename and changing the runtime reference in the
same reviewed change.
