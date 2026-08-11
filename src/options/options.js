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

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');

  let sites = {};

  async function load() {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    sites = data[STORAGE_KEY] || {};
    render();
  }

  function render() {
    const keys = Object.keys(sites);
    emptyEl.hidden = keys.length > 0;

    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    for (const key of keys) {
      const vol = typeof sites[key] === 'number' ? sites[key] : 1;
      const row = document.createElement('div');
      row.className = 'row';

      const name = document.createElement('span');
      name.className = 'site';
      name.textContent = key;
      name.title = key;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(vol);

      const volLabel = document.createElement('span');
      volLabel.className = 'vol';
      volLabel.textContent = Math.round(vol * 100) + '%';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'mute-toggle';
      muteBtn.textContent = vol === 0 ? '🔊 恢复音量' : '🔇 静音';
      muteBtn.classList.toggle('active', vol === 0);

      const del = document.createElement('button');
      del.className = 'delete';
      del.textContent = '删除';

      // 拖动中:只更新内存+本行 UI,不写 storage
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        volLabel.textContent = Math.round(v * 100) + '%';
        sites[key] = Math.min(1, Math.max(0, v));
        muteBtn.textContent = sites[key] === 0 ? '🔊 恢复音量' : '🔇 静音';
        muteBtn.classList.toggle('active', sites[key] === 0);
      });

      // 松开鼠标:写一次 storage
      slider.addEventListener('change', () => {
        console.log('[Site Volume] options commit ->', key, sites[key]);
        // 用共享配额工具写,配额超限时输出醒目错误日志
        (window.saveToStorage || ((k, val) => chrome.storage.sync.set({ [k]: val })))(STORAGE_KEY, sites, 'options');
        render();
      });

      muteBtn.addEventListener('click', () => {
        sites[key] = vol === 0 ? 1 : 0;
        console.log('[Site Volume] options commit ->', key, sites[key]);
        (window.saveToStorage || ((k, val) => chrome.storage.sync.set({ [k]: val })))(STORAGE_KEY, sites, 'options');
        render();
      });

      del.addEventListener('click', () => {
        delete sites[key];
        (window.saveToStorage || ((k, val) => chrome.storage.sync.set({ [k]: val })))(STORAGE_KEY, sites, 'options');
        render();
      });

      row.appendChild(name);
      row.appendChild(slider);
      row.appendChild(volLabel);
      row.appendChild(muteBtn);
      row.appendChild(del);
      listEl.appendChild(row);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    load();
  });

  load();
})();
