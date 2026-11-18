import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:4173';
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 1;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    return this;
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

async function browserVersion() {
  const response = await fetch(`${cdpBase}/json/version`);
  if (!response.ok) throw new Error(`CDP tidak tersedia: ${response.status}`);
  return response.json();
}

async function ensureChrome() {
  try {
    return { version: await browserVersion(), process: null, profile: null };
  } catch {}

  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('Chrome tidak ditemukan. Isi CHROME_PATH.');
  const profile = await mkdtemp(join(tmpdir(), 'katakita-e2e-'));
  const processHandle = spawn(executable, [
    '--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9223',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { return { version: await browserVersion(), process: processHandle, profile }; } catch { await delay(250); }
  }
  throw new Error('Chrome Headless gagal membuka DevTools Protocol.');
}

async function main() {
  const chrome = await ensureChrome();
  const cdp = await new Cdp(chrome.version.webSocketDebuggerUrl).open();
  const contexts = [];

  const evaluate = async (sessionId, expression) => {
    const response = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true
    }, sessionId);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };

  const waitFor = async (sessionId, expression, label, timeout = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(sessionId, `Boolean(${expression})`)) return;
      await delay(200);
    }
    const diagnostic = await evaluate(sessionId, `document.body?.innerText?.slice(0, 1800) || ''`);
    throw new Error(`Timeout: ${label}\n${diagnostic}`);
  };

  const createPage = async url => {
    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    contexts.push(browserContextId);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false
    }, sessionId);
    await cdp.send('Page.navigate', { url }, sessionId);
    await waitFor(sessionId, `document.readyState === 'complete'`, `memuat ${url}`);
    await waitFor(sessionId, `document.querySelector('#connection-status b')?.textContent === 'Siap bermain'`, 'backend siap');
    return sessionId;
  };

  try {
    const playerOne = await createPage(appUrl);
    await evaluate(playerOne, `document.querySelector('#guest-name').value='Pemain Satu';document.querySelector('input[value="300000"]').click();document.querySelector('#guest-form').requestSubmit()`);
    await waitFor(playerOne, `!document.querySelector('#lobby-screen').classList.contains('hidden')`, 'pemain pertama membuat ruang');
    assert.equal(await evaluate(playerOne, `document.querySelector('#lobby-time').textContent`), '5 menit');
    const invitation = await evaluate(playerOne, `document.querySelector('#invite-link').textContent`);
    const roomCode = await evaluate(playerOne, `document.querySelector('#lobby-code').textContent`);
    assert.match(roomCode, /^[A-F0-9]{6}$/);
    assert.match(invitation, new RegExp(`room=${roomCode}$`));

    const playerTwo = await createPage(invitation);
    await evaluate(playerTwo, `document.querySelector('#guest-name').value='Pemain Dua';document.querySelector('#guest-form').requestSubmit()`);
    await waitFor(playerTwo, `!document.querySelector('#lobby-screen').classList.contains('hidden')`, 'pemain kedua bergabung');
    await waitFor(playerOne, `document.querySelector('#lobby-player-2 strong').textContent === 'Pemain Dua'`, 'realtime pemain kedua');

    await evaluate(playerOne, `document.querySelector('#ready-button').click()`);
    await waitFor(playerOne, `document.querySelector('#ready-button').textContent === 'Batalkan siap'`, 'pemain pertama siap');
    await evaluate(playerTwo, `document.querySelector('#ready-button').click()`);
    await waitFor(playerOne, `!document.querySelector('#game-screen').classList.contains('hidden')`, 'permainan dimulai di pemain pertama');
    await waitFor(playerTwo, `!document.querySelector('#game-screen').classList.contains('hidden')`, 'permainan dimulai di pemain kedua');

    const firstTurn = await evaluate(playerOne, `document.querySelector('#play-word').disabled ? 'two' : 'one'`);
    const active = firstTurn === 'one' ? playerOne : playerTwo;
    const waiting = firstTurn === 'one' ? playerTwo : playerOne;
    const activeName = firstTurn === 'one' ? 'Pemain Satu' : 'Pemain Dua';
    const waitingName = firstTurn === 'one' ? 'Pemain Dua' : 'Pemain Satu';

    await evaluate(active, `document.querySelector('#music-toggle').click()`);
    await waitFor(active, `document.querySelector('#music-toggle').getAttribute('aria-pressed') === 'true'`, 'musik menyala');

    const rack = await evaluate(active, `[...document.querySelectorAll('#tile-rack .rack-tile')].map(tile=>tile.firstChild.textContent.trim().toLowerCase())`);
    assert.equal(rack.length, 7);
    const words = (await readFile(new URL('./data/indonesian-words.txt', import.meta.url), 'utf8')).trim().split(/\r?\n/);
    const canBuild = word => {
      const letters = [...rack];
      return [...word].every(letter => {
        const index = letters.indexOf(letter);
        if (index < 0) return false;
        letters.splice(index, 1);
        return true;
      });
    };
    const word = words.find(candidate => candidate.length >= 2 && candidate.length <= 5 && canBuild(candidate));
    assert.ok(word, `Tidak ada kata 2-5 huruf untuk rak ${rack.join('')}`);

    await evaluate(active, `document.querySelector('#tile-rack .rack-tile').click();document.querySelector('.cell[data-row="7"][data-col="7"]').click();document.querySelector('#play-word').click()`);
    await waitFor(active, `document.querySelector('#toast').textContent.includes('Kata tidak ada di kamus')`, 'checker menolak satu huruf');
    assert.equal(await evaluate(active, `document.querySelectorAll('#game-board .board-tile.new').length`), 0);

    const startColumn = 7 - Math.floor(word.length / 2);
    for (const [offset, letter] of [...word.toUpperCase()].entries()) {
      const dropped = await evaluate(active, `(()=>{const tile=[...document.querySelectorAll('#tile-rack .rack-tile:not(.used)')].find(node=>node.firstChild.textContent.trim()===${JSON.stringify(letter)});const cell=document.querySelector('.cell[data-row="7"][data-col="${startColumn + offset}"]');if(!tile||!cell)return false;const from=tile.getBoundingClientRect();const to=cell.getBoundingClientRect();const pointerId=${offset + 1};const base={bubbles:true,pointerId,pointerType:${JSON.stringify(offset === 0 ? 'touch' : 'mouse')},button:0,buttons:1,clientX:from.left+from.width/2,clientY:from.top+from.height/2};tile.dispatchEvent(new PointerEvent('pointerdown',base));tile.dispatchEvent(new PointerEvent('pointermove',{...base,clientX:to.left+to.width/2,clientY:to.top+to.height/2}));tile.dispatchEvent(new PointerEvent('pointerup',{...base,buttons:0,clientX:to.left+to.width/2,clientY:to.top+to.height/2}));return true})()`);
      assert.ok(dropped, `Huruf ${letter} tidak dapat didrop ke papan.`);
      assert.equal(await evaluate(active, `document.querySelectorAll('#game-board .board-tile.new').length`), offset + 1);
    }
    await evaluate(active, `document.querySelector('#play-word').click()`);
    await waitFor(active, `document.querySelector('#turn-label').textContent === 'Giliran 2'`, `memainkan kata ${word}`);
    await waitFor(waiting, `document.querySelector('#turn-label').textContent === 'Giliran 2'`, 'sinkronisasi langkah ke lawan');
    assert.equal(await evaluate(waiting, `document.querySelectorAll('#game-board .board-tile').length`), word.length);

    await evaluate(waiting, `document.querySelector('#pass-turn').click()`);
    await waitFor(active, `document.querySelector('#turn-label').textContent === 'Giliran 3'`, 'sinkronisasi lewati giliran');

    await evaluate(active, `window.confirm=()=>true;document.querySelector('#resign-game').click()`);
    await waitFor(active, `document.querySelector('#result-dialog').open`, 'hasil pertandingan pemain aktif');
    await waitFor(waiting, `document.querySelector('#result-dialog').open`, 'hasil pertandingan lawan');
    assert.equal(await evaluate(active, `document.querySelector('#result-title').textContent`), `${waitingName} menang!`);
    assert.match(await evaluate(active, `document.querySelector('#result-reason').textContent`), /menyerah/i);

    console.log(JSON.stringify({
      status: 'lulus', roomCode, invitation, time: '5 menit', firstTurn: activeName,
      dictionaryWord: word.toUpperCase(), synchronizedTiles: word.length,
      dragDrop: true, passTurn: true, music: true, winner: waitingName
    }, null, 2));
  } finally {
    for (const browserContextId of contexts) {
      await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    }
    cdp.close();
    if (chrome.process) {
      chrome.process.kill();
      await Promise.race([
        new Promise(resolve => chrome.process.once('exit', resolve)),
        delay(3000)
      ]);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try { await rm(chrome.profile, { recursive: true, force: true }); break; }
        catch (error) { if (!['EBUSY', 'EPERM'].includes(error.code) || attempt === 4) throw error; await delay(300); }
      }
    }
  }
}

await main();
