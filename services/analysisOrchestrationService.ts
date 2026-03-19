import {
  AnalysisShotSegment,
  AnalysisTranscriptArtifact,
  ProjectState,
  VideoAnalysisRecord,
  ViralScoreCard,
  ViralSignal,
  ViralTemplateRecord,
} from '../types';

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

export const runAnalysisOrchestration = async (project: ProjectState): Promise<AnalysisOrchestrationResult> => {
  ensureValidSource(project);
  await new Promise(resolve => setTimeout(resolve, 900));
  const seed = buildSeedText(project);
  const shots = buildShots(seed);
  const transcript = buildTranscript(seed, shots);
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

  const rawResponse = JSON.stringify({ seed, shots, transcript, viralSignals, score, templateCandidates }, null, 2);

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
  };
};
