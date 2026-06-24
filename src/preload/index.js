const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cluely', {
  // main -> renderer streams (answer/thinking/status/queue events)
  onAi: (cb) => ipcRenderer.on('cluely:ai', (_e, payload) => cb(payload)),

  // renderer -> main
  capture: () => ipcRenderer.invoke('cluely:capture'),
  solve: () => ipcRenderer.invoke('cluely:solve'),
  clearQueue: () => ipcRenderer.invoke('cluely:clear-queue'),
  removeScreenshot: (id) => ipcRenderer.invoke('cluely:remove-screenshot', id),
  toggleInteract: () => ipcRenderer.invoke('cluely:toggle-interact'),
  setInteractive: (on) => ipcRenderer.invoke('cluely:set-interactive', on),
  focusInput: () => ipcRenderer.invoke('cluely:focus-input'),
  hover: (over) => ipcRenderer.send('cluely:hover', over),
  activate: () => ipcRenderer.send('cluely:activate'),
  askText: (text) => ipcRenderer.invoke('cluely:ask-text', text),
  sendAudio: (buffer, mime) => ipcRenderer.invoke('cluely:audio', { buffer, mime }),
  reset: () => ipcRenderer.invoke('cluely:reset'),
  getHotkeys: () => ipcRenderer.invoke('cluely:get-hotkeys'),
  notifyListening: (on) => ipcRenderer.send('cluely:listening-state', on),
});
