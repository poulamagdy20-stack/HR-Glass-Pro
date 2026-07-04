const { contextBridge } = require('electron');

Object.defineProperty(window, '__ALPHA_DESKTOP__', {
  configurable: false,
  enumerable: true,
  value: true
});

contextBridge.exposeInMainWorld('__ALPHA_DESKTOP__', true);
