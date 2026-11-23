import type { MonitorApi } from '../shared/types';

declare global {
  interface Window {
    xhsMonitor: MonitorApi;
  }
}

export {};
