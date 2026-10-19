/* Optional adapter boundaries. The default application remains entirely local. */
(function (root) {
  "use strict";

  const CONTRACT_VERSION = 1;

  /**
   * Existing local persistence contract. Calls keep their current synchronous
   * behavior, return values, validation, and backup semantics.
   * @typedef {Object} StorageAdapter
   * @property {function(Function=): Object} load
   * @property {function(Object): Object} save
   * @property {function(Object): string} exportJSON
   * @property {function(string): Object} importJSON
   */

  /**
   * Future account provider. Its sign-in input and session representation belong
   * to the selected backend; this module never handles credentials or sessions.
   * @typedef {Object} AccountsAdapter
   * @property {function(): Promise<unknown>} getSession
   * @property {function(unknown): Promise<unknown>} signIn
   * @property {function(): Promise<void>} signOut
   */

  /**
   * Future project progress provider. The backend defines and validates its
   * progress payload and authorizes every read/write independently.
   * @typedef {Object} ProjectSharingAdapter
   * @property {function(string): Promise<unknown>} getProjectProgress
   * @property {function(string, Object): Promise<unknown>} publishProjectProgress
   */

  function validateAdapter(adapter, label, methods) {
    if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
      throw new TypeError(label + "需要提供有效的接口对象。");
    }
    for (const method of methods) {
      if (typeof adapter[method] !== "function") {
        throw new TypeError(label + "缺少方法：" + method);
      }
    }
    return adapter;
  }

  /**
   * Compose explicit adapters without invoking any of them. No global registry,
   * auto-discovery, background work, or fallback remote implementation exists.
   * Freeze only this container: providers may retain their own internal state.
   * @param {{storage: StorageAdapter, accounts?: AccountsAdapter|null,
   * projectSharing?: ProjectSharingAdapter|null}} options
   * @returns {{storage: StorageAdapter, accounts: AccountsAdapter|null,
   * projectSharing: ProjectSharingAdapter|null}}
   */
  function createIntegrationServices(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("扩展接口参数必须是对象。");
    }
    const storage = validateAdapter(options.storage, "本地存储接口", ["load", "save", "exportJSON", "importJSON"]);
    const accounts = options.accounts == null ? null : validateAdapter(options.accounts, "账号接口", ["getSession", "signIn", "signOut"]);
    const projectSharing = options.projectSharing == null ? null : validateAdapter(options.projectSharing, "项目共享接口", ["getProjectProgress", "publishProjectProgress"]);
    return Object.freeze({
      storage,
      accounts,
      projectSharing
    });
  }
  const api = Object.freeze({
    CONTRACT_VERSION,
    createIntegrationServices
  });
  root.ThreeThingsIntegrations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
