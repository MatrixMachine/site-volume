# Site Volume — 设计定稿

## 一句话

一个 Chrome MV3 扩展,让用户按 **Site(eTLD+1)** 设置音量。不做全局静音;单个站点的静音 = 该站点音量为 0。

## 领域模型(见 CONTEXT.md)

- **Site** = registrable domain(`bilibili.com` 涵盖 `www`/`live`/`m`)。
- **Site Volume** = 某站点独立于浏览器全局音量的音量,单值 0–1。
- **Site Factor** = 实际输出 = 源音量 × Site Factor,即该站点 Site Volume。
- **Source Volume** = 页面播放器自身音量。
- **Default Volume** = 未配置站点恒为 100%(不干预),不可配置。
- **静音 = Site Volume 为 0**;恢复 = 调回非 0(无独立 muted 状态,ADR-0003)。

## 架构

- **Manifest V3**,无 background、无 commands(无全局快捷键)。
- `world: "MAIN"` content script 注入(`all_frames: true`),host permission `<all_urls>`。
- **MAIN world 注入脚本**(每 frame):
  - 拦截 `HTMLMediaElement.prototype.volume` setter:存源音量,实际值 = 源音量 × siteFactor;getter 返回源音量。
  - 包装 `AudioContext`:destination 前插入 GainNode(instance own property 遮蔽 `ctx.destination`),gain = siteFactor。
  - MutationObserver 覆盖动态创建的媒体元素。
  - **消息监听器注入时立即注册**,避免 bridge 在 document_start 下发的初始 factor 丢失。
- **ISOLATED world content script**(桥):
  - 读 `chrome.storage.sync`,归一化历史 `{volume, muted}` 数据为单值。
  - 剥标签近似匹配 eTLD+1,计算 siteFactor = volume,经 postMessage 推给 MAIN world。
  - 监听 storage 变更实时更新。
- **popup**:当前站点滑块 + 静音按钮(= 设为 0)。
- **options 页**:站点列表管理(改音量/删除)。

## 硬边界

- DRM 站点(Netflix / Disney+ / Spotify web)不支持。
- chrome:// 等特权页面天然无法注入。
- `co.uk` 等复合后缀站点的剥标签近似会合并两个注册域(已知局限,ADR-0001)。

## 文件结构

```
site-volume/
├── manifest.json
├── CONTEXT.md
├── DESIGN.md
├── docs/adr/0001-*.md, 0002-*.md, 0003-*.md
└── src/
    ├── inject/volume.js      # MAIN world:MediaElement + AudioContext
    ├── content/bridge.js     # ISOLATED world 桥
    ├── popup/
    └── options/
```

## 里程碑

1. ✅ 骨架:manifest + 注入 + popup 壳
2. ✅ MediaElement 拦截单站点生效(B站实测)
3. ✅ AudioContext 路径 + 多站点配置
4. ✅ 单值 volume 模型 + 静音 = 0 + 移除全局静音(ADR-0003)
5. ⏳ options 页打磨、正式图标
