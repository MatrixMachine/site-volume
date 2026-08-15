# 跨 frame 继承测试(回归)

复现 supjav.com 场景:视频播放器嵌在**跨域 iframe / 空 hostname(srcdoc)iframe** 里,
扩展需要把顶层 frame 匹配到的站点配置传播到所有子 frame。

## 为什么需要这个测试

旧版 bridge.js 每个 frame 只按自己的 hostname 匹配站点:
子 frame hostname 不是已配置站点 → 永远 factor=1 → 顶层调音量对实际发声的播放器无效。
修复后:子 frame 匹配不到配置时继承父 frame(逐级到顶层)的 factor。

## 运行

1. **重新加载扩展**:`chrome://extensions` → 找到 Site Volume → 点刷新按钮。
   如果之前是"加载已解压的扩展程序"加载的,直接刷新即可;如果装的是 zip,
   先用 `tools\package.ps1` 重新打包再重装。
2. **启动本地服务器**(在 `tests/fixture` 目录):

   ```powershell
   cd tests\fixture
   python -m http.server 8000
   ```

   (或 `npx http-server -p 8000`)

3. 打开 <http://127.0.0.1:8000/top.html>
4. 在扩展 popup 中把 **127.0.0.1** 设为 **30%**
5. 打开 DevTools Console,左上角上下文下拉框分别切到:
   - `http://localhost:8000/child.html`(跨域 iframe)
   - srcdoc iframe(hostname 为空)
   - 顶层 `127.0.0.1:8000`

## 期望日志

| frame | 修复前(旧版) | 修复后 |
|---|---|---|
| 顶层 `127.0.0.1` | `hostname=127.0.0.1, siteKey=127.0.0.1, factor=0.3` | 不变 |
| `localhost` 子 frame | `hostname=localhost, siteKey=null, factor=1` ❌ | `hostname=localhost, siteKey=127.0.0.1, factor=0.3` ✅ |
| srcdoc 子 frame | `hostname=, siteKey=null, factor=1` ❌ | `hostname=, siteKey=127.0.0.1, factor=0.3` ✅ |

同时每个 frame 的 MAIN world 应输出 `inject applied factor: 0.3 siteKey: 127.0.0.1`。

## 真实验证(supjav.com)

1. 打开一个**具体视频播放页**并让声音开始播放
2. 刷新后顶层 Console 查看 `[Site Volume]` 日志:
   原来 `hostname=lk1.supremejav.com, siteKey=null, factor=1` 的 frame,
   修复后应变为 `siteKey=supjav.com, factor=<你设的值>`
3. 在 popup 拖动音量,确认播放器声音**实际变化**
