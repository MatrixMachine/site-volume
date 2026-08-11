# Site Volume(站点音量扩展)

一个浏览器扩展,让用户对**单个站点**设置音量,而不是只能调浏览器全局音量。核心动机:Chrome 不支持 site 级音量控制,用户在部分站点(如 B站、YouTube)会遇到"声音外放很尴尬"的场景。

## Language

**Site(站点)**:
音量设置的粒度单位。定义为 **Registrable domain(eTLD+1)**:`www.bilibili.com`、`live.bilibili.com` 同属一个 Site `bilibili.com`。匹配时用剥标签近似(见 ADR-0001),不引入 Public Suffix List。
_Avoid_: 域名, 页面, tab, hostname

**Site Volume(站点音量)**:
应用于某个站点全部音频的音量设置,独立于浏览器全局音量。取值范围 0–1,`0` 即静音。
_Avoid_: 每站音量, 网站音量

**Site Factor(站点系数)**:
源音量与实际输出之间的乘数:实际输出 = 源音量 × Site Factor。等于该站点的 Site Volume;为 0 即静音。
_Avoid_: 音量系数, 倍率

**Source Volume(源音量)**:
页面播放器自身设置的音量(0–1)。与实际输出区分:实际输出 = 源音量 × Site Factor(见 ADR-0002)。站内音量条操作的是源音量。
_Avoid_: 原生音量, 页面音量

**Default Volume(默认音量)**:
未显式配置站点的音量。恒为 **100%**,语义是"未配置 = 不干预"。**不可配置**——不存在可调节的全局默认音量。
_Avoid_: 基础音量, 全局音量

## Rules

- 场景聚焦:以少数常用站点(B站、YouTube)为核心。
- **静音 = Site Volume 为 0**,没有独立的静音状态;恢复音量 = 把 Site Volume 调回非 0。
- **不做全局静音**(无全局快捷键、无批量静音操作)。
- 状态模型为单值 `{ siteKey: volume }`;历史 `{ volume, muted }` 数据在读取时迁移为 `{ siteKey: volume || 0 }`。
