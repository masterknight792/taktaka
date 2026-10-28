const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, protocol, net, dialog } = require('electron');
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAdUlEQVR4nO3XQQ7AIAgEQP/p/+/9gd6alDSK1C6LwYSbsBPjhVLEqfVqf5bMg4YPEajwVwQ6/IHwCr8RdAB5vgbM5vEDrBDtnDgALWS1nx+g/UzWvjgA6xOfB9h9Ly5AWwlIQALiAdDlD3BfTChWM4rl1Gs974IpVv4cktccAAAAAElFTkSuQmCC';
app.setName('Taktaka');
for (const s of ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(s);
protocol.registerSchemesAsPrivileged([{ scheme: 'tkt', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }]);
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
let win, tray, realm, hook = false;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
process.on('uncaughtException', e => { console.error(e); if (app.isReady()) dialog.showErrorBox('Taktaka error', String(e.stack || e)); });

// ---- Realm DB (main process) ----
try {
  const Realm = require('realm');
  realm = new Realm({
    path: path.join(app.getPath('userData'), 'taktaka.realm'),
    schema: [
      { name: 'Setting', primaryKey: 'key', properties: { key: 'string', value: 'string' } },
      { name: 'Pack', primaryKey: 'id', properties: { id: 'string', meta: 'string', audio: 'data' } }
    ]
  });
} catch (e) { console.error('Realm unavailable:', e.message); }

const ab = u => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
ipcMain.handle('db:settings', () => {
  const o = {}; realm && realm.objects('Setting').forEach(s => (o[s.key] = JSON.parse(s.value))); return o;
});
ipcMain.handle('db:set', (_, key, v) => { if (realm) realm.write(() => { realm.create('Setting', { key, value: JSON.stringify(v) }, 'modified'); }); return true; });
ipcMain.handle('db:packs', () => realm ? realm.objects('Pack').map(p => ({ id: p.id, meta: p.meta })) : []);
ipcMain.handle('db:pack', (_, id) => { const p = realm.objectForPrimaryKey('Pack', id); return p && Buffer.from(p.audio); });
ipcMain.handle('db:save', (_, p) => { if (realm) realm.write(() => { realm.create('Pack', { id: p.id, meta: p.meta, audio: ab(p.audio) }, 'modified'); }); return true; });
ipcMain.handle('db:del', (_, id) => realm && realm.write(() => { const p = realm.objectForPrimaryKey('Pack', id); p && realm.delete(p); }));
ipcMain.on('win', (_, c, v, w) => { if (!win) return;
  if (c === 'min') win.minimize(); else if (c === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize()); else if (c === 'resize') { if (!win.isMaximized()) win.setSize(Math.round(v), Math.round(w)); } else if (c === 'hide') win.hide(); else if (c === 'close') app.quit(); else if (c === 'top') win.setAlwaysOnTop(!!v, 'screen-saver'); });
const ID = () => path.join(app.getPath('userData'), 'images');
ipcMain.handle('img:add', async (_, src) => { fs.mkdirSync(ID(), { recursive: true });
  const f = path.join(ID(), Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + path.extname(src)); await fs.promises.copyFile(src, f);
  return { file: f, url: 'tkt://img/' + encodeURIComponent(path.basename(f)) }; });
ipcMain.handle('img:del', (_, f) => { try { fs.unlinkSync(f); } catch {} });
const SF = () => path.join(app.getPath('userData'), 'win.json');
let ST = {}; try { ST = JSON.parse(fs.readFileSync(SF(), 'utf8')); } catch {}
ipcMain.handle('win:size', () => (win ? win.getSize() : [600, 940]));
const AD = () => path.join(app.getPath('userData'), 'ambiance');
ipcMain.handle('amb:add', async (_, src) => { fs.mkdirSync(AD(), { recursive: true });
  const id = Date.now().toString(36), f = path.join(AD(), id + path.extname(src)); await fs.promises.copyFile(src, f);
  return { id, file: f, url: pathToFileURL(f).href }; });
ipcMain.handle('amb:del', (_, f) => { try { fs.unlinkSync(f); } catch {} });
ipcMain.handle('hook', () => hook);

// ---- Global input (like rdev) ----
function startHook() {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const names = {}; for (const [n, c] of Object.entries(UiohookKey)) names[c] = n;
    const MAP = { Ctrl: 'ControlLeft', CtrlRight: 'ControlRight', Alt: 'AltLeft', AltRight: 'AltRight', Shift: 'ShiftLeft', Meta: 'MetaLeft', MetaRight: 'MetaRight' };
    const conv = n => MAP[n] || (/^[A-Z]$/.test(n) ? 'Key' + n : /^\d$/.test(n) ? 'Digit' + n : n);
    const send = (code, kind, up) => win && win.webContents.send('input', { code, kind, up });
    const down = new Set();
    uIOhook.on('keydown', e => { if (down.has(e.keycode)) return; down.add(e.keycode); send(conv(names[e.keycode] || ''), 'kb'); });
    uIOhook.on('keyup', e => { down.delete(e.keycode); send('', 'kb', true); });
    uIOhook.on('mouseup', () => send('', 'ms', true));
    uIOhook.on('mousedown', e => send(['', 'MouseLeft', 'MouseRight', 'MouseMiddle'][e.button] || 'MouseLeft', 'ms'));
    uIOhook.on('wheel', e => send(e.rotation < 0 ? 'WheelUp' : 'WheelDown', 'ms'));
    uIOhook.start(); hook = true;
  } catch (e) { console.warn('Global hook off, window-only input:', e.message); }
}

app.whenReady().then(() => {
  if (!gotLock) return;
  try { protocol.handle('tkt', async req => {
    const u = new URL(req.url), f = path.join(u.hostname === 'img' ? ID() : AD(), path.basename(decodeURIComponent(u.pathname)));
    const r = await net.fetch(pathToFileURL(f).href, { headers: req.headers });
    const h = new Headers(r.headers); h.set('Access-Control-Allow-Origin', '*');
    return new Response(r.body, { status: r.status, headers: h });
  }); } catch (e) { console.error('media protocol failed:', e.message); }
  win = new BrowserWindow({
    width: ST.w || 600, height: ST.h || 940, minWidth: 480, minHeight: 640, frame: false,  title: 'Taktaka', icon: nativeImage.createFromDataURL(ICON), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, sandbox: false }
  });
  win.webContents.on('preload-error', (_, p, e) => dialog.showErrorBox('Taktaka preload error', String((e && e.stack) || e)));
  let rt; win.on('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!win.isMaximized() && !win.isMinimized()) { const [w, h] = win.getSize(); try { fs.writeFileSync(SF(), JSON.stringify({ w, h })); } catch {} } }, 400); });
  win.loadFile('index.html');
  const show = () => { win.show(); win.focus(); };
  try {
  tray = new Tray(nativeImage.createFromDataURL(ICON));
  tray.setToolTip('Taktaka');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: show },
    { label: 'Mute / Unmute', click: () => win.webContents.send('mute') },
    { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]));
  tray.on('click', show);
  } catch (e) { console.error('tray failed:', e.message); }
  startHook();
});
app.on('window-all-closed', () => app.quit());
