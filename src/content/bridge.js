/**
 * bridge.js — ISOLATED world 桥(content script)
 *
 * 职责:
 *  1. 读取 chrome.storage.sync 中的站点配置(单值 volume 模型,含历史数据迁移)
 *  2. 用剥标签近似把当前 frame 的 hostname 匹配到 eTLD+1(Site)
 *  3. 计算 siteFactor = volume(0 即静音)并通过 postMessage 推给 MAIN world
 *  4. 监听 storage 变更,实时更新 factor
 *  5. 跨 frame 继承:子 frame 自身 hostname 匹配不到配置时,向父 frame
 *     (逐级到顶层)请求并继承其 effective factor。解决播放器嵌在跨域
 *     iframe / about:blank / srcdoc 中时(如 supjav.com)音量不生效的问题。
 *
 * 帧间协议(均为 PROTOCOL_SOURCE 来源的 postMessage,跨域可用):
 *  - 'top-factor':父 frame → 子 frame,携带发送方 effective factor/siteKey
 *  - 'request-factor':子 frame → 父 frame,请求继承值(启动/配置变更时)
 *
 * 与 MAIN world 的协议('set-factor')见 volume.js 顶部常量。
 */
(() => {
  'use strict';

  const PROTOCOL_SOURCE = 'site-volume-extension';
  const MSG_TYPE_SET_FACTOR = 'set-factor';
  const MSG_TYPE_TOP_FACTOR = 'top-factor';
  const MSG_TYPE_REQUEST_FACTOR = 'request-factor';

  const STORAGE_KEY = 'sites'; // { [siteKey]: volume(0..1) }

  let cachedSites = {};

  // 从父 frame 继承的 factor/siteKey(仅子 frame 使用;null 表示尚未继承)
  let inheritedFactor = null;
  let inheritedSiteKey = null;

  // 历史数据迁移:{ siteKey: { volume, muted } } → { siteKey: volume || 0 }
  function normalizeSites(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'number') {
        out[key] = val;
      } else if (val && typeof val === 'object') {
        // 旧模型:{ volume, muted }
        const v = typeof val.volume === 'number' ? val.volume : 1;
        out[key] = val.muted ? 0 : v;
      }
    }
    return out;
  }

  // ---- 剥标签近似的 eTLD+1 匹配 ----
  // 从完整 hostname 逐级剥左段,直到命中已配置的 siteKey;剥到剩两段停止
  // (单标签 hostname 如 localhost 也允许匹配,不存在 TLD 可剥)。
  function matchSite(hostname, sites) {
    if (!hostname) return null;
    const labels = hostname.split('.').filter(Boolean);
    for (let i = 0; i < Math.max(1, labels.length - 1); i++) {
      const candidate = labels.slice(i).join('.');
      if (Object.prototype.hasOwnProperty.call(sites, candidate)) {
        return candidate;
      }
    }
    // 未配置任何近似段:返回 null(视为未知站点,不干预)
    return null;
  }

  // ---- 计算 factor ----
  function computeFactor() {
    const hostname = window.location.hostname;
    const siteKey = matchSite(hostname, cachedSites);
    let factor = 1;
    if (siteKey) {
      const v = cachedSites[siteKey];
      if (typeof v === 'number') factor = v;
    }
    return { factor, siteKey };
  }

  // 本 frame 实际生效的 factor:优先本 frame 匹配,其次父 frame 继承值,最后 1
  function effectiveFactor() {
    const own = computeFactor();
    if (own.siteKey) return own;
    if (inheritedFactor !== null) return { factor: inheritedFactor, siteKey: inheritedSiteKey };
    return { factor: 1, siteKey: null };
  }

  // ---- 推送给 MAIN world ----
  function pushFactor() {
    const { factor, siteKey } = effectiveFactor();
    console.log('[Site Volume] bridge pushFactor: hostname=%s, siteKey=%s, factor=%s',
      window.location.hostname, siteKey, factor);
    window.postMessage({
      source: PROTOCOL_SOURCE,
      type: MSG_TYPE_SET_FACTOR,
      factor,
      siteKey
    }, '*');
  }

  // 把本 frame 的 effective factor 广播给所有直接子 frame(跨域也可 postMessage)
  function broadcastToChildren() {
    const { factor, siteKey } = effectiveFactor();
    try {
      for (let i = 0; i < window.frames.length; i++) {
        window.frames[i].postMessage({
          source: PROTOCOL_SOURCE,
          type: MSG_TYPE_TOP_FACTOR,
          factor,
          siteKey
        }, '*');
      }
    } catch (e) { /* ignore */ }
  }

  // 同步本 frame:推送给 MAIN world + 广播给子 frame(嵌套层级逐级向下传播)
  function sync() {
    pushFactor();
    broadcastToChildren();
  }

  // 向父 frame 请求继承值(自身匹配不到配置的子 frame,启动/配置变更时)
  function requestFromParent() {
    try {
      window.parent.postMessage({ source: PROTOCOL_SOURCE, type: MSG_TYPE_REQUEST_FACTOR }, '*');
    } catch (e) { /* ignore */ }
  }

  // ---- 配置变化后的处理 ----
  // 自身匹配到配置:直接生效并向下广播。
  // 自身匹配不到:顶层推 factor=1;子 frame 向父级重新要继承值
  // (不推可能已过期的本地继承值,避免音量瞬间回弹)。
  function handleConfigChange() {
    if (computeFactor().siteKey) {
      sync();
    } else if (window !== window.top) {
      requestFromParent();
    } else {
      sync(); // 顶层未配置:factor 1(子 frame 也会继承到 1)
    }
  }

  // ---- 帧间消息 ----
  function onFrameMessage(e) {
    if (e.source === window) return; // 本 frame 自身的 set-factor 消息不在此处理
    const data = e.data;
    if (!data || data.source !== PROTOCOL_SOURCE) return;

    if (data.type === MSG_TYPE_TOP_FACTOR) {
      // 只接受直接父 frame 的继承值(嵌套时每级转发,发送方恒为直接父)
      if (typeof data.factor !== 'number' || e.source !== window.parent) return;
      inheritedFactor = data.factor;
      inheritedSiteKey = data.siteKey || null;
      sync();
    } else if (data.type === MSG_TYPE_REQUEST_FACTOR) {
      // 子 frame 请求继承值:回复本 frame 的 effective factor
      const { factor, siteKey } = effectiveFactor();
      try {
        e.source.postMessage({
          source: PROTOCOL_SOURCE,
          type: MSG_TYPE_TOP_FACTOR,
          factor,
          siteKey
        }, '*');
      } catch (err) { /* ignore */ }
    }
  }

  // ---- 读取配置 ----
  async function loadConfig() {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEY);
      cachedSites = normalizeSites(data[STORAGE_KEY]);
    } catch (e) {
      console.error('[Site Volume] bridge loadConfig failed:', e);
      cachedSites = {};
    }
    handleConfigChange();
  }

  // ---- 监听 storage 变更 ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!changes[STORAGE_KEY]) return; // recents 等无关键不触发重同步
    cachedSites = normalizeSites(changes[STORAGE_KEY].newValue);
    console.log('[Site Volume] bridge storage changed:', cachedSites);
    handleConfigChange();
  });

  // ---- 启动 ----
  window.addEventListener('message', onFrameMessage);
  loadConfig();
})();
