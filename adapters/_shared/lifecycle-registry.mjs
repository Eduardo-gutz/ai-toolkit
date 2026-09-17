// adapters/_shared/lifecycle-registry.mjs
//
// Generic lifecycle hook registry. Adapters declare which extras (e.g.,
// bootstrap, lint rules, custom hooks) need to run on each lifecycle
// event (install, sync, remove), and the lifecycle methods iterate
// them generically. Adding a new extra = one entry in the array, no
// changes to install/sync/remove.

/**
 * Create a lifecycle registry. Each array is a list of async hooks
 * called with ({source, target}) during the corresponding adapter
 * method. Hooks are invoked in order; if a hook throws, an error is
 * logged and the next hook still runs.
 *
 * @returns {{ install: Function[], sync: Function[], remove: Function[] }}
 *   Each entry is `async ({source, target}) => Promise<void>`.
 *
 * @example
 *   const lifecycle = createLifecycle();
 *   lifecycle.install.push(installBootstrap);
 *   lifecycle.sync.push(installBootstrap);
 *   lifecycle.remove.push(uninstallBootstrap);
 */
export function createLifecycle() {
  return {
    install: [],
    sync: [],
    remove: [],
  };
}