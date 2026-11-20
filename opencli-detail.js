import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const entry = pathToFileURL(require.resolve('@jackwener/opencli'));
const [{ BrowserBridge }, { setDaemonCommandTimeoutSeconds }, { NOTE_EXTRACT_JS },
  { buildCommentsExtractJs, normalizeCommentRows, assertCommentsLoaded }, { buildNoteUrl }] = await Promise.all([
  import(new URL('./browser/bridge.js', entry)),
  import(new URL('./browser/daemon-client.js', entry)),
  import(new URL('../../clis/xiaohongshu/note.js', entry)),
  import(new URL('../../clis/xiaohongshu/comments.js', entry)),
  import(new URL('../../clis/xiaohongshu/note-helpers.js', entry)),
]);

// 分批滚动评论容器，避免单次 Bridge 执行超时。
async function loadCandidates(page) {
  let count = 0;
  let stalls = 0;
  for (let batch = 0; batch < 6 && count < 75 && stalls < 2; batch++) {
    const next = await page.evaluate(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const scroller = document.querySelector('.note-scroller, .container');
      for (let round = 0; round < 8; round++) {
        if (document.querySelectorAll('.parent-comment').length >= 75) break;
        if (scroller) scroller.scrollTo(0, scroller.scrollHeight);
        const rows = document.querySelectorAll('.parent-comment');
        rows[rows.length - 1]?.scrollIntoView({ block: 'end' });
        window.scrollTo(0, document.body.scrollHeight);
        await wait(500);
      }
      return document.querySelectorAll('.parent-comment').length;
    })()`);
    stalls = next > count ? 0 : stalls + 1;
    count = next;
  }
  return count;
}

// 在同一个 Bridge 页面读取笔记和有界评论候选，只导航一次。
async function readDetail(rawUrl) {
  const url = buildNoteUrl(rawUrl, { commandName: 'xhs-monitor detail' });
  setDaemonCommandTimeoutSeconds(150);
  const bridge = new BrowserBridge();
  const page = await bridge.connect({ session: 'site:xiaohongshu', siteSession: 'persistent', surface: 'adapter', windowMode: 'foreground' });
  try {
    await page.goto(url);
    await page.wait({ time: 2 });
    const note = await page.evaluate(NOTE_EXTRACT_JS);
    if (note?.securityBlock) throw Object.assign(new Error('blocked'), { code: 'SECURITY_BLOCK' });
    if (note?.loginWall) throw Object.assign(new Error('login'), { code: 'AUTH_REQUIRED' });
    if (note?.notFound || (!note?.author && !note?.title)) throw Object.assign(new Error('missing'), { code: 'EMPTY_RESULT' });
    let comments = [];
    let commentTotal = null;
    let commentError = null;
    try {
      const loaded = await loadCandidates(page);
      if (!loaded && !/^(?:0|评论)$/.test(String(note.comments ?? ''))) {
        throw Object.assign(new Error('comments not loaded'), { code: 'COMMENTS_NOT_LOADED' });
      }
      const data = await page.evaluate(buildCommentsExtractJs(true, 1));
      if (data?.securityBlock) throw Object.assign(new Error('blocked'), { code: 'SECURITY_BLOCK' });
      if (data?.loginWall) throw Object.assign(new Error('login'), { code: 'AUTH_REQUIRED' });
      comments = normalizeCommentRows(data?.results, 'xhs-monitor detail');
      assertCommentsLoaded(data, comments.length, 'xhs-monitor detail');
      commentTotal = data?.commentTotal ?? null;
    } catch (error) { commentError = error?.code ?? 'COMMENTS_NOT_LOADED'; }
    return { note, comments, commentTotal, commentError };
  } finally { await bridge.close(); }
}

try {
  process.stdout.write(JSON.stringify(await readDetail(process.argv[2] ?? '')));
} catch (error) {
  process.stderr.write(JSON.stringify({ code: error?.code ?? 'COMMAND_EXEC' }));
  process.exitCode = 1;
}
