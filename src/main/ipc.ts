import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { shell } from 'electron';
import type { CaptureRecord, CaptureResponse, CaptureResult, CaptureSummary } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { MonitorError, normalizeNoteUrl } from './monitor';

interface Runtime {
  search(input: { keyword: string; source: 'opencli' }, signal: AbortSignal): Promise<CaptureResult>;
  add(result: CaptureResult): Promise<CaptureRecord>;
  list(): Promise<CaptureSummary[]>;
  get(id: string): Promise<CaptureRecord | null>;
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function responseError(error: unknown): CaptureResponse {
  if (error instanceof MonitorError) return { ok: false, error: error.code };
  if (error instanceof Error && error.name === 'AbortError') return { ok: false, error: 'scanCanceled' };
  return { ok: false, error: 'searchFailed' };
}

export function registerIpcHandlers(ipc: Pick<IpcMain, 'handle'>, runtime: Runtime): void {
  const register = (channel: string, handler: Handler) => {
    ipc.handle(channel, handler as never);
  };
  const active = new Map<number, AbortController>();

  register(IPC_CHANNELS.search, async (event, keyword): Promise<CaptureResponse> => {
    if (typeof keyword !== 'string') return { ok: false, error: 'invalidKeyword' };
    const owner = event.sender.id;
    if (active.has(owner)) return { ok: false, error: 'collectorBusy' };
    const controller = new AbortController();
    const onDestroyed = () => controller.abort();
    active.set(owner, controller);
    event.sender.once('destroyed', onDestroyed);
    try {
      const result = await runtime.search({ keyword, source: 'opencli' }, controller.signal);
      return { ok: true, record: await runtime.add(result) };
    } catch (error) {
      return responseError(error);
    } finally {
      event.sender.off('destroyed', onDestroyed);
      active.delete(owner);
    }
  });

  register(IPC_CHANNELS.cancel, event => {
    active.get(event.sender.id)?.abort();
  });
  register(IPC_CHANNELS.listHistory, () => runtime.list());
  register(IPC_CHANNELS.getHistory, (_event, id) => runtime.get(typeof id === 'string' ? id : ''));
  register(IPC_CHANNELS.openNote, async (_event, value) => {
    const url = normalizeNoteUrl(value);
    if (!url) throw new Error('invalidNoteUrl');
    await shell.openExternal(url);
  });
}
