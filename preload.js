const { contextBridge, ipcRenderer: r, webUtils } = require('electron');
contextBridge.exposeInMainWorld('mvdx', {
  db: {
    settings: () => r.invoke('db:settings'),
    set: (k, v) => r.invoke('db:set', k, v),
    packs: () => r.invoke('db:packs'),
    pack: id => r.invoke('db:pack', id),
    save: p => r.invoke('db:save', p),
    del: id => r.invoke('db:del', id)
  },
  win: (c, v, w) => r.send('win', c, v, w),
  size: () => r.invoke('win:size'),
  path: f => webUtils.getPathForFile(f),
  amb: { add: p => r.invoke('amb:add', p), del: f => r.invoke('amb:del', f) },
  img: { add: p => r.invoke('img:add', p), del: f => r.invoke('img:del', f) },
  hook: () => r.invoke('hook'),
  onInput: cb => r.on('input', (_, d) => cb(d)),
  onMute: cb => r.on('mute', () => cb())
});
