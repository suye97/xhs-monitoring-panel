import { useCallback, useEffect, useRef, useState } from 'react';
import iconUrl from '../../icon.svg';
import en from '../../locale/en.json';
import zh from '../../locale/zh.json';
import type {
  CaptureRecord,
  CaptureSummary,
  ErrorCode,
  MetricName,
  MonitorApi,
  Sentiment,
} from '../shared/types';

type TranslationKey = keyof typeof zh.messages;
type Translate = (key: TranslationKey) => string;
const sentiments: Sentiment[] = ['negative', 'positive', 'neutral', 'mixed', 'unknown'];
const errorCodes = new Set<ErrorCode>([
  'invalidKeyword', 'invalidSource', 'collectorUnavailable', 'collectorBridge', 'collectorLogin',
  'collectorBlocked', 'collectorBusy', 'collectorFailed', 'collectorFormat', 'collectorNoteLink',
  'timeout', 'scanCanceled', 'searchFailed',
]);

function errorTranslation(t: Translate, value: string | undefined): string {
  return value && errorCodes.has(value as ErrorCode) ? t(value as ErrorCode) : t('collectorFailed');
}

function sentimentTranslation(sentiment: Sentiment): TranslationKey {
  return `${sentiment}Sentiment` as TranslationKey;
}

function CaptureDetail({ record, api, t, language, historical = false }: {
  record: CaptureRecord;
  api: MonitorApi;
  t: Translate;
  language: string;
  historical?: boolean;
}) {
  const [filter, setFilter] = useState<'all' | Sentiment>('all');
  const [linkError, setLinkError] = useState(false);
  const number = new Intl.NumberFormat(language);
  const ratio = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(language, {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const formatNumber = (value: number | null) => value === null ? '—' : number.format(value);
  const formatRatio = (value: number | null) => value === null ? '—' : ratio.format(value);
  const notes = record.notes.filter(note => filter === 'all' || note.sentiment === filter);
  const stats = [
    { label: t('sample'), value: formatNumber(record.stats.count), help: `${t('analyzed')} ${formatNumber(record.stats.analyzed)}` },
    { label: t('ratio'), value: formatRatio(record.stats.negativeRatio), help: `${t('negative')} ${formatNumber(record.stats.counts.negative)} / ${formatNumber(record.stats.analyzed)}` },
    { label: t('activity'), value: formatNumber(record.stats.interactions), help: `${t('coverage')} ${formatNumber(record.stats.interactionCoverage)} / ${formatNumber(record.stats.count)}` },
    { label: t('commentRatio'), value: formatRatio(record.comments.negativeRatio), help: `${t('negative')} ${formatNumber(record.comments.counts.negative)} / ${formatNumber(record.comments.count)}` },
    { label: t('commentCoverage'), value: `${formatNumber(record.comments.sampledNotes)} / ${formatNumber(record.stats.count)}`, help: `${t('commentFailed')} ${formatNumber(record.comments.failedNotes)} · ${t('commentSkipped')} ${formatNumber(record.comments.skippedNotes)}` },
  ];

  return <>
    <section className="detail-heading" aria-labelledby="capture-title">
      <div>
        {historical && <p className="eyebrow">{t('detailTitle')}</p>}
        <h2 id="capture-title">{record.keyword}</h2>
        <p>{t('source')} · {t('sampled')} <time dateTime={record.capturedAt}>{date.format(new Date(record.capturedAt))} UTC+8</time></p>
      </div>
      <span className="status-badge"><span aria-hidden="true">●</span>{t('scanComplete')}</span>
    </section>
    <dl className="metrics">
      {stats.map(stat => <div className="metric-card" key={stat.label}>
        <dt>{stat.label}</dt><dd>{stat.value}</dd><p>{stat.help}</p>
      </div>)}
    </dl>
    <p className="method-note">{t('method')} {t('scope')} {t('commentScope')}</p>
    {record.limited && <p className="notice">{t('limited')}</p>}
    {record.stats.count === 0 && <p role="status" className="notice">{t('noResults')}</p>}
    {record.stats.count > 0 && <section className="panel notes-panel" aria-labelledby="notes-title">
      <div className="section-heading">
        <div><h2 id="notes-title">{t('notes')}</h2><p>{t('scope')}</p></div>
        <label className="filter-label">{t('all')}
          <select value={filter} onChange={event => setFilter(event.target.value as 'all' | Sentiment)}>
            <option value="all">{t('all')} ({record.stats.count})</option>
            {sentiments.map(sentiment => <option value={sentiment} key={sentiment}>
              {t(sentimentTranslation(sentiment))} ({record.stats.counts[sentiment]})
            </option>)}
          </select>
        </label>
      </div>
      {notes.length ? <ul className="note-list">
        {notes.map(note => <li className="note-card" key={note.id}>
          <div className="note-heading">
            <div>
              <h3>{note.title || t('untitled')}</h3>
              {note.url && <button className="text-link" type="button" onClick={async () => {
                setLinkError(false);
                try { await api.openNote(note.url!); } catch { setLinkError(true); }
              }}>{t('openNote')} ↗</button>}
            </div>
            <span className={`sentiment sentiment-${note.sentiment}`}>{t(sentimentTranslation(note.sentiment))}</span>
          </div>
          {note.text && <p className="note-text">{note.text}</p>}
          {note.signals.length > 0 && <p className="muted">{t('signals')} · {note.signals.join('、')}</p>}
          {Object.keys(note.metrics).length > 0 && <p className="engagement">
            {(Object.entries(note.metrics) as [MetricName, number][]).map(([name, value]) => `${t(name)} ${number.format(value)}`).join(' · ')}
          </p>}
          {note.detailError && <p className="inline-warning">{t('detailUnavailable')} · {errorTranslation(t, note.detailError)}</p>}
          {note.commentScan && <div className="comment-scan">
            {note.commentScan.status !== 'sampled' ? <p className="muted">
              {t(note.commentScan.status === 'failed' ? 'commentFailed' : 'commentSkipped')} · {errorTranslation(t, note.commentScan.reason)}
            </p> : note.commentScan.items.length === 0 ? <p className="muted">
              {t('commentEmpty')}{note.commentScan.limited ? ` · ${t('commentLimited')}` : ''}
            </p> : <details>
              <summary>{t('commentSample')} ({number.format(note.commentScan.items.length)}){note.commentScan.limited ? ` · ${t('commentLimited')}` : ''}</summary>
              <ol>{note.commentScan.items.map((item, index) => <li key={`${index}-${item.text}`}>
                <p>{item.text}</p><small>{item.isReply ? `${t('commentReply')} · ` : ''}{t(sentimentTranslation(item.sentiment))}</small>
              </li>)}</ol>
            </details>}
          </div>}
        </li>)}
      </ul> : <p role="status" className="empty-state">{t('emptyFilter')}</p>}
    </section>}
    {linkError && <p role="alert" className="error-banner">{t('searchFailed')}</p>}
  </>;
}

export default function App({ api = window.xhsMonitor }: { api?: MonitorApi }) {
  const isZh = !navigator.language.toLowerCase().startsWith('en');
  const language = isZh ? 'zh-CN' : 'en';
  const t: Translate = useCallback(key => (isZh ? zh.messages : en.messages)[key] ?? zh.messages[key], [isZh]);
  const [keyword, setKeyword] = useState('');
  const [history, setHistory] = useState<CaptureSummary[]>([]);
  const [current, setCurrent] = useState<CaptureRecord | null>(null);
  const [selected, setSelected] = useState<CaptureRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [error, setError] = useState<ErrorCode | ''>('');
  const [historyError, setHistoryError] = useState(false);
  const [auto, setAuto] = useState(false);
  const live = useRef(false);
  const mounted = useRef(true);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await api.listHistory();
      if (!mounted.current) return;
      setHistory(rows);
      setHistoryError(false);
    } catch { if (mounted.current) setHistoryError(true); }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    void loadHistory();
    return () => {
      mounted.current = false;
      if (live.current) void api.cancel();
    };
  }, [api, loadHistory]);

  const run = useCallback(async (value: string) => {
    if (live.current) return;
    live.current = true;
    setPending(true);
    setError('');
    try {
      const response = await api.search(value);
      if (!mounted.current) return;
      if (response.ok) {
        setCurrent(response.record);
        setSelected(null);
        await loadHistory();
      } else setError(response.error);
    } catch { if (mounted.current) setError('searchFailed'); }
    finally {
      live.current = false;
      if (mounted.current) setPending(false);
    }
  }, [api, loadHistory]);

  useEffect(() => {
    if (!auto || !current || selected) return;
    const interval = 30 * 60 * 1000;
    let lastAttempt = Date.now();
    const refresh = () => {
      if (live.current || document.visibilityState !== 'visible' || Date.now() - lastAttempt < interval) return;
      lastAttempt = Date.now();
      void run(current.keyword);
    };
    const timer = window.setInterval(refresh, interval);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [auto, current, run, selected]);

  async function openHistory(id: string) {
    setOpeningId(id);
    setHistoryError(false);
    try {
      const record = await api.getHistory(id);
      if (record) {
        setSelected(record);
        setError('');
      } else setHistoryError(true);
    } catch { setHistoryError(true); }
    finally { setOpeningId(''); }
  }

  const displayed = current?.keyword === keyword.trim().normalize('NFKC') ? current : null;
  const trend = displayed ? history.filter(row => row.keyword === displayed.keyword).slice(0, 8) : [];
  const date = new Intl.DateTimeFormat(language, {
    timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const number = new Intl.NumberFormat(language);
  const ratio = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-mark"><img src={iconUrl} alt="" /></div>
      <div className="brand-copy"><p className="eyebrow">{t('eyebrow')}</p><h1>{t('title')}</h1><p>{t('intro')}</p></div>
      {selected && <button className="secondary-button header-back" type="button" onClick={() => setSelected(null)}>← {t('back')}</button>}
    </header>

    <main>
      {selected ? <CaptureDetail key={selected.id} record={selected} api={api} t={t} language={language} historical /> : <>
        <section className="panel capture-panel" aria-labelledby="capture-form-title">
          <div className="source-row"><span className="source-chip"><span className="source-dot" />{t('source')}</span><span className="secure-label">Desktop · OpenCLI 2.0.3</span></div>
          <p className="source-info" id="capture-form-title">{t('sourceInfo')}</p>
          <form className="capture-form" onSubmit={event => { event.preventDefault(); void run(keyword); }}>
            <label className="keyword-field">{t('keyword')}
              <input value={keyword} maxLength={80} required disabled={pending} placeholder={t('placeholder')}
                onChange={event => { setKeyword(event.target.value); setAuto(false); setError(''); }} />
            </label>
            <button className="primary-button" type="submit" disabled={pending || !keyword.trim()}>{pending ? t('busy') : t('scanAction')}</button>
            {pending && <button className="secondary-button" type="button" onClick={() => void api.cancel()}>{t('cancel')}</button>}
          </form>
          <div className="capture-status">
            <div role="status" className="status-text">{pending ? t('busy') : auto && displayed && !error ? t('autoActive') : displayed && !error ? `${t('scanComplete')} · ${t('sample')} ${displayed.stats.count}` : ''}</div>
            {displayed && <label className="auto-option"><input type="checkbox" checked={auto} disabled={pending} onChange={event => setAuto(event.target.checked)} />{t('auto')}</label>}
          </div>
          {error && <div className="error-banner" role="alert"><span>{t(error)}{(error === 'scanCanceled' || error === 'collectorBusy') && current ? ` ${t('previousCapture')}` : ''}</span>
            {!pending && <button className="text-link" type="button" onClick={() => void run(keyword)}>{t('retry')}</button>}</div>}
        </section>

        {displayed && <CaptureDetail key={displayed.id} record={displayed} api={api} t={t} language={language} />}

        {trend.length > 0 && <section className="panel trend-panel" aria-labelledby="trend-title">
          <div className="section-heading"><div><h2 id="trend-title">{t('trends')}</h2><p>{t('trendHelp')}</p></div></div>
          <div className="table-scroll"><table><thead><tr><th scope="col">{t('time')}</th><th scope="col">{t('sample')}</th><th scope="col">{t('ratio')}</th><th scope="col">{t('activity')}</th></tr></thead>
            <tbody>{trend.map(row => <tr key={row.id}><td><time dateTime={row.capturedAt}>{date.format(new Date(row.capturedAt))}</time></td><td>{number.format(row.stats.count)}</td><td>{row.stats.negativeRatio === null ? '—' : ratio.format(row.stats.negativeRatio)}</td><td>{row.stats.interactions === null ? '—' : number.format(row.stats.interactions)}</td></tr>)}</tbody>
          </table></div>
        </section>}

        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="section-heading"><div><h2 id="history-title">{t('history')}</h2><p>{t('historyHelp')}</p></div><span className="record-count">{history.length} / 80</span></div>
          {historyError && <p role="alert" className="error-banner">{t('storageFailed')}</p>}
          {history.length ? <div className="table-scroll"><table className="history-table"><thead><tr><th scope="col">{t('keyword')}</th><th scope="col">{t('time')}</th><th scope="col">{t('sample')}</th><th scope="col">{t('ratio')}</th><th scope="col"><span className="sr-only">{t('viewDetail')}</span></th></tr></thead>
            <tbody>{history.map(row => <tr key={row.id}>
              <td className="history-keyword">{row.keyword}</td><td><time dateTime={row.capturedAt}>{date.format(new Date(row.capturedAt))} UTC+8</time></td><td>{number.format(row.stats.count)}</td><td>{row.stats.negativeRatio === null ? '—' : ratio.format(row.stats.negativeRatio)}</td>
              <td><button className="detail-button" type="button" disabled={Boolean(openingId)} aria-label={`${row.keyword} · ${t('viewDetail')}`} onClick={() => void openHistory(row.id)}>{openingId === row.id ? '…' : `${t('viewDetail')} →`}</button></td>
            </tr>)}</tbody>
          </table></div> : !historyError && <p className="empty-state">{t('emptyHistory')}</p>}
        </section>
      </>}
    </main>
    <footer>OPENCLI · TypeScript · React</footer>
  </div>;
}
