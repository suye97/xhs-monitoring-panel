window.__ModuleLoader__.load({
  id: '@local/xhs-monitor',
  factory(require) {
    const React = require('react');
    const { createElement: h, useEffect, useRef, useState } = React;
    const id = 'xhs-monitor';
    const zh = {
      title: '小红书舆情监控', keyword: '关键词', placeholder: '例如：黄金', scan: '搜索笔记并扫描评论',
      busy: '正在采集和分析…', history: '采集历史', noHistory: '暂无采集历史', detail: '采集详情',
      notes: '笔记', comments: '评论', noteIndex: '笔记情绪指数', commentIndex: '评论情绪指数',
      summary: 'AI 总结', ai: '疑似 AI 生成', probability: 'AI 概率', excluded: '剔除', valid: '有效样本',
      positive: '正向', negative: '负向', neutral: '中性', mixed: '混合', unknown: '未知',
      sampled: '已采', failed: '失败', skipped: '跳过', insufficientRelevant: '合格评论不足 50 条',
      candidateLimit: '达到评论候选上限', collectorNoteLink: '缺少带签名的笔记链接',
      collectorBridge: 'Browser Bridge 未连接', collectorLogin: '请先在浏览器登录小红书',
      collectorBlocked: '平台限制了本次采集', collectorUnavailable: '找不到 OpenCLI，请安装依赖',
      collectorBusy: '已有采集正在进行', collectorFailed: 'OpenCLI 采集失败', collectorFormat: 'OpenCLI 响应格式异常',
      timeout: '采集超时', invalidKeyword: '请输入 1–80 个字符的关键词', invalidSource: '仅支持 OpenCLI',
      invalidOptions: '请求参数无效', searchFailed: '采集失败', analysisFailed: '模型分析失败',
      analysisFormat: '模型响应格式不正确', analysisConfiguration: '模型地址无效',
      unconfigured: '未配置模型地址和名称，尚未生成 AI 总结', pending: '等待模型分析', completed: '分析完成',
      retry: '重试分析', scannedRaw: '候选评论', filtered: '过滤', relevance: '相关度',
      limited: '搜索达到样本上限', detailFailed: '笔记详情读取失败', historyMissing: '历史详情不存在',
      legacy: '旧版历史仅有汇总快照', indexMethod: '指数 = 100 ×（正向数 − 负向数）÷ 有效样本数；高置信 AI 文本不计入。',
      empty: '暂无结果', storageFailed: '浏览器旧历史读取失败',
    };
    const en = {
      title: 'Xiaohongshu monitor', keyword: 'Keyword', placeholder: 'For example: 黄金', scan: 'Search notes and scan comments',
      busy: 'Capturing and analyzing…', history: 'Capture history', noHistory: 'No captures yet', detail: 'Capture details',
      notes: 'Notes', comments: 'Comments', noteIndex: 'Note sentiment index', commentIndex: 'Comment sentiment index',
      summary: 'AI summary', ai: 'Likely AI generated', probability: 'AI probability', excluded: 'Excluded', valid: 'Valid samples',
      positive: 'Positive', negative: 'Negative', neutral: 'Neutral', mixed: 'Mixed', unknown: 'Unknown',
      sampled: 'Sampled', failed: 'Failed', skipped: 'Skipped', insufficientRelevant: 'Fewer than 50 relevant comments',
      candidateLimit: 'Comment candidate limit reached', collectorNoteLink: 'Signed note link missing',
      collectorBridge: 'Browser Bridge disconnected', collectorLogin: 'Sign in to Xiaohongshu in the browser',
      collectorBlocked: 'Platform blocked this capture', collectorUnavailable: 'OpenCLI unavailable; install dependencies',
      collectorBusy: 'A capture is already running', collectorFailed: 'OpenCLI capture failed', collectorFormat: 'Invalid OpenCLI response',
      timeout: 'Capture timed out', invalidKeyword: 'Enter 1–80 characters', invalidSource: 'Only OpenCLI is supported',
      invalidOptions: 'Invalid request', searchFailed: 'Capture failed', analysisFailed: 'Model analysis failed',
      analysisFormat: 'Invalid model response', analysisConfiguration: 'Invalid model endpoint',
      unconfigured: 'Configure a model endpoint and name to generate an AI summary', pending: 'Waiting for analysis', completed: 'Analysis completed',
      retry: 'Retry analysis', scannedRaw: 'Candidate comments', filtered: 'Filtered', relevance: 'Relevance',
      limited: 'Search sample limit reached', detailFailed: 'Note details unavailable', historyMissing: 'Capture details missing',
      legacy: 'Older history contains summary values only', indexMethod: 'Index = 100 × (positive − negative) / valid samples; high confidence AI text is excluded.',
      empty: 'No results', storageFailed: 'Could not load old browser history',
    };
    const styles = `
      .xhs-page{height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px}
      .xhs-content{max-width:980px;margin:auto;padding:28px clamp(16px,4vw,48px) 48px;display:grid;gap:22px}
      .xhs-page h1,.xhs-page h2,.xhs-page h3,.xhs-page p,.xhs-page dl,.xhs-page dd{margin:0}
      .xhs-page h1{font-size:20px}.xhs-page h2{font-size:17px}.xhs-page h3{font-size:15px}
      .xhs-form,.xhs-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.xhs-form input{flex:1;min-width:180px}
      .xhs-page input,.xhs-page button{min-height:36px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:5px 10px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}
      .xhs-page button{cursor:pointer}.xhs-page button:disabled{opacity:.6;cursor:default}
      .xhs-page a{color:inherit}.xhs-muted{color:var(--dsw-alias-label-secondary);font-size:13px}
      .xhs-history{display:flex;gap:6px;flex-wrap:wrap}.xhs-history button{text-align:left}
      .xhs-card{border:1px solid var(--dsw-alias-border-l3);border-radius:12px;padding:12px 14px;display:grid;gap:7px;min-width:0}
      .xhs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}
      .xhs-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}.xhs-note{display:grid;gap:10px}
      .xhs-page p,.xhs-page li{overflow-wrap:anywhere;white-space:pre-wrap}.xhs-page summary{cursor:pointer}
      .xhs-comments{display:grid;gap:8px;padding-inline-start:22px}.xhs-comment{padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l3)}
      .xhs-index{font-size:26px;font-weight:600}.xhs-page [role=alert]{border-inline-start:3px solid currentColor;padding-inline-start:10px}
    `;

    // 将旧浏览器历史转换为只读快照。
    function readLegacy() {
      const rows = [];
      for (const key of ['@local/xhs-monitor/history-v2', '@local/xhs-monitor/history-v1']) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
          if (Array.isArray(parsed)) rows.push(...parsed.filter(row => typeof row?.keyword === 'string' && row.capturedAt));
        } catch { /* 旧缓存损坏时继续读取其他版本。 */ }
      }
      return rows.slice(0, 80);
    }

    // 生成雪花格式的请求幂等键。
    let lastMs = 0n;
    let sequence = 0n;
    const worker = BigInt(crypto.getRandomValues(new Uint16Array(1))[0] & 1023);
    function requestKey() {
      let ms = BigInt(Date.now());
      if (ms < lastMs) ms = lastMs;
      if (ms === lastMs) sequence = (sequence + 1n) & 4095n;
      else sequence = 0n;
      if (ms === lastMs && sequence === 0n) ms++;
      lastMs = ms;
      return (((ms - 1577836800000n) << 22n) | (worker << 12n) | sequence).toString();
    }

    // 统一使用宿主传输层请求本地接口。
    async function send(path, init) {
      const fetcher = window.__DSH_TRANSPORT__?.fetch ?? ((url, options) => fetch(url, options));
      const response = await fetcher(path, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'searchFailed');
      return data;
    }

    function Icon() {
      return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M4 4v15h16M7.5 14l4-4 3 2 5-6' }));
    }

    // 显示已排除数量及有效分母。
    function IndexCard({ label, value, t }) {
      return h('div', { className: 'xhs-card' }, h('h3', null, label), h('div', { className: 'xhs-index' }, value?.index ?? '—'),
        h('p', { className: 'xhs-muted' }, `${t('valid')} ${value?.valid ?? 0} · ${t('excluded')} ${value?.excludedAi ?? 0}`));
    }

    // 展示单篇正文、分析与前五十条相关评论。
    function Note({ note, t }) {
      const scan = note.commentScan;
      return h('li', { className: 'xhs-card xhs-note', key: note.id },
        h('h3', null, h('a', { href: note.url, target: '_blank', rel: 'noopener noreferrer' }, note.title || note.id)),
        note.text && h('p', null, note.text),
        note.detailError && h('p', { className: 'xhs-muted' }, t('detailFailed')),
        note.analysis && h('p', { className: 'xhs-muted' }, `${t(note.analysis.sentiment)} · ${t('probability')} ${Math.round(note.analysis.aiProbability * 100)}%${note.analysis.aiGenerated ? ` · ${t('ai')}` : ''}`),
        note.analysis?.summary && h('p', null, note.analysis.summary),
        h('p', { className: 'xhs-muted' }, Object.entries(note.metrics ?? {}).map(([name, value]) => `${name} ${value}`).join(' · ')),
        scan && h('p', { className: 'xhs-muted' }, `${t(scan.status) ?? scan.status} · ${t('scannedRaw')} ${scan.scannedRaw ?? 0} · ${t('comments')} ${scan.items?.length ?? 0}${scan.reason ? ` · ${t(scan.reason) ?? scan.reason}` : ''}`),
        scan?.filtered && Object.keys(scan.filtered).length > 0 && h('p', { className: 'xhs-muted' }, `${t('filtered')}: ${Object.entries(scan.filtered).map(([key, value]) => `${key} ${value}`).join(' · ')}`),
        scan?.items?.length > 0 && h('details', null, h('summary', null, `${t('comments')} (${scan.items.length})`),
          h('ol', { className: 'xhs-comments' }, scan.items.map((item, index) => h('li', { key: `${item.id}-${index}`, className: 'xhs-comment' },
            h('p', null, item.text), h('p', { className: 'xhs-muted' }, `${t('relevance')} ${item.relevance}% · ${item.analysis ? t(item.analysis.sentiment) : t('unknown')}${item.analysis ? ` · ${t('probability')} ${Math.round(item.analysis.aiProbability * 100)}%` : ''}${item.analysis?.aiGenerated ? ` · ${t('ai')}` : ''}`))))));
    }

    function Panel({ t }) {
      const [keyword, setKeyword] = useState('黄金');
      const [history, setHistory] = useState([]);
      const [legacy] = useState(readLegacy);
      const [result, setResult] = useState(null);
      const [error, setError] = useState('');
      const [pending, setPending] = useState(false);
      const live = useRef(false);

      // 从宿主读取持久化历史，刷新后仍可打开原采集详情。
      async function refreshHistory() {
        try { setHistory(await send('api/xhs-monitor.history')); }
        catch { setError('searchFailed'); }
      }
      useEffect(() => { void refreshHistory(); }, []);

      // 提交一轮新采集；同一页面重复点击共用正在进行的请求。
      async function run() {
        if (live.current) return;
        live.current = true;
        setPending(true);
        setError('');
        try {
          const data = await send('api/xhs-monitor.search', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keyword, requestKey: requestKey() }) });
          setResult(data);
          await refreshHistory();
        } catch (cause) { setError(cause.message ?? 'searchFailed'); }
        finally { live.current = false; setPending(false); }
      }

      // 按任务 ID 读取当次结果，不触发重新采集。
      async function openTask(taskId) {
        setError('');
        try { setResult(await send(`api/xhs-monitor.detail?taskId=${encodeURIComponent(taskId)}`)); }
        catch (cause) { setError(cause.message ?? 'historyMissing'); }
      }

      // 只重做模型分析并保留原始正文与评论。
      async function retry() {
        if (!result?.taskId || pending) return;
        setPending(true);
        try {
          setResult(await send('api/xhs-monitor.analysis-retry', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskId: result.taskId }) }));
          await refreshHistory();
        } catch (cause) { setError(cause.message ?? 'analysisFailed'); }
        finally { setPending(false); }
      }

      const formatDate = value => new Date(value).toLocaleString(document.documentElement.lang || 'zh-CN');
      return h('div', { className: 'xhs-page' }, h('style', null, styles), h('main', { className: 'xhs-content' },
        h('h1', null, t('title')),
        h('form', { className: 'xhs-form', onSubmit: event => { event.preventDefault(); void run(); } },
          h('label', null, t('keyword')),
          h('input', { value: keyword, maxLength: 80, required: true, disabled: pending, placeholder: t('placeholder'),
            onChange: event => setKeyword(event.target.value) }),
          h('button', { type: 'submit', disabled: pending || !keyword.trim() }, pending ? t('busy') : t('scan'))),
        error && h('p', { role: 'alert' }, t(error) ?? error),
        h('section', { className: 'xhs-card' }, h('h2', null, t('history')),
          history.length ? h('div', { className: 'xhs-history' }, history.map(row => h('button', { key: row.taskId, type: 'button',
            onClick: () => void openTask(row.taskId) }, `${row.keyword} · ${formatDate(row.capturedAt)} · ${row.count}`))) : h('p', null, t('noHistory')),
          legacy.length > 0 && h('details', null, h('summary', null, t('legacy')),
            legacy.map((row, index) => h('p', { key: index }, `${row.keyword} · ${formatDate(row.capturedAt)} · ${row.count} · ${row.summary ?? ''}`)))),
        result && h('section', { className: 'xhs-card' },
          h('div', { className: 'xhs-row' }, h('h2', null, `${t('detail')} · ${result.keyword}`),
            h('span', { className: 'xhs-muted' }, formatDate(result.capturedAt))),
          result.limited && h('p', { className: 'xhs-muted' }, t('limited')),
          h('div', { className: 'xhs-grid' }, h(IndexCard, { label: t('noteIndex'), value: result.stats?.notes, t }),
            h(IndexCard, { label: t('commentIndex'), value: result.stats?.comments, t })),
          h('p', { className: 'xhs-muted' }, t('indexMethod')),
          h('h3', null, t('summary')),
          h('p', null, result.analysis?.summary || t(result.analysis?.reason ?? result.analysis?.status ?? 'pending')),
          result.analysis?.status !== 'completed' && h('button', { type: 'button', disabled: pending,
            onClick: () => void retry() }, t('retry')),
          h('h3', null, `${t('notes')} (${result.notes?.length ?? 0})`),
          result.notes?.length ? h('ul', { className: 'xhs-list' }, result.notes.map(note => h(Note, { key: note.id, note, t }))) : h('p', null, t('empty')))));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(id, { zh, en }));
        const t = ctx.locale.bind(id);
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: id }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: 100, locale: id, label: () => t('title') }, Icon));
      },
    };
  },
});
