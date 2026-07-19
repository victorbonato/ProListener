const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proListener', {
  platform: process.platform,
  saveRecording: (arrayBuffer) => ipcRenderer.invoke('save-recording', arrayBuffer),
  transcribe: (options) => ipcRenderer.invoke('transcribe', options),
  getRealtimeToken: () => ipcRenderer.invoke('realtime-token')
});
