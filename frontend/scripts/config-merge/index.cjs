"use strict";
const createMerge = require("@fastify/deepmerge");

/**
 * @typedef {{ arrayMerge?: (target: unknown[], source: unknown[]) => unknown[] }} MergeOptions
 */

/**
 * Only the configuration API used by the pinned consumers is supported.
 * Reject new options rather than silently changing a future consumer's behavior.
 * @param {unknown} target Existing configuration.
 * @param {unknown} source Incoming configuration.
 * @param {MergeOptions} [options] Pinned consumers' array replacement callback.
 * @returns {unknown} Merged configuration without prototype keys.
 */
function merge(target, source, options = {}) {
  for (const key of Object.keys(options)) {
    if (key !== "arrayMerge") {
      throw new TypeError(`Unsupported configuration merge option: ${key}`);
    }
  }
  const { arrayMerge } = options;
  const mergeObjects = createMerge({
    symbols: true,
    ...(arrayMerge ? { mergeArray: () => arrayMerge } : {}),
  });
  return mergeObjects(target, source);
}

/**
 * @param {unknown[]} values Ordered registry configuration fragments.
 * @param {MergeOptions} [options] Pinned consumers' array replacement callback.
 * @returns {unknown} Combined configuration, starting with an empty object.
 */
merge.all = (values, options) => {
  if (!Array.isArray(values)) {
    throw new TypeError("Configuration merge requires an array");
  }
  return values.reduce((target, source) => merge(target, source, options), {});
};

module.exports = merge;
