import {
  AnalysisShotSegment,
  AnalysisTranscriptArtifact,
  LocalAnalysisRunData,
  LocalShotVisionBatchResult,
  ProjectState,
  VideoAnalysisRecord,
  ViralScoreCard,
  ViralSignal,
  ViralTemplateRecord,
} from '../types';
import { runLocalAnalysis } from './localAnalysisService';
import { loadLocalAnalysisUserConfig } from './localAnalysisConfigService';
import { analyzeVideoShotsWithVision } from './localVideoVisionService';

export class AnalysisPipelineError extends Error {
  partialRecord?: Partial<VideoAnalysisRecord>;

  constructor(message: string, partialRecord?: Partial<VideoAnalysisRecord>) {
    super(message);
    this.name = 'AnalysisPipelineError';
    this.partialRecord = partialRecord;
  }
}

const createId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const toTitleWords = (input: string): string[] =>
  input
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

const buildSeedText = (project: ProjectState): string => {
  const source = project.analysisData?.source;
  const fallback = project.title || '视频分析样本';
  return source?.title || source?.fileName || source?.originalUrl || fallback;
};

type LocalTranscriptLine = LocalAnalysisRunData['transcript']['lines'][number];

const clipText = (value: string, maxLength: number): string => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const joinTranscriptTexts = (texts: string[]): string => {
  return texts.map(text => text.trim()).filter(Boolean).join('，');
};

const getLinesForRange = (
  lines: LocalTranscriptLine[],
  startMs: number,
  endMs: number,
): LocalTranscriptLine[] => {
  const overlapping = lines.filter(line => line.endMs > startMs && line.startMs < endMs);
  if (overlapping.length > 0) return overlapping;

  const nearestLine = lines.find(line => line.startMs >= startMs) || lines.find(line => line.endMs <= endMs) || null;
  return nearestLine ? [nearestLine] : [];
};

const buildLocalTranscriptSummary = (lines: LocalTranscriptLine[]): string => {
  const mergedPreview = joinTranscriptTexts(lines.slice(0, 4).map(line => line.text));
  if (!mergedPreview) {
    return '本地分析已完成，但当前没有提取到可用的转录文本。';
  }
  return clipText(`本地分析已基于语音转录得到 ${lines.length} 条时间轴文本，可继续结合镜头切分结果做结构化复核。核心内容：${mergedPreview}`, 220);
};

const createShotTitle = (index: number, total: number): string => {
  if (index === 0) return 'Opening / 开场';
  if (index === total - 1) return 'Closing / 收束';
  return `Scene ${index + 1} / 内容段落`;
};

const createShotVisualNotes = (index: number, total: number): string => {
  if (index === 0) return '优先复核开场画面中的主体、字幕区与节奏建立方式。';
  if (index === total - 1) return '优先复核结尾画面的结果呈现、CTA 与情绪收束。';
  return '优先复核这一段的主体动作、镜头转换与信息密度变化。';
};

const buildShotFromLines = (
  index: number,
  total: number,
  lines: LocalTranscriptLine[],
  startMs: number,
  endMs: number,
): AnalysisShotSegment => {
  const mergedText = joinTranscriptTexts(lines.map(line => line.text));
  const summarySeed = clipText(mergedText || '当前段落缺少可用文本，建议回看原视频确认画面与节奏。', 140);

  return {
    id: `analysis_local_shot_${index + 1}`,
    startMs,
    endMs,
    title: createShotTitle(index, total),
    summary: index === 0
      ? `开头围绕“${summarySeed}”快速建立内容切入点。`
      : index === total - 1
        ? `结尾围绕“${summarySeed}”完成结果收束或行动引导。`
        : `这一段主要围绕“${summarySeed}”展开信息递进。`,
    scriptSnippet: clipText(mergedText, 180) || undefined,
    visualNotes: createShotVisualNotes(index, total),
    viralElements: index === 0 ? ['hook', 'speed'] : index === total - 1 ? ['payoff', 'cta'] : ['explanation', 'rhythm'],
    confidence: lines.length > 0 ? 0.88 : 0.62,
  };
};

const chunkTranscriptLines = (lines: LocalTranscriptLine[]): LocalTranscriptLine[][] => {
  if (lines.length <= 4) {
    return lines.map(line => [line]);
  }

  const targetShotCount = Math.min(8, Math.max(3, Math.ceil(lines.length / 3)));
  const linesPerShot = Math.max(1, Math.ceil(lines.length / targetShotCount));
  const chunks: LocalTranscriptLine[][] = [];

  for (let index = 0; index < lines.length; index += linesPerShot) {
    chunks.push(lines.slice(index, index + linesPerShot));
  }

  return chunks;
};

const buildShotsFromLocalAnalysis = (result: LocalAnalysisRunData): AnalysisShotSegment[] => {
  if (result.sceneSegments.length > 0) {
    return result.sceneSegments.map((segment, index, allSegments) => {
      const lines = getLinesForRange(result.transcript.lines, segment.startMs, segment.endMs);
      return buildShotFromLines(index, allSegments.length, lines, segment.startMs, segment.endMs);
    });
  }

  const chunks = chunkTranscriptLines(result.transcript.lines);
  return chunks.map((chunk, index, allChunks) => {
    const startMs = chunk[0]?.startMs ?? index * 3000;
    const endMs = chunk[chunk.length - 1]?.endMs ?? startMs + 3000;
    return buildShotFromLines(index, allChunks.length, chunk, startMs, endMs);
  });
};

const buildTranscriptFromLocalAnalysis = (result: LocalAnalysisRunData): AnalysisTranscriptArtifact => {
  return {
    language: result.transcript.language || '未知',
    mergedScript: result.transcript.mergedText,
    summary: buildLocalTranscriptSummary(result.transcript.lines),
    lines: result.transcript.lines,
  };
};

interface LocalAnalysisAttemptResult {
  data: LocalAnalysisRunData | null;
  error: string | null;
}

interface VisionEnhancementAttemptResult {
  data: LocalShotVisionBatchResult | null;
  error: string | null;
}

export interface AnalysisRunOverrides {
  enableSceneDetection?: boolean;
}

const tryRunLocalAnalysis = async (
  project: ProjectState,
  overrides: AnalysisRunOverrides,
): Promise<LocalAnalysisAttemptResult> => {
  const source = project.analysisData?.source;
  if (!source || source.status !== 'ready') {
    return { data: null, error: '分析源未就绪，未执行本地分析。' };
  }

  const userConfig = loadLocalAnalysisUserConfig();
  const enableSceneDetection = overrides.enableSceneDetection !== false;

  try {
    const data = await runLocalAnalysis(source, {
      enableSceneDetection,
      language: 'auto',
    }, userConfig);
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : '本地分析执行失败，已回退到内置分析。',
    };
  }
};

const mergeVisionAnalysesIntoShots = (
  shots: AnalysisShotSegment[],
  visionResult: LocalShotVisionBatchResult | null,
): AnalysisShotSegment[] => {
  if (!visionResult || visionResult.analyses.length === 0) {
    return shots;
  }

  const byShotId = new Map(visionResult.analyses.map((analysis) => [analysis.shotId, analysis]));

  return shots.map((shot) => {
    const vision = byShotId.get(shot.id);
    if (!vision) return shot;

    return {
      ...shot,
      title: vision.title || shot.title,
      summary: vision.summary || shot.summary,
      visualNotes: vision.visualNotes || shot.visualNotes,
      viralElements: vision.viralElements.length > 0 ? vision.viralElements : shot.viralElements,
      confidence: vision.confidence ?? shot.confidence,
    };
  });
};

const tryRunVisionEnhancement = async (
  project: ProjectState,
  shots: AnalysisShotSegment[],
  transcript: AnalysisTranscriptArtifact,
): Promise<VisionEnhancementAttemptResult> => {
  const source = project.analysisData?.source;
  if (!source || shots.length === 0) {
    return { data: null, error: '缺少可用于视觉增强的镜头数据或视频源。' };
  }

  const userConfig = loadLocalAnalysisUserConfig();

  try {
    const data = await analyzeVideoShotsWithVision(source, shots, transcript, userConfig.visionModel || 'gpt-4o');
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : '视觉增强执行失败，已保留基础分析结果。',
    };
  }
};

const buildShots = (seed: string): AnalysisShotSegment[] => {
  const words = toTitleWords(seed);
  const phraseA = words.slice(0, 2).join(' ') || '强钩子';
  const phraseB = words.slice(2, 4).join(' ') || '冲突升级';
  const phraseC = words.slice(4, 6).join(' ') || '结果兑现';

  return [
    {
      id: createId('analysis_shot_1'),
      startMs: 0,
      endMs: 3200,
      title: 'Hook / 开场钩子',
      summary: `开头用 ${phraseA} 快速建立好奇点与情绪预期。`,
      scriptSnippet: `前 3 秒直接抛出 ${phraseA}，让观众立刻知道“为什么要继续看”。`,
      visualNotes: '近景+高对比字幕区，节奏要快。',
      viralElements: ['hook', 'contrast', 'speed'],
      confidence: 0.89,
    },
    {
      id: createId('analysis_shot_2'),
      startMs: 3200,
      endMs: 8600,
      title: 'Escalation / 信息递进',
      summary: `中段通过 ${phraseB} 补充信息密度，并持续放大冲突。`,
      scriptSnippet: `用连续的信息点解释问题与转折，让观众持续获得新刺激。`,
      visualNotes: '中景切换+节奏化 B-roll，保证信息持续输入。',
      viralElements: ['explanation', 'rhythm', 'payoff-setup'],
      confidence: 0.84,
    },
    {
      id: createId('analysis_shot_3'),
      startMs: 8600,
      endMs: 15000,
      title: 'Payoff / 结果兑现',
      summary: `结尾用 ${phraseC} 完成兑现，并给出可记忆结论或 CTA。`,
      scriptSnippet: '在最后一段给出结果、总结和下一步动作，形成完整闭环。',
      visualNotes: '回到主体画面，放大结果与 CTA。',
      viralElements: ['payoff', 'cta', 'closure'],
      confidence: 0.86,
    },
  ];
};

const buildTranscript = (seed: string, shots: AnalysisShotSegment[]): AnalysisTranscriptArtifact => {
  const topic = toTitleWords(seed).join(' / ') || '这条视频';
  return {
    language: '中文',
    mergedScript: `先用一句话交代 ${topic} 的核心价值，再用两个递进信息点解释差异，最后给出结果与行动建议。`,
    summary: `脚本结构是“开头钩子 → 中段解释 → 结尾兑现”，适合短视频的高密度信息节奏。`,
    lines: shots.map((shot, index) => ({
      id: createId(`line_${index + 1}`),
      startMs: shot.startMs,
      endMs: shot.endMs,
      text: shot.scriptSnippet || shot.summary,
      source: 'merged',
    })),
  };
};

const buildSignals = (shots: AnalysisShotSegment[]): ViralSignal[] => {
  return [
    {
      id: createId('signal_hook'),
      category: 'hook',
      label: '高密度开场钩子',
      evidence: shots[0]?.summary || '前 3 秒快速建立兴趣点。',
      score: 88,
      shotId: shots[0]?.id,
      startMs: shots[0]?.startMs,
      endMs: shots[0]?.endMs,
    },
    {
      id: createId('signal_script'),
      category: 'script',
      label: '递进式解释结构',
      evidence: shots[1]?.summary || '中段持续补充信息密度。',
      score: 81,
      shotId: shots[1]?.id,
      startMs: shots[1]?.startMs,
      endMs: shots[1]?.endMs,
    },
    {
      id: createId('signal_rhythm'),
      category: 'rhythm',
      label: '结尾兑现与 CTA',
      evidence: shots[2]?.summary || '结尾完成结果兑现。',
      score: 79,
      shotId: shots[2]?.id,
      startMs: shots[2]?.startMs,
      endMs: shots[2]?.endMs,
    },
  ];
};

const buildScore = (signals: ViralSignal[]): ViralScoreCard => {
  const factors = [
    { id: 'factor_hook', label: 'Hook 强度', score: signals[0]?.score || 0, weight: 0.35, explanation: '开头是否足够快地给出利益点、反差或悬念。' },
    { id: 'factor_structure', label: '信息递进', score: signals[1]?.score || 0, weight: 0.35, explanation: '中段是否持续补充新信息，而不是重复同一句话。' },
    { id: 'factor_payoff', label: '结尾兑现', score: signals[2]?.score || 0, weight: 0.3, explanation: '结尾是否回收承诺并给出明确 CTA 或结果。' },
  ];
  const overall = Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0));
  return {
    overall,
    rationale: '综合考量开头钩子、信息递进与结尾兑现三个维度，形成可解释的爆款评分。',
    version: 'analysis-v1',
    factors,
  };
};

const buildTemplateCandidates = (project: ProjectState, shots: AnalysisShotSegment[]): ViralTemplateRecord[] => {
  const projectId = project.projectId || project.id;
  const episodeId = project.id;
  const source = project.analysisData?.source;

  return [
    {
      id: createId('template_video'),
      type: 'video',
      title: '短视频三段式模板',
      description: '整条视频遵循开头钩子、中段解释、结尾兑现的稳定结构。',
      score: 84,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: {
        projectId,
        episodeId,
        analysisSourceId: source?.id,
        sourceTitle: source?.title || source?.fileName,
        sourceUrl: source?.originalUrl,
      },
      payload: {
        summary: '适合知识型/解释型短视频的三段式结构模板。',
        cues: ['前三秒抛价值', '中段递进解释', '结尾回收承诺'],
        tags: ['video', 'structure', 'explainer'],
      },
    },
    {
      id: createId('template_hook'),
      type: 'hook',
      title: '高反差开头 Hook',
      description: '用一句高价值承诺或反差信息打开视频。',
      score: 88,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: {
        projectId,
        episodeId,
        analysisSourceId: source?.id,
        sourceTitle: source?.title || source?.fileName,
        sourceUrl: source?.originalUrl,
        shotId: shots[0]?.id,
        startMs: shots[0]?.startMs,
        endMs: shots[0]?.endMs,
      },
      payload: {
        summary: '以高价值结论或反差问题开头，快速争取停留。',
        cues: ['前 3 秒交代利益点', '避免铺垫过长', '第一句就有冲击力'],
        tags: ['hook', 'contrast', 'retention'],
      },
    },
    {
      id: createId('template_rhythm'),
      type: 'rhythm',
      title: '递进式节奏模板',
      description: '每 3-5 秒给一个新信息点，防止节奏塌陷。',
      score: 80,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: {
        projectId,
        episodeId,
        analysisSourceId: source?.id,
        sourceTitle: source?.title || source?.fileName,
        sourceUrl: source?.originalUrl,
        shotId: shots[1]?.id,
        startMs: shots[1]?.startMs,
        endMs: shots[1]?.endMs,
      },
      payload: {
        summary: '适合高信息密度内容的递进节奏。',
        cues: ['每段一个增量信息点', 'B-roll 服务解释', '结尾前开始收束'],
        tags: ['rhythm', 'pacing', 'explanation'],
      },
    },
  ];
};

const ensureValidSource = (project: ProjectState): void => {
  if (!project.analysisData?.source || project.analysisData.source.status !== 'ready') {
    throw new Error('请先准备一个可用的视频输入，再启动分析。');
  }
};

export interface AnalysisOrchestrationResult {
  record: VideoAnalysisRecord;
  rawResponse: string;
}

export const runAnalysisOrchestration = async (
  project: ProjectState,
  overrides: AnalysisRunOverrides = {},
): Promise<AnalysisOrchestrationResult> => {
  ensureValidSource(project);
  await new Promise(resolve => setTimeout(resolve, 900));
  const seed = buildSeedText(project);
  const localAnalysisAttempt = await tryRunLocalAnalysis(project, overrides);
  const localAnalysis = localAnalysisAttempt.data;
  const baseShots = localAnalysis ? buildShotsFromLocalAnalysis(localAnalysis) : buildShots(seed);
  const transcript = localAnalysis ? buildTranscriptFromLocalAnalysis(localAnalysis) : buildTranscript(seed, baseShots);
  const visionEnhancementAttempt = localAnalysis
    ? await tryRunVisionEnhancement(project, baseShots, transcript)
    : { data: null, error: localAnalysisAttempt.error ? '本地分析未成功，已跳过视觉增强。' : null };
  const visionEnhancement = visionEnhancementAttempt.data;
  const shots = visionEnhancement ? mergeVisionAnalysesIntoShots(baseShots, visionEnhancement) : baseShots;
  const viralSignals = buildSignals(shots);
  const sourceTitle = project.analysisData?.source?.title || project.analysisData?.source?.originalUrl || '';

  if (sourceTitle.includes('simulate-failure')) {
    throw new AnalysisPipelineError('分析在评分阶段中断，请重试。', {
      source: project.analysisData?.source || null,
      status: 'failed',
      createdAt: project.analysisData?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      rawResponse: JSON.stringify({ seed, shots, transcript, viralSignals }, null, 2),
      shots,
      transcript,
      viralSignals,
      score: null,
      review: project.analysisData?.review,
      derivedDraft: project.analysisData?.derivedDraft,
      templateCandidates: [],
      applyHistory: project.analysisData?.applyHistory,
    });
  }

  const score = buildScore(viralSignals);
  const templateCandidates = buildTemplateCandidates(project, shots);

  const rawResponse = JSON.stringify({
    mode: localAnalysis ? (visionEnhancement ? 'local-analysis+vision' : 'local-analysis') : 'mock-fallback',
    seed,
    localAnalysis,
    localAnalysisError: localAnalysisAttempt.error,
    visionEnhancement,
    visionEnhancementError: visionEnhancementAttempt.error,
    shots,
    transcript,
    viralSignals,
    score,
    templateCandidates,
  }, null, 2);

  const record: VideoAnalysisRecord = {
    source: project.analysisData?.source || null,
    status: 'completed',
    createdAt: project.analysisData?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    rawResponse,
    shots,
    transcript,
    viralSignals,
    score,
    review: {
      status: 'draft',
      userEdited: false,
      dirtyFields: [],
      notes: project.analysisData?.review?.notes,
      lastReviewedAt: project.analysisData?.review?.lastReviewedAt,
    },
    derivedDraft: project.analysisData?.derivedDraft || null,
    templateCandidates,
    applyHistory: project.analysisData?.applyHistory || [],
  };

  return { record, rawResponse };
};

export const normalizeAnalysisRecord = (record: Partial<VideoAnalysisRecord>): VideoAnalysisRecord => {
  return {
    source: record.source ?? null,
    status: record.status ?? 'idle',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    rawResponse: record.rawResponse ?? null,
    shots: record.shots ?? [],
    transcript: record.transcript ?? null,
    viralSignals: record.viralSignals ?? [],
    score: record.score ?? null,
    review: {
      status: record.review?.status ?? 'draft',
      userEdited: record.review?.userEdited ?? false,
      lastReviewedAt: record.review?.lastReviewedAt,
      notes: record.review?.notes,
      dirtyFields: record.review?.dirtyFields ?? [],
    },
    derivedDraft: record.derivedDraft ?? null,
    templateCandidates: record.templateCandidates ?? [],
    applyHistory: record.applyHistory ?? [],
    benchmarkImport: record.benchmarkImport ?? null,
  };
};
