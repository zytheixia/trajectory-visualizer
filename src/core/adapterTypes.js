/**
 * Adapter contract:
 *
 * @typedef {Object} TraceEvent
 * @property {string} id
 * @property {string} type
 * @property {string} category
 * @property {string} name
 * @property {string} content
 * @property {number} time
 * @property {number} durationMs
 * @property {string} status
 * @property {string} parentId
 * @property {string} actor
 * @property {Object} metadata
 * @property {unknown} payload
 *
 * @callback TraceAdapter
 * @param {unknown[] | unknown} input
 * @param {Object} [options]
 * @returns {TraceEvent[]}
 */

export const adapterContractVersion = "agent-trace-adapter/v1";
