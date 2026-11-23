import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { captureFixture } from '../shared/test-fixtures';
import type { CaptureSummary, MonitorApi } from '../shared/types';

const record = { ...captureFixture(), id: 'record-1' };
const summary: CaptureSummary = {
  id: record.id,
  keyword: record.keyword,
  source: record.source,
  capturedAt: record.capturedAt,
  limited: record.limited,
  stats: record.stats,
  comments: record.comments,
};

function apiFixture(overrides: Partial<MonitorApi> = {}): MonitorApi {
  return {
    search: vi.fn(async () => ({ ok: true as const, record })),
    cancel: vi.fn(async () => {}),
    listHistory: vi.fn(async () => [summary]),
    getHistory: vi.fn(async () => record),
    openNote: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN'));
afterEach(cleanup);

describe('monitor desktop UI', () => {
  it('offers only OpenCLI and opens historical details without another capture', async () => {
    const api = apiFixture();
    render(<App api={api} />);
    expect(await screen.findByRole('button', { name: '咖啡 · 查看详情' })).toBeInTheDocument();
    expect(screen.getAllByText('OPENCLI笔记与评论').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Harness|笔记数据 API|演示样本/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '咖啡 · 查看详情' }));
    expect(await screen.findByText('历史采集详情')).toBeInTheDocument();
    expect(screen.getByText('历史笔记正文')).toBeInTheDocument();
    fireEvent.click(screen.getByText('文本评论及回复 (1)'));
    expect(screen.getByText('历史评论正文')).toBeVisible();
    expect(api.getHistory).toHaveBeenCalledWith('record-1');
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /返回采集记录/ }));
    expect(screen.getByRole('button', { name: '咖啡 · 查看详情' })).toBeInTheDocument();
  });

  it('runs a capture, refreshes history, and displays complete returned data', async () => {
    const api = apiFixture({ listHistory: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([summary]) });
    render(<App api={api} />);
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: '咖啡' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索笔记并扫描评论' }));
    expect(await screen.findByText('历史笔记标题')).toBeInTheDocument();
    await waitFor(() => expect(api.search).toHaveBeenCalledWith('咖啡'));
    expect(screen.getByText('历史笔记正文')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '咖啡 · 查看详情' })).toBeInTheDocument();
  });

  it('shows collector failures without creating a history record', async () => {
    const api = apiFixture({
      listHistory: vi.fn(async () => []),
      search: vi.fn(async () => ({ ok: false as const, error: 'collectorBridge' as const })),
    });
    render(<App api={api} />);
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: '咖啡' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索笔记并扫描评论' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser Bridge');
    expect(screen.getByText('完成一次采集后，记录会显示在这里。')).toBeInTheDocument();
  });
});
