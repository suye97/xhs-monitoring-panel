import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../shared/types';
import { captureFixture } from '../shared/test-fixtures';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

import { shell } from 'electron';
import { registerIpcHandlers } from './ipc';
import { MonitorError } from './monitor';

function setup(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const sender = { id: 7, once: vi.fn(), off: vi.fn() };
  const event = { sender };
  const record = { ...captureFixture(), id: 'capture-id' };
  const runtime = {
    search: vi.fn(async () => captureFixture()),
    add: vi.fn(async () => record),
    list: vi.fn(async () => []),
    get: vi.fn(async () => record),
    ...overrides,
  };
  registerIpcHandlers({ handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, handler) } as never, runtime as never);
  return { handlers, event, runtime, record };
}

describe('desktop IPC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers only the fixed renderer contract and stores successful captures', async () => {
    const { handlers, event, runtime, record } = setup();
    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort());
    const response = await handlers.get(IPC_CHANNELS.search)!(event, '咖啡');
    expect(response).toEqual({ ok: true, record });
    expect(runtime.search).toHaveBeenCalledWith({ keyword: '咖啡', source: 'opencli' }, expect.any(AbortSignal));
    expect(runtime.add).toHaveBeenCalledOnce();
  });

  it('does not store canceled, failed, or concurrent captures', async () => {
    const aborted = setup({ search: vi.fn(async () => { throw new DOMException('Aborted', 'AbortError'); }) });
    expect(await aborted.handlers.get(IPC_CHANNELS.search)!(aborted.event, '茶')).toEqual({ ok: false, error: 'scanCanceled' });
    expect(aborted.runtime.add).not.toHaveBeenCalled();
    const failed = setup({ search: vi.fn(async () => { throw new MonitorError('collectorBridge'); }) });
    expect(await failed.handlers.get(IPC_CHANNELS.search)!(failed.event, '茶')).toEqual({ ok: false, error: 'collectorBridge' });
    expect(failed.runtime.add).not.toHaveBeenCalled();
    let finish: (() => void) | undefined;
    const active = setup({ search: vi.fn(() => new Promise(resolve => { finish = () => resolve(captureFixture()); })) });
    const first = active.handlers.get(IPC_CHANNELS.search)!(active.event, '茶');
    expect(await active.handlers.get(IPC_CHANNELS.search)!(active.event, '咖啡')).toEqual({ ok: false, error: 'collectorBusy' });
    finish!();
    await first;
  });

  it('cancels only the requesting window and validates history ids and external links', async () => {
    const { handlers, event, runtime } = setup();
    await handlers.get(IPC_CHANNELS.cancel)!(event);
    await handlers.get(IPC_CHANNELS.getHistory)!(event, 123);
    expect(runtime.get).toHaveBeenCalledWith('');
    await expect(handlers.get(IPC_CHANNELS.openNote)!(event, 'https://evil.example/note')).rejects.toThrow('invalidNoteUrl');
    const url = 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=a&utm_source=x';
    await handlers.get(IPC_CHANNELS.openNote)!(event, url);
    expect(shell.openExternal).toHaveBeenCalledWith('https://www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=a');
  });
});
