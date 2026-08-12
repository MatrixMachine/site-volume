/**
 * options.js — 站点列表管理(改音量 / 删除)
 * 单值 volume 模型:静音 = 音量 0
 *
 * 配额策略:与 popup.js 一致——滑块 input 只更新内存+本行 UI,不写 storage;
 * change(松开鼠标)才写一次,避免打爆 chrome.storage.sync 的写入配额。
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'sites';

  const ICON_VOL = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.4 7.4 0 0 1 0 10.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4z" fill="currentColor"/><path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>';

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const statTotal = document.getElementById('stat-total');
  const statAvg = document.getElementById('stat-avg');
  const statMuted = document.getElementById('stat-muted');
  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');
  const importFile = document.getElementById('import-file');
  const toolbarMsg = document.getElementById('toolbar-msg');

  let sites = {};
  // 静音前的非零音量记忆(仅内存,页面生命周期内有效):{ [siteKey]: volume }
  // 用于"恢复"回到静音前的值,而不是粗暴回 100%。
  const lastNonZero = {};

  function save() {
    (window.saveToStorage || ((k, val) => chrome.storage.sync.set({ [k]: val })))(STORAGE_KEY, sites, 'options');
  }

  async function load() {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    sites = data[STORAGE_KEY] || {};
    render();
  }

  function renderStats() {
    const vols = Object.values(sites).filter(v => typeof v === 'number');
    statTotal.textContent = String(vols.length);
    statMuted.textContent = String(vols.filter(v => v === 0).length);
    statAvg.textContent = vols.length
      ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length * 100) + '%'
      : '—';
  }

  // 只更新某一行的 UI(音量标签/滑块填充/静音态),不重建整个列表。
  // 调整音量后整列表重建会"闪"一下、还丢失滑块焦点;原地更新即可。
  function updateRowUI(row, slider, volLabel, muteBtn, state, v) {
    const muted = v === 0;
    volLabel.textContent = Math.round(v * 100) + '%';
    slider.value = String(v);
    slider.style.setProperty('--fill', Math.round(v * 100) + '%');
    row.classList.toggle('muted-row', muted);
    state.textContent = muted ? '已静音' : '生效中';
    muteBtn.className = 'btn mute-toggle' + (muted ? ' active' : '');
    muteBtn.innerHTML = (muted ? ICON_VOL + '恢复' : ICON_MUTE + '静音');
  }

  function render() {
    const keys = Object.keys(sites).sort();
    emptyEl.hidden = keys.length > 0;
    renderStats();

    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    keys.forEach((key, i) => {
      const vol = typeof sites[key] === 'number' ? sites[key] : 1;
      const isMuted = vol === 0;

      const row = document.createElement('div');
      row.className = 'row' + (isMuted ? ' muted-row' : '');
      row.style.setProperty('--i', String(i));

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = key.charAt(0).toUpperCase(); // 兜底:首字母
      if (window.makeFaviconImg) {
        avatar.appendChild(window.makeFaviconImg(key, key.charAt(0).toUpperCase()));
      }

      const info = document.createElement('div');
      info.className = 'site-info';
      const name = document.createElement('div');
      name.className = 'site';
      name.textContent = key;
      name.title = key;
      const state = document.createElement('div');
      state.className = 'site-state';
      state.textContent = isMuted ? '已静音' : '生效中';
      info.appendChild(name);
      info.appendChild(state);

      const zone = document.createElement('div');
      zone.className = 'slider-zone';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(vol);
      slider.style.setProperty('--fill', Math.round(vol * 100) + '%');
      slider.setAttribute('aria-label', key + ' 音量');

      const volLabel = document.createElement('span');
      volLabel.className = 'vol';
      volLabel.textContent = Math.round(vol * 100) + '%';

      zone.appendChild(slider);
      zone.appendChild(volLabel);

      const muteBtn = document.createElement('button');
      muteBtn.className = 'btn mute-toggle' + (isMuted ? ' active' : '');
      muteBtn.innerHTML = (isMuted ? ICON_VOL + '恢复' : ICON_MUTE + '静音');

      const del = document.createElement('button');
      del.className = 'btn delete';
      del.innerHTML = ICON_TRASH;
      del.title = '删除 ' + key;

      // 拖动中:只更新内存+本行 UI,不写 storage
      slider.addEventListener('input', () => {
        const v = Math.min(1, Math.max(0, parseFloat(slider.value)));
        sites[key] = v;
        updateRowUI(row, slider, volLabel, muteBtn, state, v);
      });

      // 松开鼠标:写一次 storage
      slider.addEventListener('change', () => {
        console.log('[Site Volume] options commit ->', key, sites[key]);
        save();
        if (window.touchRecent) window.touchRecent(key, 'options');
        renderStats();
      });

      muteBtn.addEventListener('click', () => {
        if (sites[key] === 0) {
          // 恢复:回到静音前的音量(未知则 100%)
          sites[key] = typeof lastNonZero[key] === 'number' && lastNonZero[key] > 0
            ? lastNonZero[key]
            : 1;
        } else {
          // 静音:先记住当前非零音量
          lastNonZero[key] = sites[key];
          sites[key] = 0;
        }
        console.log('[Site Volume] options commit ->', key, sites[key]);
        save();
        if (window.touchRecent) window.touchRecent(key, 'options');
        // 原地更新本行,不整列表重建(避免整体刷新)
        updateRowUI(row, slider, volLabel, muteBtn, state, sites[key]);
        renderStats();
      });

      del.addEventListener('click', () => {
        // 退场动画后再删除
        row.classList.add('leaving');
        setTimeout(() => {
          delete sites[key];
          save();
          render();
        }, 220);
      });

      row.appendChild(avatar);
      row.appendChild(info);
      row.appendChild(zone);
      row.appendChild(muteBtn);
      row.appendChild(del);
      listEl.appendChild(row);
    });
  }

  // ---- 导入 / 导出 ----
  let msgTimer = null;
  function showMsg(text, kind) {
    toolbarMsg.textContent = text;
    toolbarMsg.className = 'toolbar-msg' + (kind ? ' ' + kind : '');
    if (msgTimer) clearTimeout(msgTimer);
    // 5s 后自动清掉,避免长期占用视觉焦点
    msgTimer = setTimeout(() => {
      toolbarMsg.textContent = '';
      toolbarMsg.className = 'toolbar-msg';
    }, 5000);
  }

  function exportConfig() {
    const payload = {
      app: 'site-volume',
      version: 1,
      exportedAt: new Date().toISOString(),
      sites
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    a.href = url;
    a.download = `site-volume-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 释放 blob URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const count = Object.keys(sites).length;
    showMsg(`已导出 ${count} 个站点`, 'ok');
  }

  // 把任意形态的 JSON 归一化成 { siteKey: volume(0..1) }
  // 容忍三种输入:{ sites:{...} }(本扩展导出) / 直接的 { siteKey: number } / 旧模型 { siteKey: {volume, muted} }
  function normalizeImported(json) {
    let raw = null;
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if (json.sites && typeof json.sites === 'object' && !Array.isArray(json.sites)) {
        raw = json.sites;
      } else {
        raw = json;
      }
    }
    if (!raw) return null;
    const out = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof key !== 'string' || !key) continue;
      let v = null;
      if (typeof val === 'number') {
        v = val;
      } else if (val && typeof val === 'object') {
        // 旧模型 { volume, muted }
        const vol = typeof val.volume === 'number' ? val.volume : 1;
        v = val.muted ? 0 : vol;
      }
      if (typeof v !== 'number' || !isFinite(v)) continue;
      out[key] = Math.min(1, Math.max(0, v));
    }
    return out;
  }

  async function importConfig(file) {
    let json;
    try {
      const text = await file.text();
      json = JSON.parse(text);
    } catch (e) {
      showMsg('文件不是有效的 JSON', 'err');
      return;
    }
    const imported = normalizeImported(json);
    if (!imported) {
      showMsg('文件结构不识别:需要 { sites: { siteKey: volume } } 或直接 { siteKey: volume }', 'err');
      return;
    }
    const importedKeys = Object.keys(imported);
    if (importedKeys.length === 0) {
      showMsg('文件里没有可用的站点配置', 'err');
      return;
    }
    // 合并:导入的覆盖冲突
    let added = 0, overridden = 0;
    for (const k of importedKeys) {
      if (Object.prototype.hasOwnProperty.call(sites, k)) overridden++;
      else added++;
      sites[k] = imported[k];
    }
    save();
    render();
    const parts = [];
    parts.push(`导入 ${importedKeys.length} 个`);
    if (added > 0) parts.push(`新增 ${added}`);
    if (overridden > 0) parts.push(`覆盖 ${overridden}`);
    showMsg(parts.join(' · '), 'ok');
  }

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const f = importFile.files && importFile.files[0];
    if (f) importConfig(f);
    // 允许连续选同一个文件
    importFile.value = '';
  });
  exportBtn.addEventListener('click', exportConfig);

  // storage 变更(其他窗口/页面修改)时刷新。
  // 自己写入 storage 触发的变更不整体刷新(否则调整音量后整列表会重建一遍),
  // 仅外部变更才重新加载。
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (window.consumeSelfWrite && window.consumeSelfWrite()) return;
    load();
  });

  load();
})();
