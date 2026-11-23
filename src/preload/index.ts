import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureRecord, CaptureResponse, CaptureSummary, MonitorApi } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';

const api: MonitorApi = {
  search: keyword => ipcRenderer.invoke(IPC_CHANNELS.search, keyword) as Promise<CaptureResponse>,
  cancel: () => ipcRenderer.invoke(IPC_CHANNELS.cancel) as Promise<void>,
  listHistory: () => ipcRenderer.invoke(IPC_CHANNELS.listHistory) as Promise<CaptureSummary[]>,
  getHistory: id => ipcRenderer.invoke(IPC_CHANNELS.getHistory, id) as Promise<CaptureRecord | null>,
  openNote: url => ipcRenderer.invoke(IPC_CHANNELS.openNote, url) as Promise<void>,
};

contextBridge.exposeInMainWorld('xhsMonitor', Object.freeze(api));
