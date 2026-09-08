import { readdir, rm, unlink, readFile, writeFile, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Remove a file or directory only if it has no content.
 * For files: deletes the file.
 * For directories: deletes the directory only if empty.
 * If the path doesn't exist, this is a no-op.
 * @param {string} path
 * @returns {Promise<boolean>} true if removed, false otherwise
 */
export async function removeIfEmpty(path) {
  if (!existsSync(path)) return false;
  try {
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      const entries = await readdir(path);
      if (entries.length > 0) return false;
      await rm(path, { recursive: true, force: true });
    } else {
      await unlink(path);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a specific top-level key from a JSON file, and delete the file
 * if it becomes empty after removal. Used to clean up MCP entries that
 * the toolkit added (e.g., remove the 'mcp' key from opencode.json).
 * @param {string} filePath
 * @param {string|string[]} keys - key(s) to remove
 * @returns {Promise<boolean>} true if file was deleted, false otherwise
 */
export async function removeJsonKeys(filePath, keys) {
  if (!existsSync(filePath)) return false;
  const keyArr = Array.isArray(keys) ? keys : [keys];
  try {
    const raw = await readFile(filePath, 'utf8');
    const obj = JSON.parse(raw);
    let modified = false;
    for (const k of keyArr) {
      if (k in obj) {
        delete obj[k];
        modified = true;
      }
    }
    if (!modified) return false;
    if (Object.keys(obj).length === 0) {
      await unlink(filePath);
      return true;
    }
    await writeFile(filePath, JSON.stringify(obj, null, 2) + '\n');
    return false;
  } catch {
    return false;
  }
}
