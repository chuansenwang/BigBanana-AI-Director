import { Innertube } from 'youtubei.js';

const json = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const toWarningMessage = (error) => {
  const message = String(error?.message || error || '').trim();
  if (!message) return '未能获取视频字幕。';
  return `未能获取视频字幕：${message}`;
};

const parseYouTubeUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('请输入有效的 YouTube 链接。');
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname)) {
    throw new Error('当前仅支持 YouTube / YouTube Shorts 链接。');
  }

  if (hostname === 'youtu.be') {
    const videoId = url.pathname.replace(/^\//, '').trim();
    if (!videoId) throw new Error('无法从 youtu.be 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (url.pathname.startsWith('/shorts/')) {
    const videoId = url.pathname.split('/').filter(Boolean)[1] || '';
    if (!videoId) throw new Error('无法从 Shorts 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (url.pathname === '/watch') {
    const videoId = String(url.searchParams.get('v') || '').trim();
    if (!videoId) throw new Error('无法从 watch 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error('当前仅支持 youtube.com/watch、youtube.com/shorts 和 youtu.be 链接。');
};

const pickThumbnailUrl = (thumbnails) => {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return undefined;
  return [...thumbnails]
    .sort((a, b) => ((b?.width || 0) * (b?.height || 0)) - ((a?.width || 0) * (a?.height || 0)))[0]?.url;
};

const extractTranscriptSegments = (transcriptInfo) => {
  const rawSegments = transcriptInfo?.transcript?.content?.body?.initial_segments || [];
  return rawSegments
    .map((segment) => {
      const text = segment?.snippet?.toString?.() || segment?.snippet?.text || '';
      const startMs = Number.parseInt(segment?.start_ms || '0', 10);
      const endMs = Number.parseInt(segment?.end_ms || String(startMs), 10);
      const startTimeText = segment?.start_time_text?.toString?.() || '';

      if (!text.trim()) return null;
      return {
        startMs: Number.isFinite(startMs) ? startMs : 0,
        endMs: Number.isFinite(endMs) ? endMs : startMs,
        startTimeText: String(startTimeText || '').trim(),
        text: String(text).trim(),
      };
    })
    .filter(Boolean);
};

const buildMetadata = (parsedUrl, info, transcriptInfo, transcriptStatus) => ({
  videoId: parsedUrl.videoId,
  canonicalUrl: parsedUrl.canonicalUrl,
  title: String(info?.basic_info?.title || '').trim() || parsedUrl.videoId,
  description: String(info?.basic_info?.short_description || '').trim(),
  channelTitle: info?.basic_info?.channel?.name || info?.basic_info?.author || undefined,
  channelId: info?.basic_info?.channel?.id || info?.basic_info?.channel_id || undefined,
  thumbnailUrl: pickThumbnailUrl(info?.basic_info?.thumbnail),
  durationSeconds: info?.basic_info?.duration,
  viewCount: info?.basic_info?.view_count,
  likeCount: info?.basic_info?.like_count,
  transcriptStatus,
  transcriptLanguage: transcriptInfo?.selectedLanguage || undefined,
});

export const createYouTubeBenchmarkHandler = () => async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/api/youtube-benchmark')) return false;

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (requestUrl.pathname === '/api/youtube-benchmark/healthz' && req.method === 'GET') {
    json(res, 200, { ok: true, service: 'youtube-benchmark-proxy' });
    return true;
  }

  if (requestUrl.pathname !== '/api/youtube-benchmark/intake' || req.method !== 'GET') {
    json(res, 404, { ok: false, error: 'Not found.' });
    return true;
  }

  try {
    const sourceUrl = String(requestUrl.searchParams.get('url') || '').trim();
    if (!sourceUrl) {
      json(res, 400, { ok: false, error: '缺少 url 参数。' });
      return true;
    }

    const parsedUrl = parseYouTubeUrl(sourceUrl);
    const yt = await Innertube.create();
    const info = await yt.getBasicInfo(parsedUrl.videoId);

    let transcriptInfo = null;
    let transcriptStatus = 'unavailable';
    const warnings = [];

    try {
      transcriptInfo = await info.getTranscript();
      transcriptStatus = 'available';
    } catch (error) {
      transcriptStatus = 'error';
      warnings.push(toWarningMessage(error));
    }

    const metadata = buildMetadata(parsedUrl, info, transcriptInfo, transcriptStatus);
    const transcriptSegments = transcriptInfo ? extractTranscriptSegments(transcriptInfo) : [];
    if (!transcriptSegments.length) {
      warnings.push('当前视频没有返回可用字幕时间轴，后续会退回为元数据层分析。');
    }

    json(res, 200, {
      ok: true,
      data: {
        ...metadata,
        transcriptSegments,
        warnings: Array.from(new Set(warnings.filter(Boolean))),
      },
    });
    return true;
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: error?.message || 'YouTube 数据抓取失败。',
    });
    return true;
  }
};
