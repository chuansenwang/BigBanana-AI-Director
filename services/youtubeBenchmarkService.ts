import {
  BenchmarkAnalysisMode,
  BenchmarkFallbackReason,
  BenchmarkMetrics,
  BenchmarkShotResult,
  BenchmarkSourceMeta,
  BenchmarkTranscriptStatus,
} from '../types';
import { ApiKeyError, chatCompletion, getApiKeyResolutionContext, parseJsonWithRecovery } from './ai';

const DEFAULT_YOUTUBE_BENCHMARK_ENDPOINT = '/api/youtube-benchmark/intake';
const configuredEndpoint = String(import.meta.env.VITE_YOUTUBE_BENCHMARK_ENDPOINT ?? '').trim();
const youtubeBenchmarkEndpoint = configuredEndpoint || DEFAULT_YOUTUBE_BENCHMARK_ENDPOINT;

export interface YouTubeTranscriptSegment {
  startMs: number;
  endMs: number;
  startTimeText: string;
  text: string;
}

export interface YouTubeBenchmarkIntake {
  videoId: string;
  canonicalUrl: string;
  title: string;
  description: string;
  channelTitle?: string;
  channelId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  transcriptStatus: BenchmarkTranscriptStatus;
  transcriptLanguage?: string;
  transcriptSegments: YouTubeTranscriptSegment[];
  warnings: string[];
}

interface IntakeEnvelope {
  ok?: boolean;
  data?: YouTubeBenchmarkIntake;
  error?: string;
}

interface LlmBenchmarkResult {
  title?: string;
  metrics?: Partial<BenchmarkMetrics>;
  shots?: Array<Partial<BenchmarkShotResult>>;
  warnings?: string[];
}

export interface BenchmarkDeconstructionResult {
  title: string;
  metrics: BenchmarkMetrics;
  shots: BenchmarkShotResult[];
  sourceMeta: BenchmarkSourceMeta;
  transcriptStatus: BenchmarkTranscriptStatus;
  analysisMode: BenchmarkAnalysisMode;
  fallbackReason?: BenchmarkFallbackReason;
  analysisBasis: string;
  warnings: string[];
}

const buildIntakeUrl = (sourceUrl: string): string => {
  const separator = youtubeBenchmarkEndpoint.includes('?') ? '&' : '?';
  return `${youtubeBenchmarkEndpoint}${separator}url=${encodeURIComponent(sourceUrl)}`;
};

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const compactNumber = (value?: number): string => {
  if (!Number.isFinite(value)) return '未知';
  if ((value || 0) >= 100000000) {
    return `${((value || 0) / 100000000).toFixed((value || 0) >= 1000000000 ? 0 : 1)}亿`;
  }
  if ((value || 0) >= 10000) {
    return `${((value || 0) / 10000).toFixed((value || 0) >= 100000 ? 0 : 1)}万`;
  }
  return new Intl.NumberFormat('zh-CN').format(value || 0);
};

const formatDuration = (seconds?: number): string => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '未知';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (!mins) return `${secs}秒`;
  return `${mins}分${secs.toString().padStart(2, '0')}秒`;
};

const formatRange = (startMs: number, endMs: number): string => {
  const format = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  return `${format(startMs)}-${format(endMs)}`;
};

const dedupeWarnings = (warnings: Array<string | undefined>): string[] =>
  Array.from(new Set(warnings.map((item) => String(item || '').trim()).filter(Boolean)));

const clipText = (value: string, maxLength: number): string => {
  const trimmed = String(value || '').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
};

const buildTranscriptExcerpt = (segments: YouTubeTranscriptSegment[]): string => {
  const text = segments
    .slice(0, 16)
    .map((segment) => `[${segment.startTimeText}] ${segment.text}`)
    .join('\n');
  return clipText(text, 4000);
};

const extractHashtags = (...texts: Array<string | undefined>): string[] => {
  const tags = texts.flatMap((text) => String(text || '').match(/#[^\s#]+/g) || []);
  return Array.from(new Set(tags.map((tag) => tag.trim())));
};

const stripHashtags = (value: string): string => String(value || '').replace(/#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim();

const buildAnalysisBasis = (intake: YouTubeBenchmarkIntake): string => {
  const basis = ['标题', '描述', '标签', '频道', '播放量', '时长'];
  if (intake.likeCount) basis.push('点赞量');
  if (intake.transcriptSegments.length) basis.push('字幕时间轴');
  return `基于${basis.join(' / ')}生成`;
};

const buildTopicSummary = (intake: YouTubeBenchmarkIntake): string => {
  const hashtags = extractHashtags(intake.title, intake.description);
  const titleCore = clipText(stripHashtags(intake.title), 80) || intake.title;
  if (hashtags.length > 0) {
    return `主题集中在 ${hashtags.slice(0, 4).join(' / ')}，标题核心为“${titleCore}”`;
  }
  return `当前可确认的公开主题是“${titleCore}”`;
};

const inferAudience = (intake: YouTubeBenchmarkIntake): string => {
  const hashtags = extractHashtags(intake.title, intake.description);
  if (hashtags.length > 0) {
    return `更偏向关注 ${hashtags.slice(0, 4).join('、')} 的兴趣圈层用户`;
  }
  if (intake.channelTitle) {
    return `更可能触达 ${intake.channelTitle} 频道现有受众及相近兴趣用户`;
  }
  return '目标受众需结合更多样本进一步判断';
};

const buildPopularitySignal = (intake: YouTubeBenchmarkIntake): string => {
  const parts = [`播放量 ${compactNumber(intake.viewCount)}`];
  if (intake.likeCount) parts.push(`点赞 ${compactNumber(intake.likeCount)}`);
  if (intake.durationSeconds) parts.push(`时长 ${formatDuration(intake.durationSeconds)}`);
  return parts.join(' / ');
};

const inferViralFactors = (intake: YouTubeBenchmarkIntake): string => {
  const factors: string[] = [];
  const hashtags = extractHashtags(intake.title, intake.description);
  if (/[?？]/.test(intake.title)) factors.push('标题采用提问/悬念钩子');
  if (hashtags.length > 0) factors.push(`绑定话题标签 ${hashtags.slice(0, 4).join('、')}`);
  if ((intake.durationSeconds || 0) <= 60) factors.push('短时长内容更容易被快速消费和重复观看');
  if ((intake.viewCount || 0) >= 1000000) factors.push('已有较强的公开传播验证');
  if (!factors.length) factors.push('当前仅能从公开元数据确认基础传播信号');
  return factors.join('；');
};

const inferHomogenization = (intake: YouTubeBenchmarkIntake): string => {
  const hashtags = extractHashtags(intake.title, intake.description);
  if (hashtags.length >= 3) {
    return '依赖热点标签和现成兴趣圈层分发，同题材内容的同质化风险偏高';
  }
  return '从公开元数据看，差异化程度仍需结合更多同赛道样本确认';
};

const isApiKeyMissingError = (error: unknown): boolean => {
  if (error instanceof ApiKeyError) return true;
  const message = toErrorMessage(error, '');
  return message.includes('API Key is missing') || message.includes('API Key 缺失');
};

const buildMissingApiKeyWarning = (): string => {
  const context = getApiKeyResolutionContext('chat');
  const modelLabel = context.modelName || context.modelId || '当前激活对话模型';
  const providerLabel = context.providerName || context.providerId;
  return providerLabel
    ? `当前激活的对话模型「${modelLabel}」（提供商：${providerLabel}）缺少可用 API Key，当前展示为降级分析结果。可在“模型配置”中补充后重试。`
    : `当前激活的对话模型「${modelLabel}」缺少可用 API Key，当前展示为降级分析结果。可在“模型配置”中补充后重试。`;
};

const buildFallbackMetrics = (intake: YouTubeBenchmarkIntake): BenchmarkMetrics => {
  const transcriptPreview = buildTranscriptExcerpt(intake.transcriptSegments);
  const firstSegment = intake.transcriptSegments[0]?.text || intake.description || intake.title;
  const hashtags = extractHashtags(intake.title, intake.description);
  const analysisBasis = buildAnalysisBasis(intake);
  const transcriptStatusText =
    intake.transcriptStatus === 'available'
      ? `字幕可用（${intake.transcriptLanguage || '自动语言'}）`
      : intake.transcriptStatus === 'error'
        ? '字幕抓取失败，以下分析仅基于公开元数据'
        : '字幕不可用，以下分析仅基于公开元数据';

  return {
    t0_playCount: compactNumber(intake.viewCount),
    t0_storyScript: clipText(
      transcriptPreview || `${buildTopicSummary(intake)}；描述/标签补充：${clipText(intake.description || hashtags.join(' '), 120) || '暂无更多公开文本。'}`,
      240,
    ),
    t0_viralFactors: inferViralFactors(intake),
    t0_homogenization: intake.transcriptStatus === 'available' ? '需结合完整视频与赛道样本进一步判断' : inferHomogenization(intake),

    t1_first3sContent: clipText(
      intake.transcriptSegments.length ? firstSegment : `当前可确认的主钩子来自标题/标签：${buildTopicSummary(intake)}`,
      120,
    ),
    t1_first3sVisuals: intake.transcriptSegments.length ? '可从字幕文本侧推情节，但画面构图仍需看视频确认' : '当前只能确认封面/标题主题，具体前 3 秒画面仍需看视频确认',
    t1_duration: formatDuration(intake.durationSeconds),
    t1_shotCount: intake.transcriptSegments.length ? `${intake.transcriptSegments.length} 个字幕片段` : '暂无可用镜头拆解',
    t1_shotDuration: intake.transcriptSegments.length && intake.durationSeconds
      ? `平均 ${(intake.durationSeconds / intake.transcriptSegments.length).toFixed(1)} 秒/片段`
      : '未知',
    t1_pacing: intake.transcriptSegments.length >= 12
      ? '字幕切分较密，节奏偏快'
      : (intake.durationSeconds || 0) <= 60
        ? '短视频时长较短，通常需要在前几秒完成钩子建立'
        : '仅凭当前数据无法稳定判断',
    t1_mainSubject: buildTopicSummary(intake),
    t1_twistCount: '待结合完整视频判断',

    t2_music: '无法仅凭当前字幕/元数据确认',
    t2_soundEffects: '无法仅凭当前字幕/元数据确认',
    t2_voiceOver: intake.transcriptSegments.length ? '存在可用字幕内容' : '暂无可用字幕内容',
    t2_artStyle: '无法仅凭当前字幕/元数据确认',
    t2_visualBrightness: '无法仅凭当前字幕/元数据确认',
    t2_motionMagnitude: '无法仅凭当前字幕/元数据确认',
    t2_expressionLiveliness: '无法仅凭当前字幕/元数据确认',
    t2_clarity: intake.thumbnailUrl ? '存在公开视频封面，清晰度待视频级确认' : '未知',
    t2_interactionGuide: /[?？]/.test(intake.title) ? '标题已形成提问式互动钩子，评论区更容易围绕答案/猜测展开' : '互动设计需结合正文字幕、口播与评论区进一步判断',
    t2_errors: '当前未检测技术错误，但分析维度受限于数据来源',
    t2_demographics: inferAudience(intake),
    t2_transitions: '无法仅凭当前字幕/元数据确认',

    t3_subjectiveInterest: intake.transcriptSegments.length ? '已有可分析文本，可继续做内容级对标' : `当前更适合作为元数据样本参考；传播信号：${buildPopularitySignal(intake)}`,
    t3_publishTime: '当前未接入发布时间数据',
    t3_customMetrics: `${transcriptStatusText}；${analysisBasis}；频道：${intake.channelTitle || '未知'}；视频 ID：${intake.videoId}`,
  };
};

const normalizeMetrics = (
  intake: YouTubeBenchmarkIntake,
  partial: Partial<BenchmarkMetrics> | undefined,
  shotCount: number
): BenchmarkMetrics => {
  const fallback = buildFallbackMetrics(intake);
  const merged: BenchmarkMetrics = {
    ...fallback,
    ...(partial || {}),
  };

  if (shotCount > 0) {
    merged.t1_shotCount = partial?.t1_shotCount?.trim() || `${shotCount} 镜头`; 
    if (intake.durationSeconds && !partial?.t1_shotDuration?.trim()) {
      merged.t1_shotDuration = `平均 ${(intake.durationSeconds / shotCount).toFixed(1)} 秒/镜头`;
    }
  }

  if (!partial?.t1_duration?.trim()) {
    merged.t1_duration = formatDuration(intake.durationSeconds);
  }

  if (!partial?.t0_playCount?.trim()) {
    merged.t0_playCount = compactNumber(intake.viewCount);
  }

  return merged;
};

const normalizeShot = (shot: Partial<BenchmarkShotResult>, index: number, fallback?: YouTubeTranscriptSegment): BenchmarkShotResult => ({
  id: Number.isFinite(shot.id) ? Number(shot.id) : index + 1,
  time: String(shot.time || (fallback ? formatRange(fallback.startMs, fallback.endMs) : '')).trim() || `镜头 ${index + 1}`,
  desc: clipText(String(shot.desc || fallback?.text || '未提供镜头描述').trim(), 600),
  videoPrompt: clipText(String(shot.videoPrompt || '').trim(), 240) || undefined,
  firstFramePrompt: clipText(String(shot.firstFramePrompt || '').trim(), 240) || undefined,
  lastFramePrompt: clipText(String(shot.lastFramePrompt || '').trim(), 240) || undefined,
  adjustment: clipText(String(shot.adjustment || '').trim(), 160) || undefined,
});

const normalizeShots = (intake: YouTubeBenchmarkIntake, shots: Array<Partial<BenchmarkShotResult>> | undefined): BenchmarkShotResult[] => {
  if (!Array.isArray(shots) || shots.length === 0) return [];
  return shots
    .slice(0, 24)
    .map((shot, index) => normalizeShot(shot, index, intake.transcriptSegments[index]))
    .filter((shot) => Boolean(shot.desc));
};

const buildPrompt = (intake: YouTubeBenchmarkIntake): string => {
  const transcriptPayload = intake.transcriptSegments.slice(0, 48).map((segment) => ({
    startMs: segment.startMs,
    endMs: segment.endMs,
    startTimeText: segment.startTimeText,
    text: segment.text,
  }));

  return [
    '你是短视频对标分析助手。',
    '请基于我提供的 YouTube Shorts 元数据和字幕时间轴，输出严格 JSON。',
    '必须遵守：',
    '1. 只能根据输入数据判断，禁止编造不存在的剧情、镜头、音乐、音效或画面细节。',
    '2. 对无法确认的字段，填写“无法仅凭当前数据确认”。',
    '3. 如果字幕不足以做分镜拆解，shots 返回空数组。',
    '4. shots 最多 20 条，按时间顺序输出。',
    '5. 每条 shot 仅输出这些字段：id, time, desc, videoPrompt, firstFramePrompt, lastFramePrompt, adjustment。',
    '6. metrics 中所有字段都必须存在，且值必须是字符串。',
    '7. 不要输出 markdown，不要输出解释。',
    '',
    '输出 JSON 结构：',
    JSON.stringify({
      title: intake.title,
      warnings: ['string'],
      metrics: buildFallbackMetrics(intake),
      shots: [
        {
          id: 1,
          time: '00:00-00:03',
          desc: '基于字幕/元数据可验证的镜头描述',
          videoPrompt: '如果无法判断则写“无法仅凭当前数据确认”',
          firstFramePrompt: '如果无法判断则写“无法仅凭当前数据确认”',
          lastFramePrompt: '如果无法判断则写“无法仅凭当前数据确认”',
          adjustment: '可留空字符串',
        },
      ],
    }, null, 2),
    '',
    '输入数据：',
    JSON.stringify({
      title: intake.title,
      description: intake.description,
      channelTitle: intake.channelTitle,
      durationSeconds: intake.durationSeconds,
      viewCount: intake.viewCount,
      likeCount: intake.likeCount,
      transcriptStatus: intake.transcriptStatus,
      transcriptLanguage: intake.transcriptLanguage,
      transcriptSegments: transcriptPayload,
      warnings: intake.warnings,
    }, null, 2),
  ].join('\n');
};

export const fetchYouTubeBenchmarkIntake = async (sourceUrl: string): Promise<YouTubeBenchmarkIntake> => {
  const response = await fetch(buildIntakeUrl(sourceUrl), {
    method: 'GET',
    credentials: 'same-origin',
  });

  const payload = await response.json() as IntakeEnvelope;
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || `YouTube 数据获取失败（HTTP ${response.status}）`);
  }

  return {
    ...payload.data,
    warnings: payload.data.warnings || [],
    transcriptSegments: payload.data.transcriptSegments || [],
  };
};

export const buildBenchmarkSourceMeta = (intake: YouTubeBenchmarkIntake): BenchmarkSourceMeta => ({
  videoId: intake.videoId,
  canonicalUrl: intake.canonicalUrl,
  channelTitle: intake.channelTitle,
  channelId: intake.channelId,
  thumbnailUrl: intake.thumbnailUrl,
  durationSeconds: intake.durationSeconds,
  viewCount: intake.viewCount,
  likeCount: intake.likeCount,
  transcriptLanguage: intake.transcriptLanguage,
});

export const analyzeYouTubeBenchmark = async (
  intake: YouTubeBenchmarkIntake
): Promise<BenchmarkDeconstructionResult> => {
  const baseWarnings = [...(intake.warnings || [])];
  const sourceMeta = buildBenchmarkSourceMeta(intake);
  const analysisBasis = buildAnalysisBasis(intake);
  const hasTranscript = intake.transcriptSegments.length > 0;

  if (!intake.transcriptSegments.length && !intake.description.trim()) {
    return {
      title: intake.title,
      metrics: buildFallbackMetrics(intake),
      shots: [],
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: 'metadata',
      fallbackReason: 'no_transcript',
      analysisBasis,
      warnings: dedupeWarnings([
        ...baseWarnings,
        '当前视频没有可用字幕或描述，已退回为元数据层分析。',
      ]),
    };
  }

  try {
    const raw = await chatCompletion(buildPrompt(intake), undefined, 0.3, 4096, 'json_object', 300000);
    const parsed = parseJsonWithRecovery<LlmBenchmarkResult>(raw, {});
    const shots = normalizeShots(intake, parsed.shots);

    return {
      title: String(parsed.title || intake.title).trim() || intake.title,
      metrics: normalizeMetrics(intake, parsed.metrics, shots.length),
      shots,
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: hasTranscript ? 'full' : 'metadata',
      fallbackReason: hasTranscript ? undefined : 'no_transcript',
      analysisBasis,
      warnings: dedupeWarnings([...(parsed.warnings || []), ...baseWarnings]),
    };
  } catch (error) {
    const fallbackReason: BenchmarkFallbackReason = isApiKeyMissingError(error)
      ? 'missing_api_key'
      : !hasTranscript
        ? 'no_transcript'
        : 'ai_failed';

    const fallbackWarning = fallbackReason === 'missing_api_key'
      ? buildMissingApiKeyWarning()
      : fallbackReason === 'no_transcript'
        ? '当前视频没有可用字幕，已退回为元数据层分析。'
        : `AI 结构化分析失败，已回退为降级结果：${toErrorMessage(error, '未知错误')}`;

    return {
      title: intake.title,
      metrics: buildFallbackMetrics(intake),
      shots: [],
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: 'metadata',
      fallbackReason,
      analysisBasis,
      warnings: dedupeWarnings([
        ...baseWarnings,
        fallbackWarning,
      ]),
    };
  }
};
