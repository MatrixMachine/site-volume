/**
 * quota-log.js — chrome.storage.sync 配额超限的日志工具
 *
 * storage.sync 的硬限制(Chrome 官方):
 *   - MAX_WRITE_OPERATIONS_PER_MINUTE: 120 次/分钟
 *   - MAX_WRITE_OPERATIONS_PER_HOUR:   1800 次/小时
 *
 * 所有对 storage.sync 的写入都应通过 saveToStorage() 包装,
 * 遇到配额超限时输出清晰、可操作的错误日志(而非只有原始错误对象)。
 */
(() => {
  'use strict';

  // 识别配额超限错误(不同 Chrome 版本错误消息略有差异)
  function isQuotaError(err) {
    if (!err) return false;
    const msg = String(err && err.message ? err.message : err);
    return /MAX_WRITE_OPERATIONS_PER_MINUTE|MAX_WRITE_OPERATIONS_PER_HOUR/i.test(msg);
  }

  /**
   * 写入 chrome.storage.sync,并统一处理配额错误日志
   * @param {string} key    存储键(如 'sites')
   * @param {object} value  要写入的值
   * @param {string} source 调用来源标识(如 'popup' / 'options'),用于日志
   */
  function saveToStorage(key, value, source) {
    return chrome.storage.sync.set({ [key]: value }).catch((err) => {
      if (isQuotaError(err)) {
        console.error(
          `%c[Site Volume] ${source}:⚠️ 写入配额超限(storage.sync 限制 120 次/分钟)。` +
          `本次修改未保存到 storage,可能未生效。请稍候(约 1 分钟)再试,或避免连续快速拖动滑块。`,
          'color:#f85149;font-weight:bold'
        );
        console.error('[Site Volume] quota error detail:', err);
      } else {
        console.error(`[Site Volume] ${source}:写入 storage 失败:`, err);
      }
    });
  }

  // 暴露到全局(window),popup.js / options.js 通过 window.saveToStorage 使用
  // (content script 的 ISOLATED world 与 popup 页面是不同上下文,这里仅服务 popup/options 页面)
  window.saveToStorage = saveToStorage;
})();
