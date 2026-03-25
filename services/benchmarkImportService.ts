import {
  AnalysisShotSegment,
  AnalysisTranscriptArtifact,
  AnalysisTranscriptLine,
  BenchmarkAnalysisImportMeta,
  BenchmarkShotResult,
  BenchmarkVideo,
  Episode,
  Series,
  SeriesProject,
  VideoAnalysisRecord,
  ViralSignal,
} from '../types';
import { normalizeAnalysisRecord } from './analysisOrchestrationService';
import { createNewEpisode, createNewSeries, getEpisodesBySeries, getSeriesByProject, saveEpisode, saveSeries, saveSeriesProject } from './storageService';
import { YouTubeBenchmarkIntake, fetchYouTubeBenchmarkIntake } from './youtubeBenchmarkService';

const createId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const clipText = (value: string, maxLength: number): string => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const parseTimecodeToMs = (value: string): number | null => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const parts = normalized.split(':').map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return ((minutes * 60) + seconds) * 1000;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return (((hours * 60 * 60) + (minutes * 60) + seconds) * 1000);
  }

  return null;
};

const resolveShotRange = (shot: BenchmarkShotResult, index: number, total: number, durationSeconds?: number) => {
  const matchedRange = String(shot.time || '').match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-~—]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  const startMs = matchedRange ? parseTimecodeToMs(matchedRange[1]) : null;
  const endMs = matchedRange ? parseTimecodeToMs(matchedRange[2]) : null;

  if (startMs !== null && endMs !== null && endMs > startMs) {
    return { startMs, endMs };
  }

  const totalDurationMs = durationSeconds && durationSeconds > 0 ? durationSeconds * 1000 : 0;
  const fallbackSpanMs = totalDurationMs > 0 && total > 0 ? Math.max(1500, Math.floor(totalDurationMs / total)) : 3000;
  const fallbackStartMs = index * fallbackSpanMs;

  return {
    startMs: fallbackStartMs,
    endMs: totalDurationMs > 0 ? Math.min(totalDurationMs, fallbackStartMs + fallbackSpanMs) : fallbackStartMs + fallbackSpanMs,
  };
};

const buildVisualNotes = (shot: BenchmarkShotResult): string | undefined => {
  const notes = [
    shot.videoPrompt ? `视频提示词：${shot.videoPrompt}` : null,
    shot.firstFramePrompt ? `首帧提示词：${shot.firstFramePrompt}` : null,
    shot.lastFramePrompt ? `尾帧提示词：${shot.lastFramePrompt}` : null,
    shot.adjustment ? `调整建议：${shot.adjustment}` : null,
  ].filter(Boolean);

  return notes.length > 0 ? notes.join('\n') : undefined;
};

const buildImportedShots = (benchmark: BenchmarkVideo, intake: YouTubeBenchmarkIntake): AnalysisShotSegment[] => {
  if (benchmark.deconstructResult && benchmark.deconstructResult.length > 0) {
    return benchmark.deconstructResult.map((shot, index, allShots) => {
      const range = resolveShotRange(shot, index, allShots.length, intake.durationSeconds || benchmark.sourceMeta?.durationSeconds);
      return {
        id: createId(`analysis_benchmark_shot_${index + 1}`),
        startMs: range.startMs,
        endMs: Math.max(range.endMs, range.startMs + 1000),
        title: `对标镜头 ${index + 1}`,
        summary: clipText(shot.desc || `对标镜头 ${index + 1}`, 220),
        scriptSnippet: shot.videoPrompt || undefined,
        visualNotes: buildVisualNotes(shot),
        viralElements: index === 0 ? ['hook'] : index === allShots.length - 1 ? ['payoff'] : ['shot'],
        confidence: benchmark.analysisMode === 'metadata' ? 0.66 : 0.86,
      };
    });
  }

  return intake.transcriptSegments.slice(0, 12).map((segment, index, allSegments) => ({
    id: createId(`analysis_benchmark_segment_${index + 1}`),
    startMs: segment.startMs,
    endMs: Math.max(segment.endMs, segment.startMs + 1000),
    title: `字幕片段 ${index + 1}`,
    summary: clipText(segment.text || `字幕片段 ${index + 1}`, 220),
    scriptSnippet: segment.text,
    visualNotes: '当前镜头来自 YouTube 对标导入；如需画面级分析，请补充直链或本地视频文件。',
    viralElements: index === 0 ? ['hook'] : index === allSegments.length - 1 ? ['payoff'] : ['script'],
    confidence: 0.62,
  }));
};

const buildTranscript = (benchmark: BenchmarkVideo, intake: YouTubeBenchmarkIntake): AnalysisTranscriptArtifact => {
  const lines: AnalysisTranscriptLine[] = intake.transcriptSegments.map((segment, index) => ({
    id: `benchmark_line_${index + 1}`,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    source: 'subtitle',
  }));

  const mergedScript = lines.length > 0
    ? lines.map((line) => line.text).join('，')
    : clipText(benchmark.metrics?.t0_storyScript || benchmark.analysisBasis || intake.description || benchmark.title, 2000);

  const summary = clipText(
    benchmark.metrics?.t0_storyScript
      || benchmark.analysisBasis
      || (lines[0]?.text ? `已导入 ${lines.length} 条字幕时间轴，可继续在工作台做镜头复核与创作派生。` : `当前导入结果主要基于 ${benchmark.title} 的公开元数据。`),
    240,
  );

  return {
    language: intake.transcriptLanguage || benchmark.sourceMeta?.transcriptLanguage || '未知',
    mergedScript,
    summary,
    lines,
  };
};

const buildSignals = (benchmark: BenchmarkVideo): ViralSignal[] => {
  const metrics = benchmark.metrics;
  if (!metrics) return [];

  const rawSignals: Array<Pick<ViralSignal, 'category' | 'label' | 'evidence'>> = [
    { category: 'hook', label: '前三秒内容', evidence: metrics.t1_first3sContent },
    { category: 'script', label: '故事脚本', evidence: metrics.t0_storyScript },
    { category: 'rhythm', label: '内容节奏', evidence: metrics.t1_pacing },
    { category: 'shot', label: '画面与转场', evidence: `${metrics.t1_first3sVisuals}；${metrics.t2_transitions}` },
    { category: 'emotion', label: '主观兴趣', evidence: metrics.t3_subjectiveInterest },
  ];

  return rawSignals
    .map((signal, index) => ({
      id: `benchmark_signal_${index + 1}`,
      category: signal.category,
      label: signal.label,
      evidence: clipText(signal.evidence, 220),
    }))
    .filter((signal) => Boolean(signal.evidence));
};

const buildBenchmarkImportMeta = (benchmark: BenchmarkVideo): BenchmarkAnalysisImportMeta => ({
  benchmarkId: benchmark.id,
  importedAt: Date.now(),
  analysisMode: benchmark.analysisMode,
  transcriptStatus: benchmark.transcriptStatus,
  analysisBasis: benchmark.analysisBasis,
  warnings: benchmark.warnings || [],
  sourceMeta: benchmark.sourceMeta,
});

const buildAnalysisRecord = (benchmark: BenchmarkVideo, intake: YouTubeBenchmarkIntake): VideoAnalysisRecord => {
  const benchmarkImport = buildBenchmarkImportMeta(benchmark);
  const shots = buildImportedShots(benchmark, intake);
  const transcript = buildTranscript(benchmark, intake);
  const viralSignals = buildSignals(benchmark);

  return normalizeAnalysisRecord({
    source: {
      id: `benchmark_source_${benchmark.id}`,
      kind: 'benchmark',
      title: benchmark.title || intake.title,
      originalUrl: benchmark.sourceMeta?.canonicalUrl || intake.canonicalUrl || benchmark.url,
      thumbnailUrl: benchmark.sourceMeta?.thumbnailUrl || intake.thumbnailUrl,
      status: 'ready',
    },
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rawResponse: JSON.stringify({
      mode: 'benchmark-import',
      benchmarkImport,
      importedShotCount: shots.length,
      transcriptSegmentCount: intake.transcriptSegments.length,
    }, null, 2),
    shots,
    transcript,
    viralSignals,
    score: null,
    review: {
      status: 'draft',
      userEdited: false,
      dirtyFields: [],
      notes: '该记录来自首页 YouTube 对标导入，默认保留字幕/元数据分析结论。',
    },
    derivedDraft: null,
    templateCandidates: [],
    applyHistory: [],
    benchmarkImport,
  });
};

const ensureTargetSeries = async (project: SeriesProject): Promise<Series> => {
  const seriesList = await getSeriesByProject(project.id);
  if (seriesList.length > 0) return seriesList[0];

  const createdSeries = createNewSeries(project.id, '第一季', 0);
  await saveSeries(createdSeries);
  return createdSeries;
};

const buildEpisodeTitle = (benchmark: BenchmarkVideo): string => {
  return clipText(`${benchmark.title || 'YouTube 对标样本'} - 对标导入`, 60);
};

export const importBenchmarkToProject = async (benchmark: BenchmarkVideo, project: SeriesProject): Promise<Episode> => {
  const intake = await fetchYouTubeBenchmarkIntake(benchmark.url);
  const targetSeries = await ensureTargetSeries(project);
  const existingEpisodes = await getEpisodesBySeries(targetSeries.id);
  const nextEpisodeNumber = existingEpisodes.length > 0
    ? Math.max(...existingEpisodes.map((episode) => episode.episodeNumber || 0)) + 1
    : 1;

  const baseEpisode = createNewEpisode(project.id, targetSeries.id, nextEpisodeNumber, buildEpisodeTitle(benchmark));
  const importedEpisode: Episode = {
    ...baseEpisode,
    stage: 'analysis',
    language: project.language,
    visualStyle: project.visualStyle,
    analysisData: buildAnalysisRecord(benchmark, intake),
  };

  await saveEpisode(importedEpisode);
  await saveSeriesProject({
    ...project,
    lastModified: Date.now(),
  });

  return importedEpisode;
};
