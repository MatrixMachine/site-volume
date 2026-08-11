# 0001: Site 匹配用 eTLD+1 粒度 + 剥标签近似,不引入 Public Suffix List

## 决定

Site 的粒度定义为 **Registrable domain(eTLD+1)**:`www.youtube.com`、`m.youtube.com`、`music.youtube.com` 都归属同一个 Site `youtube.com`。

实现上**不内置 Public Suffix List(PSL)**。匹配时取当前 hostname,若在已配置的 Site 集合中找不到精确 hostname,则**逐级剥离最左段标签**直到命中(`www.bilibili.com` → `bilibili.com`);剥到剩两段仍不命中则视为未知站点。

## 理由

- 用户心智中 B站/YouTube 全家桶是"一个站",eTLD+1 符合直觉。
- PSL 数据集约 200KB,塞进 content script 代价过高,且需要随上游更新。
- 目标站点(B站、YouTube 等)都在 PSL 的"单段公共后缀"一侧,`co.uk` 这类复合后缀站点极少,剥标签近似在这些场景下行为正确;遇到复合后缀时只会在"剥到剩两段"时多剥一层,影响可接受。

## 后果

- 剥标签近似在 `example.co.uk` 这类站点上会把两个不同的注册域(`a.co.uk` / `b.co.uk`)错误合并为一个 Site。已知局限,接受。
- 存储 key 使用 eTLD+1 形式(`youtube.com`),而非完整 hostname。
