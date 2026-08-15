/**
 * bridge-inherit.test.js — 跨 frame factor 继承的自动化逻辑测试(无依赖,node 直跑)
 *
 * 用 vm 在两个模拟 window(top=127.0.0.1 / child=localhost)里加载真实的 bridge.js,
 * 模拟 postMessage 路由 / chrome.storage,断言子 frame 能继承顶层的 factor。
 *
 * 运行:node tests/bridge-inherit.test.js
 * 覆盖:启动继承、配置变更广播、自身配置优先于继承。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'bridge.js'), 'utf8');

// ---------- 模拟环境 ----------

function makeWindow(name, hostname) {
  const win = {
    name,
    hostname,
    location: { hostname },
    _listeners: [],
    frames: [],
    _top: null,
    _parent: null,
    get top() { return win._top || win; },
    get parent() { return win._parent || win; },
    addEventListener(type, fn) { if (type === 'message') win._listeners.push(fn); },
    // 默认 postMessage:投递给自己,sender = 自己(真实浏览器中 window.postMessage 的语义)
    postMessage(msg) { deliver(win, msg, win); },
    _receive(msg, sender) { win._listeners.forEach((fn) => fn({ data: msg, source: sender })); }
  };
  return win;
}

// 模拟跨 realm 调用语义:子/父 frame 的 postMessage 被对方 realm 调用时,
// sender 是调用方 window。这里按父子关系显式安装 postMessage(单子 frame 场景,
// 逻辑测试足够;真实行为以浏览器 fixture 为准)。
function link(parent, child) {
  child._top = parent._top || parent;
  child._parent = parent;
  parent.frames.push(child);
  child.postMessage = (msg) => deliver(child, msg, parent);
  parent.postMessage = (msg) => deliver(parent, msg, child);
}

function deliver(targetWin, msg, senderWin) {
  targetWin._receive(msg, senderWin);
}

function makeChrome(sitesData) {
  const listeners = [];
  return {
    storage: {
      sync: {
        get: async () => ({ sites: sitesData }),
      },
      onChanged: {
        addListener(fn) { listeners.push(fn); },
      },
    },
    _fireSitesChange(newValue) {
      listeners.forEach((fn) => fn({ sites: { newValue } }, 'sync'));
    }
  };
}

function loadBridge(win, chromeStub) {
  const logs = [];
  // 模拟浏览器 console.log 的 %s 占位符替换
  const fmt = (args) => {
    const a = [...args];
    let s = a.shift();
    if (typeof s === 'string') s = s.replace(/%s/g, () => (a.length ? String(a.shift()) : ''));
    else s = String(s);
    return [s, ...a].join(' ');
  };
  const sandbox = {
    window: win,
    chrome: chromeStub,
    console: { log: (...a) => logs.push(fmt(a)), error: (...a) => logs.push('ERR ' + fmt(a)) },
    Object, Array, Math, Symbol, Number, String, Boolean, JSON, WeakMap, Set, Map,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(BRIDGE_SRC, sandbox, { filename: 'bridge.js' });
  return logs;
}

function lastPushFactor(logs) {
  const lines = logs.filter((l) => l.includes('bridge pushFactor'));
  if (!lines.length) return null;
  const m = lines[lines.length - 1].match(/hostname=([^,]*), siteKey=([^,]*), factor=([^\s]*)/);
  return m ? { hostname: m[1], siteKey: m[2], factor: Number(m[3]) } : null;
}

// ---------- 测试 ----------

function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else { console.log('PASS: ' + msg); }
}

async function run() {
  const top = makeWindow('top', '127.0.0.1');
  const child = makeWindow('child', 'localhost');
  link(top, child);

  const chrome = makeChrome({ '127.0.0.1': 0.3 });
  const topLogs = loadBridge(top, chrome);
  const childLogs = loadBridge(child, chrome);

  // 等所有异步 loadConfig / 帧间消息落定
  await new Promise((r) => setTimeout(r, 20));

  const topF = lastPushFactor(topLogs);
  assert(topF && topF.factor === 0.3 && topF.siteKey === '127.0.0.1',
    '顶层自身配置生效 factor=0.3,实际=' + JSON.stringify(topF));

  const childF = lastPushFactor(childLogs);
  assert(childF && childF.factor === 0.3 && childF.siteKey === '127.0.0.1',
    '子 frame 继承顶层 factor=0.3 (siteKey=127.0.0.1),实际=' + JSON.stringify(childF));

  // 配置变更 → 顶层广播 → 子 frame 跟随
  chrome._fireSitesChange({ '127.0.0.1': 0.5 });
  await new Promise((r) => setTimeout(r, 20));
  const childF2 = lastPushFactor(childLogs);
  assert(childF2 && childF2.factor === 0.5,
    'storage 变更后子 frame 跟随新 factor=0.5,实际=' + JSON.stringify(childF2));

  // 子 frame 自身有配置 → 用自身的,不继承
  chrome._fireSitesChange({ '127.0.0.1': 0.5, 'localhost': 0.7 });
  await new Promise((r) => setTimeout(r, 20));
  const childF3 = lastPushFactor(childLogs);
  assert(childF3 && childF3.factor === 0.7 && childF3.siteKey === 'localhost',
    '子 frame 自身配置优先 factor=0.7 (siteKey=localhost),实际=' + JSON.stringify(childF3));

  console.log(process.exitCode ? '\n有失败项' : '\n全部通过');
}

run();
