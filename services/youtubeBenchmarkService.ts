import {
  ArtifactStorageUserConfig,
  BenchmarkDownloadArtifact,
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
  breakdownReport?: string;
  metrics?: Partial<BenchmarkMetrics>;
  shots?: Array<Partial<BenchmarkShotResult>>;
  warnings?: string[];
}

export interface BenchmarkDeconstructionResult {
  title: string;
  breakdownReport: string;
  metrics: BenchmarkMetrics;
  shots: BenchmarkShotResult[];
  sourceMeta: BenchmarkSourceMeta;
  transcriptStatus: BenchmarkTranscriptStatus;
  analysisMode: BenchmarkAnalysisMode;
  fallbackReason?: BenchmarkFallbackReason;
  analysisBasis: string;
  warnings: string[];
}

export interface YouTubeBenchmarkDownloadRequest {
  url: string;
  videoId: string;
  artifactStorageConfig: ArtifactStorageUserConfig;
}

interface BenchmarkDownloadStreamEventBase {
  seq: number;
  at: number;
}

export type BenchmarkDownloadStreamEvent =
  | (BenchmarkDownloadStreamEventBase & { type: 'status'; artifact: BenchmarkDownloadArtifact })
  | (BenchmarkDownloadStreamEventBase & { type: 'progress'; artifact: BenchmarkDownloadArtifact })
  | (BenchmarkDownloadStreamEventBase & { type: 'done'; artifact: BenchmarkDownloadArtifact })
  | (BenchmarkDownloadStreamEventBase & { type: 'error'; message: string; artifact?: BenchmarkDownloadArtifact });

interface DownloadYouTubeBenchmarkVideoOptions {
  onEvent?: (event: BenchmarkDownloadStreamEvent) => void;
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

const buildTranscriptHighlights = (segments: YouTubeTranscriptSegment[], maxCount: number): string[] => {
  return segments
    .slice(0, maxCount)
    .map((segment) => `${segment.startTimeText} ${clipText(segment.text, 80)}`)
    .filter(Boolean);
};

const buildShotTableRows = (shots: BenchmarkShotResult[], transcriptSegments: YouTubeTranscriptSegment[]): string[] => {
  const sourceShots = shots.length > 0
    ? shots.slice(0, 12).map((shot, index) => ({
        id: shot.id,
        time: shot.time || `镜头 ${index + 1}`,
        scene: '无法仅凭当前数据确认',
        shotSize: '无法仅凭当前数据确认',
        camera: '无法仅凭当前数据确认',
        content: clipText(shot.desc || '无法仅凭当前数据确认', 120),
        dialogue: clipText(transcriptSegments[index]?.text || '无法仅凭当前数据确认', 60),
        sound: transcriptSegments[index]?.text ? '存在字幕/口播文本，具体 SFX/BGM 无法仅凭当前数据确认' : '无法仅凭当前数据确认',
        effects: '无法仅凭当前数据确认',
      }))
    : transcriptSegments.slice(0, 12).map((segment, index) => ({
        id: index + 1,
        time: formatRange(segment.startMs, segment.endMs),
        scene: '无法仅凭当前数据确认',
        shotSize: '无法仅凭当前数据确认',
        camera: '无法仅凭当前数据确认',
        content: clipText(segment.text || '无法仅凭当前数据确认', 120),
        dialogue: clipText(segment.text || '无法仅凭当前数据确认', 60),
        sound: '存在字幕/口播文本，具体 SFX/BGM 无法仅凭当前数据确认',
        effects: '无法仅凭当前数据确认',
      }));

  if (sourceShots.length === 0) {
    return [
      '| 1 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 当前仅有标题/描述/元数据，暂无逐切画面依据 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 |',
    ];
  }

  return sourceShots.map((shot) => `| ${shot.id} | ${shot.time} | ${shot.scene} | ${shot.shotSize} | ${shot.camera} | ${shot.content} | ${shot.dialogue} | ${shot.sound} | ${shot.effects} |`);
};

const buildFallbackBreakdownReport = (
  intake: YouTubeBenchmarkIntake,
  metrics: BenchmarkMetrics,
  shots: BenchmarkShotResult[],
  analysisBasis: string,
  warnings: string[]
): string => {
  const transcriptHighlights = buildTranscriptHighlights(intake.transcriptSegments, 6);
  const sceneSummary = shots.length > 0
    ? shots.slice(0, 5).map((shot, index) => `${index + 1}. ${clipText(shot.desc, 70)}`).join('\n')
    : transcriptHighlights.length > 0
      ? transcriptHighlights.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : `1. 标题主题：${clipText(intake.title, 80)}\n2. 描述补充：${clipText(intake.description || '无法仅凭当前数据确认', 100)}`;
  const transcriptSection = transcriptHighlights.length > 0
    ? transcriptHighlights.map((item, index) => `${index === 0 ? '第一' : index === 1 ? '第二' : index === 2 ? '第三' : `第${index + 1}`}部分：基于可用字幕与元数据可确认的段落 (${item.split(' ')[0] || '时间点待确认'} - 无法仅凭当前数据确认) -> ${item}`).join('\n')
    : '第一部分：当前无可用字幕时间轴 (时间点待确认 - 时间点待确认) -> 只能确认标题、描述与公开元数据，无法稳定拆解全部主要段落。';
  const warningSection = warnings.length > 0
    ? warnings.map((warning) => `- ${warning}`).join('\n')
    : '- 当前无额外系统警告。';
  const shotRows = buildShotTableRows(shots, intake.transcriptSegments).join('\n');

  return [
    '请根据我提供的视频内容，参考以下格式输出标准的【视频拆解方案】：',
    '# 📌 全局设计',
    `故事线设计： [明线剧情梳理] ${clipText(metrics.t1_mainSubject || '无法仅凭当前数据确认', 140)} + [暗线情绪/反转/互动逻辑梳理] ${clipText(metrics.t0_viralFactors || '无法仅凭当前数据确认', 140)}`,
    `核心场景 (Scenes)：\n${sceneSummary}`,
    `核心道具与特效 (Props & VFX)：${clipText(`${metrics.t2_soundEffects || '无法仅凭当前数据确认'}；${metrics.t2_transitions || '无法仅凭当前数据确认'}；${metrics.t2_errors || '无法仅凭当前数据确认'}`, 240)}`,
    '人物形象与复刻指南 (Characters)：无法仅凭当前数据确认具体人物外观；如需复刻，请仅基于已知标题、描述、字幕中出现的人物身份词补全。[Gender], [Hairstyle], [Clothing], character sheet, full body, three orthographic views: front view, side view, back view, standing pose, consistent character design, centered, split view, white space between views, pure white background, high resolution, concept art style, label "xxxx" in top left, text not overlapping with character.',
    '# 📖 视频故事情节结构',
    transcriptSection,
    '# 🎞️ 详细分镜时间脚本 (请使用Markdown表格输出)',
    '| 镜头号 | 时间段 | 场景(Scene) | 景别(Shot) | 运镜(Camera) | 画面内容 & 表演指令 | 角色台词 | 声音设计(SFX/BGM) | 道具/特效/后期 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    shotRows,
    '# 💡 导演/制片复刻执行笔记',
    `- 机位布置：优先依据可验证的字幕切分或镜头描述建立 shot list；当前镜头数量参考 ${shots.length > 0 ? `${shots.length} 条结构化镜头` : '字幕/元数据粗拆结果'}。`,
    `- 后期剪辑重点：围绕 ${clipText(metrics.t1_pacing || '无法仅凭当前数据确认', 120)} 保持节奏，优先保留标题与前几秒钩子信息。`,
    '- 现场执行难点：公开视频缺少完整画面与声音轨道证据时，不要擅自补全景别、运镜、特效细节，应先回看原片逐切确认。',
    `- 分析依据：${analysisBasis}`,
    `- 风险/警告：\n${warningSection}`,
    '# 重点 按照**“逐切记录”**的超精细颗粒度',
    '在专业的拉片分镜本中，应该做到**“逢切必记”**（即画面只要发生切换，哪怕只有0.5秒，也要单独列为一个镜头号）。当前结果仅基于可用标题、描述、元数据与字幕时间轴做保守拆解；若原片存在更多切点但输入未提供证据，请在复刻前逐切补录。',
  ].join('\n\n').trim();
};

const normalizeBreakdownReport = (
  intake: YouTubeBenchmarkIntake,
  report: string | undefined,
  metrics: BenchmarkMetrics,
  shots: BenchmarkShotResult[],
  analysisBasis: string,
  warnings: string[]
): string => {
  const trimmed = String(report || '').trim();
  if (trimmed) return trimmed;
  return buildFallbackBreakdownReport(intake, metrics, shots, analysisBasis, warnings);
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
    '7. breakdownReport 必须存在，且为字符串；内容必须尽量贴合我提供的拆解方案模板，但只能引用输入里可验证的信息。',
    '8. 不要输出 JSON 之外的 markdown 或解释；如果需要 markdown，只能放在 breakdownReport 字符串内部。',
    '9. 请尽量贴近以下模板原文与顺序输出 breakdownReport：',
    '请根据我提供的视频内容，参考以下格式输出标准的【视频拆解方案】：',
    '# 📌 全局设计',
    '故事线设计： [明线剧情梳理] +[暗线情绪/反转/互动逻辑梳理]',
    '核心场景 (Scenes)：[列出视频中的主要场景，及复刻该场景需要的核心背景元素]',
    '核心道具与特效 (Props & VFX)：[列出关键的实体道具、后期特效、音效及包装设计]',
    '人物形象与复刻指南 (Characters)：[Gender], [Hairstyle], [Clothing], character sheet, full body, three orthographic views: front view, side view, back view, standing pose, consistent character design, centered, split view, white space between views, pure white background, high resolution, concept art style, label "xxxx" in top left, text not overlapping with character.',
    '# 📖 视频故事情节结构',
    '第一部分：[段落主题] (时间点 - 时间点) -> 描述具体情节及在剧本结构中的作用。',
    '(以此类推，拆解视频的所有主要段落)',
    '# 🎞️ 详细分镜时间脚本 (请使用Markdown表格输出)',
    '| 镜头号 | 时间段 | 场景(Scene) | 景别(Shot) | 运镜(Camera) | 画面内容 & 表演指令 | 角色台词 | 声音设计(SFX/BGM) | 道具/特效/后期 |',
    '# 💡 导演/制片复刻执行笔记',
    '给出关于【机位布置】、【后期剪辑重点】、【现场执行难点】等维度的专业实操建议。',
    '# 重点 按照**“逐切记录”**的超精细颗粒度',
    '在专业的拉片分镜本中，应该做到**“逢切必记”**（即画面只要发生切换，哪怕只有0.5秒，也要单独列为一个镜头号）。',
    '',
    '输出 JSON 结构：',
    JSON.stringify({
      title: intake.title,
      breakdownReport: '请根据我提供的视频内容，参考以下格式输出标准的【视频拆解方案】：\n# 📌 全局设计\n故事线设计：...\n核心场景 (Scenes)：...\n核心道具与特效 (Props & VFX)：...\n人物形象与复刻指南 (Characters)：...\n# 📖 视频故事情节结构\n第一部分：...\n# 🎞️ 详细分镜时间脚本 (请使用Markdown表格输出)\n| 镜头号 | 时间段 | 场景(Scene) | 景别(Shot) | 运镜(Camera) | 画面内容 & 表演指令 | 角色台词 | 声音设计(SFX/BGM) | 道具/特效/后期 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 00:00-00:03 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 基于输入数据可验证的描述 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 | 无法仅凭当前数据确认 |\n# 💡 导演/制片复刻执行笔记\n...\n# 重点 按照**“逐切记录”**的超精细颗粒度\n...',
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

export const downloadYouTubeBenchmarkVideo = async (
  request: YouTubeBenchmarkDownloadRequest,
  options: DownloadYouTubeBenchmarkVideoOptions = {},
): Promise<BenchmarkDownloadArtifact> => {
  const response = await fetch('/api/youtube-benchmark/download', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok || !response.body) {
    let message = `视频下载失败（HTTP ${response.status}）`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // ignore parse error and keep fallback message
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalArtifact: BenchmarkDownloadArtifact | null = null;

  const handleChunk = (chunkText: string) => {
    buffer += chunkText;
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) continue;
      const event = JSON.parse(data) as BenchmarkDownloadStreamEvent;
      options.onEvent?.(event);

      if (event.type === 'done') {
        finalArtifact = {
          ...event.artifact,
          warnings: event.artifact.warnings || [],
        };
      }

      if (event.type === 'error') {
        throw new Error(event.message || '视频下载失败。');
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    handleChunk(decoder.decode(value, { stream: true }));
  }

  const trailing = decoder.decode();
  if (trailing) {
    handleChunk(trailing);
  }

  if (!finalArtifact) {
    throw new Error('视频下载流已结束，但未返回完成结果。');
  }

  return finalArtifact;
};

export const analyzeYouTubeBenchmark = async (
  intake: YouTubeBenchmarkIntake
): Promise<BenchmarkDeconstructionResult> => {
  const baseWarnings = [...(intake.warnings || [])];
  const sourceMeta = buildBenchmarkSourceMeta(intake);
  const analysisBasis = buildAnalysisBasis(intake);
  const hasTranscript = intake.transcriptSegments.length > 0;

  if (!intake.transcriptSegments.length && !intake.description.trim()) {
    const warnings = dedupeWarnings([
      ...baseWarnings,
      '当前视频没有可用字幕或描述，已退回为元数据层分析。',
    ]);
    const metrics = buildFallbackMetrics(intake);

    return {
      title: intake.title,
      breakdownReport: normalizeBreakdownReport(intake, '', metrics, [], analysisBasis, warnings),
      metrics,
      shots: [],
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: 'metadata',
      fallbackReason: 'no_transcript',
      analysisBasis,
      warnings,
    };
  }

  try {
    const raw = await chatCompletion(buildPrompt(intake), undefined, 0.3, 4096, 'json_object', 300000);
    const parsed = parseJsonWithRecovery<LlmBenchmarkResult>(raw, {});
    const shots = normalizeShots(intake, parsed.shots);
    const warnings = dedupeWarnings([...(parsed.warnings || []), ...baseWarnings]);
    const metrics = normalizeMetrics(intake, parsed.metrics, shots.length);

    return {
      title: String(parsed.title || intake.title).trim() || intake.title,
      breakdownReport: normalizeBreakdownReport(intake, parsed.breakdownReport, metrics, shots, analysisBasis, warnings),
      metrics,
      shots,
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: hasTranscript ? 'full' : 'metadata',
      fallbackReason: hasTranscript ? undefined : 'no_transcript',
      analysisBasis,
      warnings,
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

    const warnings = dedupeWarnings([
      ...baseWarnings,
      fallbackWarning,
    ]);
    const metrics = buildFallbackMetrics(intake);

    return {
      title: intake.title,
      breakdownReport: normalizeBreakdownReport(intake, '', metrics, [], analysisBasis, warnings),
      metrics,
      shots: [],
      sourceMeta,
      transcriptStatus: intake.transcriptStatus,
      analysisMode: 'metadata',
      fallbackReason,
      analysisBasis,
      warnings,
    };
  }
};
