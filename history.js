import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const EPOCH = 1_577_836_800_000n;
let lastMillisecond = 0n;
let sequence = 0n;

// 生成十进制雪花任务 ID，保持 JSON 精度。
export function createTaskId() {
  let current = BigInt(Date.now());
  if (current < lastMillisecond) current = lastMillisecond;
  if (current === lastMillisecond) sequence = (sequence + 1n) & 4095n;
  else sequence = 0n;
  if (sequence === 0n && current === lastMillisecond) current++;
  lastMillisecond = current;
  return (((current - EPOCH) << 22n) | (BigInt(process.pid % 1024) << 12n) | sequence).toString();
}

// 对请求幂等键计算摘要，避免将原键写入历史文件。
export function hashKey(value) {
  return createHash('sha256').update(value).digest('hex');
}

// 使用同目录临时文件和重命名原子保存单次采集。
export function createHistory(directory = process.env.XHS_MONITOR_DATA_DIR || join(process.cwd(), '.xhs-monitor-data')) {
  const root = resolve(directory);
  const file = id => join(root, `${id}.json`);
  return {
    async save(record) {
      await mkdir(root, { recursive: true });
      const temporary = join(root, `${record.taskId}.${createTaskId()}.tmp`);
      await writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', flag: 'w' });
      await rename(temporary, file(record.taskId));
    },
    async get(id) {
      if (!/^\d{15,20}$/.test(String(id))) return null;
      try { return JSON.parse(await readFile(file(id), 'utf8')); }
      catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
    },
    async list() {
      let names;
      try { names = await readdir(root); }
      catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
      const ids = names.filter(name => /^\d{15,20}\.json$/.test(name)).sort((a, b) => b.localeCompare(a)).slice(0, 80);
      const records = await Promise.all(ids.map(name => this.get(name.slice(0, -5))));
      return records.filter(Boolean).map(({ taskId, keyword, capturedAt, stats, analysis }) => ({
        taskId, keyword, capturedAt, count: stats?.count ?? 0, noteIndex: stats?.notes?.index ?? null,
        commentIndex: stats?.comments?.index ?? null, summary: analysis?.summary ?? '', analysisStatus: analysis?.status,
      }));
    },
    // 在最近的持久化记录中查找请求幂等键。
    async findByKey(digest) {
      let names;
      try { names = await readdir(root); }
      catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
      for (const name of names.filter(value => /^\d{15,20}\.json$/.test(value)).sort((a, b) => b.localeCompare(a)).slice(0, 80)) {
        const record = await this.get(name.slice(0, -5));
        if (record?.requestKeyHash === digest) return record;
      }
      return null;
    },
  };
}
