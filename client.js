window.__ModuleLoader__.load({
  id: '@local/xhs-monitor',
  factory(require) {
    const React = require('react');
    const { createElement: h, useEffect, useRef, useState } = React;
    const id = 'xhs-monitor';
    const storageKey = '@local/xhs-monitor/history-v1';
    const sources = ['opencli', 'web', 'api', 'demo'];
    const sentiments = ['negative', 'positive', 'neutral', 'mixed', 'unknown'];
    const errors = ['invalidKeyword', 'webUnavailable', 'apiUnavailable', 'apiConfiguration', 'apiFailed', 'apiFormat', 'rateLimited', 'timeout', 'searchFailed',
      'collectorUnavailable', 'collectorBridge', 'collectorLogin', 'collectorBlocked', 'collectorBusy', 'collectorFailed', 'collectorFormat'];
    const zh = {
      title: '小红书舆情监控', intro: '按关键词采集笔记样本，追踪情绪和热度变化。',
      keyword: '关键词', placeholder: '输入品牌、产品或话题', source: '数据源', web: 'Harness 网页搜索', api: '笔记数据 API', demo: '演示样本',
      search: '搜索并分析', busy: '正在搜索和分析…', cancel: '取消', auto: '页面打开时每 30 分钟刷新', autoActive: '自动刷新已开启',
      webInfo: '使用 Harness 搜索公开收录的小红书笔记，按标题和摘要分类。搜索服务可能计费。',
      apiInfo: '使用管理员配置的笔记数据接口。互动量取决于接口返回字段，服务可能计费。',
      demoInfo: '虚构样本，用于体验面板。演示数据单独保存。',
      sample: '采集笔记', ratio: '负面占比', activity: '已知互动量', analyzed: '可分析笔记',
      sampled: '采集于', codeLimit: '本次达到搜索样本上限。', noResults: '这次搜索未返回可识别的小红书笔记。可以换一个关键词，或切换到已配置的笔记数据 API。',
      negative: '负面', positive: '正面', neutral: '中性', mixed: '混合', unknown: '缺少文本',
      trends: '采集趋势', trendHelp: '每次采集形成一个快照，按关键词和数据源保存在当前浏览器。',
      firstTrend: '再采集一次即可比较变化。', history: '近期关键词', time: '采集时间',
      notes: '笔记样本', all: '全部情绪', emptyFilter: '当前分类下没有笔记。', untitled: '无标题笔记',
      signals: '命中词', likes: '赞', comments: '评', saves: '藏', shares: '分享', coverage: '有互动数据的笔记',
      method: '负面占比 = 负面笔记数 ÷ 有标题或文本的笔记数。中文规则估算包含混合和中性样本作为分母。',
      scope: '样本量和累计互动量仅反映本次采集结果。', storageFailed: '浏览器存储不可用，本次历史只保留在页面内。',
      invalidKeyword: '请输入 1–80 个字符的关键词。', searchFailed: '搜索失败，请检查连接后重试。',
      webUnavailable: '当前 Harness 网页搜索不可用。请检查「设置 → 网页搜索和抓取」中的搜索服务和凭据。',
      apiUnavailable: '笔记数据 API 尚未配置。请设置插件的 searchEndpoint 后重试。',
      apiConfiguration: '笔记数据 API 地址无效，需使用 HTTPS。', apiFailed: '笔记数据 API 请求失败，请检查地址和凭据。',
      apiFormat: '笔记数据 API 返回格式不符合接口约定。', rateLimited: '数据服务限制了请求频率，请稍后重试。', timeout: '搜索超时，请重试。',
    };
    const en = {
      title: 'Xiaohongshu monitor', intro: 'Sample posts by keyword and track sentiment and activity over time.',
      keyword: 'Keyword', placeholder: 'Enter a brand, product or topic', source: 'Data source', web: 'Harness web search', api: 'Note data API', demo: 'Demo sample',
      search: 'Search and analyze', busy: 'Searching and analyzing…', cancel: 'Cancel', auto: 'Refresh every 30 minutes while open', autoActive: 'Auto-refresh active',
      webInfo: 'Classifies indexed Xiaohongshu notes from their titles and snippets. The search provider may charge per call.',
      apiInfo: 'Uses an administrator-configured note API. Interaction metrics depend on the returned fields. The provider may charge per call.',
      demoInfo: 'Synthetic samples for exploring the panel. Demo history is stored separately.',
      sample: 'Notes sampled', ratio: 'Negative share', activity: 'Reported interactions', analyzed: 'Analyzable notes',
      sampled: 'Captured', codeLimit: 'This capture reached the search sample limit.', noResults: 'This search returned no identifiable Xiaohongshu notes. Try another keyword or a configured note API.',
      negative: 'Negative', positive: 'Positive', neutral: 'Neutral', mixed: 'Mixed', unknown: 'Missing text',
      trends: 'Capture history', trendHelp: 'Each search adds a snapshot for its keyword and source in this browser.',
      firstTrend: 'Capture another sample to compare changes.', history: 'Recent keywords', time: 'Capture time',
      notes: 'Sampled posts', all: 'All sentiments', emptyFilter: 'No notes match this filter.', untitled: 'Untitled note',
      signals: 'Matched terms', likes: 'Likes', comments: 'Comments', saves: 'Saves', shares: 'Shares', coverage: 'Notes with interaction data',
      method: 'Negative share = negative notes ÷ notes with a title or text. Chinese-language rules classify the sample. Mixed and neutral notes are included in the denominator.',
      scope: 'Post counts and cumulative interactions reflect the current sample.', storageFailed: 'Browser storage is unavailable. This history lasts while the panel is open.',
      invalidKeyword: 'Enter a keyword of 1–80 characters.', searchFailed: 'Search failed. Check the connection and try again.',
      webUnavailable: 'Harness web search is unavailable. Check its search provider and credentials under Settings.',
      apiUnavailable: 'The note API is unconfigured. Set the plugin’s searchEndpoint and try again.',
      apiConfiguration: 'The note API requires a valid HTTPS URL.', apiFailed: 'The note API request failed. Check the endpoint and credentials.',
      apiFormat: 'The note API did not return the expected response.', rateLimited: 'The provider throttled the request. Try again later.', timeout: 'The search timed out. Try again.',
    };
    Object.assign(zh, {
      opencli: 'OpenCLI 笔记与评论', opencliInfo: '使用已登录小红书且连接 Browser Bridge 的浏览器。每次最多扫描 6 篇笔记，每篇最多 20 条文本评论及回复（合计）。',
      collectorUnavailable: 'Harness Host 找不到 OpenCLI。请安装插件依赖，或配置 XHS_MONITOR_OPENCLI_ENTRY。',
      collectorBridge: 'OpenCLI 浏览器桥接未连接。请打开装有 Browser Bridge 的浏览器并启用该扩展。',
      collectorLogin: '请在已连接的浏览器中登录小红书，再重试。',
      collectorBlocked: '平台限制了本次采集，扫描已停止。', collectorBusy: '已有一项 OpenCLI 采集在运行。',
      collectorFailed: 'OpenCLI 采集失败，请检查浏览器连接和登录状态。', collectorFormat: 'OpenCLI 返回了无法识别的数据。',
      collectorNoteLink: '搜索结果缺少读取这篇笔记所需的链接参数。', detailUnavailable: '笔记详情读取失败，情绪分析使用搜索标题。',
      commentRatio: '评论负面占比', commentSample: '已采集文本评论', commentCoverage: '评论扫描成功的笔记',
      commentScope: '评论占比按采到的文本评论和回复计算。每次扫描只反映本次样本。',
      commentFailed: '读取失败', commentSkipped: '跳过', commentEmpty: '本次没有采到文本评论。',
      commentLimited: '本次可能还有更多评论。', commentReply: '回复',
      scanAction: '搜索笔记并扫描评论', scanCanceled: '已取消采集。', previousCapture: '以下保留上一次采集结果。',
      scanComplete: '采集结束', retry: '重试',
    });
    Object.assign(en, {
      opencli: 'OpenCLI notes and comments', opencliInfo: 'Uses a Browser Bridge connection to a signed-in browser. Samples up to 6 notes and 20 text comments and replies combined per note.',
      collectorUnavailable: 'Harness Host could not find OpenCLI. Install the plugin dependencies or set XHS_MONITOR_OPENCLI_ENTRY.',
      collectorBridge: 'OpenCLI Browser Bridge is disconnected. Open the browser and enable the Browser Bridge extension.',
      collectorLogin: 'Sign into Xiaohongshu in the connected browser and try again.',
      collectorBlocked: 'Xiaohongshu restricted this capture. The scan stopped.', collectorBusy: 'An OpenCLI capture is already running.',
      collectorFailed: 'OpenCLI capture failed. Check the browser connection and sign-in.', collectorFormat: 'OpenCLI returned an unrecognized result.',
      collectorNoteLink: 'The search result is missing a link parameter required to open this note.', detailUnavailable: 'Note details are unavailable. Sentiment uses the search title.',
      commentRatio: 'Negative comment share', commentSample: 'Text comments sampled', commentCoverage: 'Notes scanned successfully',
      commentScope: 'Comment share uses the text comments and replies collected in this sample.',
      commentFailed: 'Reads failed', commentSkipped: 'Skipped', commentEmpty: 'No text comments were collected.',
      commentLimited: 'More comments may be available.', commentReply: 'Reply',
      scanAction: 'Search notes and scan comments', scanCanceled: 'Capture canceled.', previousCapture: 'Showing the previous capture.',
      scanComplete: 'Capture finished', retry: 'Retry',
    });
    const styles = `
      .xhs-page{height:100%;min-height:0;overflow:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.55}
      .xhs-content{max-width:960px;margin:auto;padding:28px clamp(16px,4vw,48px) 48px}
      [data-platform='darwin'] .xhs-content{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .xhs-page h1,.xhs-page h2,.xhs-page h3,.xhs-page p,.xhs-page dl,.xhs-page dd{margin:0}
      .xhs-page h1{font-size:20px;line-height:28px;font-weight:500}
      .xhs-page h2{font-size:16px;font-weight:600;overflow-wrap:anywhere}
      .xhs-page h3{font-size:14px;font-weight:600;overflow-wrap:anywhere}
      .xhs-muted{color:var(--dsw-alias-label-secondary);font-size:13px;overflow-wrap:anywhere}
      .xhs-section{margin-top:24px;display:grid;gap:12px}
      .xhs-form,.xhs-row{display:flex;align-items:end;flex-wrap:wrap;gap:8px 12px}
      .xhs-row{align-items:center;justify-content:space-between}
      .xhs-field{display:grid;gap:4px;font-size:13px}
      .xhs-keyword{flex:1 1 220px;min-width:0}
      .xhs-sources{border:0;margin:0;padding:0;min-width:0}
      .xhs-sources legend{padding:0}
      .xhs-sources > div{display:flex;flex-wrap:wrap;gap:4px}
      .xhs-page .xhs-sources button[aria-pressed=true]{border-color:var(--dsw-alias-label-primary);font-weight:600}
      .xhs-page :is(input:not([type=checkbox]),select,button){min-height:34px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:4px 10px;font:inherit;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
      .xhs-page :is(button,select){cursor:pointer}
      .xhs-page button:disabled{opacity:.6;cursor:default}
      .xhs-page :is(input,select,button,a):focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
      .xhs-page button:hover:not(:disabled),.xhs-page .xhs-sources button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}
      .xhs-page button.xhs-submit,.xhs-page button.xhs-submit:hover:not(:disabled){background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-foreground);font-weight:600}
      .xhs-auto{display:inline-flex;align-items:center;gap:6px;font-size:13px}
      .xhs-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px}
      .xhs-card,.xhs-trend{border:1px solid var(--dsw-alias-border-l3);border-radius:12px;padding:12px 14px}
      .xhs-card dd{font-size:25px;font-weight:600;font-variant-numeric:tabular-nums}
      .xhs-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
      .xhs-post{display:grid;gap:5px;border-bottom:1px solid var(--dsw-alias-border-l3);padding:5px 0 11px;min-width:0}
      .xhs-page a{color:inherit;text-underline-offset:3px}
      .xhs-post p{overflow-wrap:anywhere;white-space:pre-wrap}
      .xhs-comment-scan{padding:8px 0}
      .xhs-comment-scan summary{cursor:pointer}
      .xhs-comment-scan ol{display:grid;gap:6px;padding-inline-start:1.5em;margin-block:8px 0}
      .xhs-comment-scan small{color:var(--dsw-alias-label-secondary)}
      .xhs-pill{width:max-content;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 8px;font-size:12px}
      .xhs-negative{font-weight:700}
      .xhs-trend{overflow-x:auto}
      .xhs-table{width:100%;min-width:320px;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
      .xhs-table :is(th,td){padding:6px;text-align:start;border-bottom:1px solid var(--dsw-alias-border-l3)}
      .xhs-table tr:last-child td{border:0}
      .xhs-table th:first-child,.xhs-table td:first-child{padding-inline-start:0}
      .xhs-table th:last-child,.xhs-table td:last-child{padding-inline-end:0}
      .xhs-bar{display:inline-block;height:6px;min-width:0;border-radius:4px;background:var(--dsw-alias-label-secondary);vertical-align:middle}
      .xhs-history{display:flex;flex-wrap:wrap;gap:6px}
      .xhs-history button{max-width:100%;overflow-wrap:anywhere;font-size:12px;text-align:start}
      .xhs-status{min-height:1.45em}
      .xhs-page [role=alert]{border-inline-start:3px solid var(--dsw-alias-label-primary);padding-inline-start:10px}
    `;

    const signature = ({ keyword, source }) => JSON.stringify([source, keyword]);

    function readHistory() {
      try {
        const rows = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
        return Array.isArray(rows) ? rows.filter(row => typeof row?.keyword === 'string' && sources.includes(row.source)
          && Number.isFinite(Date.parse(row.capturedAt)) && Number.isInteger(row.count)
          && (row.negativeRatio === null || Number.isFinite(row.negativeRatio))
          && (row.interactions === null || Number.isFinite(row.interactions))).slice(0, 80) : [];
      } catch { return []; }
    }

    function Icon({ size = 18 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M4 4v15h16M7.5 14l4-4 3 2 5-6' }));
    }

    function Trend({ rows, t, formatNumber, formatRatio, formatDate }) {
      const maxCount = Math.max(1, ...rows.map(row => row.count));
      return h('section', { className: 'xhs-section' },
        h('h2', null, t('trends')), h('p', { className: 'xhs-muted' }, t('trendHelp')),
        rows.length < 2 && h('p', { className: 'xhs-muted' }, t('firstTrend')),
        rows.length > 0 && h('div', { className: 'xhs-trend' }, h('table', { className: 'xhs-table' },
          h('thead', null, h('tr', null, ['time', 'sample', 'ratio', 'activity'].map(key => h('th', { key, scope: 'col' }, t(key))))),
          h('tbody', null, rows.map((row, index) => h('tr', { key: `${row.capturedAt}-${index}` },
            h('td', null, h('time', { dateTime: row.capturedAt }, formatDate(row.capturedAt))),
            h('td', null, formatNumber(row.count), ' ', h('span', { className: 'xhs-bar', 'aria-hidden': true,
              style: { width: `${Math.round(38 * row.count / maxCount)}px` } })),
            h('td', null, formatRatio(row.negativeRatio)), h('td', null, formatNumber(row.interactions))))))));
    }

    function CommentScan({ scan, t, formatNumber }) {
      if (!scan) return null;
      if (scan.status !== 'sampled') {
        const reason = [...errors, 'collectorNoteLink'].includes(scan.reason) ? scan.reason : 'collectorFailed';
        return h('p', { className: 'xhs-muted' }, `${t(scan.status === 'failed' ? 'commentFailed' : 'commentSkipped')} · ${t(reason)}`);
      }
      const limitHint = scan.limited ? ` · ${t('commentLimited')}` : '';
      if (!scan.items.length) return h('p', { className: 'xhs-muted' }, `${t('commentEmpty')}${limitHint}`);
      return h('details', { className: 'xhs-comment-scan' },
        h('summary', null, `${t('commentSample')} (${formatNumber(scan.items.length)})${limitHint}`),

        h('ol', null, scan.items.map((item, index) => h('li', { key: index },
          h('p', null, item.text), h('small', null, item.isReply ? `${t('commentReply')} · ${t(item.sentiment)}` : t(item.sentiment))))));
    }

    function Panel({ t }) {
      const [history, setHistory] = useState(readHistory);
      const [keyword, setKeyword] = useState(history[0]?.keyword ?? '');
      const [source, setSource] = useState(history[0]?.source ?? 'opencli');
      const [result, setResult] = useState(null);
      const [error, setError] = useState('');
      const [canceled, setCanceled] = useState(false);
      const [storageFailed, setStorageFailed] = useState(false);
      const [pending, setPending] = useState(false);
      const [auto, setAuto] = useState(false);
      const [filter, setFilter] = useState('all');
      const live = useRef(null);
      const lang = document.documentElement.lang || 'zh-CN';
      const number = new Intl.NumberFormat(lang);
      const ratio = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });
      const date = new Intl.DateTimeFormat(lang, { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      const formatNumber = value => value === null ? '—' : number.format(value);
      const formatRatio = value => value === null ? '—' : ratio.format(value);
      const formatDate = value => `${date.format(new Date(value))} UTC+8`;

      async function run(searchKeyword, searchSource) {
        if (live.current) return;
        const controller = new AbortController();
        live.current = controller;
        setPending(true);
        setError('');
        setCanceled(false);
        try {
          const send = window.__DSH_TRANSPORT__?.fetch ?? ((path, init) => fetch(path, init));
          const response = await send('api/xhs-monitor.search', { method: 'POST', signal: controller.signal,
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keyword: searchKeyword, source: searchSource }) });
          const data = await response.json();
          controller.signal.throwIfAborted();
          if (!response.ok) throw new Error(data.error);
          setResult(data);
          setFilter('all');
          const { count, negativeRatio, interactions } = data.stats;
          const snapshot = { keyword: data.keyword, source: data.source, capturedAt: data.capturedAt, count, negativeRatio, interactions };
          const stored = readHistory();
          const next = [snapshot, ...(stored.length ? stored : history)].slice(0, 80);
          setHistory(next);
          try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setStorageFailed(true); }
        } catch (cause) {
          if (!controller.signal.aborted) setError(errors.includes(cause.message) ? cause.message : 'searchFailed');
        } finally {
          if (live.current === controller) {
            live.current = null;
            setPending(false);
          }
        }
      }

      useEffect(() => () => { const running = live.current; live.current = null; running?.abort(); }, []);
      useEffect(() => {
        if (!auto || source === 'demo' || result?.keyword !== keyword.trim().normalize('NFKC') || result?.source !== source) return;
        const interval = 30 * 60 * 1000;
        let lastAttempt = Date.now();
        const refreshIfDue = () => {
          if (live.current || document.visibilityState !== 'visible' || Date.now() - lastAttempt < interval) return;
          lastAttempt = Date.now();
          void run(result.keyword, source);
        };
        const timer = window.setInterval(refreshIfDue, interval);
        document.addEventListener('visibilitychange', refreshIfDue);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshIfDue); };
      }, [auto, keyword, source, result]);

      const recent = [...new Map(history.slice().reverse().map(row => [signature(row), row])).values()]
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 6);
      const displayed = result && signature(result) === signature({ keyword: keyword.trim().normalize('NFKC'), source }) ? result : null;
      const trend = history.filter(row => signature(row) === signature({ keyword: keyword.trim().normalize('NFKC'), source })).slice(0, 8);
      const stats = displayed?.stats;
      const commentStats = displayed?.comments;
      const notes = displayed?.notes.filter(note => filter === 'all' || filter === note.sentiment) ?? [];

      return h('div', { className: 'xhs-page' }, h('style', null, styles), h('div', { className: 'xhs-content' },
        h('header', null, h('h1', null, t('title')), h('p', { className: 'xhs-muted' }, t('intro'))),
        h('section', { className: 'xhs-section' },
          h('form', { className: 'xhs-form', onSubmit: event => { event.preventDefault(); void run(keyword, source); } },
            h('label', { className: 'xhs-field xhs-keyword' }, t('keyword'), h('input', { value: keyword, maxLength: 80, required: true, disabled: pending,
              placeholder: t('placeholder'), onChange: event => { setAuto(false); setError(''); setKeyword(event.target.value); } })),
            h('fieldset', { className: 'xhs-field xhs-sources', disabled: pending }, h('legend', null, t('source')),
              h('div', null, sources.map(key => h('button', { key, type: 'button', 'aria-pressed': source === key,
                onClick: () => { if (source !== key) { setAuto(false); setError(''); setSource(key); } } }, t(key))))),
            h('button', { className: 'xhs-submit', type: 'submit', disabled: pending || !keyword.trim() }, t(source === 'opencli' ? 'scanAction' : 'search')),
            pending && h('button', { type: 'button', onClick: () => { setAuto(false); setCanceled(true); live.current?.abort(); } }, t('cancel'))),
          h('div', { className: 'xhs-row' }, h('p', { className: 'xhs-muted' }, t(`${source}Info`)),
            displayed && source !== 'demo' && h('label', { className: 'xhs-auto' }, h('input', { type: 'checkbox', checked: auto,
              onChange: event => setAuto(event.target.checked) }), t('auto'))),
          recent.length > 0 && h('div', { className: 'xhs-history', 'aria-label': t('history') }, recent.map(row =>
            h('button', { key: signature(row), type: 'button', disabled: pending, onClick: () => { setAuto(false); setError(''); setKeyword(row.keyword); setSource(row.source); } },
              `${row.keyword} · ${t(row.source)}`))),
          h('div', { className: 'xhs-muted xhs-status', role: 'status' }, pending ? t('busy') : canceled ? t('scanCanceled') : auto ? t('autoActive') :
            !error && commentStats ? `${t('scanComplete')} · ${t('sample')} ${formatNumber(stats.count)} · ${t('commentSample')} ${formatNumber(commentStats.count)}` : ''),
          error && h('div', { className: 'xhs-row' }, h('p', { role: 'alert' }, t(error)),
            source === 'opencli' && h('button', { type: 'button', disabled: pending, onClick: () => void run(keyword, source) }, t('retry'))),
          storageFailed && h('p', { className: 'xhs-muted' }, t('storageFailed'))),
        stats && h('section', { className: 'xhs-section' },
           (error || canceled) && h('p', { className: 'xhs-muted' }, t('previousCapture')),
          h('div', { className: 'xhs-row' }, h('h2', null, displayed.keyword), h('p', { className: 'xhs-muted' },
            `${t(displayed.source)} · ${t('sampled')} ${formatDate(displayed.capturedAt)}`)),
          h('dl', { className: 'xhs-metrics' }, [
            ['sample', formatNumber(stats.count), `${t('analyzed')} ${formatNumber(stats.analyzed)}`],
            ['ratio', formatRatio(stats.negativeRatio), `${t('negative')} ${formatNumber(stats.counts.negative)} / ${formatNumber(stats.analyzed)}`],
            ['activity', formatNumber(stats.interactions), `${t('coverage')} ${formatNumber(stats.interactionCoverage)} / ${formatNumber(stats.count)}`],
          ].map(([key, value, explanation]) => h('div', { className: 'xhs-card', key }, h('dt', null, t(key)), h('dd', null, value),
            h('p', { className: 'xhs-muted' }, explanation)))),
          h('p', { className: 'xhs-muted' }, `${t('method')} ${t('scope')}`),
          commentStats && h('dl', { className: 'xhs-metrics' },
            h('div', { className: 'xhs-card' }, h('dt', null, t('commentRatio')), h('dd', null, formatRatio(commentStats.negativeRatio)),
              h('p', { className: 'xhs-muted' }, `${t('negative')} ${formatNumber(commentStats.counts.negative)} / ${formatNumber(commentStats.count)}`)),
            h('div', { className: 'xhs-card' }, h('dt', null, t('commentCoverage')), h('dd', null, `${formatNumber(commentStats.sampledNotes)} / ${formatNumber(stats.count)}`),
              h('p', { className: 'xhs-muted' }, `${t('commentFailed')} ${formatNumber(commentStats.failedNotes)} · ${t('commentSkipped')} ${formatNumber(commentStats.skippedNotes)}`))),
          commentStats && h('p', { className: 'xhs-muted' }, t('commentScope')),
          displayed.limited && h('p', { className: 'xhs-muted' }, t('codeLimit')),
          !stats.count && h('p', { role: 'status' }, t('noResults'))),
        trend.length > 0 && h(Trend, { rows: trend, t, formatNumber, formatRatio, formatDate }),
        stats?.count > 0 && h('section', { className: 'xhs-section' },
          h('div', { className: 'xhs-row' }, h('h2', null, t('notes')), h('select', { 'aria-label': t('all'), value: filter,
            onChange: event => setFilter(event.target.value) }, ['all', ...sentiments].map(key => h('option', { value: key, key },
            `${t(key)} (${formatNumber(key === 'all' ? stats.count : stats.counts[key])})`)))),
          notes.length ? h('ul', { className: 'xhs-list' }, notes.map(note => h('li', { key: note.id, className: 'xhs-post' },
            h('div', { className: 'xhs-row' }, h('h3', null, note.url
              ? h('a', { href: note.url, target: '_blank', rel: 'noopener noreferrer' }, note.title || t('untitled')) : note.title || t('untitled')),
            h('span', { className: `xhs-pill xhs-${note.sentiment}` }, t(note.sentiment))),
            note.text && h('p', null, note.text),
            note.signals.length > 0 && h('p', { className: 'xhs-muted' }, `${t('signals')} · ${note.signals.join('、')}`),
            Object.keys(note.metrics).length > 0 && h('p', { className: 'xhs-muted' }, Object.entries(note.metrics)
              .map(([name, value]) => `${t(name)} ${formatNumber(value)}`).join(' · ')),
            note.detailError && h('p', { className: 'xhs-muted' }, t('detailUnavailable')),
            h(CommentScan, { scan: note.commentScan, t, formatNumber })))) : h('p', { role: 'status' }, t('emptyFilter')))));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(id, { zh, en }));
        const t = ctx.locale.bind(id);
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: id }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id, order: 100, locale: id, label: () => t('title'),
        }, Icon));
      },
    };
  },
});
