# 0002: 音量实现 = MediaElement volume setter 拦截 + AudioContext GainNode 包装

## 决定

在 MAIN world 注入脚本,通过两条路径实现站点音量系数(siteFactor):

1. **MediaElement 路径**:覆盖 `HTMLMediaElement.prototype.volume` 的 getter/setter。setter 把"源音量"(页面播放器设置的值)存入 WeakMap,实际生效值 = 源音量 × siteFactor(muted 时为 0);getter 返回源音量,保证站内音量滑块显示正确。用 MutationObserver 捕获动态创建的媒体元素,确保对现在与未来的所有元素生效。
2. **Web Audio 路径**:包装 `AudioContext` 构造,在 destination 前插入一个 GainNode,gain = siteFactor(muted 时为 0)。

两条路径共用同一个 siteFactor,保证单一音量语义。

## 理由

- Chrome 没有任何原生 per-site / per-tab 音量 API,扩展必须自行实现音量。
- 只直接设 `volume` 属性会被 React/Vue 等框架反复覆写;拦截 setter 才能维持站点系数不被破坏。
- MediaElement 覆盖绝大多数主流站点(B站、YouTube、抖音网页版);Web Audio 路径补齐直播/特效等 AudioContext 音源。
- 否决 `tabCapture` 重采样方案:过重、延迟明显、仅用于录屏场景。

## 后果

- **DRM 站点(Netflix、Disney+、Spotify web)不适用**——接受这个硬边界。
- 需要 `"world": "MAIN"` 注入(content script 默认 ISOLATED world 无法触达页面原型)。
- 与站点自身音量控制**共存而非冲突**:站内音量条操作的是源音量,站点系数不变——这正是期望行为。
- 注入脚本对站点是侵入性的,存在被站点脚本反制(如重定义原型)的对抗风险,接受。
