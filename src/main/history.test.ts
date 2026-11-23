import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureFixture } from '../shared/test-fixtures';
import { HistoryStore } from './history';

let directory = '';
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'xhs-history-test-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('HistoryStore', () => {
  it('persists complete snapshots across instances without exposing notes in list summaries', async () => {
    const path = join(directory, 'history.json');
    const store = new HistoryStore(path);
    const first = await store.add(captureFixture());
    const second = await store.add(captureFixture('茶'));
    expect(first.id).not.toBe(second.id);
    const reopened = new HistoryStore(path);
    const rows = await reopened.list();
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('notes');
    expect(await reopened.get(first.id)).toEqual(first);
    expect((await reopened.get(first.id))!.notes[0]!.commentScan!.items[0]!.text).toBe('历史评论正文');
    expect(await reopened.get('missing')).toBeNull();
  });

  it('retains only the newest 80 records and assigns unique ids to concurrent captures', async () => {
    const store = new HistoryStore(join(directory, 'history.json'));
    await Promise.all(Array.from({ length: 85 }, (_, index) => store.add(captureFixture(`词${index}`))));
    const rows = await store.list();
    expect(rows).toHaveLength(80);
    expect(new Set(rows.map(row => row.id)).size).toBe(80);
    expect(rows[0]!.keyword).toBe('词84');
    expect(rows.some(row => row.keyword === '词0')).toBe(false);
  });

  it('fails closed on malformed data and recovers on the next successful write', async () => {
    const path = join(directory, 'history.json');
    await writeFile(path, '{broken', 'utf8');
    const store = new HistoryStore(path);
    expect(await store.list()).toEqual([]);
    const record = await store.add(captureFixture());
    expect((await store.list())[0]!.id).toBe(record.id);
    const persisted = JSON.parse(await readFile(path, 'utf8'));
    expect(persisted.version).toBe(1);
    expect(persisted.records).toHaveLength(1);
  });
});
