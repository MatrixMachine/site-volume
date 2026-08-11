# 0003: 静音 = 音量 0;移除全局静音

## 决定

- **单个站点的静音 = 该站点 Site Volume 为 0**。状态模型从 `{ volume, muted }` 简化为**单一 `volume` 值**(0–1);不存在独立的静音布尔字段。
- **移除全局静音(Global Mute)**:删除全局静音快捷键、popup/options 的全局静音按钮、`globalMute` 存储 key。
- **数据迁移**:读取历史配置时,若站点记录是 `{ volume, muted }` 形态,则迁移为 `volume = muted ? 0 : volume`。

## 理由

- 旧模型中 `muted` 是叠加在 `volume` 之上的独立布尔。静音后即使用户把滑块拖回非 0,`muted` 仍为 true,实际输出恒为 0——用户无法在扩展内恢复音量,只能去系统音量,这是致命的产品缺陷。单一 `volume` 模型天然消灭该缺陷:恢复音量 = 拖滑块。
- 用户不需要"全部站点静音"的能力,砍掉全局静音使产品聚焦、状态更简单。

## 后果

- popup/options 中的"静音"按钮变为快捷地把该站点音量设为 0。
- manifest 移除 `commands` 权限与快捷键声明;background service worker 不再需要(可保留空文件或删除注册)。
