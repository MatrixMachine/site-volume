/**
 * popup.js — 当前站点音量控制(单值 volume 模型)
 *
 * 配额策略:chrome.storage.sync 有 MAX_WRITE_OPERATIONS_PER_MINUTE(120 次/分)配额。
 * 滑块 input 事件每帧都会触发,直接写 storage 会瞬间打爆配额。
 * 因此:input 期间只更新内存+UI,**不写 storage**;change(松开鼠标)才写一次。
 * 静音按钮点击是低频操作,即时写。
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'sites';

  const el = {
    siteName: document.getElementById('site-name'),
    siteBadge: document.getElementById('site-badge'),
    slider: document.getElementById('volume-slider'),
    volLabel: document.getElementById('volume-label'),
    muteBtn: document.getElementById('mute-btn')
  };

  let currentSiteKey = null; // eTLD+1,匹配到的配置 key
  let currentHostname = null;
  let sites = {};

  // ---- eTLD+1 剥标签近似(与 bridge.js 保持一致) ----
  function matchSite(hostname) {
    if (!hostname) return null;
    const labels = hostname.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.');
      if (Object.prototype.hasOwnProperty.call(sites, candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // UI 显示的 key:已配置用匹配 key,未配置用 hostname 最后两段(便于首次操作创建)
  function displayKey() {
    return currentSiteKey || (currentHostname ? currentHostname.split('.').slice(-2).join('.') : null);
  }

  function currentVolume() {
    const k = currentSiteKey || displayKey();
    return k && typeof sites[k] === 'number' ? sites[k] : 1;
  }

  async function load() {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    sites = data[STORAGE_KEY] || {};

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        currentHostname = url.hostname;
      } catch (e) { /* ignore */ }
    }
    currentSiteKey = currentHostname ? matchSite(currentHostname) : null;
    console.log('[Site Volume] popup load: hostname=%s, siteKey=%s, sites=%o',
      currentHostname, currentSiteKey, sites);

    render();
  }

  function render() {
    const key = displayKey();
    const volume = currentVolume();
    const isMuted = volume === 0;

    if (key) {
      el.siteName.textContent = key;
      el.siteBadge.textContent = currentSiteKey ? '' : '(未配置,默认 100%)';
    } else {
      el.siteName.textContent = '—';
      el.siteBadge.textContent = '无法获取当前站点';
    }

    // 滑块与按钮同步来自内存 volume(单数据源)
    el.slider.value = String(volume);
    el.volLabel.textContent = Math.round(volume * 100) + '%';

    el.muteBtn.textContent = isMuted ? '🔊 恢复音量' : '🔇 静音此站点';
    el.muteBtn.classList.toggle('active', isMuted);
    el.muteBtn.disabled = !key;
    el.slider.disabled = !key;
  }

  // 更新内存 + 同步按钮;不写 storage(由 commit 负责)
  function updateMemory(v) {
    const k = displayKey();
    if (!k) return;
    if (!currentSiteKey) currentSiteKey = k; // 首次操作创建配置
    sites[k] = Math.min(1, Math.max(0, v));
    const isMuted = sites[k] === 0;
    el.muteBtn.textContent = isMuted ? '🔊 恢复音量' : '🔇 静音此站点';
    el.muteBtn.classList.toggle('active', isMuted);
    return k;
  }

  // 写 storage(低频:change 事件 / 按钮点击)
  function commit() {
    const k = displayKey();
    if (!k) return;
    console.log('[Site Volume] commit ->', k, sites[k]);
    // 用共享配额工具写,配额超限时输出醒目错误日志
    (window.saveToStorage || ((key, val) => chrome.storage.sync.set({ [key]: val })))(STORAGE_KEY, sites, 'popup');
    render();
  }

  // ---- 事件 ----
  // 拖动中:只更新内存+标签+按钮,不写 storage
  el.slider.addEventListener('input', () => {
    const v = parseFloat(el.slider.value);
    el.volLabel.textContent = Math.round(v * 100) + '%';
    updateMemory(v);
  });

  // 松开鼠标:写一次 storage
  el.slider.addEventListener('change', () => {
    commit();
  });

  el.muteBtn.addEventListener('click', () => {
    const next = currentVolume() === 0 ? 1 : 0;
    updateMemory(next);
    commit();
  });

  // storage 变更(其他窗口/options 修改)时刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    load();
  });

  load();
})();
