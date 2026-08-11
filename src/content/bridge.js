/**
 * bridge.js — ISOLATED world 桥(content script)
 *
 * 职责:
 *  1. 读取 chrome.storage.sync 中的站点配置(单值 volume 模型,含历史数据迁移)
 *  2. 用剥标签近似把当前 frame 的 hostname 匹配到 eTLD+1(Site)
 *  3. 计算 siteFactor = volume(0 即静音)并通过 postMessage 推给 MAIN world
 *  4. 监听 storage 变更,实时更新 factor
 *
 * 协议见 volume.js 顶部常量。
 */
(() => {
  'use strict';

  const PROTOCOL_SOURCE = 'site-volume-extension';
  const MSG_TYPE_SET_FACTOR = 'set-factor';

  const STORAGE_KEY = 'sites'; // { [siteKey]: volume(0..1) }

  let cachedSites = {};

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
  // 从完整 hostname 逐级剥左段,直到命中已配置的 siteKey;剥到剩两段停止。
  function matchSite(hostname, sites) {
    if (!hostname) return null;
    const labels = hostname.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i++) {
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

  // ---- 推送给 MAIN world ----
  function pushFactor() {
    const { factor, siteKey } = computeFactor();
    console.log('[Site Volume] bridge pushFactor: hostname=%s, siteKey=%s, factor=%s',
      window.location.hostname, siteKey, factor);
    window.postMessage({
      source: PROTOCOL_SOURCE,
      type: MSG_TYPE_SET_FACTOR,
      factor,
      siteKey
    }, '*');
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
    pushFactor();
  }

  // ---- 监听 storage 变更 ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[STORAGE_KEY]) {
      cachedSites = normalizeSites(changes[STORAGE_KEY].newValue);
      console.log('[Site Volume] bridge storage changed:', cachedSites);
    }
    pushFactor();
  });

  // ---- 启动 ----
  loadConfig();
})();
