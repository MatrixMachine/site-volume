/**
 * volume.js — MAIN world 注入脚本(每个 frame 独立运行)
 *
 * 职责:
 *  1. 拦截 HTMLMediaElement.prototype.volume 的 getter/setter:
 *     - setter 把"源音量"存到元素私有 symbol,实际生效值 = 源音量 × siteFactor(0 即静音)
 *     - getter 返回源音量,保证站内音量滑块显示正确
 *  2. 包装 AudioContext:在 destination 前插入 GainNode,gain = siteFactor
 *  3. 用 MutationObserver 捕获动态创建的媒体元素,确保现在与未来的元素都生效
 *
 * 与 ISOLATED world 桥(bridge.js)通过 window.postMessage 通信。
 * 注意:MAIN world 无法访问 chrome.storage,一切配置来自桥的下发。
 */
(() => {
  'use strict';

  // ---- 通信协议常量(与 bridge.js 保持一致) ----
  const PROTOCOL_SOURCE = 'site-volume-extension';
  const MSG_TYPE_SET_FACTOR = 'set-factor';

  // 私有 symbol:每个媒体元素被页面设置的源音量
  const SOURCE_VOLUME = Symbol('siteVolumeSourceVolume');
  // 私有 symbol:标记元素已被本脚本处理
  const PATCHED = Symbol('siteVolumePatched');
  // 全局 symbol:AudioContext 是否已包装、gain 节点引用
  const AUDIO_PATCHED = Symbol.for('siteVolumeAudioPatched');
  const AUDIO_GAIN = Symbol.for('siteVolumeGainNode');

  let siteFactor = 1;

  // 原始 descriptor(闭包保存,供内部调用,不再暴露给页面)
  let _originalGetter = null;
  let _originalSetter = null;

  // 注入前已存在元素的原始音量(必须在覆写 getter 之前读取)
  const _preVolumes = new WeakMap();

  // 所有 AudioContext 的 gain 节点注册表
  const _gainRegistry = new Set();

  // ---- 工具 ----
  function effectiveVolume(sourceVol) {
    const f = siteFactor;
    if (typeof sourceVol !== 'number') return 0;
    return Math.min(1, Math.max(0, sourceVol * f));
  }

  function getSourceVolume(el) {
    return el[SOURCE_VOLUME];
  }
  function setSourceVolume(el, v) {
    el[SOURCE_VOLUME] = v;
  }

  // ---- MediaElement 拦截 ----
  function preReadExisting() {
    try {
      document.querySelectorAll('audio, video').forEach((el) => {
        _preVolumes.set(el, el.volume);
      });
    } catch (e) { /* ignore */ }
  }

  function installMediaPatch() {
    const proto = HTMLMediaElement.prototype;
    if (proto[PATCHED]) return;

    const desc = Object.getOwnPropertyDescriptor(proto, 'volume');
    _originalGetter = desc ? desc.get : null;
    _originalSetter = desc ? desc.set : null;

    // 必须在覆写 getter 前读取已存在元素的原始音量
    preReadExisting();

    Object.defineProperty(proto, 'volume', {
      configurable: true,
      enumerable: true,
      get: function () {
        const stored = getSourceVolume(this);
        if (typeof stored === 'number') return stored;
        return _originalGetter ? _originalGetter.call(this) : 1;
      },
      set: function (v) {
        const clamped = typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 1;
        setSourceVolume(this, clamped);
        if (_originalSetter) {
          _originalSetter.call(this, effectiveVolume(clamped));
        }
      }
    });

    // 处理注入前已存在的元素
    try {
      document.querySelectorAll('audio, video').forEach((el) => {
        if (el[PATCHED]) return;
        const orig = _preVolumes.get(el);
        if (typeof orig === 'number') {
          setSourceVolume(el, orig);
          if (_originalSetter) _originalSetter.call(el, effectiveVolume(orig));
        }
        el[PATCHED] = true;
      });
    } catch (e) { /* ignore */ }

    proto[PATCHED] = true;
  }

  // 处理单个(新出现的)媒体元素
  function applyToElement(el) {
    if (!el || el[PATCHED]) return;
    // 此刻 prototype 已被覆写;getter 返回 stored ?? originalGetter
    const current = el.volume;
    if (typeof current === 'number') {
      setSourceVolume(el, current);
      if (_originalSetter) _originalSetter.call(el, effectiveVolume(current));
    }
    el[PATCHED] = true;
  }

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            applyToElement(node);
          } else if (node.nodeType === 1 && node.querySelectorAll) {
            node.querySelectorAll('audio, video').forEach(applyToElement);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---- AudioContext 包装 ----
  function installAudioPatch() {
    if (window[AUDIO_PATCHED]) return;

    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!NativeAudioContext) return;

    function PatchedAudioContext(...args) {
      const ctx = new NativeAudioContext(...args);
      try {
        // 先拿到真实的 destination(在遮蔽之前)
        const realDest = ctx.destination;
        const gain = ctx.createGain();
        gain.gain.value = siteFactor;
        ctx[AUDIO_GAIN] = gain;
        _gainRegistry.add(gain);
        gain.connect(realDest);
        // 用实例上的 own property 遮蔽 prototype 的 destination getter:
        // 页面代码 source.connect(ctx.destination) 现在会连到 gain(而非真实 destination),
        // gain 再汇入真实 destination。
        Object.defineProperty(ctx, 'destination', {
          configurable: true,
          enumerable: true,
          value: gain
        });
      } catch (e) { /* ignore */ }
      return ctx;
    }

    try {
      PatchedAudioContext.prototype = NativeAudioContext.prototype;
      PatchedAudioContext.prototype.constructor = PatchedAudioContext;
      window.AudioContext = PatchedAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;
    } catch (e) { /* ignore */ }

    window[AUDIO_PATCHED] = true;
  }

  // ---- 应用新 factor ----
  function applyFactor(f) {
    siteFactor = f;
    // 更新所有已代理元素的实际音量
    try {
      document.querySelectorAll('audio, video').forEach((el) => {
        const src = getSourceVolume(el);
        if (typeof src === 'number' && _originalSetter) {
          _originalSetter.call(el, effectiveVolume(src));
        }
      });
    } catch (e) { /* ignore */ }
    // 更新所有 gain 节点
    _gainRegistry.forEach((gain) => {
      try { gain.gain.value = f; } catch (e) { /* ignore */ }
    });
  }

  // ---- 与桥通信 ----
  function onMessage(e) {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== PROTOCOL_SOURCE) return;
    if (data.type === MSG_TYPE_SET_FACTOR && typeof data.factor === 'number') {
      console.log('[Site Volume] inject applied factor:', data.factor, 'siteKey:', data.siteKey);
      applyFactor(data.factor);
    }
  }
  // 消息监听器在注入时立即注册(而非等到 DOMContentLoaded),
  // 这样桥在 document_start 下发的初始 factor 不会丢失。
  window.addEventListener('message', onMessage);

  // ---- 启动 ----
  // document_start 时可能没有 documentElement,MutationObserver 观察时机延后。
  function boot() {
    installMediaPatch();
    installAudioPatch();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
