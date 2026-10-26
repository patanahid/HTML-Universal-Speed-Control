/* Dependency-free smoke tests for the timing engine and settings helpers.
 * Run with:  node tests/smoke.js
 *
 * It executes shared/settings.js and page/page.js inside a Node VM with a fake
 * clock and fake timers, exactly like the earlier error audit harness.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const CHANNEL = 'universal-speed-controller/v3.2';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  - ' + name);
  } catch (error) {
    console.error('  FAIL - ' + name + '\n        ' + error.message);
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------- fake browser */

function createEnv() {
  let clock = 0;
  let seq = 1;
  const tasks = new Map();
  const listeners = {};

  const nativeSetInterval = (fn, t, ...args) => {
    const id = seq++;
    tasks.set(id, { fn, args, period: Math.max(1, Number(t) || 0), next: clock + Math.max(1, Number(t) || 0), interval: true });
    return id;
  };
  const nativeSetTimeout = (fn, t, ...args) => {
    const id = seq++;
    tasks.set(id, { fn, args, period: Math.max(1, Number(t) || 0), next: clock + Math.max(1, Number(t) || 0), interval: false });
    return id;
  };
  const nativeClear = (id) => tasks.delete(id);

  const FakeDate = function () {};
  FakeDate.now = () => 1700000000000 + clock;

  const documentElement = {
    nodeType: 1,
    dataset: {},
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    matches() { return false; },
    querySelectorAll() { return []; }
  };

  const doc = {
    documentElement,
    readyState: 'complete',
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelectorAll() { return []; }
  };

  const win = {
    setInterval: nativeSetInterval,
    clearInterval: nativeClear,
    setTimeout: nativeSetTimeout,
    clearTimeout: nativeClear,
    performance: { now: () => clock },
    requestAnimationFrame: (cb) => nativeSetTimeout(() => cb(clock), 16),
    cancelAnimationFrame: nativeClear,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    console
  };

  const ctx = {
    window: win,
    document: doc,
    navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
    Date: FakeDate,
    Map, Set, WeakSet, WeakMap, Number, Math, Error, TypeError, Promise, JSON,
    URL, Object, Array, String, Boolean, RegExp, isNaN, parseInt, parseFloat,
    console,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    }
  };
  // Bare global timer calls inside page.js must resolve to the (overridden)
  // window timers, just like in a real browser.
  for (const key of ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval']) {
    Object.defineProperty(ctx, key, { get: () => win[key], configurable: true });
  }
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const shared = fs.readFileSync(path.join(ROOT, 'shared/settings.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'page/page.js'), 'utf8');
  vm.runInContext(shared, ctx);
  vm.runInContext(page, ctx);

  return {
    ctx, win, doc, tasks, FakeDate,
    now: () => clock,
    tick(ms) {
      const target = clock + ms;
      let steps = 0;
      while (steps++ < 100000) {
        let best = null;
        for (const [id, task] of tasks) {
          if (task.next <= target && (!best || task.next < best.task.next)) best = { id, task };
        }
        if (!best) break;
        clock = best.task.next;
        if (best.task.interval) best.task.next += best.task.period;
        else tasks.delete(best.id);
        best.task.fn(...best.task.args);
      }
      clock = target;
    },
    send(settings) {
      const event = { source: win, origin: 'https://example.com', data: { channel: CHANNEL, direction: 'content-to-page', settings } };
      (listeners.message || []).forEach((fn) => fn(event));
    },
    post(data) {
      const event = { source: win, origin: 'https://example.com', data };
      (listeners.message || []).forEach((fn) => fn(event));
    },
    intervalPeriods(match) {
      const out = [];
      tasks.forEach((task) => {
        if (task.interval && (!match || String(task.fn).includes(match))) out.push(task.period);
      });
      return out;
    }
  };
}

function config(overrides) {
  return Object.assign({
    speed: 1,
    setInterval: true,
    setTimeout: true,
    performance: true,
    dateNow: true,
    requestAnimationFrame: false,
    autoClickClose: false,
    tickRate: 60,
    useHighPrecisionTimer: false,
    useLegacyMode: false,
    optimizeForBattery: false
  }, overrides || {});
}

/* -------------------------------------------------------------- shared tests */

console.log('\nshared/settings.js');

test('normalizeSettings produces one coherent default state', () => {
  const env = createEnv();
  const s = env.ctx.USC.normalizeSettings({});
  assert.strictEqual(s.speed, 1);
  assert.strictEqual(Object.keys(s.autoSpeedSites).length, 0);
  assert.strictEqual(typeof s.developerSettings.tickRate, 'number');
  assert.strictEqual(s.speedSteps.length, 5);
});

test('legacy array autoSpeedSites is migrated to an object', () => {
  const env = createEnv();
  const legacy = [];
  legacy['example.com'] = 20;
  const s = env.ctx.USC.normalizeSettings({ autoSpeedSites: legacy });
  assert.strictEqual(s.autoSpeedSites['example.com'], 20);
});

test('fractional speeds survive normalisation', () => {
  const env = createEnv();
  const s = env.ctx.USC.normalizeSettings({ speed: 1.5, speedSteps: [1.5, 2, 2] });
  assert.strictEqual(s.speed, 1.5);
  assert.deepStrictEqual(Array.from(s.speedSteps), [1.5, 2]);
});

test('normalizeHost strips URL, credentials, port and path', () => {
  const env = createEnv();
  const { normalizeHost } = env.ctx.USC;
  assert.strictEqual(normalizeHost('https://WWW.Example.com:8443/path?q=1'), 'www.example.com');
  assert.strictEqual(normalizeHost('user:pass@example.com'), 'example.com');
  assert.strictEqual(normalizeHost('example.com:20'), 'example.com');
  assert.strictEqual(normalizeHost('not a domain'), '');
  assert.strictEqual(normalizeHost('example.com/path'), 'example.com');
  assert.strictEqual(normalizeHost(''), '');
});

test('parseWebsitesList handles ports, IPv6 and reports errors', () => {
  const env = createEnv();
  const parsed = env.ctx.USC.parseWebsitesList('example.com:20\n[::1]:1.5\nhttps://foo.org/x:10\nbroken\nx.com:2000');
  assert.strictEqual(parsed.sites['example.com'], 20);
  assert.strictEqual(parsed.sites['[::1]'], 1.5);
  assert.strictEqual(parsed.sites['foo.org'], 10);
  assert.strictEqual(parsed.errors.length, 2);
});

/* ---------------------------------------------------------------- page tests */

console.log('\npage/page.js');

test('before settings arrive the engine is inert', () => {
  const env = createEnv();
  assert.strictEqual(env.win.performance.now(), 0);
  env.now();
  const id = env.win.setInterval(() => {}, 1000);
  assert.strictEqual(env.tasks.get(id).period, 1000);
});

test('speed scales setTimeout / setInterval; reschedules on every speed change', () => {
  const env = createEnv();
  env.send(config({ speed: 10 }));
  let hits = 0;
  const id = env.win.setInterval(() => { hits += 1; }, 1000);
  assert.deepStrictEqual(env.intervalPeriods('hits'), [100]);

  env.send(config({ speed: 20 }));
  assert.deepStrictEqual(env.intervalPeriods('hits'), [50], 'second speed change must reschedule');

  env.send(config({ speed: 50 }));
  assert.deepStrictEqual(env.intervalPeriods('hits'), [20], 'third speed change must reschedule');

  env.win.clearInterval(id);
  assert.deepStrictEqual(env.intervalPeriods('hits'), [], 'clearInterval(old id) must stop the rescheduled timer');
});

test('short intervals are accelerated, never slowed down', () => {
  const env = createEnv();
  env.send(config({ speed: 2 }));
  const id = env.win.setInterval(() => {}, 16);
  assert.strictEqual(env.tasks.get(id).period, 8);
});

test('speed 0 restores native timers and clocks (no Infinity)', () => {
  const env = createEnv();
  env.send(config({ speed: 0 }));
  const id = env.win.setInterval(() => {}, 1000);
  assert.strictEqual(env.tasks.get(id).period, 1000);
  const timeoutId = env.win.setTimeout(() => {}, 1000);
  assert.strictEqual(env.tasks.get(timeoutId).period, 1000);
  env.tick(37);
  assert.strictEqual(env.win.performance.now(), 37);
  assert.strictEqual(env.ctx.Date.now(), 1700000000037);
});

test('turning a toggle off really restores the native clock', () => {
  const env = createEnv();
  env.send(config({ speed: 1, performance: false, dateNow: false }));
  const perf = [], dates = [];
  for (let i = 0; i < 8; i += 1) {
    perf.push(env.win.performance.now());
    dates.push(env.ctx.Date.now());
    env.tick(5);
  }
  assert.strictEqual(new Set(perf).size, 8, 'performance.now must not be quantised at 1x');
  assert.strictEqual(new Set(dates).size, 8, 'Date.now must not be quantised at 1x');
});

test('virtual clocks scale with speed and stay coherent (no 3x cap)', () => {
  const env = createEnv();
  env.send(config({ speed: 10, useHighPrecisionTimer: true }));
  const p0 = env.win.performance.now();
  const d0 = env.ctx.Date.now();
  env.tick(100);
  const p1 = env.win.performance.now();
  const d1 = env.ctx.Date.now();
  assert.ok(Math.abs((d1 - d0) - 1000) <= 2, 'Date.now should advance ~10x, got ' + (d1 - d0));
  assert.ok(Math.abs((p1 - p0) - 1000) <= 2, 'performance.now should advance ~10x, got ' + (p1 - p0));
});

test('virtual clocks are continuous across a speed change', () => {
  const env = createEnv();
  env.send(config({ speed: 2, useHighPrecisionTimer: true }));
  env.tick(100);
  const before = env.win.performance.now();
  env.send(config({ speed: 5, useHighPrecisionTimer: true }));
  const after = env.win.performance.now();
  assert.ok(Math.abs(after - before) <= 1, 'clock must not jump on a speed change');
});

test('rAF delivers one callback per frame with a scaled timestamp', () => {
  const env = createEnv();
  env.send(config({ speed: 4, requestAnimationFrame: true, useHighPrecisionTimer: true }));
  const stamps = [];
  const loop = (ts) => { stamps.push(ts); if (stamps.length < 3) env.win.requestAnimationFrame(loop); };
  env.win.requestAnimationFrame(loop);
  env.tick(48);
  assert.ok(stamps.length >= 3, 'expected 3 frames, got ' + stamps.length);
  assert.ok(Math.abs((stamps[2] - stamps[0]) - 128) <= 2, 'timestamp deltas should be scaled 4x, got ' + (stamps[2] - stamps[0]));
  assert.notStrictEqual(stamps[0], stamps[1], 'timestamps must differ');
});

test('cancelAnimationFrame cancels the underlying frame', () => {
  const env = createEnv();
  env.send(config({ speed: 4, requestAnimationFrame: true }));
  let calls = 0;
  const id = env.win.requestAnimationFrame(() => { calls += 1; });
  env.win.cancelAnimationFrame(id);
  env.tick(32);
  assert.strictEqual(calls, 0);
});

test('postMessage(null) and spoofed messages are ignored safely', () => {
  const env = createEnv();
  env.send(config({ speed: 3 }));
  assert.doesNotThrow(() => env.post(null));
  assert.doesNotThrow(() => env.post({ action: 'updateSettings', settings: config({ speed: 999 }) }));
  const id = env.win.setTimeout(() => {}, 1000);
  assert.strictEqual(env.tasks.get(id).period, 333.3333333333333, 'spoofed config must be ignored');
});

test('developer settings are actually used by the engine', () => {
  const env = createEnv();
  env.send(config({ speed: 2, useLegacyMode: true, tickRate: 10 }));
  const id = env.win.setTimeout(() => {}, 1000);
  // 1000 / 2 = 500ms; legacy mode rounds up to a 100ms tick => 500ms.
  assert.strictEqual(env.tasks.get(id).period, 500);
  env.send(config({ speed: 2, useLegacyMode: false, optimizeForBattery: true, tickRate: 10 }));
  env.tick(37);
  const value = env.win.performance.now();
  assert.strictEqual(value % 100, 0, 'battery mode quantises to the tick grid');
});

test('fractional speed from the popup is honoured', () => {
  const env = createEnv();
  env.send(config({ speed: 1.5 }));
  const id = env.win.setTimeout(() => {}, 1000);
  assert.ok(Math.abs(env.tasks.get(id).period - 666.6666666666666) < 0.001);
});

console.log('\n' + passed + ' checks passed.');
