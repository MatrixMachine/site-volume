/**
 * site-icon.js — 站点图标工具(popup/options 共用)
 *
 * 站点的配置 key 是 eTLD+1(如 example.com),可直接从公共 favicon 服务取图。
 * 这里用 Google s2 favicons(返回透明 PNG、可按尺寸取图、无需站点权限)。
 * 每个头像容器里始终保留"首字母文字"作兜底,favicon <img> 绝对定位叠在上面;
 * 加载失败/超时自动移除 <img>,露出首字母。
 */
(() => {
  'use strict';

  /** 站点 favicon 的 URL(公共服务,无需 host 权限) */
  function siteFaviconUrl(siteKey, size) {
    if (!siteKey) return '';
    const s = typeof size === 'number' ? Math.max(16, Math.min(256, size | 0)) : 64;
    return 'https://www.google.com/s2/favicons?domain=' +
      encodeURIComponent(siteKey) + '&sz=' + s;
  }

  /**
   * 创建 favicon <img>。调用方应先把首字母文字放进容器(作兜底),
   * 图片加载成功后覆盖其上;加载失败/超时会自动移除,露出文字。
   * @param {string} siteKey       站点 key(如 'example.com')
   * @param {string} [fallbackText] 兜底文字(通常是首字母),同时用作 alt
   * @param {number} [size]        向服务请求的图标像素(默认 64)
   */
  function makeFaviconImg(siteKey, fallbackText, size) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = siteFaviconUrl(siteKey, size);
    img.alt = fallbackText || '';
    img.draggable = false;

    let settled = false;
    const timer = setTimeout(remove, 3000); // 网络不通/加载过慢的兜底
    function remove() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.remove();
    }
    img.addEventListener('error', remove);
    img.addEventListener('load', () => { settled = true; clearTimeout(timer); });
    return img;
  }

  window.siteFaviconUrl = siteFaviconUrl;
  window.makeFaviconImg = makeFaviconImg;
})();
