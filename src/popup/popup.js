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

  const ICON_VOL = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.4 7.4 0 0 1 0 10.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4z" fill="currentColor"/><path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const el = {
    siteAvatar: document.getElementById('site-avatar'),
    siteName: document.getElementById('site-name'),
    siteBadge: document.getElementById('site-badge'),
    slider: document.getElementById('volume-slider'),
    volNumber: document.getElementById('vol-number'),
    waves: document.getElementById('waves'),
    muteBtn: document.getElementById('mute-btn'),
    siteList: document.getElementById('site-list'),
    siteListEmpty: document.getElementById('site-list-empty'),
    openOptionsBtn: document.getElementById('open-options-btn')
  };

  const waveBars = Array.from(el.waves.querySelectorAll('span'));

  let currentSiteKey = null; // eTLD+1,匹配到的配置 key
  let currentHostname = null;
  let sites = {};
  // 最近使用列表(来自 storage,新的在前);renderSiteList 只取前 5 条显示
  let recents = [];
  // popup 列表一次显示的条数上限
  const LIST_LIMIT = 5;
  // 静音前的非零音量记忆(仅内存,popup 生命周期内有效):{ [siteKey]: volume }
  // 用于"恢复音量"回到静音前的值,而不是粗暴回 100%。
  const lastNonZero = {};

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

  // ---- 视觉同步:大数字 / 波形条 / 滑块渐变 / 静音按钮 ----
  function syncVisual(volume) {
    const pct = Math.round(volume * 100);
    const isMuted = volume === 0;

    // 大数字
    el.volNumber.innerHTML = pct + '<span class="pct">%</span>';
    el.volNumber.classList.toggle('muted', isMuted);

    // 波形条:按音量点亮不同数量,高度做波形起伏
    const lit = Math.round(volume * waveBars.length);
    waveBars.forEach((bar, i) => {
      const wave = 0.45 + 0.55 * Math.abs(Math.sin((i / waveBars.length) * Math.PI));
      bar.style.setProperty('--h', Math.round(wave * 100) + '%');
      bar.classList.toggle('on', i < lit && !isMuted);
    });

    // 滑块轨道填充(webkit 用 CSS 变量,firefox 用 range-progress 自动)
    el.slider.style.setProperty('--fill', pct + '%');

    // 静音按钮
    el.muteBtn.innerHTML = (isMuted ? ICON_VOL + '恢复音量' : ICON_MUTE + '静音此站点');
    el.muteBtn.classList.toggle('active', isMuted);
  }

  async function load() {
    const recentsKey = window.RECENTS_KEY || 'recents';
    const data = await chrome.storage.sync.get([STORAGE_KEY, recentsKey]);
    sites = data[STORAGE_KEY] || {};
    recents = Array.isArray(data[recentsKey]) ? data[recentsKey] : [];

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        currentHostname = url.hostname;
      } catch (e) { /* ignore */ }
    }
    currentSiteKey = currentHostname ? matchSite(currentHostname) : null;
    console.log('[Site Volume] popup load: hostname=%s, siteKey=%s, sites=%o, recents=%o',
      currentHostname, currentSiteKey, sites, recents);

    render();
  }

  function render() {
    const key = displayKey();
    const volume = currentVolume();

    if (key) {
      el.siteName.textContent = key;
      el.siteBadge.textContent = currentSiteKey ? '' : '未配置,默认 100%';
      el.siteAvatar.textContent = key.charAt(0).toUpperCase();
      el.siteAvatar.classList.remove('off');
    } else {
      el.siteName.textContent = '—';
      el.siteBadge.textContent = '无法获取当前站点';
      el.siteAvatar.textContent = '·';
      el.siteAvatar.classList.add('off');
    }

    // 滑块与视觉同步来自内存 volume(单数据源)
    el.slider.value = String(volume);
    syncVisual(volume);

    el.muteBtn.disabled = !key;
    el.slider.disabled = !key;

    renderSiteList();
  }

  // ---- 站点配置列表(最近使用,最多 LIST_LIMIT 条) ----
  function renderSiteList() {
    const allKeys = Object.keys(sites);
    el.siteListEmpty.hidden = allKeys.length > 0;

    while (el.siteList.firstChild) el.siteList.removeChild(el.siteList.firstChild);

    // 排序:recents 里的按出现顺序,不在 recents 里的按字典序排在后面
    const rank = new Map(recents.map((k, i) => [k, i]));
    const sorted = allKeys.slice().sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    const shown = sorted.slice(0, LIST_LIMIT);
    const hiddenCount = sorted.length - shown.length;

    shown.forEach((key, i) => {
      const vol = typeof sites[key] === 'number' ? sites[key] : 1;
      const item = document.createElement('div');
      item.className = 'list-item';
      item.style.setProperty('--i', String(i));

      const avatar = document.createElement('span');
      avatar.className = 'mini-avatar';
      avatar.textContent = key.charAt(0).toUpperCase();

      const name = document.createElement('span');
      name.className = 'site';
      name.textContent = key;
      name.title = key;

      const volLabel = document.createElement('span');
      volLabel.className = 'vol' + (vol === 0 ? ' muted' : '');
      volLabel.innerHTML = vol === 0
        ? ICON_MUTE + '0%'
        : Math.round(vol * 100) + '%';

      // 点击列表项 → 打开对应站点的新标签(方便直接调音量)
      item.addEventListener('click', () => {
        const url = 'https://' + key + '/';
        chrome.tabs.create({ url }).catch((e) => {
          console.error('[Site Volume] open tab failed:', e);
        });
      });

      item.appendChild(avatar);
      item.appendChild(name);
      item.appendChild(volLabel);
      el.siteList.appendChild(item);
    });

    // 还有未展示的站点:给一行跳转管理页的提示
    if (hiddenCount > 0) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'list-more';
      more.textContent = `还有 ${hiddenCount} 个站点 → 管理`;
      more.addEventListener('click', () => {
        chrome.runtime.openOptionsPage().catch((e) => {
          console.error('[Site Volume] open options failed:', e);
        });
      });
      el.siteList.appendChild(more);
    }
  }

  // 更新内存 + 同步视觉;不写 storage(由 commit 负责)
  function updateMemory(v) {
    const k = displayKey();
    if (!k) return;
    if (!currentSiteKey) currentSiteKey = k; // 首次操作创建配置
    sites[k] = Math.min(1, Math.max(0, v));
    syncVisual(sites[k]);
    return k;
  }

  // 写 storage(低频:change 事件 / 按钮点击)
  function commit() {
    const k = displayKey();
    if (!k) return;
    console.log('[Site Volume] commit ->', k, sites[k]);
    // 用共享配额工具写,配额超限时输出醒目错误日志
    (window.saveToStorage || ((key, val) => chrome.storage.sync.set({ [key]: val })))(STORAGE_KEY, sites, 'popup');
    // 记一下"最近调整过"——popup 列表按此排序;失败不影响主流程
    if (window.touchRecent) window.touchRecent(k, 'popup');
    render();
  }

  // ---- 事件 ----
  // 拖动中:只更新内存+视觉,不写 storage
  el.slider.addEventListener('input', () => {
    updateMemory(parseFloat(el.slider.value));
  });

  // 松开鼠标:写一次 storage
  el.slider.addEventListener('change', () => {
    commit();
  });

  el.muteBtn.addEventListener('click', () => {
    const k = displayKey();
    if (!k) return;
    const cur = currentVolume();
    let next;
    if (cur === 0) {
      // 恢复:回到静音前的音量(未知则 100%)
      next = typeof lastNonZero[k] === 'number' && lastNonZero[k] > 0 ? lastNonZero[k] : 1;
    } else {
      // 静音:先记住当前非零音量
      lastNonZero[k] = cur;
      next = 0;
    }
    updateMemory(next);
    commit();
  });

  // 打开完整管理页(options)
  el.openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage().catch((e) => {
      console.error('[Site Volume] open options failed:', e);
    });
  });

  // storage 变更(其他窗口/options 修改)时刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    load();
  });

  load();
})();
