import { join } from 'node:path';

// Build a per-tool `resourcePaths(type, name, target)`.
//
// SECURITY: `assertSafeName` is invoked BEFORE building any path so a
// malicious name cannot escape into the filesystem layout.
//
// @param {object} opts
// @param {string} opts.agentsDir
// @param {string} opts.skillsDir
// @param {(name: string, type: string) => void} opts.assertSafeName
// @returns {(type: string, name: string, target: string) => string[]}
export function makeResourcePaths({ agentsDir, skillsDir, assertSafeName }) {
  return (type, name, target) => {
    assertSafeName(name, type);

    switch (type) {
      case 'agents':
        return [join(target, agentsDir, `${name}.md`)];
      case 'skills':
        return [join(target, skillsDir, name)];
      default:
        return [];
    }
  };
}

/**
 * Build a per-tool `cleanupDirs(target)`.
 * Order: deepest first (agents, skills, root) so removeIfEmpty cascades up.
 *
 * @param {object} opts
 * @param {string} opts.rootDir
 * @returns {(target: string) => string[]}
 */
export function makeCleanupDirs({ rootDir }) {
  return (target) => [
    join(target, rootDir, 'agents'),
    join(target, rootDir, 'skills'),
    join(target, rootDir),
  ];
}
