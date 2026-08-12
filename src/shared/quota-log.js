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

  // ---- 自写抑制:避免"自己写 storage → 自己的 onChanged → 重复全量刷新" ----
  // popup/options 都监听 chrome.storage.onChanged 以便同步外部(其他窗口/页面)的修改;
  // 但本页面自己 set() 时 onChanged 也会在自己这里触发,若不区分,调节音量时
  // "最近站点"列表 / 整个管理列表会因自己的写入而多刷新一次(闪一下)。
  // 方案:每次 set() 前 beginSelfWrite() 计数;onChanged 事件与 set() 一一对应,
  // 由监听器 consumeSelfWrite() 消费一个计数——计数 >0 说明该变更是本页面自己写的,
  // 应跳过 reload。写入失败时不会有对应 onChanged,在 catch 里补回计数。
  const _selfWriteCount = { count: 0 };

  function beginSelfWrite() {
    _selfWriteCount.count++;
  }

  /** 消费一个"自写"计数;返回 true 表示这次变更来自本页面,应跳过 reload */
  function consumeSelfWrite() {
    if (_selfWriteCount.count > 0) {
      _selfWriteCount.count--;
      return true;
    }
    return false;
  }

  /**
   * 写入 chrome.storage.sync,并统一处理配额错误日志
   * @param {string} key    存储键(如 'sites')
   * @param {object} value  要写入的值
   * @param {string} source 调用来源标识(如 'popup' / 'options'),用于日志
   */
  function saveToStorage(key, value, source) {
    beginSelfWrite();
    return chrome.storage.sync.set({ [key]: value }).catch((err) => {
      // 写入失败不会触发 onChanged,补回计数(consume 内部有 >0 保护,可安全调用)
      consumeSelfWrite();
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

  // ---- 最近使用记录 ----
  // 单独的 storage key,值是 siteKey 数组,最新的在最前,长度封顶 20。
  // 只被 popup/options 在"用户调整了站点音量/静音"时调用,不拦截正常访问。
  const RECENTS_KEY = 'recents';
  const RECENTS_MAX = 20;

  /**
   * 把 siteKey 推到最近使用列表最前,去重并截断;失败只记日志,不影响主流程。
   * @param {string} siteKey 配置 key(如 'example.com')
   * @param {string} source  调用来源('popup' / 'options'),仅用于日志
   */
  async function touchRecent(siteKey, source) {
    if (!siteKey) return;
    try {
      const data = await chrome.storage.sync.get(RECENTS_KEY);
      const arr = Array.isArray(data[RECENTS_KEY]) ? data[RECENTS_KEY] : [];
      const next = [siteKey, ...arr.filter((k) => k !== siteKey)].slice(0, RECENTS_MAX);
      // 值没变就不写:既省配额,也避免产生无意义的 onChanged(以及计数配平问题)
      if (next.join('\u0000') === arr.join('\u0000')) return;
      beginSelfWrite();
      await chrome.storage.sync.set({ [RECENTS_KEY]: next });
    } catch (err) {
      // get/set 失败不会有对应 onChanged,补回计数
      consumeSelfWrite();
      // recents 是辅助数据,失败不应阻塞主流程,也不应吓用户
      console.warn(`[Site Volume] ${source}:更新最近使用失败(可忽略):`, err);
    }
  }

  // 暴露到全局(window),popup.js / options.js 通过 window.saveToStorage / window.touchRecent 使用
  // (content script 的 ISOLATED world 与 popup 页面是不同上下文,这里仅服务 popup/options 页面)
  window.saveToStorage = saveToStorage;
  window.touchRecent = touchRecent;
  window.RECENTS_KEY = RECENTS_KEY;
  // 供 popup/options 的 storage.onChanged 监听器判断"这次变更是否自己写的"
  window.consumeSelfWrite = consumeSelfWrite;
})();
