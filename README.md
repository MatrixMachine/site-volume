<div align="center">

<img src="src/icons/icon128.png" width="96" height="96" alt="Site Volume 图标" />

# Site Volume

按站点独立控制音量的 Chrome 扩展——给每个网站设置自己的音量,互不干扰。

</div>

---

## 为什么需要它

Chrome 没有原生 per-site 音量控制,只能调浏览器全局音量。看 B 站要小点声、听 YouTube 音乐又想大点声?Site Volume 让你**为每个站点单独设置音量**,其他站点不受影响。

## 核心概念

| 术语 | 含义 |
| --- | --- |
| **Site** | 站点粒度 = 主域名(eTLD+1)。`www.bilibili.com` / `live.bilibili.com` / `m.bilibili.com` 同属一个站点 `bilibili.com` |
| **Site Volume** | 某个站点独立的音量(0–100%),不影响其他站点与浏览器全局音量 |
| **静音** | 就是音量 0,没有独立的静音状态。恢复音量 = 把滑块拖回非 0 |
| **默认音量** | 未配置的站点恒为 100%(不干预),不可配置 |

> 站内播放器自己的音量条依然有效,它控制的是"源音量";Site Volume 是叠加在源音量之上的**站点系数**。两者共存互不冲突。

## 功能

- 🎚️ **按站点调音量** — 在 popup 里拖动滑块,只影响当前站点
- 🔇 **快速静音** — 一键把当前站点设为 0(静音),再点恢复
- 📋 **站点管理页** — 查看所有已配置站点,统一改音量 / 静音 / 删除
- 📊 **统计概览** — 管理页顶部显示已配置站点数、平均音量、静音站点数
- 🌙 **深浅色主题** — 跟随系统外观自动切换
- 🎨 **动效与波形可视化** — 音量实时波形条、渐变滑块、入场动画

## 安装

### 开发者模式加载(推荐)

1. 打开 `chrome://extensions`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**,选择本仓库目录(包含 `manifest.json` 的根目录)
4. 打开任意网站,点击工具栏上的 Site Volume 图标即可使用

> 需重新加载时:在 `chrome://extensions` 点扩展卡片上的 ↻ 刷新按钮。

### 手动打包

```bash
# 打包为 .crx(需先在 chrome://extensions 记录扩展 ID)
# 或用"打包扩展程序"按钮选择本目录
```

## 使用

1. 打开一个网站(如 `bilibili.com`)
2. 点击扩展栏的 **Site Volume** 图标
3. 拖动滑块调整该站点音量,松手即保存
4. 点击 **管理** 进入设置页,可批量调整 / 静音 / 删除站点

## 工作原理

扩展在页面加载早期(`document_start`)注入脚本,用两条路径实现站点音量系数:

1. **媒体元素路径** — 拦截 `HTMLMediaElement.prototype.volume` setter:页面设置的是源音量,实际生效值 = 源音量 × 站点系数;getter 仍返回源音量,保证站内音量条显示正确
2. **Web Audio 路径** — 包装 `AudioContext`,在 destination 前插入一个 GainNode,增益 = 站点系数

两条路径共用同一个站点系数,保证单一音量语义;MutationObserver 覆盖动态创建的媒体元素。

```
┌─────────────┐    postMessage     ┌──────────────────────────┐
│  bridge.js  │ ─────────────────▶ │  volume.js (MAIN world)  │
│ (ISOLATED)  │    siteFactor      │   MediaElement / GainNode │
│  storage 读  │ ◀───────────────── │                          │
└─────────────┘    storage 变更      └──────────────────────────┘
```

## 已知限制

- ⛔ **DRM 站点**(Netflix、Disney+、Spotify 网页版)无法注入,不支持
- ⛔ `chrome://` 等特权页面天然无法注入
- ⚠️ **复合后缀域名**(如 `example.co.uk`)的剥标签近似会把 `a.co.uk` / `b.co.uk` 合并为一个站点(已知局限,见 [ADR-0001](docs/adr/0001-site-matching-etld1-strip-labels.md))
- 注入脚本对站点是侵入性的,存在被站点脚本反制的对抗风险(见 [ADR-0002](docs/adr/0002-volume-implementation-mediaelement-audiocontext.md))

## 架构与文档

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | MV3 清单,双 world 注入(`MAIN` + `ISOLATED`),无 background |
| `src/inject/volume.js` | MAIN world 注入:MediaElement setter 拦截 + AudioContext 包装 |
| `src/content/bridge.js` | ISOLATED world 桥:读 storage、剥标签匹配、推送 siteFactor |
| `src/popup/` | 当前站点音量控制弹窗 |
| `src/options/` | 站点列表管理页 |
| `src/shared/quota-log.js` | storage.sync 配额超限日志工具 |
| `tools/gen_icons.py` | 图标生成脚本(Pillow) |

技术决策记录(ADR):

- [ADR-0001:Site 匹配用 eTLD+1 + 剥标签近似](docs/adr/0001-site-matching-etld1-strip-labels.md)
- [ADR-0002:音量实现 = MediaElement 拦截 + AudioContext GainNode](docs/adr/0002-volume-implementation-mediaelement-audiocontext.md)
- [ADR-0003:静音 = 音量 0,移除全局静音](docs/adr/0003-mute-is-volume-zero-no-global-mute.md)

领域词汇与规则见 [`CONTEXT.md`](CONTEXT.md),设计定稿见 [`DESIGN.md`](DESIGN.md)。

## 开发

```bash
# 生成图标(修改 tools/gen_icons.py 后重新生成 16/48/128 三档 PNG)
python tools/gen_icons.py

# JS 语法快速检查
node -e "['src/popup/popup.js','src/options/options.js','src/shared/quota-log.js','src/content/bridge.js','src/inject/volume.js'].forEach(f=>{new Function(require('fs').readFileSync(f,'utf8'))})"
```

### 存储配额注意

`chrome.storage.sync` 限制 **120 次写入/分钟**。滑块拖动期间**只更新内存与 UI,松开鼠标才写入一次**,避免打爆配额;超限时会输出醒目的错误日志(`src/shared/quota-log.js`)。

## License

MIT
