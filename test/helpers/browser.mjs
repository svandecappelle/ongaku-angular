/**
 * Minimal Chrome DevTools Protocol driver for the browser tests: a headless Chromium
 * (process.env.CHROME, set by test/run.mjs) with its own profile, removed on close.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { BASE } from './client.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

export async function openBrowser({ width = 1366, height = 900 } = {}) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-chrome-'));
  const proc = spawn(process.env.CHROME, [
    '--headless', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      await sleep(100);
    }
  }
  if (!target) {
    proc.kill();
    throw new Error('Chromium did not start');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let id = 0;
  const pending = new Map();
  /** Uncaught errors of the page (the moment script of index.html is served by the production image only) */
  const errors = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      if (!String(details.url ?? '').includes('/node_modules/')) {
        errors.push(details.exception?.description ?? details.text);
      }
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    errors,
    send,
    sleep,
    /** Value of a JavaScript expression in the page */
    async eval(expression) {
      const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result?.exceptionDetails) {
        throw new Error(`${expression}: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      }
      return result?.result?.value;
    },
    /** Opens a page of the instance, logged in with this session cookie (or anonymous) */
    async goto(urlPath, cookie) {
      await send('Network.enable');
      await send('Network.clearBrowserCookies');
      if (cookie) {
        const [name, value] = cookie.split('=');
        await send('Network.setCookie', { name, value, domain: '127.0.0.1', path: '/', httpOnly: true });
      }
      await send('Page.navigate', { url: `${BASE}${urlPath}` });
    },
    /** Reloads the current page */
    async reload() {
      await send('Page.reload', { ignoreCache: false });
    },
    /** Waits for an expression to be truthy; resolves with its value */
    async waitFor(expression, { timeout = 10000, what = expression } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try {
          // A DOM node cannot be returned by value: it counts as found
          const value = await page.eval(`(() => { const v = (${expression}); return v instanceof Node ? true : v; })()`);
          if (value) {
            return value;
          }
        } catch {
          // Page navigating
        }
        await sleep(100);
      }
      const where = await page.eval(`location.pathname + ' | ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)`).catch(() => '');
      throw new Error(`Timed out waiting for ${what} (page: ${where})`);
    },
    async screenshot(file) {
      const { result } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    },
    async close() {
      ws.close();
      proc.kill();
      await sleep(200);
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
  return page;
}
