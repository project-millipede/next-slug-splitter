/**
 * Removes previously generated route handler pages before a fresh build
 * or dev session.
 *
 * The code generator (next-slug-splitter CLI) creates handler pages under
 * `app/<section>/generated-handlers/`. These are derived artifacts that must
 * be
 * regenerated whenever the content tree or generator logic changes.
 * Cleaning them first avoids stale handlers surviving across runs.
 *
 * Run via `pnpm clean:handlers`.
 */

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Handler directories to clean
//
// Each entry is a path (relative to cwd) containing generated handler pages.
// Add new sections here as they are introduced.
// ---------------------------------------------------------------------------

const handlerDirs = [join(process.cwd(), 'app', 'docs', 'generated-handlers')];

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

for (const dir of handlerDirs) {
  if (!existsSync(dir)) {
    console.log(`[clean] ${dir} does not exist, nothing to remove.`);
    continue;
  }

  rmSync(dir, { recursive: true, force: true });
  console.log(`[clean] Removed ${dir}`);
}
