/**
 * Activates a configuration variant for the demo.
 *
 * The demo supports two configuration styles — JavaScript (.mjs) and
 * TypeScript (.ts). Source-of-truth files live in `config-variants/<variant>/`
 * and this script copies them to the locations the app expects at runtime.
 *
 * Usage:
 *   node scripts/use-config.mjs javascript   # activate .mjs config files
 *   node scripts/use-config.mjs typescript    # activate .ts  config files
 *
 * The active copies are gitignored so the repository always stays clean.
 */

import { copyFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoRoot = join(__dirname, '..');
const variantsDir = join(demoRoot, 'config-variants');

// ---------------------------------------------------------------------------
// Variant definitions
//
// Each variant declares which source files map to which active locations.
// Source paths are relative to `config-variants/<variant>/`, destination
// paths are relative to the demo root.
// ---------------------------------------------------------------------------

const variants = {
  javascript: {
    extension: '.mjs',
    files: [
      { src: 'next.config.mjs',           dest: 'next.config.mjs' },
      { src: 'route-handlers-config.mjs',  dest: 'route-handlers-config.mjs' },
      { src: 'component-registry.mjs',     dest: 'component-registry.mjs' },
      { src: 'handler-processor.mjs',      dest: 'handler-processor.mjs' },
    ]
  },
  typescript: {
    extension: '.ts',
    files: [
      { src: 'next.config.ts',            dest: 'next.config.ts' },
      { src: 'route-handlers-config.ts',   dest: 'route-handlers-config.ts' },
      { src: 'component-registry.ts',      dest: 'component-registry.ts' },
      { src: 'handler-processor.ts',       dest: 'handler-processor.ts' },
    ]
  }
};

// ---------------------------------------------------------------------------
// All possible active file paths (union of both variants).
// Used to clean up stale files from a previously active variant before
// copying the new one.
// ---------------------------------------------------------------------------

const allActiveFiles = Object.values(variants).flatMap(v =>
  v.files.map(f => f.dest)
);

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const variantName = process.argv[2];

if (!variantName || !variants[variantName]) {
  console.error(
    `Usage: node scripts/use-config.mjs <variant>\n` +
    `Available variants: ${Object.keys(variants).join(', ')}`
  );
  process.exit(1);
}

const variant = variants[variantName];
const sourceDir = join(variantsDir, variantName);
const activeDestinations = new Set(variant.files.map(file => file.dest));

// ---------------------------------------------------------------------------
// Clean stale active files
//
// Remove only files that are inactive for the selected variant.
// This still cleans up leftovers from the previously active variant, but it
// keeps current destinations in place so unchanged files are not deleted and
// recreated just to activate the same variant again.
//
// That preservation matters because the current library still observes changes
// in active config inputs such as `next.config.*`; rewriting an unchanged file
// would bump its mtime, look like a real config change, and trigger needless
// handler invalidation/regeneration on the next dev request.
// ---------------------------------------------------------------------------

for (const relativePath of allActiveFiles) {
  const target = join(demoRoot, relativePath);
  if (!activeDestinations.has(relativePath) && existsSync(target)) {
    rmSync(target);
  }
}

// ---------------------------------------------------------------------------
// Copy variant files to active locations
// ---------------------------------------------------------------------------

for (const { src, dest } of variant.files) {
  const from = join(sourceDir, src);
  const to = join(demoRoot, dest);

  if (existsSync(to)) {
    const sourceContents = readFileSync(from);
    const targetContents = readFileSync(to);

    if (sourceContents.equals(targetContents)) {
      console.log(`[use-config] ${dest} (unchanged)`);
      continue;
    }
  }

  copyFileSync(from, to);
  console.log(`[use-config] ${dest}`);
}

console.log(`[use-config] Activated "${variantName}" variant.`);
