import { copyFile, mkdir, rm, stat, readdir, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Install a resource (file or directory) to the target project by COPYING it.
 * No symlinks: we use copy for stability across npx cache cleans and
 * different filesystems. Trade-off: changes to source/ require `sync`
 * to propagate; no live change detection.
 *
 * If `dst` exists and `overwrite` is true (default), it is replaced
 * WITHOUT a backup. (The `backup_existing` config flag was retired —
 * backup is out of scope per issue 3b; use git/manual copies if you
 * need safety.)
 *
 * Parent directories are created as needed.
 *
 * @param {string} src - absolute source path (file OR directory)
 * @param {string} dst - absolute destination path
 * @param {object} [options]
 * @param {boolean} [options.overwrite=true] - replace existing destination
 * @returns {Promise<{copied: boolean}>}
 */
export async function installResource(src, dst, options = {}) {
  const overwrite = options.overwrite !== false;

  if (await pathExists(dst)) {
    if (!overwrite) {
      return { copied: false, skipped: true };
    }
    await rm(dst, { recursive: true, force: true });
  }

  await mkdir(dirname(dst), { recursive: true });

  const srcStat = await stat(src);
  if (srcStat.isDirectory()) {
    await copyDir(src, dst);
  } else {
    await copyFile(src, dst);
  }

  return { copied: true };
}

/**
 * Recursive directory copy.
 * @param {string} src
 * @param {string} dst
 */
async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else {
      await copyFile(srcPath, dstPath);
    }
  }
}

/**
 * Check if a path exists (file, directory, or symlink).
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}