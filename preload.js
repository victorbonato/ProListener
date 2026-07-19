const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proListener', {
  saveRecording: (arrayBuffer) => ipcRenderer.invoke('save-recording', arrayBuffer)
});
