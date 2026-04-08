import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Folder, ChevronDown, ChevronRight, Calendar, AlertTriangle, X, Cpu, Archive, Search, SearchCheck, Sparkles, LayoutPanelTop, Users, MapPin, Package, Database, Settings, Sun, Moon, Film, ExternalLink, User, Link as LinkIcon, Wand2 } from 'lucide-react';
import { SeriesProject, AssetLibraryItem, Character, Scene, Prop, ProjectState, BenchmarkVideo, BenchmarkDownloadArtifact, BenchmarkSliceArtifact, BenchmarkSliceManifestShot, BenchmarkSlicePromptReconstruction } from '../types';
import { getAllSeriesProjects, createNewSeriesProject, saveSeriesProject, deleteSeriesProject, createNewSeries, saveSeries, createNewEpisode, saveEpisode, getAllAssetLibraryItems, saveAssetToLibrary, deleteAssetFromLibrary, exportIndexedDBData, getAllBenchmarkVideos, saveBenchmarkVideo, deleteBenchmarkVideo, convertImageToBase64 } from '../services/storageService';
import { useAlert } from './GlobalAlert';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResolvedVideoUrl } from '../hooks/useResolvedVideoUrl';
import AssetLibraryEditorCard, { LibraryAsset } from './CharacterLibrary/AssetLibraryEditorCard';
import {
  useBackupTransfer,
  DEFAULT_BACKUP_TRANSFER_MESSAGES,
  globalBackupFileName,
} from '../hooks/useBackupTransfer';
import { DIRECTOR_HUB_URL } from '../constants/links';
import { analyzeYouTubeBenchmark, downloadYouTubeBenchmarkVideo, fetchYouTubeBenchmarkIntake } from '../services/youtubeBenchmarkService';
import { importBenchmarkToProject } from '../services/benchmarkImportService';
import { loadArtifactStorageUserConfig } from '../services/artifactStorageConfigService';
import { buildBenchmarkSlicingShots, buildStoryboardSlicingAssetUrl, mergeStoryboardSliceClips, resolveBenchmarkSliceMiddleFrameCandidates, resolveBenchmarkSliceRepresentativeMiddleFrame, runBenchmarkPromptReconstruction, runBenchmarkSlicing } from '../services/storyboardSlicingService';
import { createLibraryItemFromCharacter } from '../services/assetLibraryService';

interface Props {
  onOpenProject: (project: ProjectState) => void;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
}

type DashboardHomeSection = 'projects' | 'characters' | 'analysis';

const hasBenchmarkText = (value?: string | number | null): boolean => {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
};

const formatBenchmarkDuration = (seconds?: number): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const timeParts = hours > 0
    ? [hours, minutes, remainingSeconds]
    : [minutes, remainingSeconds];

  return `${timeParts.map((part) => String(part).padStart(2, '0')).join(':')}（约 ${totalSeconds} 秒）`;
};

const formatByteCount = (value?: number): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
};

const formatEtaLabel = (seconds?: number): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins} 分 ${secs.toString().padStart(2, '0')} 秒`;
};

const STALE_SLICE_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;

const formatElapsedSince = (timestamp?: number): string | null => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const elapsedMs = Date.now() - timestamp;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} 小时 ${remainingMinutes.toString().padStart(2, '0')} 分`;
};

const mergeDownloadArtifact = (
  base?: BenchmarkDownloadArtifact,
  incoming?: BenchmarkDownloadArtifact,
): BenchmarkDownloadArtifact | undefined => {
  if (!base && !incoming) return undefined;
  return {
    ...(base || {}),
    ...(incoming || {}),
    status: incoming?.status ?? base?.status ?? 'pending',
    warnings: incoming?.warnings || base?.warnings || [],
  };
};

const getBenchmarkDownloadStatusLabel = (benchmark: Pick<BenchmarkVideo, 'status' | 'downloadArtifact'>): string => {
  const downloadStatus = benchmark.downloadArtifact?.status;
  if (downloadStatus === 'downloading') return '下载中';
  if (downloadStatus === 'ready') return benchmark.status === 'completed' ? '已落盘' : '已下载';
  if (downloadStatus === 'failed') return '下载失败';
  if (downloadStatus === 'pending' && benchmark.status === 'analyzing') return '等待下载';
  return '未下载';
};

const appendBenchmarkSection = (
  lines: string[],
  title: string,
  items: Array<[string, string | number | null | undefined]>
) => {
  const sectionLines = items
    .filter(([, value]) => hasBenchmarkText(value))
    .map(([label, value]) => `${label}：${String(value).trim()}`);

  if (sectionLines.length === 0) {
    return;
  }

  if (lines.length > 0) {
    lines.push('');
  }

  lines.push(title);
  lines.push(...sectionLines);
};

const getBenchmarkBreakdownDisplayText = (benchmark: BenchmarkVideo | null): string => {
  if (!benchmark) {
    return '';
  }

  const breakdownReportText = benchmark.breakdownReport?.trim();
  if (breakdownReportText) {
    return breakdownReportText;
  }

  const lines: string[] = [];
  const metrics = benchmark.metrics;
  const shots = benchmark.deconstructResult;
  const warnings = benchmark.warnings?.filter((warning) => hasBenchmarkText(warning)) || [];
  const analysisModeLabel = benchmark.status !== 'completed'
    ? '分析中'
    : benchmark.analysisMode === 'metadata'
      ? benchmark.fallbackReason === 'missing_api_key'
        ? '降级分析'
        : '元数据分析'
      : '完整分析';
  const transcriptStatusLabel = benchmark.transcriptStatus === 'available'
    ? `可用${benchmark.sourceMeta?.transcriptLanguage ? ` · ${benchmark.sourceMeta.transcriptLanguage}` : ''}`
    : benchmark.transcriptStatus === 'error'
      ? '获取失败'
      : '不可用';

  appendBenchmarkSection(lines, '报告概览', [
    ['标题', benchmark.title],
    ['状态', benchmark.status],
    ['分析方式', analysisModeLabel],
    ['来源链接', benchmark.sourceMeta?.canonicalUrl || benchmark.url],
    ['分析依据', benchmark.analysisBasis],
    ['错误信息', benchmark.errorMessage],
  ]);

  appendBenchmarkSection(lines, '来源信息', [
    ['频道', benchmark.sourceMeta?.channelTitle],
    ['字幕状态', transcriptStatusLabel],
    ['视频时长', formatBenchmarkDuration(benchmark.sourceMeta?.durationSeconds)],
    ['播放量', typeof benchmark.sourceMeta?.viewCount === 'number' ? benchmark.sourceMeta.viewCount.toLocaleString('zh-CN') : null],
    ['点赞', typeof benchmark.sourceMeta?.likeCount === 'number' ? benchmark.sourceMeta.likeCount.toLocaleString('zh-CN') : null],
  ]);

  appendBenchmarkSection(lines, '本地下载', [
    ['下载状态', getBenchmarkDownloadStatusLabel(benchmark)],
    ['本地路径', benchmark.downloadArtifact?.localPath],
    ['输出目录', benchmark.downloadArtifact?.outputDirectory],
    ['下载错误', benchmark.downloadArtifact?.errorMessage],
  ]);

  if (warnings.length > 0) {
    lines.push('');
    lines.push('风险提醒');
    warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning.trim()}`);
    });
  }

  if (metrics) {
    appendBenchmarkSection(lines, '结构化分析摘要 / T0', [
      ['播放量判断', metrics.t0_playCount],
      ['故事脚本', metrics.t0_storyScript],
      ['爆款因子', metrics.t0_viralFactors],
      ['同质化程度', metrics.t0_homogenization],
    ]);

    appendBenchmarkSection(lines, '结构化分析摘要 / T1', [
      ['前三秒内容', metrics.t1_first3sContent],
      ['前三秒画面', metrics.t1_first3sVisuals],
      ['总时长', metrics.t1_duration],
      ['分镜个数', metrics.t1_shotCount],
      ['分镜时长', metrics.t1_shotDuration],
      ['反转数量', metrics.t1_twistCount],
      ['形象主体', metrics.t1_mainSubject],
      ['节奏快慢', metrics.t1_pacing],
    ]);

    appendBenchmarkSection(lines, '结构化分析摘要 / T2', [
      ['画风', metrics.t2_artStyle],
      ['音乐', metrics.t2_music],
      ['音效', metrics.t2_soundEffects],
      ['画面亮度/艳度', metrics.t2_visualBrightness],
      ['表情与肢体生动度', metrics.t2_expressionLiveliness],
      ['动作幅度', metrics.t2_motionMagnitude],
      ['转场剪辑处理', metrics.t2_transitions],
      ['清晰度与画质', metrics.t2_clarity],
      ['配音', metrics.t2_voiceOver],
      ['人群倾向', metrics.t2_demographics],
      ['细节与 Bug', metrics.t2_errors],
    ]);

    appendBenchmarkSection(lines, '结构化分析摘要 / T3', [
      ['主观观看意愿', metrics.t3_subjectiveInterest],
      ['发布时间', metrics.t3_publishTime],
      ['赛道专属指标', metrics.t3_customMetrics],
    ]);
  }

  if (shots?.length) {
    lines.push('');
    lines.push(`分镜拆解记录（共 ${shots.length} 镜头）`);
    shots.forEach((shot, index) => {
      const shotLines = [
        hasBenchmarkText(shot.time) ? `时间：${shot.time}` : null,
        hasBenchmarkText(shot.desc) ? `镜头说明：${shot.desc}` : null,
        hasBenchmarkText(shot.videoPrompt) ? `视频提示词：${shot.videoPrompt}` : null,
        hasBenchmarkText(shot.firstFramePrompt) ? `首帧提示词：${shot.firstFramePrompt}` : null,
        hasBenchmarkText(shot.lastFramePrompt) ? `尾帧提示词：${shot.lastFramePrompt}` : null,
        hasBenchmarkText(shot.adjustment) ? `调整建议：${shot.adjustment}` : null,
      ].filter((item): item is string => item !== null);

      if (shotLines.length === 0) {
        return;
      }

      lines.push('');
      lines.push(`镜头 ${shot.id || index + 1}`);
      lines.push(...shotLines);
    });
  }

  if (lines.length === 0) {
    return '当前记录暂无可展示的拆解方案。该记录可能仍在分析中，或仅保留了基础来源信息。';
  }

  return lines.join('\n');
};

type MockSliceFrameTone = 'warning' | 'accent' | 'success';

type MockSliceFrameLabel = '首帧' | '中段' | '尾帧';

interface MockSliceFrame {
  id: string;
  label: string;
  timecode: string;
  caption: string;
  tone: MockSliceFrameTone;
  imageUrl?: string;
  fallbackImageUrls?: string[];
  promptText?: string;
}

interface MockSliceShot {
  id: string;
  indexLabel: string;
  startSecond: number;
  endSecond: number;
  durationSeconds: number;
  title: string;
  timeRange: string;
  durationLabel: string;
  beatSummary: string;
  scene?: string;
  dialogue?: string;
  transition: string;
  cameraLanguage: string;
  emotionAnchor: string;
  soundDesign: string;
  promptFocus: string;
  clipPath?: string;
  videoUrl?: string;
  reconstruction?: BenchmarkSlicePromptReconstruction;
  frames: MockSliceFrame[];
}

interface SliceFrameViewerState {
  imageUrl: string;
  shotTitle: string;
  frameLabel: string;
  timecode: string;
}

interface SliceParagraphPreview {
  id: string;
  label: string;
  firstShotId: string;
  shotIds: string[];
  shotCount: number;
  shotRangeLabel: string;
  timeRangeLabel: string;
  totalDurationLabel: string;
  primaryScene: string;
  summary: string;
  dialogueExcerpt?: string;
}

interface SliceVideoEvidence {
  id: string;
  label: string;
  title: string;
  timeRange: string;
  durationLabel: string;
  videoUrl?: string;
  posterUrl?: string;
}

interface SliceFilmstripFrame {
  id: string;
  shotLabel: string;
  title: string;
  timecode: string;
  imageUrl: string;
  fallbackImageUrls: string[];
}

interface MergedParagraphVideoState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  videoUrl?: string;
  errorMessage?: string;
}

interface SliceDetailModel {
  id: string;
  kind: 'shot' | 'merged';
  label: string;
  title: string;
  summary: string;
  timeRange: string;
  durationLabel: string;
  shotCount: number;
  scene: string;
  dialogue: string;
  cameraLanguage: string;
  emotionAnchor: string;
  soundDesign: string;
  promptFocus: string;
  frames: MockSliceFrame[];
  filmstripFrames: SliceFilmstripFrame[];
  videoUrl?: string;
  videoEvidence: SliceVideoEvidence[];
  mergedClipPaths: string[];
  reconstructionStatus?: BenchmarkSlicePromptReconstruction['status'];
  reconstructionConfidence?: string | null;
  reconstructionCombinedPrompt?: string;
  reconstructionTransitionSummary?: string;
  reconstructionNegativePrompt?: string;
  continuityNotes: string[];
  missingDetails: string[];
  reconstructionWarnings: string[];
}

type AdaptationDocumentBlockType = 'text' | 'image';

interface AdaptationTextBlock {
  id: string;
  type: 'text';
  content: string;
}

interface AdaptationImageBlock {
  id: string;
  type: 'image';
  imageUrl: string;
  fallbackImageUrls?: string[];
  shotLabel: string;
  shotTitle?: string;
  frameLabel: string;
  timecode: string;
  caption?: string;
  source: 'slice-frame' | 'filmstrip';
}

type AdaptationDocumentBlock = AdaptationTextBlock | AdaptationImageBlock;

interface AdaptationDocument {
  version: 1;
  blocks: AdaptationDocumentBlock[];
}

interface AdaptationImageInsertPayload {
  imageUrl: string;
  fallbackImageUrls?: string[];
  shotLabel: string;
  shotTitle?: string;
  frameLabel: string;
  timecode: string;
  caption?: string;
  source: 'slice-frame' | 'filmstrip';
}

const ADAPTATION_DOCUMENT_PREFIX = '__BIGBANANA_ADAPTATION_DOC__::';

const createAdaptationBlockId = (kind: AdaptationDocumentBlockType): string => (
  `adapt_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
);

const createAdaptationTextBlock = (content = ''): AdaptationTextBlock => ({
  id: createAdaptationBlockId('text'),
  type: 'text',
  content,
});

const createEmptyAdaptationDocument = (): AdaptationDocument => ({
  version: 1,
  blocks: [createAdaptationTextBlock('')],
});

const normalizeAdaptationDocumentBlocks = (blocks: AdaptationDocumentBlock[]): AdaptationDocumentBlock[] => {
  const normalizedBlocks: AdaptationDocumentBlock[] = [];

  blocks.forEach((block) => {
    if (block.type === 'text') {
      const nextContent = typeof block.content === 'string' ? block.content : '';
      const previousBlock = normalizedBlocks[normalizedBlocks.length - 1];
      if (previousBlock?.type === 'text') {
        previousBlock.content = previousBlock.content && nextContent
          ? `${previousBlock.content}\n\n${nextContent}`
          : `${previousBlock.content}${nextContent}`;
        return;
      }

      normalizedBlocks.push({
        id: block.id || createAdaptationBlockId('text'),
        type: 'text',
        content: nextContent,
      });
      return;
    }

    const trimmedImageUrl = String(block.imageUrl || '').trim();
    if (!trimmedImageUrl) {
      return;
    }

    normalizedBlocks.push({
      ...block,
      id: block.id || createAdaptationBlockId('image'),
      imageUrl: trimmedImageUrl,
      fallbackImageUrls: Array.isArray(block.fallbackImageUrls)
        ? block.fallbackImageUrls.map((value) => String(value || '').trim()).filter(Boolean)
        : undefined,
      shotLabel: String(block.shotLabel || '未命名镜头').trim() || '未命名镜头',
      shotTitle: typeof block.shotTitle === 'string' && block.shotTitle.trim() ? block.shotTitle.trim() : undefined,
      frameLabel: String(block.frameLabel || '关键帧').trim() || '关键帧',
      timecode: String(block.timecode || '-').trim() || '-',
      caption: typeof block.caption === 'string' && block.caption.trim() ? block.caption.trim() : undefined,
    });
  });

  return normalizedBlocks.length > 0 ? normalizedBlocks : [createAdaptationTextBlock('')];
};

const coerceAdaptationDocumentBlock = (input: unknown): AdaptationDocumentBlock | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  const type = record.type;
  if (type === 'image') {
    const imageUrl = String(record.imageUrl || '').trim();
    if (!imageUrl) {
      return null;
    }

    return {
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : createAdaptationBlockId('image'),
      type: 'image',
      imageUrl,
      fallbackImageUrls: Array.isArray(record.fallbackImageUrls)
        ? record.fallbackImageUrls.map((value) => String(value || '').trim()).filter(Boolean)
        : undefined,
      shotLabel: typeof record.shotLabel === 'string' && record.shotLabel.trim() ? record.shotLabel.trim() : '未命名镜头',
      shotTitle: typeof record.shotTitle === 'string' && record.shotTitle.trim() ? record.shotTitle.trim() : undefined,
      frameLabel: typeof record.frameLabel === 'string' && record.frameLabel.trim() ? record.frameLabel.trim() : '关键帧',
      timecode: typeof record.timecode === 'string' && record.timecode.trim() ? record.timecode.trim() : '-',
      caption: typeof record.caption === 'string' && record.caption.trim() ? record.caption.trim() : undefined,
      source: record.source === 'filmstrip' ? 'filmstrip' : 'slice-frame',
    };
  }

  if (type === 'text') {
    return {
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : createAdaptationBlockId('text'),
      type: 'text',
      content: typeof record.content === 'string' ? record.content : '',
    };
  }

  return null;
};

const parseStoredAdaptationDocument = (rawValue?: string | null): AdaptationDocument => {
  const source = typeof rawValue === 'string' ? rawValue : '';
  if (!source.trim()) {
    return createEmptyAdaptationDocument();
  }

  if (!source.startsWith(ADAPTATION_DOCUMENT_PREFIX)) {
    return {
      version: 1,
      blocks: [createAdaptationTextBlock(source)],
    };
  }

  try {
    const parsed = JSON.parse(source.slice(ADAPTATION_DOCUMENT_PREFIX.length)) as { version?: number; blocks?: unknown[] };
    const blocks = Array.isArray(parsed.blocks)
      ? parsed.blocks.map((block) => coerceAdaptationDocumentBlock(block)).filter((block): block is AdaptationDocumentBlock => block !== null)
      : [];

    return {
      version: 1,
      blocks: normalizeAdaptationDocumentBlocks(blocks),
    };
  } catch {
    return {
      version: 1,
      blocks: [createAdaptationTextBlock(source)],
    };
  }
};

const getAdaptationDocumentPlainText = (document: AdaptationDocument): string => (
  normalizeAdaptationDocumentBlocks(document.blocks)
    .filter((block): block is AdaptationTextBlock => block.type === 'text')
    .map((block) => block.content)
    .join('\n\n')
);

const countAdaptationImageBlocks = (document: AdaptationDocument): number => (
  normalizeAdaptationDocumentBlocks(document.blocks).filter((block) => block.type === 'image').length
);

const hasAdaptationDocumentContent = (document: AdaptationDocument): boolean => (
  normalizeAdaptationDocumentBlocks(document.blocks).some((block) => block.type === 'image' || block.content.trim().length > 0)
);

const serializeAdaptationDocument = (document: AdaptationDocument): string | undefined => {
  const normalizedBlocks = normalizeAdaptationDocumentBlocks(document.blocks);
  const hasImageBlocks = normalizedBlocks.some((block) => block.type === 'image');

  if (!hasImageBlocks) {
    const plainText = normalizedBlocks
      .filter((block): block is AdaptationTextBlock => block.type === 'text')
      .map((block) => block.content)
      .join('\n\n')
      .trim();
    return plainText || undefined;
  }

  return `${ADAPTATION_DOCUMENT_PREFIX}${JSON.stringify({
    version: 1,
    blocks: normalizedBlocks,
  })}`;
};

const updateAdaptationTextBlock = (
  document: AdaptationDocument,
  blockId: string,
  nextContent: string,
): AdaptationDocument => ({
  version: 1,
  blocks: normalizeAdaptationDocumentBlocks(document.blocks.map((block) => (
    block.type === 'text' && block.id === blockId
      ? { ...block, content: nextContent }
      : block
  ))),
});

const removeAdaptationBlock = (document: AdaptationDocument, blockId: string): AdaptationDocument => ({
  version: 1,
  blocks: normalizeAdaptationDocumentBlocks(document.blocks.filter((block) => block.id !== blockId)),
});

const appendAdaptationImageBlock = (
  document: AdaptationDocument,
  payload: AdaptationImageInsertPayload,
): { document: AdaptationDocument; focusBlockId: string } => {
  const normalizedBlocks = normalizeAdaptationDocumentBlocks(document.blocks);
  const lastBlock = normalizedBlocks[normalizedBlocks.length - 1];
  const trailingEditableTextBlock = lastBlock?.type === 'text' && !lastBlock.content.trim()
    ? lastBlock
    : createAdaptationTextBlock('');
  const baseBlocks = lastBlock?.id === trailingEditableTextBlock.id
    ? normalizedBlocks.slice(0, -1)
    : normalizedBlocks;

  const imageBlock: AdaptationImageBlock = {
    id: createAdaptationBlockId('image'),
    type: 'image',
    imageUrl: payload.imageUrl,
    fallbackImageUrls: payload.fallbackImageUrls,
    shotLabel: payload.shotLabel,
    shotTitle: payload.shotTitle,
    frameLabel: payload.frameLabel,
    timecode: payload.timecode,
    caption: payload.caption,
    source: payload.source,
  };

  return {
    document: {
      version: 1,
      blocks: [...baseBlocks, imageBlock, trailingEditableTextBlock],
    },
    focusBlockId: trailingEditableTextBlock.id,
  };
};

const SLICE_PARAGRAPH_MAX_SHOTS = 4;
const SLICE_PARAGRAPH_MAX_DURATION_SECONDS = 18;
const SLICE_PARAGRAPH_MAX_GAP_SECONDS = 1.25;
const SLICE_PARAGRAPH_RESET_HINT_PATTERN = /(黑场|淡入|淡出|闪回|回忆|字幕|章节|空镜|建立镜|场景切换|时间跳|新场景|镜头重置|切回现实)/i;
const SLICE_EMPTY_DIALOGUE_PATTERN = /^[（(]?(无|none|n\/a|暂无|空)[）)]?$/i;

const hasUsableSliceMetaText = (value?: string | null): boolean => hasMeaningfulSliceText(value) && value.trim() !== '-';

const hasUsableSliceDialogueText = (value?: string | null): boolean => {
  if (!hasMeaningfulSliceText(value)) return false;
  const normalized = value.trim();
  return normalized !== '-' && !SLICE_EMPTY_DIALOGUE_PATTERN.test(normalized);
};

const normalizeSliceGroupingToken = (value?: string | null): string => (
  hasUsableSliceMetaText(value) ? value.trim().toLowerCase() : ''
);

const truncateSliceParagraphText = (value: string, maxLength: number): string => (
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
);

const getSliceShotStartLabel = (shot: MockSliceShot): string => (
  shot.timeRange.split(' - ')[0]?.trim() || formatMockSliceTimecode(shot.startSecond)
);

const getSliceShotEndLabel = (shot: MockSliceShot): string => {
  const timeRangeParts = shot.timeRange.split(' - ');
  return timeRangeParts[timeRangeParts.length - 1]?.trim() || formatMockSliceTimecode(shot.endSecond);
};

const getSliceParagraphPrimaryScene = (shots: MockSliceShot[]): string => {
  const sceneCounts = new Map<string, number>();
  shots.forEach((shot) => {
    if (!hasUsableSliceMetaText(shot.scene)) {
      return;
    }
    const normalizedScene = shot.scene!.trim();
    sceneCounts.set(normalizedScene, (sceneCounts.get(normalizedScene) || 0) + 1);
  });

  const primarySceneEntry = Array.from(sceneCounts.entries())
    .sort((left, right) => right[1] - left[1])[0];
  return primarySceneEntry?.[0] || '未标注场景';
};

const getSliceParagraphSummary = (shots: MockSliceShot[]): string => {
  const candidates = Array.from(new Set(
    shots
      .map((shot) => shot.beatSummary?.trim())
      .filter((value): value is string => hasUsableSliceMetaText(value)),
  ));

  if (candidates.length === 0) {
    const fallbackTitles = Array.from(new Set(
      shots
        .map((shot) => shot.title?.trim())
        .filter((value): value is string => hasUsableSliceMetaText(value)),
    ));
    return truncateSliceParagraphText(fallbackTitles.slice(0, 2).join(' → ') || '当前段落可继续进入首镜头做精修检查。', 78);
  }

  return truncateSliceParagraphText(candidates.slice(0, 2).join(' → '), 78);
};

const getSliceParagraphDialogueExcerpt = (shots: MockSliceShot[]): string | undefined => {
  const dialogue = shots
    .map((shot) => shot.dialogue?.trim())
    .filter((value): value is string => hasUsableSliceDialogueText(value))
    .slice(0, 2)
    .join(' / ');
  return dialogue ? truncateSliceParagraphText(dialogue, 72) : undefined;
};

const formatSliceDialogueAggregate = (
  values: Array<string | null | undefined>,
  options: {
    fallback?: string;
    maxItems?: number;
    maxLength?: number;
    separator?: string;
  } = {},
): string => {
  const orderedValues = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => hasUsableSliceDialogueText(value));

  if (orderedValues.length === 0) {
    return options.fallback ?? '当前合并段落暂无对白内容。';
  }

  return truncateSliceParagraphText(
    orderedValues.slice(0, options.maxItems ?? orderedValues.length).join(options.separator ?? ' / '),
    options.maxLength ?? 156,
  );
};

const collectSliceMetaTexts = (
  values: Array<string | null | undefined>,
  options: { allowDash?: boolean } = {},
): string[] => Array.from(new Set(
  values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0 && (options.allowDash || value !== '-')),
));

const formatSliceMetaAggregate = (
  values: Array<string | null | undefined>,
  options: {
    allowDash?: boolean;
    fallback?: string;
    maxItems?: number;
    maxLength?: number;
    separator?: string;
  } = {},
): string => {
  const uniqueValues = collectSliceMetaTexts(values, { allowDash: options.allowDash });
  if (uniqueValues.length === 0) {
    return options.fallback ?? '-';
  }

  return truncateSliceParagraphText(
    uniqueValues.slice(0, options.maxItems ?? uniqueValues.length).join(options.separator ?? ' · '),
    options.maxLength ?? 96,
  );
};

const mergeSliceReconstructionStatus = (
  reconstructions: BenchmarkSlicePromptReconstruction[],
): BenchmarkSlicePromptReconstruction['status'] | undefined => {
  const statuses = reconstructions
    .map((item) => item.status)
    .filter((status): status is NonNullable<BenchmarkSlicePromptReconstruction['status']> => !!status);

  if (statuses.length === 0) return undefined;
  if (statuses.every((status) => status === 'ok')) return 'ok';
  if (statuses.every((status) => status === 'skipped')) return 'skipped';
  if (statuses.every((status) => status === 'failed')) return 'failed';
  if (statuses.every((status) => status === 'pending')) return 'pending';
  if (statuses.some((status) => status === 'ok' || status === 'partial')) return 'partial';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  return statuses[0];
};

const createMergedSliceFrame = (
  paragraphId: string,
  label: MockSliceFrameLabel,
  baseFrame: MockSliceFrame | undefined,
  fallbackTimecode: string,
  fallbackCaption: string,
): MockSliceFrame => ({
  id: `${paragraphId}-${label}`,
  label,
  timecode: baseFrame?.timecode || fallbackTimecode,
  caption: truncateSliceParagraphText(baseFrame?.caption || fallbackCaption, 92),
  tone: baseFrame?.tone || (label === '首帧' ? 'warning' : label === '尾帧' ? 'success' : 'accent'),
  imageUrl: baseFrame?.imageUrl,
  fallbackImageUrls: baseFrame?.fallbackImageUrls,
  promptText: baseFrame?.promptText,
});

const buildMergedSliceFrames = (paragraphId: string, paragraphShots: MockSliceShot[]): MockSliceFrame[] => {
  const firstShot = paragraphShots[0];
  const middleShot = paragraphShots[Math.floor((paragraphShots.length - 1) / 2)] || firstShot;
  const lastShot = paragraphShots[paragraphShots.length - 1] || firstShot;
  if (!firstShot || !middleShot || !lastShot) {
    return [];
  }

  const firstFrame = firstShot.frames.find((frame) => frame.label === '首帧') || firstShot.frames[0];
  const middleFrame = middleShot.frames.find((frame) => frame.label === '中段') || middleShot.frames[1] || middleShot.frames[0];
  const lastFrame = lastShot.frames.find((frame) => frame.label === '尾帧') || lastShot.frames[lastShot.frames.length - 1];

  return [
    createMergedSliceFrame(
      paragraphId,
      '首帧',
      firstFrame,
      formatMockSliceTimecode(firstShot.startSecond),
      `段首参考（镜头 ${firstShot.indexLabel}）· ${firstShot.beatSummary}`,
    ),
    createMergedSliceFrame(
      paragraphId,
      '中段',
      middleFrame,
      formatMockSliceTimecode((firstShot.startSecond + lastShot.endSecond) / 2),
      `段中参考（镜头 ${middleShot.indexLabel}）· ${middleShot.beatSummary}`,
    ),
    createMergedSliceFrame(
      paragraphId,
      '尾帧',
      lastFrame,
      formatMockSliceTimecode(lastShot.endSecond),
      `段尾参考（镜头 ${lastShot.indexLabel}）· ${lastShot.beatSummary}`,
    ),
  ];
};

const buildMergedSliceFilmstripFrames = (paragraphId: string, paragraphShots: MockSliceShot[]): SliceFilmstripFrame[] => (
  paragraphShots
    .map((shot) => {
      const middleFrame = shot.frames.find((frame) => frame.label === '中段') || shot.frames[1] || shot.frames[0];
      if (!middleFrame?.imageUrl) {
        return null;
      }

      return {
        id: `${paragraphId}-${shot.id}-filmstrip`,
        shotLabel: `镜头 ${shot.indexLabel}`,
        title: shot.title,
        timecode: middleFrame.timecode,
        imageUrl: middleFrame.imageUrl,
        fallbackImageUrls: middleFrame.fallbackImageUrls || [],
      };
    })
    .filter((frame): frame is SliceFilmstripFrame => frame !== null)
);

const buildSliceShotDetail = (shot: MockSliceShot): SliceDetailModel => ({
  id: shot.id,
  kind: 'shot',
  label: `镜头 ${shot.indexLabel}`,
  title: shot.title,
  summary: shot.beatSummary,
  timeRange: shot.timeRange,
  durationLabel: shot.durationLabel,
  shotCount: 1,
  scene: shot.scene || '-',
  dialogue: shot.dialogue && shot.dialogue !== '-' ? shot.dialogue : '当前镜头暂无对白内容。',
  cameraLanguage: shot.cameraLanguage,
  emotionAnchor: shot.emotionAnchor,
  soundDesign: shot.soundDesign,
  promptFocus: shot.promptFocus,
  frames: shot.frames,
  filmstripFrames: [],
  videoUrl: shot.videoUrl,
  videoEvidence: [{
    id: `${shot.id}-video`,
    label: `镜头 ${shot.indexLabel}`,
    title: shot.title,
    timeRange: shot.timeRange,
    durationLabel: shot.durationLabel,
    videoUrl: shot.videoUrl,
    posterUrl: shot.frames[0]?.imageUrl,
  }],
  mergedClipPaths: [],
  reconstructionStatus: shot.reconstruction?.status,
  reconstructionConfidence: shot.reconstruction?.confidence,
  reconstructionCombinedPrompt: shot.reconstruction?.combined_prompt,
  reconstructionTransitionSummary: shot.reconstruction?.transition_summary,
  reconstructionNegativePrompt: shot.reconstruction?.negative_prompt,
  continuityNotes: shot.reconstruction?.continuity_notes?.filter((item) => hasMeaningfulSliceText(item)) || [],
  missingDetails: shot.reconstruction?.missing_details?.filter((item) => hasMeaningfulSliceText(item)) || [],
  reconstructionWarnings: shot.reconstruction?.warnings?.filter((item) => hasMeaningfulSliceText(item)) || [],
});

const buildSliceParagraphDetail = (
  paragraph: SliceParagraphPreview,
  paragraphShots: MockSliceShot[],
): SliceDetailModel => {
  const reconstructions = paragraphShots
    .map((shot) => shot.reconstruction)
    .filter((item): item is BenchmarkSlicePromptReconstruction => !!item);
  const reconstructedCount = paragraphShots.filter((shot) => {
    const status = shot.reconstruction?.status;
    return status === 'ok' || status === 'partial';
  }).length;

  return {
    id: paragraph.id,
    kind: 'merged',
    label: paragraph.label,
    title: paragraph.shotRangeLabel,
    summary: paragraph.summary,
    timeRange: paragraph.timeRangeLabel,
    durationLabel: paragraph.totalDurationLabel,
    shotCount: paragraph.shotCount,
    scene: paragraph.primaryScene,
    dialogue: formatSliceDialogueAggregate(
      paragraphShots.map((shot) => shot.dialogue),
      { fallback: '当前合并段落暂无对白内容。', maxItems: 3, maxLength: 156, separator: ' / ' },
    ),
    cameraLanguage: formatSliceMetaAggregate(paragraphShots.map((shot) => shot.cameraLanguage)),
    emotionAnchor: formatSliceMetaAggregate(paragraphShots.map((shot) => shot.emotionAnchor)),
    soundDesign: formatSliceMetaAggregate(paragraphShots.map((shot) => shot.soundDesign)),
    promptFocus: formatSliceMetaAggregate(paragraphShots.map((shot) => shot.promptFocus), { maxLength: 120 }),
    frames: buildMergedSliceFrames(paragraph.id, paragraphShots),
    filmstripFrames: buildMergedSliceFilmstripFrames(paragraph.id, paragraphShots),
    videoEvidence: paragraphShots.map((shot) => ({
      id: `${paragraph.id}-${shot.id}-video`,
      label: `镜头 ${shot.indexLabel}`,
      title: shot.title,
      timeRange: shot.timeRange,
      durationLabel: shot.durationLabel,
      videoUrl: shot.videoUrl,
      posterUrl: shot.frames[0]?.imageUrl,
    })),
    mergedClipPaths: paragraphShots.map((shot) => shot.clipPath).filter((value): value is string => !!value && value.trim().length > 0),
    reconstructionStatus: mergeSliceReconstructionStatus(reconstructions),
    reconstructionConfidence: reconstructedCount > 0 ? `${reconstructedCount}/${paragraph.shotCount} 条镜头已完成反推` : null,
    reconstructionCombinedPrompt: formatSliceMetaAggregate(
      reconstructions.map((item) => item.combined_prompt),
      { fallback: '', maxItems: 2, maxLength: 180, separator: ' / ' },
    ) || undefined,
    reconstructionTransitionSummary: formatSliceMetaAggregate(
      reconstructions.map((item) => item.transition_summary),
      { fallback: '', maxItems: 2, maxLength: 160, separator: ' / ' },
    ) || undefined,
    reconstructionNegativePrompt: formatSliceMetaAggregate(
      reconstructions.map((item) => item.negative_prompt),
      { fallback: '', maxItems: 2, maxLength: 160, separator: ' / ' },
    ) || undefined,
    continuityNotes: collectSliceMetaTexts(reconstructions.flatMap((item) => item.continuity_notes || [])),
    missingDetails: collectSliceMetaTexts(reconstructions.flatMap((item) => item.missing_details || [])),
    reconstructionWarnings: collectSliceMetaTexts(reconstructions.flatMap((item) => item.warnings || [])),
  };
};

const shouldStartNewSliceParagraph = (paragraphShots: MockSliceShot[], nextShot: MockSliceShot): boolean => {
  if (paragraphShots.length === 0) {
    return false;
  }

  const firstShot = paragraphShots[0];
  const previousShot = paragraphShots[paragraphShots.length - 1];
  const accumulatedDurationSeconds = Math.max(0, nextShot.endSecond - firstShot.startSecond);
  const gapSeconds = nextShot.startSecond - previousShot.endSecond;
  const previousScene = normalizeSliceGroupingToken(previousShot.scene);
  const nextScene = normalizeSliceGroupingToken(nextShot.scene);
  const resetHintSource = [
    previousShot.transition,
    nextShot.transition,
    nextShot.title,
    nextShot.beatSummary,
  ].filter((value): value is string => hasUsableSliceMetaText(value)).join(' ');

  const exceedsShotCap = paragraphShots.length >= SLICE_PARAGRAPH_MAX_SHOTS;
  const exceedsDurationCap = accumulatedDurationSeconds > SLICE_PARAGRAPH_MAX_DURATION_SECONDS;
  const breaksSceneContinuity = !!previousScene && !!nextScene && previousScene !== nextScene;
  const breaksTimeContinuity = gapSeconds > SLICE_PARAGRAPH_MAX_GAP_SECONDS || gapSeconds < -0.5;
  const hasResetHint = paragraphShots.length >= 2 && SLICE_PARAGRAPH_RESET_HINT_PATTERN.test(resetHintSource);

  return exceedsShotCap || exceedsDurationCap || breaksSceneContinuity || breaksTimeContinuity || hasResetHint;
};

const buildSliceParagraphPreviews = (shots: MockSliceShot[]): SliceParagraphPreview[] => {
  if (shots.length === 0) {
    return [];
  }

  const groupedShots: MockSliceShot[][] = [];

  shots.forEach((shot) => {
    const currentGroup = groupedShots[groupedShots.length - 1];
    if (!currentGroup || shouldStartNewSliceParagraph(currentGroup, shot)) {
      groupedShots.push([shot]);
      return;
    }
    currentGroup.push(shot);
  });

  return groupedShots.map((paragraphShots, index) => {
    const firstShot = paragraphShots[0];
    const lastShot = paragraphShots[paragraphShots.length - 1];
    const totalDurationSeconds = Math.max(
      0,
      paragraphShots.reduce((maxValue, shot) => Math.max(maxValue, shot.endSecond), firstShot.endSecond) - firstShot.startSecond,
    );
    const shotRangeLabel = firstShot.indexLabel === lastShot.indexLabel
      ? `覆盖镜头 ${firstShot.indexLabel}`
      : `覆盖镜头 ${firstShot.indexLabel}-${lastShot.indexLabel}`;

    return {
      id: `slice-paragraph-${String(index + 1).padStart(2, '0')}-${firstShot.id}`,
      label: `段落 P${String(index + 1).padStart(2, '0')}`,
      firstShotId: firstShot.id,
      shotIds: paragraphShots.map((shot) => shot.id),
      shotCount: paragraphShots.length,
      shotRangeLabel,
      timeRangeLabel: `${getSliceShotStartLabel(firstShot)} - ${getSliceShotEndLabel(lastShot)}`,
      totalDurationLabel: formatSliceDurationLabel(totalDurationSeconds),
      primaryScene: getSliceParagraphPrimaryScene(paragraphShots),
      summary: getSliceParagraphSummary(paragraphShots),
      dialogueExcerpt: getSliceParagraphDialogueExcerpt(paragraphShots),
    };
  });
};

const readSliceSourceValue = (sourceRow: Record<string, unknown> | undefined, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = sourceRow?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const parseSliceTimecodeToSeconds = (value?: string): number | null => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const segments = normalized.split(':');
  const parsedSegments = segments.map((segment) => Number(segment));
  if (parsedSegments.some((segment) => !Number.isFinite(segment))) return null;

  if (parsedSegments.length === 2) {
    const [minutes, seconds] = parsedSegments;
    return (minutes * 60) + seconds;
  }

  if (parsedSegments.length === 3) {
    const [hours, minutes, seconds] = parsedSegments;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return null;
};

const formatSliceDurationLabel = (seconds?: number): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '-';
  return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1).replace(/\.0$/, '')} 秒`;
};

const hasMeaningfulSliceText = (value?: string | null): boolean => typeof value === 'string' && value.trim().length > 0;

const getSliceFramePrompt = (
  reconstruction: BenchmarkSlicePromptReconstruction | undefined,
  label: MockSliceFrameLabel,
): string | undefined => {
  if (!reconstruction) return undefined;
  if (label === '首帧') return reconstruction.first_frame_prompt?.trim() || undefined;
  if (label === '中段') return reconstruction.middle_frame_prompt?.trim() || undefined;
  if (label === '尾帧') return reconstruction.last_frame_prompt?.trim() || undefined;
  return undefined;
};

const getSliceReconstructionStatusLabel = (status?: BenchmarkSlicePromptReconstruction['status']): string => {
  if (status === 'ok') return '已重建';
  if (status === 'partial') return '部分可用';
  if (status === 'pending') return '待完成';
  if (status === 'skipped') return '已跳过';
  if (status === 'failed') return '重建失败';
  return '暂无结果';
};

const buildSlicePreviewShotId = (shot: BenchmarkSliceManifestShot, manifestIndex: number): string => {
  const idParts = [
    `slice-shot-${String(manifestIndex + 1).padStart(3, '0')}`,
    shot.start_time,
    shot.end_time,
    shot.first_frame_path,
    shot.last_frame_path,
  ];

  return idParts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('__');
};

const buildSlicePreviewFrames = (
  shot: BenchmarkSliceManifestShot,
  sourceRow?: Record<string, unknown>,
  outputDir?: string,
  reconstruction?: BenchmarkSlicePromptReconstruction,
): MockSliceFrame[] => {
  const startSeconds = parseSliceTimecodeToSeconds(shot.start_time);
  const endSeconds = parseSliceTimecodeToSeconds(shot.end_time);
  const midpointSeconds = startSeconds !== null && endSeconds !== null ? (startSeconds + endSeconds) / 2 : null;
  const summary = readSliceSourceValue(sourceRow, 'summary', 'beat_summary', 'notes', 'desc') || '用于快速浏览当前镜头的节奏和构图。';
  const middleFrameCandidates = resolveBenchmarkSliceMiddleFrameCandidates(shot);
  const representativeMiddleFrame = resolveBenchmarkSliceRepresentativeMiddleFrame(shot);
  const middleFrameImageUrls = middleFrameCandidates
    .map((candidate) => buildStoryboardSlicingAssetUrl(candidate.framePath, outputDir))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const middleTimecode = startSeconds !== null && typeof representativeMiddleFrame?.timestampSeconds === 'number'
    ? formatMockSliceTimecode(startSeconds + representativeMiddleFrame.timestampSeconds)
    : midpointSeconds !== null
      ? formatMockSliceTimecode(midpointSeconds)
      : shot.start_time;

  return [
    {
      id: `${shot.base_name}-first`,
      label: '首帧',
      timecode: shot.start_time,
      caption: `起始落点：${summary}`,
      tone: 'warning',
      imageUrl: buildStoryboardSlicingAssetUrl(shot.first_frame_path, outputDir),
      promptText: getSliceFramePrompt(reconstruction, '首帧'),
    },
      {
        id: `${shot.base_name}-middle`,
        label: '中段',
        timecode: middleTimecode,
        caption: readSliceSourceValue(sourceRow, 'middle_caption', 'prompt_focus') || '中段参考帧用于查看镜头中段的信息密度与动作推进。',
        tone: 'accent',
        imageUrl: middleFrameImageUrls[0],
        fallbackImageUrls: middleFrameImageUrls.slice(1),
        promptText: getSliceFramePrompt(reconstruction, '中段'),
      },
    {
      id: `${shot.base_name}-last`,
      label: '尾帧',
      timecode: shot.end_time,
      caption: readSliceSourceValue(sourceRow, 'tail_caption', 'adjustment') || '尾帧用于确认镜头收束、转场落点与可衔接性。',
      tone: 'success',
      imageUrl: buildStoryboardSlicingAssetUrl(shot.last_frame_path, outputDir),
      promptText: getSliceFramePrompt(reconstruction, '尾帧'),
    },
  ];
};

const mapSliceArtifactToPreviewShots = (sliceArtifact?: BenchmarkSliceArtifact): MockSliceShot[] => {
  const manifestShots = sliceArtifact?.manifest?.shots || [];
  return manifestShots
    .map((shot, manifestIndex) => ({ shot, manifestIndex }))
    .filter(({ shot }) => shot.status !== 'failed' || shot.first_frame_path || shot.last_frame_path)
    .map(({ shot, manifestIndex }, index) => {
      const sourceRow = shot.source_row;
      const reconstruction = shot.reconstruction;
      const indexLabel = String(shot.shot_number || index + 1).padStart(2, '0');
      const durationSeconds = typeof shot.duration_seconds === 'number' && Number.isFinite(shot.duration_seconds) ? shot.duration_seconds : 0;
      const title = readSliceSourceValue(sourceRow, 'title') || `镜头 ${indexLabel}`;
      const beatSummary = readSliceSourceValue(sourceRow, 'summary', 'beat_summary', 'notes', 'desc') || '当前镜头已完成拆片，可继续检查三帧和节奏落点。';

      return {
        id: buildSlicePreviewShotId(shot, manifestIndex),
        indexLabel,
        startSecond: parseSliceTimecodeToSeconds(shot.start_time) ?? index * 3,
        endSecond: parseSliceTimecodeToSeconds(shot.end_time) ?? ((index + 1) * 3),
        durationSeconds,
        title,
        timeRange: `${shot.start_time} - ${shot.end_time}`,
        durationLabel: formatSliceDurationLabel(durationSeconds),
        beatSummary,
        scene: readSliceSourceValue(sourceRow, 'scene', '场景') || '-',
        dialogue: readSliceSourceValue(sourceRow, 'dialogue', '角色台词', '台词') || '-',
        transition: readSliceSourceValue(sourceRow, 'transition', 'transition_mode') || shot.status,
        cameraLanguage: readSliceSourceValue(sourceRow, 'camera_language', 'camera_movement', 'camera') || '-',
        emotionAnchor: readSliceSourceValue(sourceRow, 'emotion_anchor', 'emotion') || '-',
        soundDesign: readSliceSourceValue(sourceRow, 'sound_design', 'sound') || '-',
        promptFocus: readSliceSourceValue(sourceRow, 'prompt_focus', 'props_vfx', 'visual_focus') || '-',
        clipPath: shot.clip_path,
        videoUrl: buildStoryboardSlicingAssetUrl(shot.clip_path, sliceArtifact?.outputDir),
        reconstruction,
        frames: buildSlicePreviewFrames(shot, sourceRow, sliceArtifact?.outputDir, reconstruction),
      };
    });
};

interface MockSliceFrameTemplate {
  label: MockSliceFrameLabel;
  timeOffsetSeconds: number;
  caption: string;
  tone: MockSliceFrameTone;
}

interface MockSliceShotTemplate {
  title: string;
  durationSeconds: number;
  beatSummary: string;
  transition: string;
  cameraLanguage: string;
  emotionAnchor: string;
  soundDesign: string;
  promptFocus: string;
  frames: MockSliceFrameTemplate[];
}

interface GeneratedMockSliceBlueprint {
  title: string;
  beatSummary: string;
  transition: string;
  cameraLanguage: string;
  emotionAnchor: string;
  soundDesign: string;
  promptFocus: string;
  frameCaptions: [string, string, string];
}

const padMockSliceNumber = (value: number): string => String(value).padStart(2, '0');

const formatMockSliceTimestamp = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${padMockSliceNumber(minutes)}:${padMockSliceNumber(remainingSeconds)}`;
};

const formatMockSliceTimecode = (seconds: number): string => {
  const totalTenths = Math.max(0, Math.round(seconds * 10));
  const minutes = Math.floor(totalTenths / 600);
  const remainingTenths = totalTenths % 600;
  const remainingSeconds = Math.floor(remainingTenths / 10);
  const tenths = remainingTenths % 10;
  return `${padMockSliceNumber(minutes)}:${padMockSliceNumber(remainingSeconds)}.${tenths}`;
};

const buildMockSliceShot = (
  index: number,
  startSecond: number,
  template: MockSliceShotTemplate
): MockSliceShot => {
  const shotId = `mock-shot-${padMockSliceNumber(index)}`;
  const endSecond = startSecond + template.durationSeconds;

  return {
    id: shotId,
    indexLabel: padMockSliceNumber(index),
    startSecond,
    endSecond,
    durationSeconds: template.durationSeconds,
    title: template.title,
    timeRange: `${formatMockSliceTimestamp(startSecond)} - ${formatMockSliceTimestamp(endSecond)}`,
    durationLabel: `${template.durationSeconds} 秒`,
    beatSummary: template.beatSummary,
    scene: '-',
    dialogue: '-',
    transition: template.transition,
    cameraLanguage: template.cameraLanguage,
    emotionAnchor: template.emotionAnchor,
    soundDesign: template.soundDesign,
    promptFocus: template.promptFocus,
    reconstruction: undefined,
    frames: template.frames.map((frame, frameIndex) => ({
      id: `${shotId}-frame-${padMockSliceNumber(frameIndex + 1)}`,
      label: frame.label,
      timecode: formatMockSliceTimecode(startSecond + Math.min(template.durationSeconds, Math.max(0, frame.timeOffsetSeconds))),
      caption: frame.caption,
      tone: frame.tone,
      promptText: undefined,
    })),
  };
};

const AUTHORED_MOCK_SLICE_SHOT_TEMPLATES: MockSliceShotTemplate[] = [
  {
    title: '冷开场反差入镜',
    durationSeconds: 4,
    beatSummary: '先抛结果、后补原因，让观众在第一眼抓到冲突。',
    transition: '黑场硬切，开门瞬间直接入画。',
    cameraLanguage: '中近景推进，镜头跟着视线轻压。',
    emotionAnchor: '紧张里带一点确认感，压住但不失控。',
    soundDesign: '轻脉冲低频 + 门轴金属响，快速拉起注意力。',
    promptFocus: '保留屏幕冷光与人物脸侧高光反差，先建立信息密度。',
    frames: [
      { label: '首帧', timeOffsetSeconds: 0.2, caption: '门刚打开，冷光先打在人物脸侧，画面带出第一层悬念。', tone: 'warning' },
      { label: '中段', timeOffsetSeconds: 2.1, caption: '镜头压近到胸像，主角抬眼确认目标，节奏开始收紧。', tone: 'accent' },
      { label: '尾帧', timeOffsetSeconds: 3.8, caption: '屏幕反光切到面部高亮，留下一个可无缝硬切的落点。', tone: 'success' },
    ],
  },
  {
    title: '信息抛出与视线锁定',
    durationSeconds: 5,
    beatSummary: '用一组连续视线切换，把核心信息稳定送到观众面前。',
    transition: '延续上一镜头尾帧的反光区域做视觉接缝。',
    cameraLanguage: '肩后视角切到正反打，保持注视方向统一。',
    emotionAnchor: '从疑惑进入判断，节奏更像在读一条关键消息。',
    soundDesign: '底噪压低，加入轻微提示音，把信息节点做得更清晰。',
    promptFocus: '让视线方向、屏幕文字区域和手部动作形成同一视觉路径。',
    frames: [
      { label: '首帧', timeOffsetSeconds: 0.1, caption: '肩后视角带出屏幕内容，人物肩线稳定画面重心。', tone: 'accent' },
      { label: '中段', timeOffsetSeconds: 2.0, caption: '切到正面近景，眼神短暂停顿，信息被真正“看见”。', tone: 'success' },
      { label: '尾帧', timeOffsetSeconds: 4.7, caption: '指尖滑过屏幕边缘，为下一个动作镜头留出明确方向。', tone: 'warning' },
    ],
  },
  {
    title: '动作补偿与节奏抬升',
    durationSeconds: 5,
    beatSummary: '信息确认后立刻补动作，让叙事从理解进入执行。',
    transition: '利用手部运动方向做顺势切换，避免停顿感。',
    cameraLanguage: '侧向跟拍 + 轻摇镜，制造紧跟感和推动力。',
    emotionAnchor: '决心感开始上升，画面不再犹豫。',
    soundDesign: '脚步声和布料摩擦被抬到前景，强化执行感。',
    promptFocus: '动作线要清楚，主体移动轨迹比背景细节更重要。',
    frames: [
      { label: '首帧', timeOffsetSeconds: 0.2, caption: '人物侧身起步，肩颈线先动，画面开始带出方向性。', tone: 'success' },
      { label: '中段', timeOffsetSeconds: 2.4, caption: '跟拍速度抬高，背景被轻微拉开，动作动势变得更明确。', tone: 'warning' },
      { label: '尾帧', timeOffsetSeconds: 4.9, caption: '在一个偏强的身体停顿处收镜，为下一个重点镜头蓄力。', tone: 'accent' },
    ],
  },
  {
    title: '收束定格与情绪回钩',
    durationSeconds: 5,
    beatSummary: '用短暂停顿回钩情绪，让整段切片在尾部留下记忆点。',
    transition: '从动作余势直接切静态构图，形成明显收束。',
    cameraLanguage: '镜头减速后停在半身构图，留足封面感。',
    emotionAnchor: '从执行切回情绪，让观众记住最后的表情信号。',
    soundDesign: '音乐保留延音，环境声渐退，结尾更干净。',
    promptFocus: '让表情、肩线和背景留白共同构成结尾主视觉。',
    frames: [
      { label: '首帧', timeOffsetSeconds: 0.3, caption: '动作刚结束，呼吸感仍在，画面保留一点余势。', tone: 'warning' },
      { label: '中段', timeOffsetSeconds: 2.2, caption: '镜头减速停稳，面部表情成为新的视觉中心。', tone: 'accent' },
      { label: '尾帧', timeOffsetSeconds: 4.8, caption: '背景留白与人物轮廓形成封面式定格，便于继续衍生封面图。', tone: 'success' },
    ],
  },
];

const GENERATED_MOCK_SLICE_DURATION_PATTERN = [4, 5, 4, 5, 4, 5, 4, 5];
const GENERATED_MOCK_SLICE_PHASE_LABELS = ['推进段', '逼近段', '翻转段', '收束段'];
const GENERATED_MOCK_SLICE_BLUEPRINTS: GeneratedMockSliceBlueprint[] = [
  {
    title: '空间压迫升级',
    beatSummary: '用连续位移把空间层级和目标压力一起推进。',
    transition: '以前景擦切接入下一段走位，保证横向速度不断。',
    cameraLanguage: '手持侧跟 + 轻推近，保持纵深压迫。',
    emotionAnchor: '搜寻感被拉紧，观众开始预感到更大的阻力。',
    soundDesign: '脚步混响抬高，环境低频稳稳托住推进感。',
    promptFocus: '优先保留走廊纵深、人物轮廓和前景遮挡关系。',
    frameCaptions: [
      '前景遮挡掠过镜头边缘，空间压迫感先被建立。',
      '主体穿过第二层景别，纵深关系开始真正工作。',
      '在走位快到尽头时收住，给下一个决策镜头留接口。',
    ],
  },
  {
    title: '手部特写与证据强化',
    beatSummary: '把关键物件单独抬出来，确保观众不会漏掉信息锚点。',
    transition: '沿着动作末端切到细节特写，让焦点自然落下。',
    cameraLanguage: '特写微推进，景深压浅，视觉注意力更集中。',
    emotionAnchor: '确认感更强，像是终于抓到真正有效的线索。',
    soundDesign: '轻敲、摩擦和提示音被前置，形成细节层次。',
    promptFocus: '把手势、物件边缘高光和文字区域做成同一焦点。',
    frameCaptions: [
      '手部动作刚触到物件，信息锚点第一次被明确提出。',
      '镜头轻推到最清晰的位置，证据细节成为唯一中心。',
      '手势离开前留出一瞬静止，方便衔接后续反应镜头。',
    ],
  },
  {
    title: '反应切换与信息回传',
    beatSummary: '让人物反应接住刚出现的信息，把理解过程显性化。',
    transition: '借由视线方向顺切，保持观众的注意力不掉线。',
    cameraLanguage: '正反打切换，镜头语言尽量克制，突出眼神变化。',
    emotionAnchor: '从接收信息切到内心判断，紧张感更人性化。',
    soundDesign: '环境底噪稍微抽空，让呼吸和小动作更可感。',
    promptFocus: '优先刻画眼神停顿、面部肌肉和视线落点。',
    frameCaptions: [
      '人物先给出短暂停顿，像在把新信息快速吞下去。',
      '正面近景让表情变化完全暴露，判断过程被看见。',
      '目光转向下一处目标，给动作接力提供明确方向。',
    ],
  },
  {
    title: '环境插切与威胁预告',
    beatSummary: '插入空间信息，让未出现的风险先在观众脑中成形。',
    transition: '用声音先行，再让画面补上空间威胁。',
    cameraLanguage: '静态广角 + 轻微摇移，强调环境的先知感。',
    emotionAnchor: '不安感被放大，叙事开始出现看不见的对手。',
    soundDesign: '远处回响与空气噪点增多，制造预警氛围。',
    promptFocus: '优先经营留白、门缝、反光和背景深处的未知信息。',
    frameCaptions: [
      '环境先空出来，观众会本能寻找潜在威胁的位置。',
      '轻微摇移把风险区域推入中心，预警感被悄悄放大。',
      '在尚未揭露真相前收住，方便下一镜直接接危机响应。',
    ],
  },
  {
    title: '关系对峙与镜面反打',
    beatSummary: '把人物与对手或信息源放到同一张心理桌面上。',
    transition: '借助对视方向或镜面反光，形成稳定切换节奏。',
    cameraLanguage: '中近景对切，镜面元素辅助建立双向张力。',
    emotionAnchor: '压抑与挑衅同时出现，气氛开始变得更锋利。',
    soundDesign: '音乐延音拉长，局部金属或玻璃质感被凸显。',
    promptFocus: '保持对视轴线、轮廓边光和镜面层次的清晰度。',
    frameCaptions: [
      '人物先被放在镜面或反光边缘，关系张力开始露头。',
      '对视轴线被锁住，观众能感到双方都在等待先手。',
      '在情绪快要溢出前停住，为下一次动作释放蓄力。',
    ],
  },
  {
    title: '决断动作与节奏加速',
    beatSummary: '让人物不再停留在判断层，而是直接做出行动。',
    transition: '从视线落点切到动作起点，形成明显提速。',
    cameraLanguage: '近景跟拍 + 快速转向，给画面更多执行感。',
    emotionAnchor: '犹豫被压平，画面进入更强的目标导向。',
    soundDesign: '动作撞击声和衣料摩擦被提到前景，节奏感更硬。',
    promptFocus: '强调起步瞬间、身体倾角和动作方向的明确性。',
    frameCaptions: [
      '动作起点清楚可见，人物像是终于下定了决心。',
      '镜头跟着转向，执行感在中段被彻底推高。',
      '在一个偏强的动作停点收镜，方便后续继续接力。',
    ],
  },
  {
    title: '结果揭示与视觉回报',
    beatSummary: '把前面积累的动作和信息兑换成一次明确回报。',
    transition: '从高压动作切到结果展示，形成情绪落差。',
    cameraLanguage: '先稳后推，结果展示时留出足够辨识时间。',
    emotionAnchor: '短暂释放出现，但底层紧张并没有完全消失。',
    soundDesign: '音乐给出一个更亮的和声节点，随后立刻收回。',
    promptFocus: '保证结果对象、人物反应和背景留白同时可读。',
    frameCaptions: [
      '结果对象第一次被完整看见，观众终于拿到回报。',
      '人物反应跟上来，让回报不只是信息而是情绪兑现。',
      '留出一个可暂停浏览的稳定落点，方便继续衍生操作。',
    ],
  },
  {
    title: '余韵缓冲与下段挂钩',
    beatSummary: '用短暂缓冲整理信息密度，同时把下一段入口埋好。',
    transition: '从强动作退到半静止，让观众有机会重新聚焦。',
    cameraLanguage: '半身构图缓停，镜头存在感降低，情绪信号更突出。',
    emotionAnchor: '表面回稳，但观众能感到后续马上还会再起波澜。',
    soundDesign: '保留环境延音和细小呼吸声，营造尾韵。',
    promptFocus: '让留白、表情和构图平衡一起构成可复用封面感。',
    frameCaptions: [
      '动作余势还没完全退掉，画面先给出短暂的呼吸位。',
      '构图回到稳定状态，信息密度被重新整理。',
      '最后一个眼神或停顿把后续入口轻轻挂住。',
    ],
  },
];

const createGeneratedMockSliceShotTemplate = (shotNumber: number): MockSliceShotTemplate => {
  const generatedIndex = shotNumber - AUTHORED_MOCK_SLICE_SHOT_TEMPLATES.length - 1;
  const blueprint = GENERATED_MOCK_SLICE_BLUEPRINTS[generatedIndex % GENERATED_MOCK_SLICE_BLUEPRINTS.length];
  const phaseLabel = GENERATED_MOCK_SLICE_PHASE_LABELS[Math.floor(generatedIndex / 7) % GENERATED_MOCK_SLICE_PHASE_LABELS.length];
  const durationSeconds = GENERATED_MOCK_SLICE_DURATION_PATTERN[generatedIndex % GENERATED_MOCK_SLICE_DURATION_PATTERN.length];
  const tailOffset = Math.max(durationSeconds - 0.2, 0.2);

  return {
    title: `${phaseLabel} · ${blueprint.title}`,
    durationSeconds,
    beatSummary: blueprint.beatSummary,
    transition: blueprint.transition,
    cameraLanguage: blueprint.cameraLanguage,
    emotionAnchor: blueprint.emotionAnchor,
    soundDesign: blueprint.soundDesign,
    promptFocus: blueprint.promptFocus,
    frames: [
      { label: '首帧', timeOffsetSeconds: 0.2, caption: blueprint.frameCaptions[0], tone: 'warning' },
      { label: '中段', timeOffsetSeconds: durationSeconds / 2, caption: blueprint.frameCaptions[1], tone: 'accent' },
      { label: '尾帧', timeOffsetSeconds: tailOffset, caption: blueprint.frameCaptions[2], tone: 'success' },
    ],
  };
};

const MOCK_SLICE_SHOT_TEMPLATES: MockSliceShotTemplate[] = [
  ...AUTHORED_MOCK_SLICE_SHOT_TEMPLATES,
  ...Array.from({ length: 30 - AUTHORED_MOCK_SLICE_SHOT_TEMPLATES.length }, (_, index) => createGeneratedMockSliceShotTemplate(index + AUTHORED_MOCK_SLICE_SHOT_TEMPLATES.length + 1)),
];

const MOCK_SLICE_SHOTS: MockSliceShot[] = MOCK_SLICE_SHOT_TEMPLATES.reduce<MockSliceShot[]>((shots, template, index) => {
  const startSecond = shots[shots.length - 1]?.endSecond ?? 0;
  shots.push(buildMockSliceShot(index + 1, startSecond, template));
  return shots;
}, []);

const MOCK_SLICE_TOTAL_FRAMES = MOCK_SLICE_SHOTS.reduce((total, shot) => total + shot.frames.length, 0);
const MOCK_SLICE_TOTAL_COVERAGE_SECONDS = MOCK_SLICE_SHOTS.length > 0
  ? MOCK_SLICE_SHOTS[MOCK_SLICE_SHOTS.length - 1].endSecond - MOCK_SLICE_SHOTS[0].startSecond
  : 0;
const MOCK_SLICE_TOTAL_COVERAGE_LABEL = formatMockSliceTimestamp(MOCK_SLICE_TOTAL_COVERAGE_SECONDS);

const DEFAULT_MOCK_SLICE_SHOT_ID = MOCK_SLICE_SHOTS[0]?.id ?? '';

const createDashboardCharacterId = () => `char_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const getDashboardHomeSection = (searchParams: URLSearchParams): DashboardHomeSection => {
  const section = searchParams.get('section');
  if (section === 'analysis') return 'analysis';
  if (section === 'characters') return 'characters';
  return 'projects';
};

const getDashboardAnalysisSubView = (searchParams: URLSearchParams): 'benchmark' | 'overview' => (
  searchParams.get('analysisView') === 'overview' ? 'overview' : 'benchmark'
);

const getDashboardBenchmarkId = (searchParams: URLSearchParams): string | null => {
  const value = searchParams.get('benchmarkId');
  return value && value.trim() ? value.trim() : null;
};

const getDashboardSliceShotId = (searchParams: URLSearchParams): string => {
  const value = searchParams.get('sliceShotId');
  return value && value.trim() ? value.trim() : '';
};

const getMockSliceFrameToneClasses = (tone: MockSliceFrameTone) => {
  switch (tone) {
    case 'warning':
      return {
        badge: 'bg-[var(--warning)]/12 text-[var(--warning)]',
        glow: 'bg-[var(--warning)]/18',
        line: 'bg-[var(--warning)]/55',
      };
    case 'success':
      return {
        badge: 'bg-[var(--success-bg)] text-[var(--success-text)]',
        glow: 'bg-[var(--success-text)]/18',
        line: 'bg-[var(--success-text)]/55',
      };
    case 'accent':
    default:
      return {
        badge: 'bg-[var(--accent)]/12 text-[var(--accent)]',
        glow: 'bg-[var(--accent)]/18',
        line: 'bg-[var(--accent)]/55',
      };
  }
};

const ResolvedSliceVideoEvidenceCard: React.FC<{ evidence: SliceVideoEvidence }> = ({ evidence }) => {
  const resolvedVideoUrl = useResolvedVideoUrl(evidence.videoUrl);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{evidence.label}</div>
          <div className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">{evidence.title}</div>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] md:text-right">
          <div>{evidence.durationLabel}</div>
          <div className="mt-1">{evidence.timeRange}</div>
        </div>
      </div>

      <div className="mt-3">
        {resolvedVideoUrl ? (
          <video
            src={resolvedVideoUrl}
            poster={evidence.posterUrl}
            controls
            playsInline
            preload="metadata"
            className="block aspect-video w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] object-contain"
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-primary)]/50 px-4 py-4 text-[11px] leading-6 text-[var(--text-muted)]">
            当前子镜头暂无可播放的切片视频，可继续结合上方时间段和代表帧检查该合并片段。
          </div>
        )}
      </div>
    </div>
  );
};

const Dashboard: React.FC<Props> = ({ onOpenProject, onShowModelConfig }) => {
  const { showAlert } = useAlert();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<SeriesProject[]>([]);
  const [homeSection, setHomeSection] = useState<DashboardHomeSection>(() => getDashboardHomeSection(searchParams));
  const [analysisSubView, setAnalysisSubView] = useState<'benchmark' | 'overview'>(() => getDashboardAnalysisSubView(searchParams));
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<AssetLibraryItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'character' | 'scene' | 'prop'>('all');
  const [libraryProjectFilter, setLibraryProjectFilter] = useState('all');
  const [assetToUse, setAssetToUse] = useState<AssetLibraryItem | null>(null);
  const [benchmarkToImport, setBenchmarkToImport] = useState<BenchmarkVideo | null>(null);
  const [importingBenchmarkProjectId, setImportingBenchmarkProjectId] = useState<string | null>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [dashboardCharacterQuery, setDashboardCharacterQuery] = useState('');
  const [showDashboardCharacterAddModal, setShowDashboardCharacterAddModal] = useState(false);
  const [dashboardCharacterPreviewImage, setDashboardCharacterPreviewImage] = useState<string | null>(null);
  const [newDashboardCharacterForm, setNewDashboardCharacterForm] = useState({ name: '', gender: '', age: '', personality: '' });

  // Video Deconstruct State
  const [videoLink, setVideoLink] = useState('');
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [benchmarkList, setBenchmarkList] = useState<BenchmarkVideo[]>([]);
  const [hasLoadedBenchmarks, setHasLoadedBenchmarks] = useState(false);
  const [currentBenchmarkId, setCurrentBenchmarkId] = useState<string | null>(() => getDashboardBenchmarkId(searchParams));
  const [isEditingBenchmarkBreakdown, setIsEditingBenchmarkBreakdown] = useState(false);
  const [benchmarkBreakdownEditorMode, setBenchmarkBreakdownEditorMode] = useState<'edit' | 'adaptation'>('edit');
  const [isBenchmarkBreakdownExpanded, setIsBenchmarkBreakdownExpanded] = useState(false);
  const [isSliceResultsPreviewExpanded, setIsSliceResultsPreviewExpanded] = useState(false);
  const [benchmarkBreakdownDraft, setBenchmarkBreakdownDraft] = useState('');
  const [adaptationDocumentDraft, setAdaptationDocumentDraft] = useState<AdaptationDocument>(() => createEmptyAdaptationDocument());
  const [isSavingBenchmarkBreakdown, setIsSavingBenchmarkBreakdown] = useState(false);
  const [selectedSliceShotId, setSelectedSliceShotId] = useState(() => getDashboardSliceShotId(searchParams));
  const [selectedSliceParagraphId, setSelectedSliceParagraphId] = useState('');
  const selectedSliceInspectorRef = useRef<HTMLDivElement | null>(null);
  const adaptationWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const adaptationTextBlockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const pendingAdaptationFocusBlockIdRef = useRef<string | null>(null);
  const [sliceFrameViewer, setSliceFrameViewer] = useState<SliceFrameViewerState | null>(null);
  const [isPromptReconstructing, setIsPromptReconstructing] = useState(false);
  const [promptReconstructionProgress, setPromptReconstructionProgress] = useState<{ completed: number; total: number; currentShotLabel: string; succeeded: number; failed: number; } | null>(null);
  const [activeBenchmarkDownloadArtifacts, setActiveBenchmarkDownloadArtifacts] = useState<Record<string, BenchmarkDownloadArtifact>>({});
  const [mergedParagraphVideoMap, setMergedParagraphVideoMap] = useState<Record<string, MergedParagraphVideoState>>({});
  const [expandedMergedEvidenceMap, setExpandedMergedEvidenceMap] = useState<Record<string, boolean>>({});
  const activeSlicingBenchmarkIdRef = useRef<string | null>(null);
  const staleSliceRecoveryRef = useRef<Record<string, true>>({});

  useEffect(() => {
    const nextHomeSection = getDashboardHomeSection(searchParams);
    const nextAnalysisSubView = getDashboardAnalysisSubView(searchParams);
    const nextBenchmarkId = getDashboardBenchmarkId(searchParams);
    const nextSliceShotId = getDashboardSliceShotId(searchParams);

    if (homeSection !== nextHomeSection) {
      setHomeSection(nextHomeSection);
    }
    if (analysisSubView !== nextAnalysisSubView) {
      setAnalysisSubView(nextAnalysisSubView);
    }
    if (currentBenchmarkId !== nextBenchmarkId) {
      setCurrentBenchmarkId(nextBenchmarkId);
    }
    if (searchParams.has('sliceShotId')) {
      if (selectedSliceShotId !== nextSliceShotId) {
        setSelectedSliceShotId(nextSliceShotId);
      }
    } else if ((nextHomeSection !== 'analysis' || !nextBenchmarkId) && selectedSliceShotId) {
      setSelectedSliceShotId('');
    }
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (homeSection === 'analysis') {
      nextSearchParams.set('section', 'analysis');
      nextSearchParams.set('analysisView', analysisSubView);

      if (currentBenchmarkId) {
        nextSearchParams.set('benchmarkId', currentBenchmarkId);
      } else {
        nextSearchParams.delete('benchmarkId');
      }

      if (currentBenchmarkId && selectedSliceShotId) {
        nextSearchParams.set('sliceShotId', selectedSliceShotId);
      } else {
        nextSearchParams.delete('sliceShotId');
      }
    } else if (homeSection === 'characters') {
      nextSearchParams.set('section', 'characters');
      nextSearchParams.delete('analysisView');
      nextSearchParams.delete('benchmarkId');
      nextSearchParams.delete('sliceShotId');
    } else {
      nextSearchParams.delete('section');
      nextSearchParams.delete('analysisView');
      nextSearchParams.delete('benchmarkId');
      nextSearchParams.delete('sliceShotId');
    }

    const currentQuery = searchParams.toString();
    const nextQuery = nextSearchParams.toString();
    if (currentQuery !== nextQuery) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [homeSection, analysisSubView, currentBenchmarkId, selectedSliceShotId, searchParams, setSearchParams]);

  const loadBenchmarks = async () => {
    try {
      const list = await getAllBenchmarkVideos();
      setBenchmarkList(list);
    } catch (e) {
      console.error('Failed to load benchmarks', e);
    } finally {
      setHasLoadedBenchmarks(true);
    }
  };

  const updateActiveBenchmarkDownloadArtifact = (benchmarkId: string, artifact: BenchmarkDownloadArtifact) => {
    setActiveBenchmarkDownloadArtifacts((prev) => ({
      ...prev,
      [benchmarkId]: mergeDownloadArtifact(prev[benchmarkId], artifact) || artifact,
    }));
  };

  const clearActiveBenchmarkDownloadArtifact = (benchmarkId: string) => {
    setActiveBenchmarkDownloadArtifacts((prev) => {
      if (!(benchmarkId in prev)) return prev;
      const next = { ...prev };
      delete next[benchmarkId];
      return next;
    });
  };

  useEffect(() => {
    loadBenchmarks();
  }, []);

  const currentBenchmark = currentBenchmarkId ? benchmarkList.find(b => b.id === currentBenchmarkId) : null;
  const getBenchmarkStatusLabel = (item: BenchmarkVideo) => {
    if (item.status === 'analyzing') {
      return item.downloadArtifact?.status === 'downloading'
        ? '下载中'
        : item.downloadArtifact?.status === 'ready'
          ? '解构中'
          : '分析中';
    }
    if (item.status === 'failed' && item.downloadArtifact?.status === 'failed') {
      return '下载失败';
    }
    if (item.status !== 'completed') return item.status;
    if (item.deconstructResult?.length) return `${item.deconstructResult.length} 镜头`;
    if (item.analysisMode === 'metadata') return item.fallbackReason === 'missing_api_key' ? '降级分析' : '元数据分析';
    return item.status;
  };
  const transcriptStatusLabel = currentBenchmark?.transcriptStatus === 'available'
    ? `可用${currentBenchmark.sourceMeta?.transcriptLanguage ? ` · ${currentBenchmark.sourceMeta.transcriptLanguage}` : ''}`
    : currentBenchmark?.transcriptStatus === 'error'
      ? '获取失败'
      : '不可用';
  const currentDownloadArtifact = currentBenchmark
    ? mergeDownloadArtifact(currentBenchmark.downloadArtifact, activeBenchmarkDownloadArtifacts[currentBenchmark.id])
    : undefined;
  const analysisModeLabel = currentBenchmark?.status !== 'completed'
    ? currentDownloadArtifact?.status === 'downloading'
      ? '下载中'
      : currentDownloadArtifact?.status === 'ready'
        ? '解构中'
        : '分析中'
      : currentBenchmark?.analysisMode === 'metadata'
        ? currentBenchmark?.fallbackReason === 'missing_api_key'
          ? '降级分析'
          : '元数据分析'
        : '完整分析';
  const downloadStatusLabel = currentBenchmark
    ? getBenchmarkDownloadStatusLabel({ status: currentBenchmark.status, downloadArtifact: currentDownloadArtifact })
    : '未下载';
  const shouldShowModelConfigAction = currentBenchmark?.fallbackReason === 'missing_api_key' && !!onShowModelConfig;
  const benchmarkBreakdownDisplayText = getBenchmarkBreakdownDisplayText(currentBenchmark);
  const currentAdaptationDocument = useMemo(
    () => parseStoredAdaptationDocument(currentBenchmark?.adaptationReport),
    [currentBenchmark?.adaptationReport],
  );
  const benchmarkAdaptationDisplayText = getAdaptationDocumentPlainText(currentAdaptationDocument).trim();
  const benchmarkAdaptationImageCount = countAdaptationImageBlocks(currentAdaptationDocument);
  const isBenchmarkBreakdownAdaptationMode = isEditingBenchmarkBreakdown && benchmarkBreakdownEditorMode === 'adaptation';
  const isBenchmarkBreakdownEditable = !!currentBenchmark && currentBenchmark.status !== 'analyzing';
  const adaptationDraftPlainText = useMemo(
    () => getAdaptationDocumentPlainText(adaptationDocumentDraft),
    [adaptationDocumentDraft],
  );
  const adaptationDraftImageCount = useMemo(
    () => countAdaptationImageBlocks(adaptationDocumentDraft),
    [adaptationDocumentDraft],
  );
  const isUsingRichAdaptationEditor = adaptationDraftImageCount > 0 || adaptationDocumentDraft.blocks.length > 1;
  const isBenchmarkBreakdownSaveDisabled = !isBenchmarkBreakdownEditable
    || isSavingBenchmarkBreakdown
    || (isBenchmarkBreakdownAdaptationMode && !hasAdaptationDocumentContent(adaptationDocumentDraft));
  const availableSlicingShots = currentBenchmark ? buildBenchmarkSlicingShots(currentBenchmark) : [];
  const currentSliceShots = useMemo(() => {
    if (!currentBenchmark) {
      return [];
    }

    return currentBenchmark.sliceArtifact?.manifest?.shots?.length
      ? mapSliceArtifactToPreviewShots(currentBenchmark.sliceArtifact)
      : MOCK_SLICE_SHOTS;
  }, [currentBenchmark]);
  const currentSliceParagraphs = useMemo(
    () => buildSliceParagraphPreviews(currentSliceShots),
    [currentSliceShots],
  );
  const currentSliceParagraphDetails = useMemo(
    () => currentSliceParagraphs.map((paragraph) => buildSliceParagraphDetail(
      paragraph,
      currentSliceShots.filter((shot) => paragraph.shotIds.includes(shot.id)),
    )),
    [currentSliceParagraphs, currentSliceShots],
  );
  const selectedSliceShot = useMemo(
    () => currentSliceShots.find((shot) => shot.id === selectedSliceShotId) || currentSliceShots[0] || null,
    [currentSliceShots, selectedSliceShotId],
  );
  const selectedSliceParagraph = useMemo(
    () => currentSliceParagraphDetails.find((paragraph) => paragraph.id === selectedSliceParagraphId) || null,
    [currentSliceParagraphDetails, selectedSliceParagraphId],
  );
  const selectedSliceDetail = useMemo(() => {
    if (selectedSliceParagraph) {
      return selectedSliceParagraph;
    }
    return selectedSliceShot ? buildSliceShotDetail(selectedSliceShot) : null;
  }, [selectedSliceParagraph, selectedSliceShot]);
  const activeMergedParagraphVideo = selectedSliceDetail?.kind === 'merged'
    ? mergedParagraphVideoMap[selectedSliceDetail.id]
    : undefined;
  useEffect(() => {
    selectedSliceInspectorRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentBenchmarkId, selectedSliceDetail?.id]);

  const resolvedSelectedSliceVideoUrl = useResolvedVideoUrl(
    selectedSliceDetail?.kind === 'merged'
      ? activeMergedParagraphVideo?.videoUrl
      : selectedSliceDetail?.videoUrl,
  );
  const selectedSliceReconstructionWarnings = selectedSliceDetail?.reconstructionWarnings || [];
  const selectedSliceContinuityNotes = selectedSliceDetail?.continuityNotes || [];
  const selectedSliceMissingDetails = selectedSliceDetail?.missingDetails || [];
  const selectedSliceMetadataItems = useMemo(() => {
    if (!selectedSliceDetail) {
      return [];
    }

    if (selectedSliceDetail.kind === 'merged') {
      return [
        { label: '合并时段', value: selectedSliceDetail.timeRange },
        { label: '总时长', value: selectedSliceDetail.durationLabel },
        { label: '镜头数', value: `${selectedSliceDetail.shotCount} 条` },
        { label: '主场景', value: selectedSliceDetail.scene || '-' },
        { label: '重建状态', value: getSliceReconstructionStatusLabel(selectedSliceDetail.reconstructionStatus) },
        { label: '运镜语言', value: selectedSliceDetail.cameraLanguage },
        { label: '情绪落点', value: selectedSliceDetail.emotionAnchor },
        { label: '声音设计', value: selectedSliceDetail.soundDesign },
        { label: '提示词聚焦', value: selectedSliceDetail.promptFocus },
      ];
    }

    return [
      { label: '镜头时长', value: selectedSliceDetail.durationLabel },
      { label: '场景', value: selectedSliceDetail.scene || '-' },
      { label: '重建状态', value: getSliceReconstructionStatusLabel(selectedSliceDetail.reconstructionStatus) },
      { label: '运镜语言', value: selectedSliceDetail.cameraLanguage },
      { label: '情绪落点', value: selectedSliceDetail.emotionAnchor },
      { label: '声音设计', value: selectedSliceDetail.soundDesign },
      { label: '提示词聚焦', value: selectedSliceDetail.promptFocus },
    ];
  }, [selectedSliceDetail]);
  const isUsingRealSliceData = !!currentBenchmark?.sliceArtifact?.manifest?.shots?.length;
  const currentSliceArtifact = currentBenchmark?.sliceArtifact;
  const isSliceRunning = currentSliceArtifact?.status === 'running';
  const sliceElapsedLabel = isSliceRunning ? formatElapsedSince(currentSliceArtifact?.requestedAt) : null;
  const isCurrentSliceRunStale = !!(
    isSliceRunning
    && currentSliceArtifact?.requestedAt
    && (Date.now() - currentSliceArtifact.requestedAt) >= STALE_SLICE_RUNNING_THRESHOLD_MS
  );
  const canRunSlicing = !!currentBenchmark && currentBenchmark.status === 'completed' && !!currentDownloadArtifact?.localPath && availableSlicingShots.length > 0 && !isSliceRunning;
  const reconstructedSliceShotCount = currentSliceArtifact?.manifest?.shots?.filter((shot) => {
    const status = shot.reconstruction?.status;
    return status === 'ok' || status === 'partial';
  }).length ?? 0;
  const canRunPromptReconstruction = !!currentBenchmark
    && currentBenchmark.status === 'completed'
    && currentSliceArtifact?.status === 'completed'
    && !!currentSliceArtifact?.manifest?.shots?.length
    && !isSliceRunning
    && !isPromptReconstructing;
  const promptReconstructionPercent = promptReconstructionProgress && promptReconstructionProgress.total > 0
    ? Math.round((promptReconstructionProgress.completed / promptReconstructionProgress.total) * 100)
    : 0;
  const sliceCoverageSeconds = currentSliceShots.length > 0
    ? currentSliceShots[currentSliceShots.length - 1].endSecond - currentSliceShots[0].startSecond
    : 0;
  const sliceCoverageLabel = formatMockSliceTimestamp(sliceCoverageSeconds);
  const sliceFrameCount = currentSliceShots.reduce((total, shot) => total + shot.frames.length, 0);

  useEffect(() => {
    setIsEditingBenchmarkBreakdown(false);
    setBenchmarkBreakdownEditorMode('edit');
    setIsBenchmarkBreakdownExpanded(false);
    setIsSavingBenchmarkBreakdown(false);
    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
    setAdaptationDocumentDraft(currentAdaptationDocument);
  }, [currentBenchmarkId, currentBenchmark?.lastModified, benchmarkBreakdownDisplayText, currentAdaptationDocument]);

  useEffect(() => {
    if (!isEditingBenchmarkBreakdown || benchmarkBreakdownEditorMode !== 'adaptation') {
      return;
    }

    const pendingBlockId = pendingAdaptationFocusBlockIdRef.current;
    if (!pendingBlockId) {
      return;
    }

    const target = adaptationTextBlockRefs.current[pendingBlockId];
    if (!target) {
      return;
    }

    target.focus();
    const cursorPosition = target.value.length;
    target.setSelectionRange(cursorPosition, cursorPosition);
    pendingAdaptationFocusBlockIdRef.current = null;
  }, [adaptationDocumentDraft, isEditingBenchmarkBreakdown, benchmarkBreakdownEditorMode]);

  useEffect(() => {
    setIsSliceResultsPreviewExpanded(false);
  }, [currentBenchmarkId]);

  useEffect(() => {
    setMergedParagraphVideoMap({});
  }, [currentBenchmarkId, currentSliceArtifact?.manifestPath]);

  useEffect(() => {
    setExpandedMergedEvidenceMap({});
  }, [currentBenchmarkId, currentSliceArtifact?.manifestPath]);

  useEffect(() => {
    if (!hasLoadedBenchmarks || !currentBenchmarkId || currentBenchmark) {
      return;
    }

    setCurrentBenchmarkId(null);
    setSelectedSliceShotId('');
    setSelectedSliceParagraphId('');
  }, [hasLoadedBenchmarks, currentBenchmarkId, currentBenchmark]);

  useEffect(() => {
    if (!currentBenchmark) {
      return;
    }

    if (!selectedSliceShotId && currentSliceShots[0]?.id) {
      setSelectedSliceShotId(currentSliceShots[0].id);
      return;
    }
    if (selectedSliceShotId && !currentSliceShots.some((shot) => shot.id === selectedSliceShotId)) {
      setSelectedSliceShotId(currentSliceShots[0]?.id || '');
    }
  }, [currentBenchmark, currentSliceShots, selectedSliceShotId]);

  useEffect(() => {
    if (!selectedSliceParagraphId) {
      return;
    }

    if (!currentSliceParagraphDetails.some((paragraph) => paragraph.id === selectedSliceParagraphId)) {
      setSelectedSliceParagraphId('');
    }
  }, [currentSliceParagraphDetails, selectedSliceParagraphId]);

  useEffect(() => {
    if (!currentBenchmark || currentBenchmark.sliceArtifact?.status !== 'running') {
      return;
    }
    if (activeSlicingBenchmarkIdRef.current === currentBenchmark.id) {
      return;
    }
    if (staleSliceRecoveryRef.current[currentBenchmark.id]) {
      return;
    }
    if (!currentBenchmark.sliceArtifact?.requestedAt) {
      return;
    }
    if ((Date.now() - currentBenchmark.sliceArtifact.requestedAt) < STALE_SLICE_RUNNING_THRESHOLD_MS) {
      return;
    }

    void handleRecoverStuckSliceRun(
      currentBenchmark,
      '检测到上一次拆片任务长时间未完成，已自动重置为失败状态；请重新尝试。',
      true,
    );
  }, [currentBenchmark]);

  useEffect(() => {
    if (!sliceFrameViewer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSliceFrameViewer(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sliceFrameViewer]);

  const handleOpenSliceFrameViewer = (frame: MockSliceFrame, shotTitle: string, imageUrlOverride?: string) => {
    const resolvedImageUrl = String(imageUrlOverride || frame.imageUrl || '').trim();
    if (!resolvedImageUrl) {
      return;
    }

    setSliceFrameViewer({
      imageUrl: resolvedImageUrl,
      shotTitle,
      frameLabel: frame.label,
      timecode: frame.timecode,
    });
  };

  const handleCloseSliceFrameViewer = () => {
    setSliceFrameViewer(null);
  };

  const handleGenerateMergedParagraphVideo = async (detail: SliceDetailModel) => {
    if (detail.kind !== 'merged') {
      return;
    }

    const paragraphId = detail.id;
    const clipPaths = detail.mergedClipPaths;
    if (clipPaths.length === 0) {
      setMergedParagraphVideoMap((prev) => ({
        ...prev,
        [paragraphId]: {
          status: 'error',
          errorMessage: '当前合并段落缺少可用的切片视频路径。',
        },
      }));
      return;
    }

    setMergedParagraphVideoMap((prev) => ({
      ...prev,
      [paragraphId]: {
        status: 'loading',
      },
    }));

    try {
      const result = await mergeStoryboardSliceClips({
        clipPaths,
        outputDir: currentBenchmark?.sliceArtifact?.outputDir,
        mergeKey: paragraphId,
      });
      setMergedParagraphVideoMap((prev) => ({
        ...prev,
        [paragraphId]: {
          status: 'ready',
          videoUrl: result.videoUrl,
        },
      }));
    } catch (error) {
      setMergedParagraphVideoMap((prev) => ({
        ...prev,
        [paragraphId]: {
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '合并段落视频生成失败。',
        },
      }));
    }
  };

  const handleStartEditBenchmarkBreakdown = () => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    setBenchmarkBreakdownEditorMode('edit');
    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
    setIsBenchmarkBreakdownExpanded(true);
    setIsEditingBenchmarkBreakdown(true);
  };

  const handleStartAdaptBenchmarkBreakdown = () => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    setBenchmarkBreakdownEditorMode('adaptation');
    setAdaptationDocumentDraft(parseStoredAdaptationDocument(currentBenchmark.adaptationReport));
    setIsBenchmarkBreakdownExpanded(true);
    setIsEditingBenchmarkBreakdown(true);
  };

  const handleCancelEditBenchmarkBreakdown = () => {
    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
    setAdaptationDocumentDraft(currentAdaptationDocument);
    setBenchmarkBreakdownEditorMode('edit');
    setIsEditingBenchmarkBreakdown(false);
    setIsBenchmarkBreakdownExpanded(false);
  };

  const handleChangeAdaptationTextBlock = (blockId: string, nextContent: string) => {
    setAdaptationDocumentDraft((previous) => updateAdaptationTextBlock(previous, blockId, nextContent));
  };

  const handleRemoveAdaptationImageBlock = (blockId: string) => {
    setAdaptationDocumentDraft((previous) => removeAdaptationBlock(previous, blockId));
  };

  const handleInsertFrameIntoAdaptation = (payload: AdaptationImageInsertPayload) => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    const baseDocument = isBenchmarkBreakdownAdaptationMode
      ? adaptationDocumentDraft
      : parseStoredAdaptationDocument(currentBenchmark.adaptationReport);
    const { document, focusBlockId } = appendAdaptationImageBlock(baseDocument, payload);

    pendingAdaptationFocusBlockIdRef.current = focusBlockId;
    setAdaptationDocumentDraft(document);
    setBenchmarkBreakdownEditorMode('adaptation');
    setIsBenchmarkBreakdownExpanded(true);
    setIsEditingBenchmarkBreakdown(true);

    window.requestAnimationFrame(() => {
      adaptationWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSaveBenchmarkBreakdown = async () => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    if (benchmarkBreakdownEditorMode === 'adaptation' && !hasAdaptationDocumentContent(adaptationDocumentDraft)) {
      return;
    }

    const nextDocument = benchmarkBreakdownEditorMode === 'adaptation'
      ? serializeAdaptationDocument(adaptationDocumentDraft)
      : benchmarkBreakdownDraft.trim() || undefined;
    const benchmarkId = currentBenchmark.id;
    const savedMode = benchmarkBreakdownEditorMode;

    setIsSavingBenchmarkBreakdown(true);
    try {
      await saveBenchmarkVideo({
        ...currentBenchmark,
        breakdownReport: savedMode === 'edit' ? nextDocument : currentBenchmark.breakdownReport,
        adaptationReport: savedMode === 'adaptation' ? nextDocument : currentBenchmark.adaptationReport,
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(benchmarkId);
      setBenchmarkBreakdownEditorMode('edit');
      setIsEditingBenchmarkBreakdown(false);
      setIsBenchmarkBreakdownExpanded(false);
      showAlert(savedMode === 'adaptation' ? '改编文稿已单独保存' : '视频拆解方案已保存', { type: 'success' });
    } catch (error) {
      showAlert(`保存拆解方案失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
      setIsSavingBenchmarkBreakdown(false);
    }
  };

  const handleRecoverStuckSliceRun = async (benchmark: BenchmarkVideo, reason: string, silent = false) => {
    if (benchmark.sliceArtifact?.status !== 'running') {
      return;
    }

    staleSliceRecoveryRef.current[benchmark.id] = true;
    activeSlicingBenchmarkIdRef.current = null;

    try {
      await saveBenchmarkVideo({
        ...benchmark,
        sliceArtifact: {
          ...(benchmark.sliceArtifact || {}),
          status: 'failed',
          finishedAt: Date.now(),
          errorMessage: reason,
        },
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(benchmark.id);
      if (!silent) {
        showAlert(reason, { type: 'warning' });
      }
    } catch (error) {
      if (!silent) {
        showAlert(`重置拆片状态失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
      }
    }
  };

  const handleRunBenchmarkSlicing = async () => {
    if (!currentBenchmark) return;
    if (!currentDownloadArtifact?.localPath) {
      showAlert('当前记录还没有本地视频文件，请先完成下载。', { type: 'warning' });
      return;
    }
    if (availableSlicingShots.length === 0) {
      showAlert('当前记录缺少可解析的镜头时间表；请先补充结构化拆解方案。', { type: 'warning' });
      return;
    }

    const requestedAt = Date.now();
    const runningBenchmark: BenchmarkVideo = {
      ...currentBenchmark,
      sliceArtifact: {
        ...(currentBenchmark.sliceArtifact || {}),
        status: 'running',
        requestedAt,
        finishedAt: undefined,
        errorMessage: undefined,
        warnings: [],
        requestMeta: {
          middleFrames: 0,
          enableSceneDetect: false,
          enableTurningPoints: true,
        },
      },
    };

    try {
      activeSlicingBenchmarkIdRef.current = currentBenchmark.id;
      delete staleSliceRecoveryRef.current[currentBenchmark.id];
      await saveBenchmarkVideo(runningBenchmark);
      await loadBenchmarks();
      setCurrentBenchmarkId(currentBenchmark.id);

      const completedSliceArtifact = await runBenchmarkSlicing(currentBenchmark, {
        middleFrames: 0,
        enableSceneDetect: false,
        enableTurningPoints: true,
      });

      await saveBenchmarkVideo({
        ...currentBenchmark,
        sliceArtifact: {
          ...completedSliceArtifact,
          requestedAt,
          finishedAt: Date.now(),
        },
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(currentBenchmark.id);
      showAlert('拆片镜头已生成，可在下方预览真实切片结果。', { type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '拆片失败';
      await saveBenchmarkVideo({
        ...currentBenchmark,
        sliceArtifact: {
          ...(currentBenchmark.sliceArtifact || {}),
          status: 'failed',
          requestedAt,
          finishedAt: Date.now(),
          errorMessage: message,
        },
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(currentBenchmark.id);
      showAlert(message, { type: 'error' });
    } finally {
      if (activeSlicingBenchmarkIdRef.current === currentBenchmark.id) {
        activeSlicingBenchmarkIdRef.current = null;
      }
    }
  };

  const handleRunPromptReconstruction = async () => {
    if (!currentBenchmark) return;
    if (currentSliceArtifact?.status !== 'completed' || !currentSliceArtifact.manifest?.shots?.length) {
      showAlert('请先生成真实拆片结果，再执行图片反推。', { type: 'warning' });
      return;
    }

    setIsPromptReconstructing(true);
    setPromptReconstructionProgress({
      completed: 0,
      total: currentSliceArtifact.manifest.shots.length,
      currentShotLabel: `镜头 ${String(currentSliceArtifact.manifest.shots[0]?.shot_number || 1).padStart(2, '0')}`,
      succeeded: 0,
      failed: 0,
    });
    try {
      const updatedSliceArtifact = await runBenchmarkPromptReconstruction(currentSliceArtifact, {
        promptLanguage: 'bilingual',
        onProgress: (progress) => {
          setPromptReconstructionProgress(progress);
        },
      });

      await saveBenchmarkVideo({
        ...currentBenchmark,
        sliceArtifact: updatedSliceArtifact,
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(currentBenchmark.id);
      showAlert('图片反推已完成，可在下方查看首帧 / 中段 / 尾帧对应提示词。', { type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片反推失败';
      showAlert(message, { type: 'error' });
    } finally {
      setIsPromptReconstructing(false);
      setPromptReconstructionProgress(null);
    }
  };

  const handleDeconstruct = async () => {
    if (!videoLink.trim()) {
      showAlert('请输入视频链接', { type: 'warning' });
      return;
    }

    const sourceUrl = videoLink.trim();
    setIsDeconstructing(true);
    const newId = 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const newVideo: BenchmarkVideo = {
      id: newId,
      url: sourceUrl,
      title: '正在获取视频信息...',
      createdAt: Date.now(),
      lastModified: Date.now(),
      status: 'analyzing',
      deconstructResult: null,
      warnings: [],
      downloadArtifact: {
        status: 'pending',
        warnings: [],
      },
    };
    await saveBenchmarkVideo(newVideo);
    setCurrentBenchmarkId(newId);
    setVideoLink('');
    await loadBenchmarks();

    let partialVideo = newVideo;
    try {
      const intake = await fetchYouTubeBenchmarkIntake(sourceUrl);
      partialVideo = {
        ...partialVideo,
        title: intake.title,
        sourceMeta: {
          videoId: intake.videoId,
          canonicalUrl: intake.canonicalUrl,
          channelTitle: intake.channelTitle,
          channelId: intake.channelId,
          thumbnailUrl: intake.thumbnailUrl,
          durationSeconds: intake.durationSeconds,
          viewCount: intake.viewCount,
          likeCount: intake.likeCount,
          transcriptLanguage: intake.transcriptLanguage,
        },
        transcriptStatus: intake.transcriptStatus,
        warnings: intake.warnings,
      };
      await saveBenchmarkVideo(partialVideo);
      await loadBenchmarks();

      const artifactStorageConfig = loadArtifactStorageUserConfig();
      partialVideo = {
        ...partialVideo,
        downloadArtifact: {
          status: 'downloading',
          warnings: partialVideo.downloadArtifact?.warnings || [],
        },
      };
      await saveBenchmarkVideo(partialVideo);
      await loadBenchmarks();
      updateActiveBenchmarkDownloadArtifact(newId, partialVideo.downloadArtifact);

      const downloadArtifact = await downloadYouTubeBenchmarkVideo({
        url: intake.canonicalUrl,
        videoId: intake.videoId,
        artifactStorageConfig,
      }, {
        onEvent: (event) => {
          if (event.type === 'status' || event.type === 'progress' || event.type === 'done') {
            partialVideo = {
              ...partialVideo,
              downloadArtifact: mergeDownloadArtifact(partialVideo.downloadArtifact, event.artifact) || event.artifact,
            };
            updateActiveBenchmarkDownloadArtifact(newId, event.artifact);
          }
        },
      });
      partialVideo = {
        ...partialVideo,
        downloadArtifact: mergeDownloadArtifact(partialVideo.downloadArtifact, downloadArtifact) || downloadArtifact,
      };
      await saveBenchmarkVideo(partialVideo);
      await loadBenchmarks();
      clearActiveBenchmarkDownloadArtifact(newId);

      const analyzed = await analyzeYouTubeBenchmark(intake);
      const updatedVideo: BenchmarkVideo = {
        ...partialVideo,
        title: analyzed.title,
        status: 'completed',
        deconstructResult: analyzed.shots.length ? analyzed.shots : null,
        breakdownReport: analyzed.breakdownReport,
        metrics: analyzed.metrics,
        sourceMeta: analyzed.sourceMeta,
        transcriptStatus: analyzed.transcriptStatus,
        analysisMode: analyzed.analysisMode,
        fallbackReason: analyzed.fallbackReason,
        analysisBasis: analyzed.analysisBasis,
        warnings: analyzed.warnings,
        errorMessage: undefined,
        downloadArtifact: partialVideo.downloadArtifact,
      };

      await saveBenchmarkVideo(updatedVideo);
      await loadBenchmarks();
      if (analyzed.warnings.length > 0) {
        const priorityWarning = analyzed.warnings[0];
        showAlert(priorityWarning, { type: 'warning' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '视频解构失败';
      clearActiveBenchmarkDownloadArtifact(newId);
      const failedDownloadArtifact = partialVideo.downloadArtifact?.status === 'ready'
        ? partialVideo.downloadArtifact
        : {
            ...(partialVideo.downloadArtifact || { warnings: [] }),
            status: 'failed' as const,
            errorMessage: message,
          };
      await saveBenchmarkVideo({
        ...partialVideo,
        status: 'failed',
        errorMessage: message,
        downloadArtifact: failedDownloadArtifact,
      });
      await loadBenchmarks();
      showAlert(message, { type: 'error' });
    } finally {
      setIsDeconstructing(false);
    }
  };

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const list = await getAllSeriesProjects();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLibrary = async () => {
    setIsLibraryLoading(true);
    try {
      const items = await getAllAssetLibraryItems();
      setLibraryItems(items);
    } catch (e) {
      console.error('Failed to load asset library', e);
    } finally {
      setIsLibraryLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showLibraryModal) {
      loadLibrary();
    }
  }, [showLibraryModal]);

  const dashboardGlobalCharacters = useMemo(
    () => libraryItems
      .filter((item) => item.type === 'character')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [libraryItems],
  );
  const normalizedDashboardCharacterQuery = dashboardCharacterQuery.trim().toLowerCase();
  const filteredDashboardCharacters = useMemo(
    () => (
      normalizedDashboardCharacterQuery
        ? dashboardGlobalCharacters.filter((item) => {
            const character = item.data as Character;
            return [
              character.name,
              character.gender,
              character.age,
              character.personality,
              character.visualPrompt || '',
              character.coreFeatures || '',
              item.projectName || '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedDashboardCharacterQuery);
          })
        : dashboardGlobalCharacters
    ),
    [dashboardGlobalCharacters, normalizedDashboardCharacterQuery],
  );

  useEffect(() => {
    if (homeSection === 'characters') {
      void loadLibrary();
    }
  }, [homeSection]);

  const saveGlobalCharacterAsset = async (item: AssetLibraryItem) => {
    await saveAssetToLibrary({
      ...item,
      name: (item.data as Character).name,
      updatedAt: Date.now(),
    });
    await loadLibrary();
  };

  const handleSaveDashboardCharacter = async (item: AssetLibraryItem, asset: LibraryAsset) => {
    const nextCharacter = asset as Character;

    try {
      await saveGlobalCharacterAsset({
        ...item,
        name: nextCharacter.name,
        data: {
          ...nextCharacter,
          version: Math.max((item.data as Character).version || 1, nextCharacter.version || 1),
        },
      });
    } catch (error) {
      showAlert(`保存角色失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    }
  };

  const handleUploadDashboardCharacterImage = async (item: AssetLibraryItem, file: File) => {
    try {
      const base64 = await convertImageToBase64(file);
      const currentCharacter = item.data as Character;
      await saveGlobalCharacterAsset({
        ...item,
        data: {
          ...currentCharacter,
          referenceImage: base64,
          status: 'completed',
          version: (currentCharacter.version || 0) + 1,
        },
      });
    } catch (error) {
      showAlert(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    }
  };

  const handleDeleteDashboardCharacter = (item: AssetLibraryItem) => {
    const character = item.data as Character;

    showAlert(`确定从全局角色库删除“${character.name}”吗？`, {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteAssetFromLibrary(item.id);
          await loadLibrary();
        } catch (error) {
          showAlert(`删除角色失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
        }
      },
    });
  };

  const handleAddDashboardCharacter = async () => {
    if (!newDashboardCharacterForm.name.trim()) {
      showAlert('请先填写角色名称。', { type: 'warning' });
      return;
    }

    const nextCharacter: Character = {
      id: createDashboardCharacterId(),
      name: newDashboardCharacterForm.name.trim(),
      gender: newDashboardCharacterForm.gender.trim() || '未知',
      age: newDashboardCharacterForm.age.trim() || '未知',
      personality: newDashboardCharacterForm.personality.trim(),
      visualPrompt: '',
      coreFeatures: '',
      variations: [],
      version: 1,
    };

    try {
      await saveGlobalCharacterAsset(createLibraryItemFromCharacter(nextCharacter));
      setNewDashboardCharacterForm({ name: '', gender: '', age: '', personality: '' });
      setShowDashboardCharacterAddModal(false);
    } catch (error) {
      showAlert(`添加角色失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    }
  };

  const openAnalysisView = (view?: 'benchmark' | 'overview') => {
    setHomeSection('analysis');
    if (view) {
      setAnalysisSubView(view);
    }
  };

  const openCharacterLibraryView = () => {
    setHomeSection('characters');
  };


  const handleCreate = async () => {
    const sp = createNewSeriesProject();
    await saveSeriesProject(sp);
    const s = createNewSeries(sp.id, '第一季', 0);
    await saveSeries(s);
    const ep = createNewEpisode(sp.id, s.id, 1, '第 1 集');
    await saveEpisode(ep);
    navigate(`/project/${sp.id}`);
  };

  const requestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const confirmDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    const projectName = proj?.title || '未命名项目';
    try {
        await deleteSeriesProject(id);
        await loadProjects();
        console.log(`Project "${projectName}" deleted`);
    } catch (error) {
        showAlert(`删除项目失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
        setDeleteConfirmId(null);
    }
  };

  const handleDeleteLibraryItem = (itemId: string) => {
    showAlert('确定从资产库删除该资源吗？', {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteAssetFromLibrary(itemId);
          setLibraryItems((prev) => prev.filter((item) => item.id !== itemId));
        } catch (error) {
          showAlert(`删除资产失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
        }
      }
    });
  };

  const handleUseAsset = async (projectId: string) => {
    if (!assetToUse) return;
    setAssetToUse(null);
    navigate(`/project/${projectId}`);
  };

  const handleImportBenchmarkIntoProject = async (projectId: string) => {
    if (!benchmarkToImport) return;

    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject) {
      showAlert('目标项目不存在或已被删除，请刷新后重试。', { type: 'error' });
      return;
    }

    setImportingBenchmarkProjectId(projectId);
    try {
      const importedEpisode = await importBenchmarkToProject(benchmarkToImport, targetProject);
      await loadProjects();
      setBenchmarkToImport(null);
      showAlert('已创建新的对标导入 Episode，正在进入分析工作台。', { type: 'success' });
      navigate(`/project/${importedEpisode.projectId}/episode/${importedEpisode.id}`);
    } catch (error) {
      showAlert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
      setImportingBenchmarkProjectId(null);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getLibraryProjectName = (item: AssetLibraryItem): string => {
    const projectName = typeof item.projectName === 'string' ? item.projectName.trim() : '';
    return projectName || 'Unknown Project';
  };

  const projectNameOptions = Array.from<string>(
    new Set<string>(
      libraryItems.map((item) => getLibraryProjectName(item))
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const filteredLibraryItems = libraryItems.filter((item) => {
    if (libraryFilter !== 'all' && item.type !== libraryFilter) return false;
    if (libraryProjectFilter !== 'all') {
      const projectName = getLibraryProjectName(item);
      if (projectName !== libraryProjectFilter) return false;
    }
    if (!libraryQuery.trim()) return true;
    const query = libraryQuery.trim().toLowerCase();
    return item.name.toLowerCase().includes(query);
  });

  const totalCharacters = projects.reduce((sum, project) => sum + (project.characterLibrary?.length || 0), 0);
  const totalScenes = projects.reduce((sum, project) => sum + (project.sceneLibrary?.length || 0), 0);
  const totalProps = projects.reduce((sum, project) => sum + (project.propLibrary?.length || 0), 0);
  const totalTemplates = projects.reduce((sum, project) => sum + (project.viralTemplateLibrary?.length || 0), 0);
  const projectsWithTemplates = projects.filter((project) => (project.viralTemplateLibrary?.length || 0) > 0).length;
  const latestProject = projects.reduce<SeriesProject | null>((latest, project) => {
    if (!latest) return project;
    return project.lastModified > latest.lastModified ? project : latest;
  }, null);

  const {
    importInputRef,
    isDataExporting,
    isDataImporting,
    handleExportData,
    handleImportData,
    handleImportFileChange,
  } = useBackupTransfer({
    exporter: exportIndexedDBData,
    exportFileName: globalBackupFileName,
    showAlert,
    messages: DEFAULT_BACKUP_TRANSFER_MESSAGES,
    onImportSuccess: async () => {
      await loadProjects();
      if (showLibraryModal) {
        await loadLibrary();
      }
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-sans selection:bg-[var(--selection-bg)]">
      <div className="min-h-screen lg:flex">
        <aside className="hidden lg:flex lg:w-72 lg:fixed lg:inset-y-0 lg:left-0 border-r border-[var(--border-primary)] bg-[var(--bg-base)] flex-col z-40 overflow-y-auto">
          <div className="p-6 border-b border-[var(--border-subtle)]">
            <div>
              <h1 className="text-2xl font-light text-[var(--text-primary)] tracking-tight">BigBanana</h1>
              <div className="mt-2 text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">Projects Database</div>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-3">导航</div>
              <div className="space-y-1">
              <button
                type="button"
                onClick={() => setHomeSection('projects')}
                aria-pressed={homeSection === 'projects'}
                className={`w-full flex items-center justify-between px-6 py-4 border-l-2 transition-colors ${homeSection === 'projects' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                <div className="flex items-center gap-3">
                  <Folder className="w-4 h-4" />
                  <span className="font-medium text-xs tracking-wider uppercase">项目库</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">HOME</span>
              </button>
              <button
                type="button"
                onClick={openCharacterLibraryView}
                aria-pressed={homeSection === 'characters'}
                className={`w-full flex items-center justify-between px-6 py-4 border-l-2 transition-colors ${homeSection === 'characters' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4" />
                  <span className="font-medium text-xs tracking-wider uppercase">角色库</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">HOME</span>
              </button>
              <button
                type="button"
                onClick={() => openAnalysisView()}
                aria-expanded={homeSection === 'analysis'}
                aria-pressed={homeSection === 'analysis'}
                className={`w-full flex items-center justify-between px-6 py-4 border-l-2 transition-colors ${homeSection === 'analysis' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                <div className="flex items-center gap-3">
                  <Search className={`w-4 h-4 ${homeSection === 'analysis' ? 'text-[var(--accent-text)]' : ''}`} />
                  <span className="font-medium text-xs tracking-wider uppercase">数据分析</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">HOME</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${homeSection === 'analysis' ? 'rotate-90 text-[var(--accent-text)]' : ''}`} />
                </div>
              </button>
              {homeSection === 'analysis' && (
                <div className="ml-6 space-y-1 border-l border-[var(--border-subtle)] pl-4">
                  <button
                    type="button"
                    onClick={() => openAnalysisView('benchmark')}
                    aria-pressed={analysisSubView === 'benchmark'}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${analysisSubView === 'benchmark' ? 'bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className={`w-3.5 h-3.5 ${analysisSubView === 'benchmark' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="font-medium text-[11px] tracking-wider uppercase">对标分析</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">01</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAnalysisView('overview')}
                    aria-pressed={analysisSubView === 'overview'}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${analysisSubView === 'overview' ? 'bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutPanelTop className={`w-3.5 h-3.5 ${analysisSubView === 'overview' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="font-medium text-[11px] tracking-wider uppercase">总览</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">02</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 px-6 py-6 space-y-3">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">系统设置</span>
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">{theme === 'dark' ? '亮色' : '暗色'}</span>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="p-6 border-t border-[var(--border-subtle)] space-y-3">
            <button
              onClick={() => navigate('/account')}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="打开账号中心"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">账号中心</span>
              <User className="w-4 h-4" />
            </button>
          </div>
        </aside>

        <div className="flex-1 min-h-screen lg:ml-72">
          <main className="p-6 md:p-8 xl:p-10">
            <div className="w-full max-w-none space-y-8">
              <header className="border-b border-[var(--border-subtle)] pb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-3xl font-light text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                    {homeSection === 'projects' ? '项目库' : homeSection === 'characters' ? '角色库' : '数据分析'}
                    <span className="text-[var(--text-muted)] text-lg">/</span>
                    <span className="text-[var(--text-muted)] text-sm font-mono tracking-widest uppercase">{homeSection === 'projects' ? 'Projects Database' : homeSection === 'characters' ? 'Character Library' : analysisSubView === 'benchmark' ? 'Benchmark Analysis' : 'Analysis Overview'}</span>
                  </h2>
                  <div className="flex items-center gap-2 lg:hidden pt-2">
                    <button
                      type="button"
                      onClick={() => setHomeSection('projects')}
                      className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${homeSection === 'projects' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                    >
                      项目库
                    </button>
                    <button
                      type="button"
                      onClick={openCharacterLibraryView}
                      className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${homeSection === 'characters' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                    >
                      角色库
                    </button>
                    <button
                      type="button"
                      onClick={() => openAnalysisView()}
                      className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${homeSection === 'analysis' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                    >
                      数据分析
                    </button>
                  </div>
                  {homeSection === 'analysis' && (
                    <div className="flex items-center gap-2 lg:hidden pt-1">
                      <button
                        type="button"
                        onClick={() => openAnalysisView('benchmark')}
                        className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${analysisSubView === 'benchmark' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                      >
                        对标分析
                      </button>
                      <button
                        type="button"
                        onClick={() => openAnalysisView('overview')}
                        className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${analysisSubView === 'overview' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                      >
                        总览
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:hidden">
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="font-medium text-xs tracking-widest uppercase">系统设置</span>
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
                    title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <span className="font-medium text-xs tracking-widest uppercase">{theme === 'dark' ? '亮色' : '暗色'}</span>
                  </button>
                  <button
                    onClick={handleCreate}
                    className="group flex items-center gap-3 px-6 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="font-bold text-xs tracking-widest uppercase">新建项目</span>
                  </button>
                  <button
                    onClick={() => navigate('/account')}
                    className="group flex items-center gap-2 px-5 py-3 border border-[var(--accent-border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-bg)] transition-colors"
                    title="打开账号中心"
                  >
                    <User className="w-4 h-4" />
                    <span className="font-medium text-xs tracking-widest uppercase">账号中心</span>
                  </button>
                </div>
              </header>

              {homeSection === 'projects' ? (
                <>
                  <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">DirectorHub 资源共创平台</h3>
                        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-3xl">
                          DirectorHub 是一个面向创作者的资源共创平台。在这里你可以上传、下载并分享优质资源，与更多创作者协作成长。我们鼓励原创与高质量内容，对优秀作品提供平台额度补助。
                        </p>
                      </div>
                      <a
                        href={DIRECTOR_HUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium tracking-wide whitespace-nowrap"
                      >
                        访问 DirectorHub
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </section>

                  <section className="border border-[var(--border-primary)] bg-[var(--bg-base)]">
                    <div className="px-5 md:px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">项目库</h3>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{projects.length} projects</div>
                    </div>

                    <div className="p-5 md:p-6">
                      {isLoading ? (
                        <div className="flex justify-center py-20">
                          <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                          <div
                            onClick={handleCreate}
                            className="group cursor-pointer border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] flex flex-col items-center justify-center min-h-[280px] transition-all"
                          >
                            <div className="w-12 h-12 border border-[var(--border-secondary)] flex items-center justify-center mb-6 group-hover:bg-[var(--bg-hover)] transition-colors">
                              <Plus className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
                            </div>
                            <span className="text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-widest group-hover:text-[var(--text-secondary)]">Create New Project</span>
                          </div>

                          {projects.map((proj) => (
                            <div
                              key={proj.id}
                              onClick={() => navigate(`/project/${proj.id}`)}
                              className="group bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] p-0 flex flex-col cursor-pointer transition-all relative overflow-hidden h-[280px]"
                            >
                              {deleteConfirmId === proj.id && (
                                <div className="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                  <div className="w-10 h-10 bg-[var(--error-hover-bg)] flex items-center justify-center rounded-full">
                                    <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                                  </div>
                                  <div className="text-center space-y-2">
                                    <p className="text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">确认删除项目？</p>
                                    <p className="text-[var(--text-tertiary)] text-[10px] font-mono">将删除所有剧集和角色库数据</p>
                                  </div>
                                  <div className="flex gap-2 w-full pt-2">
                                    <button onClick={cancelDelete} className="flex-1 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--border-primary)]">取消</button>
                                    <button onClick={(e) => confirmDelete(e, proj.id)} className="flex-1 py-3 bg-[var(--error-hover-bg)] text-[var(--error-text)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--error-border)]">永久删除</button>
                                  </div>
                                </div>
                              )}

                              <div className="flex-1 p-6 relative flex flex-col">
                                <button onClick={(e) => requestDelete(e, proj.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--error-text)] transition-all rounded-sm z-10" title="删除项目">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="flex-1">
                                  <Folder className="w-8 h-8 text-[var(--text-muted)] mb-6 group-hover:text-[var(--text-tertiary)] transition-colors" />
                                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 line-clamp-1 tracking-wide">{proj.title}</h3>
                                  <div className="flex flex-wrap gap-2 mb-4">
                                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                      <Users className="w-3 h-3 inline mr-1" />{proj.characterLibrary?.length || 0} 角色
                                    </span>
                                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                      <Film className="w-3 h-3 inline mr-1" />多剧集
                                    </span>
                                  </div>
                                  {proj.description && (
                                    <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed font-mono border-l border-[var(--border-primary)] pl-2">{proj.description}</p>
                                  )}
                                </div>
                              </div>

                              <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
                                <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(proj.lastModified)}
                                </div>
                                <ChevronRight className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : homeSection === 'characters' ? (
                <>
                  <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2 max-w-3xl">
                        <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">首页角色库</h3>
                        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                          在首页直接维护全局角色资产。这里新增、编辑和上传的角色会写入全局角色库，供你跨项目复用。
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 border border-[var(--border-secondary)] bg-[var(--bg-sunken)] px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] whitespace-nowrap">
                        <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                        Global Asset Store
                      </div>
                    </div>
                  </section>

                  <section className="border border-[var(--border-primary)] bg-[var(--bg-base)]">
                    <div className="px-5 md:px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">角色库</h3>
                        <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                          当前维护的是全局角色资产，不隶属于单个项目。后续可在项目工作流中导入和复用这些角色。
                        </p>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{filteredDashboardCharacters.length} characters</div>
                    </div>

                    <div className="p-5 md:p-6 space-y-6">
                      {isLibraryLoading ? (
                        <div className="flex justify-center py-20">
                          <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_auto] xl:items-end">
                            <div>
                              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">搜索角色</div>
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                  value={dashboardCharacterQuery}
                                  onChange={(event) => setDashboardCharacterQuery(event.target.value)}
                                  placeholder="搜索角色名称、性格或提示词..."
                                  className="w-full rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] py-3 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--border-secondary)]"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowDashboardCharacterAddModal(true)}
                              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest"
                            >
                              <Plus className="w-4 h-4" />
                              添加角色
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
                              <Archive className="w-3.5 h-3.5" />
                              全局角色资产
                            </span>
                            <span className="inline-flex items-center gap-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
                              <Users className="w-3.5 h-3.5" />
                              {dashboardGlobalCharacters.length} 角色
                            </span>
                          </div>

                          {filteredDashboardCharacters.length === 0 ? (
                            <div className="border border-dashed border-[var(--border-primary)] p-12 text-center text-[var(--text-muted)] bg-[var(--bg-primary)]">
                              <Users className="w-10 h-10 mx-auto mb-4 opacity-30" />
                              <p className="text-sm mb-2">{dashboardCharacterQuery ? '未找到匹配角色' : '全局角色库为空'}</p>
                              <p className="text-[10px] font-mono">点击“添加角色”创建全局角色，后续可在不同项目中复用。</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                              {filteredDashboardCharacters.map((item) => (
                                <AssetLibraryEditorCard
                                  key={item.id}
                                  type="character"
                                  asset={item.data as Character}
                                  refCount={0}
                                  onSave={(asset) => handleSaveDashboardCharacter(item, asset)}
                                  onDelete={() => handleDeleteDashboardCharacter(item)}
                                  onUploadImage={(file) => handleUploadDashboardCharacterImage(item, file)}
                                  onPreviewImage={setDashboardCharacterPreviewImage}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  {analysisSubView === 'benchmark' ? (
                    <>
                      <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 md:p-8">
                        <div className="flex flex-wrap items-start justify-between gap-5">
                          <div className="space-y-3 max-w-4xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              <SearchCheck className="h-3.5 w-3.5" />
                              Benchmark Analysis
                            </div>
                            <div>
                              <h3 className="text-2xl md:text-3xl font-semibold tracking-wide text-[var(--text-primary)]">首页视频对标分析工作台</h3>
                              <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">
                                这里承接你在项目创作前的对标研究入口：先选项目，再进入具体剧集打开视频分析工作台，完成参考视频拆解、模板沉淀与创作反哺。
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-4 py-3 text-right min-w-[220px]">
                            <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">当前可进入分析的项目</div>
                            <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{projects.length} 个项目</div>
                          </div>
                        </div>
                      </section>

                      {/* Video Deconstruct UI Section */}
                      <section className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] flex flex-col">
                        <div className="px-5 md:px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-[var(--bg-base)] z-20">
                          <div className="flex items-center gap-3">
                            {currentBenchmarkId && (
                                <button
                                  onClick={() => { setCurrentBenchmarkId(null); setSelectedSliceShotId(''); setSelectedSliceParagraphId(''); setVideoLink(''); }}
                                className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
                                title="返回历史库"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            )}
                            <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">
                              {currentBenchmarkId ? '解构详情' : '视频解构'}
                            </h3>
                          </div>
                        </div>
                        <div className="p-5 md:p-6 space-y-6">
                          <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <LinkIcon className="h-4 w-4 text-[var(--text-muted)]" />
                              </div>
                              <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-3 border border-[var(--border-secondary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] text-sm transition-colors"
                                placeholder="输入视频直达链接..."
                                value={videoLink}
                                onChange={(e) => setVideoLink(e.target.value)}
                                disabled={isDeconstructing}
                              />
                            </div>
                            <button
                              onClick={handleDeconstruct}
                              disabled={isDeconstructing || !videoLink.trim()}
                              className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-bold uppercase tracking-wider transition-colors ${
                                isDeconstructing || !videoLink.trim()
                                  ? 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-primary)]'
                                  : 'bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]'
                              }`}
                            >
                              {isDeconstructing ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  解构中...
                                </>
                              ) : (
                                <>
                                  <Wand2 className="w-4 h-4" />
                                  开始解构
                                </>
                              )}
                            </button>
                          </div>
                          
                          {!currentBenchmarkId && (
                            <div className="mt-4">
                              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-4">解构历史库</h4>
                              {benchmarkList.length === 0 ? (
                                <div className="py-12 text-center border border-[var(--border-subtle)] bg-[var(--bg-base)] rounded-lg">
                                  <Archive className="w-8 h-8 text-[var(--border-secondary)] mx-auto mb-3" />
                                  <p className="text-sm text-[var(--text-muted)]">暂无对标分析历史，输入链接开始第一次解构</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                  {benchmarkList.map(item => (
                                      <div 
                                        key={item.id} 
                                        onClick={() => { setCurrentBenchmarkId(item.id); setSelectedSliceShotId(''); setSelectedSliceParagraphId(''); }}
                                      className="group cursor-pointer border border-[var(--border-primary)] bg-[var(--bg-base)] hover:border-[var(--border-secondary)] p-4 rounded-lg flex flex-col gap-2 transition-colors relative"
                                    >
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteBenchmarkVideo(item.id).then(() => loadBenchmarks());
                                        }}
                                        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--error-hover-bg)] text-[var(--text-muted)] hover:text-[var(--error-text)] rounded transition-all"
                                        title="删除记录"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      <div className="flex items-center gap-2">
                                        {item.status === 'analyzing' ? (
                                          <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                                        ) : (
                                          <Film className="w-4 h-4 text-[var(--text-muted)]" />
                                        )}
                                        <span className="text-sm font-bold text-[var(--text-primary)] line-clamp-1 pr-6">{item.title}</span>
                                      </div>
                                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">{item.url}</div>
                                      <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
                                        <span>{formatDate(item.createdAt)}</span>
                                        <span>{getBenchmarkStatusLabel(item)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {currentBenchmarkId && currentBenchmark && (
                            <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">数据来源</div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-bold text-[var(--text-primary)]">{currentBenchmark.title}</div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${currentBenchmark.status !== 'completed' || currentBenchmark.analysisMode === 'metadata' ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-[var(--success-bg)] text-[var(--success-text)]'}`}>
                                      {analysisModeLabel}
                                    </span>
                                  </div>
                                    <div className="mt-1 text-xs text-[var(--text-tertiary)] break-all">{currentBenchmark.sourceMeta?.canonicalUrl || currentBenchmark.url}</div>
                                    {currentBenchmark.analysisBasis && (
                                      <div className="mt-2 text-[11px] text-[var(--text-muted)]">{currentBenchmark.analysisBasis}</div>
                                    )}
                                  </div>
                                  {currentBenchmark.status === 'completed' && (
                                    <div className="flex flex-wrap items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={handleRunBenchmarkSlicing}
                                        disabled={!canRunSlicing}
                                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-bold transition-colors ${canRunSlicing ? 'bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]' : 'border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[var(--text-muted)] opacity-70'}`}
                                      >
                                        {isSliceRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                        {currentSliceArtifact?.status === 'completed' ? '重新生成拆片镜头' : isSliceRunning ? '拆片中...' : '生成拆片镜头'}
                                      </button>
                                      {isSliceRunning && currentBenchmark && (
                                        <button
                                          type="button"
                                          onClick={() => handleRecoverStuckSliceRun(currentBenchmark, '已手动重置卡住的拆片状态；现在可以重新尝试。')}
                                          className="inline-flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-[11px] font-bold text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/15"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          重置拆片状态
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={handleRunPromptReconstruction}
                                        disabled={!canRunPromptReconstruction}
                                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {isPromptReconstructing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        {reconstructedSliceShotCount > 0 ? (isPromptReconstructing ? '反推中...' : '重新图片反推') : (isPromptReconstructing ? '反推中...' : '图片反推')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setBenchmarkToImport(currentBenchmark)}
                                        disabled={projects.length === 0}
                                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Folder className="w-3.5 h-3.5" />
                                        导入到项目工作台
                                      </button>
                                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                        {projects.length > 0 ? '将创建新的 analysis Episode，并保留当前对标结论。' : '请先创建项目再导入。'}
                                      </span>
                                      {!currentDownloadArtifact?.localPath && (
                                        <span className="text-[10px] font-mono text-[var(--warning)]">需先拿到本地视频路径后才能拆片。</span>
                                      )}
                                      {currentDownloadArtifact?.localPath && availableSlicingShots.length === 0 && (
                                        <span className="text-[10px] font-mono text-[var(--warning)]">当前拆解方案里还没有可解析的镜头时间表。</span>
                                      )}
                                      {isSliceRunning && (
                                        <span className={`text-[10px] font-mono ${isCurrentSliceRunStale ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                                          {sliceElapsedLabel ? `已等待 ${sliceElapsedLabel}` : '正在等待拆片结果'} · 当前版本暂不支持实时拆片进度回传。
                                        </span>
                                      )}
                                    </div>
                                  )}
                                <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--text-tertiary)] md:text-right">
                                  <div>
                                    <div className="text-[var(--text-muted)]">频道</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.channelTitle || '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">字幕状态</div>
                                    <div className="text-[var(--text-primary)]">{transcriptStatusLabel}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">播放量</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.viewCount ? currentBenchmark.sourceMeta.viewCount.toLocaleString('zh-CN') : '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">点赞</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.likeCount ? currentBenchmark.sourceMeta.likeCount.toLocaleString('zh-CN') : '-'}</div>
                                  </div>
                                </div>
                              </div>

                              {currentDownloadArtifact && (
                                <div className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-base)] px-3 py-3 text-xs leading-6 text-[var(--text-tertiary)]">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">下载制品</div>
                                      <div className="mt-1 text-[var(--text-primary)]">{downloadStatusLabel}</div>
                                    </div>
                                    {currentDownloadArtifact.outputDirectory && (
                                      <div className="text-[10px] font-mono text-[var(--text-muted)] break-all md:max-w-[60%] md:text-right">
                                        {currentDownloadArtifact.outputDirectory}
                                      </div>
                                    )}
                                  </div>
                                  {currentDownloadArtifact.outputDirectory && currentDownloadArtifact.status === 'downloading' && (
                                    <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                                      正在写入：<span className="font-mono break-all text-[var(--text-primary)]">{currentDownloadArtifact.outputDirectory}</span>
                                    </div>
                                  )}
                                  {typeof currentDownloadArtifact.progressPercent === 'number' && currentDownloadArtifact.status === 'downloading' && (
                                    <div className="mt-3 space-y-2">
                                      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                                        <div
                                          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                                          style={{ width: `${Math.max(2, Math.min(100, currentDownloadArtifact.progressPercent))}%` }}
                                        />
                                      </div>
                                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                                        <span className="text-[var(--text-primary)]">{currentDownloadArtifact.progressPercent.toFixed(currentDownloadArtifact.progressPercent >= 10 ? 0 : 1)}%</span>
                                        {currentDownloadArtifact.downloadedBytes !== undefined && (
                                          <span>
                                            已下载 {formatByteCount(currentDownloadArtifact.downloadedBytes)}
                                            {currentDownloadArtifact.totalBytes !== undefined ? ` / ${formatByteCount(currentDownloadArtifact.totalBytes)}` : ''}
                                          </span>
                                        )}
                                        {currentDownloadArtifact.speedBytesPerSecond !== undefined && (
                                          <span>速度 {formatByteCount(currentDownloadArtifact.speedBytesPerSecond)}/s</span>
                                        )}
                                        {currentDownloadArtifact.etaSeconds !== undefined && (
                                          <span>剩余约 {formatEtaLabel(currentDownloadArtifact.etaSeconds)}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {currentDownloadArtifact.localPath && (
                                    <div className="mt-2 break-all font-mono text-[10px] text-[var(--text-primary)]">
                                      {currentDownloadArtifact.localPath}
                                    </div>
                                  )}
                                  {currentDownloadArtifact.errorMessage && (
                                    <div className="mt-2 text-[var(--error-text)]">
                                      {currentDownloadArtifact.errorMessage}
                                    </div>
                                  )}
                                  {!!currentDownloadArtifact.warnings?.length && (
                                    <div className="mt-2 space-y-1 text-[var(--warning)]">
                                      {currentDownloadArtifact.warnings.map((warning, index) => (
                                        <div key={`${warning}-${index}`}>{warning}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {currentBenchmark.errorMessage && (
                                <div className="rounded-md border border-[var(--error-border)] bg-[var(--error-hover-bg)] px-3 py-2 text-xs leading-6 text-[var(--error-text)]">
                                  {currentBenchmark.errorMessage}
                                </div>
                              )}

                              {currentSliceArtifact?.status === 'failed' && currentSliceArtifact.errorMessage && (
                                <div className="rounded-md border border-[var(--error-border)] bg-[var(--error-hover-bg)] px-3 py-2 text-xs leading-6 text-[var(--error-text)]">
                                  拆片失败：{currentSliceArtifact.errorMessage}
                                </div>
                              )}

                              {isPromptReconstructing && promptReconstructionProgress && (
                                <div className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-3 text-xs leading-6 text-[var(--text-primary)]">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <div className="font-bold text-[var(--accent-text-hover)]">
                                        正在执行图片反推：{promptReconstructionProgress.completed}/{promptReconstructionProgress.total}
                                      </div>
                                      <div className="text-[11px] text-[var(--text-secondary)]">
                                        当前处理 {promptReconstructionProgress.currentShotLabel} · 已成功 {promptReconstructionProgress.succeeded} 条 · 失败 {promptReconstructionProgress.failed} 条
                                      </div>
                                    </div>
                                    <div className="text-[11px] font-mono text-[var(--accent-text)]">{promptReconstructionPercent}%</div>
                                  </div>
                                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-primary)]/60">
                                    <div
                                      className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                                      style={{ width: `${Math.max(4, Math.min(100, promptReconstructionPercent))}%` }}
                                    />
                                  </div>
                                  <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                                    正在逐镜头读取首帧 / 中段 / 尾帧并生成对应反推提示词，完成后会自动写回当前拆片结果。
                                  </div>
                                </div>
                              )}

                              {currentSliceArtifact?.status === 'completed' && (
                                <div className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-xs leading-6 text-[var(--success-text)]">
                                  已生成真实拆片结果：{currentSliceArtifact.manifest?.summary?.ok_rows ?? currentSliceArtifact.manifest?.shots?.length ?? 0} 条镜头可预览。
                                  {currentSliceArtifact.outputDir ? <span className="ml-2 font-mono break-all">{currentSliceArtifact.outputDir}</span> : null}
                                  {reconstructedSliceShotCount > 0 ? <span className="ml-2">· 已完成 {reconstructedSliceShotCount} 条镜头图片反推</span> : null}
                                </div>
                              )}

                              {!!currentBenchmark.warnings?.length && (
                                <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-xs leading-6 text-[var(--warning)]">
                                  <div className="space-y-1">
                                    {currentBenchmark.warnings.map((warning, index) => (
                                      <div key={`${warning}-${index}`}>{warning}</div>
                                    ))}
                                  </div>
                                  {shouldShowModelConfigAction && (
                                    <button
                                      onClick={onShowModelConfig}
                                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--bg-primary)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                                    >
                                      <Cpu className="w-3.5 h-3.5" />
                                      配置模型
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {currentBenchmarkId && currentBenchmark && (
                            <div className="mt-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
                              <div className={`flex items-center justify-between gap-3 px-5 py-4 md:px-6 ${isEditingBenchmarkBreakdown || isBenchmarkBreakdownExpanded ? 'border-b border-[var(--border-subtle)]' : ''}`}>
                                <div>
                                  <h4 className="text-sm font-bold tracking-wide text-[var(--text-primary)]">视频拆解方案</h4>
                                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                                    {isBenchmarkBreakdownAdaptationMode
                                      ? '左侧保留当前拆解底稿，右侧可直接改写成新的创作文稿。'
                                      : '展示当前记录生成的长文本报告；旧记录会基于已保存的分析结果做保守回填。'}
                                  </p>
                                </div>
                                {!isEditingBenchmarkBreakdown ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setIsBenchmarkBreakdownExpanded((prev) => !prev)}
                                      aria-label={isBenchmarkBreakdownExpanded ? '收起视频拆解方案' : '展开视频拆解方案'}
                                      title={isBenchmarkBreakdownExpanded ? '收起' : '展开'}
                                      className="inline-flex items-center justify-center rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                                    >
                                      {isBenchmarkBreakdownExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleStartEditBenchmarkBreakdown}
                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleStartAdaptBenchmarkBreakdown}
                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                      className="inline-flex items-center gap-2 rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Wand2 className="h-3.5 w-3.5" />
                                      改编
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveBenchmarkBreakdown}
                                      disabled={isBenchmarkBreakdownSaveDisabled}
                                      className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isSavingBenchmarkBreakdown ? '保存中...' : isBenchmarkBreakdownAdaptationMode ? '保存改编' : '保存'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditBenchmarkBreakdown}
                                      disabled={isSavingBenchmarkBreakdown}
                                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      取消
                                    </button>
                                  </div>
                                )}
                              </div>
                              {(isEditingBenchmarkBreakdown || isBenchmarkBreakdownExpanded) && (
                                <div className="p-5 md:p-6">
                                  {isEditingBenchmarkBreakdown ? (
                                    isBenchmarkBreakdownAdaptationMode ? (
                                      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                                        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                              <div>
                                                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">原始拆解底稿</div>
                                                <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">当前已保存方案</div>
                                              </div>
                                              <div className="text-[10px] font-mono text-[var(--text-muted)]">只读参考</div>
                                            </div>
                                            <pre className="mt-4 max-h-[720px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-tertiary)]">
                                              {benchmarkBreakdownDisplayText}
                                            </pre>
                                          </div>
                                        </div>

                                        <div ref={adaptationWorkspaceRef} className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] p-4">
                                          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                              <div>
                                                <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--accent-text)]">
                                                  <Wand2 className="h-3.5 w-3.5" />
                                                  Adaptation Workspace
                                                </div>
                                                <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">新改编文稿</div>
                                                <p className="mt-2 text-[11px] leading-6 text-[var(--text-tertiary)]">
                                                  以左侧拆解为母稿，从空白页开始改写结构、语气和创作表达；保存后会单独写入改编稿，不覆盖左侧原始拆解底稿。
                                                </p>
                                              </div>
                                              <div className="text-right text-[10px] font-mono text-[var(--text-muted)]">
                                                <div>{adaptationDraftPlainText.trim().length} 字</div>
                                                <div className="mt-1">{adaptationDraftImageCount} 张图</div>
                                                {(benchmarkAdaptationDisplayText || benchmarkAdaptationImageCount > 0) ? <div className="mt-1 text-[9px] uppercase tracking-[0.14em]">已存在改编稿</div> : null}
                                              </div>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-[var(--accent-border)] bg-[var(--accent)]/8 px-4 py-3 text-[11px] leading-6 text-[var(--text-tertiary)]">
                                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                  下方编辑区支持文字与镜头图混排；在本页下半部分的切片预览中点击“插入改编稿”，就能把对应首帧 / 中段 / 尾帧直接送进这里。
                                                </div>
                                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--accent-text)]">
                                                  Text + Image Blocks
                                                </div>
                                              </div>
                                            </div>

                                            {isUsingRichAdaptationEditor ? (
                                              <div className="mt-4 space-y-3">
                                                {adaptationDocumentDraft.blocks.map((block, index) => (
                                                  block.type === 'text' ? (
                                                    <div key={block.id} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-3">
                                                      <div className="flex items-center justify-between gap-3">
                                                        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">文本段落 {String(index + 1).padStart(2, '0')}</div>
                                                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{block.content.trim().length} 字</div>
                                                      </div>
                                                      <textarea
                                                        ref={(node) => {
                                                          adaptationTextBlockRefs.current[block.id] = node;
                                                        }}
                                                        value={block.content}
                                                        onChange={(e) => handleChangeAdaptationTextBlock(block.id, e.target.value)}
                                                        disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                                        placeholder="继续撰写这一段改编内容……"
                                                        className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                                      />
                                                    </div>
                                                  ) : (
                                                    <div key={block.id} className="rounded-xl border border-[var(--accent-border)] bg-[var(--bg-sunken)] p-3">
                                                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                                        <div className="w-full overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-2 lg:max-w-[240px]">
                                                          <img
                                                            src={block.imageUrl}
                                                            alt={`${block.shotLabel} ${block.frameLabel}`}
                                                            className="aspect-video w-full rounded-lg object-contain"
                                                            data-fallback-urls={JSON.stringify(block.fallbackImageUrls || [])}
                                                            data-fallback-index="0"
                                                            onError={(event) => {
                                                              const target = event.currentTarget;
                                                              const fallbackUrls = JSON.parse(target.dataset.fallbackUrls || '[]') as string[];
                                                              const nextIndex = Number.parseInt(target.dataset.fallbackIndex || '0', 10);
                                                              const nextUrl = fallbackUrls[nextIndex];
                                                              if (nextUrl) {
                                                                target.dataset.fallbackIndex = String(nextIndex + 1);
                                                                target.src = nextUrl;
                                                                return;
                                                              }
                                                              target.onerror = null;
                                                            }}
                                                          />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                              <div className="inline-flex items-center rounded-full bg-[var(--accent)]/14 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--accent-text)]">
                                                                插入图片块
                                                              </div>
                                                              <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{block.shotLabel}{block.shotTitle ? ` · ${block.shotTitle}` : ''}</div>
                                                            </div>
                                                            <button
                                                              type="button"
                                                              onClick={() => handleRemoveAdaptationImageBlock(block.id)}
                                                              disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                                              className="inline-flex items-center justify-center rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                                                              title="移除这张插图"
                                                              aria-label="移除这张插图"
                                                            >
                                                              <X className="h-4 w-4" />
                                                            </button>
                                                          </div>

                                                          <div className="mt-3 flex flex-wrap gap-2">
                                                            {[
                                                              { label: '镜头', value: block.shotLabel },
                                                              { label: '帧位', value: block.frameLabel },
                                                              { label: '时间码', value: block.timecode },
                                                            ].map((item) => (
                                                              <div key={`${block.id}-${item.label}`} className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                                                <span className="text-[var(--text-muted)]">{item.label}</span>
                                                                <span className="mx-1 text-[var(--border-secondary)]">/</span>
                                                                <span className="text-[var(--text-primary)] normal-case tracking-normal">{item.value}</span>
                                                              </div>
                                                            ))}
                                                          </div>

                                                          <div className="mt-3 text-[11px] leading-6 text-[var(--text-tertiary)]">
                                                            {block.caption || '这张图来自下方切片预览，可和上下文文本一起作为改编文稿中的视觉锚点。'}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  )
                                                ))}
                                              </div>
                                            ) : (
                                              <textarea
                                                ref={(node) => {
                                                  const textBlock = adaptationDocumentDraft.blocks[0];
                                                  if (textBlock?.type === 'text') {
                                                    adaptationTextBlockRefs.current[textBlock.id] = node;
                                                  }
                                                }}
                                                value={adaptationDocumentDraft.blocks[0]?.type === 'text' ? adaptationDocumentDraft.blocks[0].content : ''}
                                                onChange={(e) => {
                                                  const firstBlock = adaptationDocumentDraft.blocks[0];
                                                  if (firstBlock?.type === 'text') {
                                                    handleChangeAdaptationTextBlock(firstBlock.id, e.target.value);
                                                  }
                                                }}
                                                disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                                placeholder="从这里开始改编：例如提炼叙事主线、改写成创作提纲、重组成新的脚本方向……"
                                                className="mt-4 min-h-[420px] max-h-[720px] w-full resize-y rounded-xl border border-[var(--accent-border)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                              />
                                            )}

                                            <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 md:flex-row md:items-center md:justify-between">
                                              <p className="text-[11px] leading-6 text-[var(--text-muted)]">
                                                取消会回到原始拆解方案；改编模式下支持纯文字保存，也支持带镜头图的图文混排保存。
                                              </p>
                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={handleCancelEditBenchmarkBreakdown}
                                                  disabled={isSavingBenchmarkBreakdown}
                                                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  取消
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={handleSaveBenchmarkBreakdown}
                                                  disabled={isBenchmarkBreakdownSaveDisabled}
                                                  className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {isSavingBenchmarkBreakdown ? '保存中...' : '保存改编'}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <textarea
                                        value={benchmarkBreakdownDraft}
                                        onChange={(e) => setBenchmarkBreakdownDraft(e.target.value)}
                                        disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                        className="min-h-[360px] max-h-[720px] w-full resize-y rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                      />
                                    )
                                  ) : (
                                    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-tertiary)]">
                                      {benchmarkBreakdownDisplayText}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {currentBenchmarkId && currentBenchmark && selectedSliceDetail && (
                            <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
                              <div className={`flex flex-col gap-4 px-5 py-4 md:px-6 xl:flex-row xl:items-end xl:justify-between ${isSliceResultsPreviewExpanded ? 'border-b border-[var(--border-subtle)]' : ''}`}>
                                <div className="space-y-2 max-w-3xl">
                                  <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                                    <LayoutPanelTop className="w-3.5 h-3.5" />
                                    Slice Results Preview
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold tracking-wide text-[var(--text-primary)]">拆片镜头预览面板</h4>
                                    <p className="mt-1 text-[11px] leading-6 text-[var(--text-muted)]">
                                      {isUsingRealSliceData
                                        ? `当前区域正在展示《${currentBenchmark.title}》的真实拆片结果，可直接浏览镜头、三帧参考和后续衍生入口。`
                                        : `当前区域仍使用模拟切片数据；点击上方“生成拆片镜头”后，会替换成《${currentBenchmark.title}》的真实结果。`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 xl:items-end">
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[420px]">
                                    {[
                                      { label: isUsingRealSliceData ? '真实镜头' : 'Mock 镜头', value: `${currentSliceShots.length} 条` },
                                      { label: '关键帧卡', value: `${sliceFrameCount} 张` },
                                      { label: '覆盖时长', value: sliceCoverageLabel },
                                      { label: '当前选择', value: selectedSliceDetail.label },
                                    ].map((item) => (
                                      <div key={item.label} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-3">
                                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">{item.label}</div>
                                        <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{item.value}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setIsSliceResultsPreviewExpanded((prev) => !prev)}
                                    aria-label={isSliceResultsPreviewExpanded ? '收起拆片镜头预览面板' : '展开拆片镜头预览面板'}
                                    title={isSliceResultsPreviewExpanded ? '收起' : '展开'}
                                    className="inline-flex items-center justify-center rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                                  >
                                    {isSliceResultsPreviewExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </button>
                                </div>
                              </div>

                              {isSliceResultsPreviewExpanded && (
                                <div className="space-y-5 p-5 md:p-6">
                                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] xl:items-start">
                                    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)]/40 p-4">
                                      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                          <div>
                                            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">合并镜头卡组</div>
                                            <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">按场景与连续时长归并成独立段落卡，点击后直接查看合并后的段落详情</div>
                                          </div>
                                          <div className="text-[11px] leading-6 text-[var(--text-tertiary)] xl:max-w-xs">
                                            基于相邻镜头的场景、时间连续性、总时长、镜头数和轻量转场提示做本地归并；该卡组只负责展示合并段落，不会替换下方原始单镜头卡组语义。
                                          </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                          {currentSliceParagraphs.map((paragraph) => {
                                            const isActive = paragraph.id === selectedSliceParagraphId;
                                            return (
                                              <button
                                                key={paragraph.id}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setSelectedSliceParagraphId(paragraph.id)}
                                                className={`group rounded-xl border px-4 py-4 text-left transition-colors ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-primary)] bg-[var(--bg-sunken)]/35 hover:bg-[var(--bg-hover)]'}`}
                                              >
                                                <div className="flex items-start justify-between gap-3">
                                                  <div>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] ${isActive ? 'bg-[var(--accent)]/14 text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                                                      {paragraph.label}
                                                    </span>
                                                    <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{paragraph.shotRangeLabel}</div>
                                                  </div>
                                                  <div className="text-right">
                                                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{paragraph.shotCount} 镜头</div>
                                                    <div className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">{paragraph.totalDurationLabel}</div>
                                                  </div>
                                                </div>

                                                <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{paragraph.timeRangeLabel}</div>
                                                <div className="mt-3 text-[11px] leading-6 text-[var(--text-primary)]">{paragraph.summary}</div>

                                                <div className="mt-3 text-[10px] leading-5 text-[var(--text-muted)]">
                                                  <span className="text-[var(--text-tertiary)]">主场景：</span>
                                                  {paragraph.primaryScene}
                                                </div>

                                                {paragraph.dialogueExcerpt && (
                                                  <div className="mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-3">
                                                    <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">对白摘录</div>
                                                    <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--text-primary)]">
                                                      “{paragraph.dialogueExcerpt}”
                                                    </div>
                                                  </div>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                        <div>
                                          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">镜头矩阵</div>
                                          <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">平铺浏览全部切片镜头，直接挑选想要继续精修的单镜头</div>
                                        </div>
                                        <div className="text-[11px] text-[var(--text-tertiary)] xl:max-w-xs">
                                          {isUsingRealSliceData ? '当前列表来自真实切片 manifest；选中后，右侧会固定显示首中尾三帧、节奏摘要和元数据。' : '所有 mock 镜头默认平铺展示；选中后，右侧检视器会持续显示三帧占位、节奏注解和演化动作入口。'}
                                        </div>
                                      </div>

                                      <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                                        {currentSliceShots.map((shot) => {
                                          const isActive = !selectedSliceParagraphId && shot.id === selectedSliceShot?.id;
                                          const hasDialogue = hasBenchmarkText(shot.dialogue) && shot.dialogue !== '-';
                                          return (
                                            <button
                                              key={shot.id}
                                              type="button"
                                              aria-pressed={isActive}
                                              onClick={() => {
                                                setSelectedSliceParagraphId('');
                                                setSelectedSliceShotId(shot.id);
                                              }}
                                              className={`group rounded-xl border px-4 py-3 text-left transition-colors ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)]'}`}
                                            >
                                              <div className="flex items-center justify-between gap-3">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] ${isActive ? 'bg-[var(--accent)]/14 text-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                                                  镜头 {shot.indexLabel}
                                                </span>
                                                <span className="text-[10px] font-mono text-[var(--text-muted)]">{shot.durationLabel}</span>
                                              </div>
                                              <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{shot.title}</div>
                                              <div className="mt-2 text-[11px] leading-5 text-[var(--text-tertiary)]">{shot.beatSummary}</div>
                                              {hasBenchmarkText(shot.scene) && (
                                                <div className="mt-2 text-[10px] leading-5 text-[var(--text-muted)]">
                                                  <span className="text-[var(--text-tertiary)]">场景：</span>
                                                  {shot.scene}
                                                </div>
                                              )}
                                              {hasDialogue && (
                                                <div className="mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-3">
                                                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">对白摘录</div>
                                                  <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--text-primary)]">
                                                    “{shot.dialogue}”
                                                  </div>
                                                </div>
                                              )}
                                              <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{shot.timeRange}</div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="self-start xl:sticky xl:top-6">
                                        <div ref={selectedSliceInspectorRef} className="space-y-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)]/40 p-4 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
                                          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                              <div>
                                                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? '选中合并段落详情' : '选中镜头详情'}</div>
                                                <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">{selectedSliceDetail.label} · {selectedSliceDetail.title}</div>
                                                <div className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">{selectedSliceDetail.summary}</div>
                                              </div>
                                              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{selectedSliceDetail.timeRange}</div>
                                            </div>
                                            <p className="text-[11px] leading-5 text-[var(--text-muted)]">
                                              {selectedSliceDetail.kind === 'merged'
                                                ? '当前右侧正在展示合并段落的独立详情模型：时间范围、总时长、段落摘要、代表帧与子镜头证据都会按段落聚合展示。'
                                                : '浏览左侧镜头矩阵时，当前镜头的对白摘录、三帧摘要、图片反推提示词、元数据和后续操作会固定保留在右侧，方便持续对照。'}
                                            </p>
                                          </div>

                                          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? '片段视频证据' : '切片视频'}</div>
                                              <div className="text-[10px] font-mono text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? `按子镜头列出 ${selectedSliceDetail.shotCount} 条切片证据` : '点击视频即可播放 / 暂停'}</div>
                                            </div>
                                            <div className="mt-4">
                                              {selectedSliceDetail.kind === 'merged' ? (
                                                <div className="space-y-3">
                                                  {resolvedSelectedSliceVideoUrl ? (
                                                    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                                                      <div className="flex items-center justify-between gap-3">
                                                        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">合并段落视频</div>
                                                        <div className="text-[10px] font-mono text-[var(--text-muted)]">按当前段落时序拼接</div>
                                                      </div>
                                                      <video
                                                        key={selectedSliceDetail.id}
                                                        src={resolvedSelectedSliceVideoUrl}
                                                        poster={selectedSliceDetail.frames[0]?.imageUrl}
                                                        controls
                                                        playsInline
                                                        preload="metadata"
                                                        className="mt-3 block aspect-video w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] object-contain"
                                                      />
                                                    </div>
                                                  ) : activeMergedParagraphVideo?.status === 'loading' ? (
                                                    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-4 text-[11px] leading-6 text-[var(--text-muted)]">
                                                      正在后台拼接当前段落视频；你可以先看下方子镜头证据和关键帧胶片条。
                                                    </div>
                                                  ) : (
                                                    <div className="rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-primary)]/60 px-4 py-4">
                                                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">合并段落视频</div>
                                                          <div className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">默认先显示子镜头证据，按需再生成一条完整段落视频，避免长时间等待。</div>
                                                        </div>
                                                        <button
                                                          type="button"
                                                          onClick={() => handleGenerateMergedParagraphVideo(selectedSliceDetail)}
                                                          className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
                                                        >
                                                          生成合并视频
                                                        </button>
                                                      </div>
                                                    </div>
                                                  )}

                                                  {activeMergedParagraphVideo?.status === 'error' && (
                                                    <div className="rounded-lg border border-dashed border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-4 text-[11px] leading-6 text-[var(--warning)]">
                                                      {activeMergedParagraphVideo.errorMessage || '当前合并段落视频生成失败，已降级为子镜头证据列表。'}
                                                    </div>
                                                  )}

                                                  {selectedSliceDetail.videoEvidence.length > 0 ? (
                                                    <div className="space-y-3">
                                                      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
                                                        <div>
                                                          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">子镜头证据</div>
                                                          <div className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">默认折叠，只有在需要逐条核对时再展开。</div>
                                                        </div>
                                                        <button
                                                          type="button"
                                                          onClick={() => setExpandedMergedEvidenceMap((prev) => ({
                                                            ...prev,
                                                            [selectedSliceDetail.id]: !prev[selectedSliceDetail.id],
                                                          }))}
                                                          className="inline-flex items-center justify-center rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-sunken)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                                                        >
                                                          {expandedMergedEvidenceMap[selectedSliceDetail.id] ? '收起子镜头证据' : `展开子镜头证据（${selectedSliceDetail.videoEvidence.length}）`}
                                                        </button>
                                                      </div>

                                                      {expandedMergedEvidenceMap[selectedSliceDetail.id] && (
                                                        <div className="space-y-3">
                                                          {selectedSliceDetail.videoEvidence.map((evidence) => (
                                                            <ResolvedSliceVideoEvidenceCard key={evidence.id} evidence={evidence} />
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <div className="rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-primary)]/50 px-4 py-4 text-[11px] leading-6 text-[var(--text-muted)]">
                                                      当前合并段落暂无可展示的子镜头视频证据。
                                                    </div>
                                                  )}
                                                </div>
                                              ) : resolvedSelectedSliceVideoUrl ? (
                                                <video
                                                  key={selectedSliceDetail.id}
                                                  src={resolvedSelectedSliceVideoUrl}
                                                  poster={selectedSliceDetail.frames[0]?.imageUrl}
                                                  controls
                                                  playsInline
                                                  preload="metadata"
                                                  className="block aspect-video w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] object-contain"
                                                />
                                              ) : (
                                                <div className="rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-primary)]/50 px-4 py-4 text-[11px] leading-6 text-[var(--text-muted)]">
                                                  {selectedSliceDetail.kind === 'merged'
                                                    ? '当前合并段落暂无可播放的子镜头视频证据，请先完成真实拆片后再查看。'
                                                    : '当前镜头暂无可播放的切片视频，请先完成真实拆片后再查看。'}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {selectedSliceDetail.kind === 'merged' && selectedSliceDetail.filmstripFrames.length > 0 && (
                                            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                              <div className="flex items-center justify-between gap-3">
                                                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">中段关键帧胶片条</div>
                                                <div className="text-[10px] font-mono text-[var(--text-muted)]">按子镜头时间顺序排布</div>
                                              </div>
                                              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                                {selectedSliceDetail.filmstripFrames.map((frame) => (
                                                  <div
                                                    key={frame.id}
                                                    className="group rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 transition-colors hover:bg-[var(--bg-hover)]"
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(event) => {
                                                        const currentImage = event.currentTarget.querySelector('img');
                                                        const resolvedImageUrl = currentImage?.currentSrc || currentImage?.getAttribute('src') || frame.imageUrl;
                                                        handleOpenSliceFrameViewer({
                                                          id: frame.id,
                                                          label: '中段',
                                                          timecode: frame.timecode,
                                                          caption: `${frame.shotLabel} · ${frame.title}`,
                                                          tone: 'accent',
                                                          imageUrl: frame.imageUrl,
                                                          fallbackImageUrls: frame.fallbackImageUrls,
                                                        }, `${selectedSliceDetail.label} · ${selectedSliceDetail.title}`, resolvedImageUrl || undefined);
                                                      }}
                                                      className="block w-full text-left"
                                                    >
                                                      <div className="aspect-video overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-base)] p-2">
                                                        <img
                                                          src={frame.imageUrl}
                                                          alt={`${frame.shotLabel} ${frame.title}`}
                                                          className="h-full w-full rounded-md object-contain"
                                                          data-fallback-urls={JSON.stringify(frame.fallbackImageUrls || [])}
                                                          data-fallback-index="0"
                                                          onError={(event) => {
                                                            const target = event.currentTarget;
                                                            const fallbackUrls = JSON.parse(target.dataset.fallbackUrls || '[]') as string[];
                                                            const nextIndex = Number.parseInt(target.dataset.fallbackIndex || '0', 10);
                                                            const nextUrl = fallbackUrls[nextIndex];
                                                            if (nextUrl) {
                                                              target.dataset.fallbackIndex = String(nextIndex + 1);
                                                              target.src = nextUrl;
                                                              return;
                                                            }
                                                            target.onerror = null;
                                                          }}
                                                        />
                                                      </div>
                                                      <div className="mt-3 flex items-start justify-between gap-3">
                                                        <div>
                                                          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{frame.shotLabel}</div>
                                                          <div className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">{frame.title}</div>
                                                        </div>
                                                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{frame.timecode}</div>
                                                      </div>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleInsertFrameIntoAdaptation({
                                                        imageUrl: frame.imageUrl,
                                                        fallbackImageUrls: frame.fallbackImageUrls,
                                                        shotLabel: frame.shotLabel,
                                                        shotTitle: frame.title,
                                                        frameLabel: '中段',
                                                        timecode: frame.timecode,
                                                        caption: `${frame.shotLabel} · ${frame.title}`,
                                                        source: 'filmstrip',
                                                      })}
                                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-[11px] font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                      <Plus className="h-3.5 w-3.5" />
                                                      插入改编稿
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">对白高亮</div>
                                            <div className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--border-secondary)] bg-[var(--accent)]/6 px-4 py-4">
                                              <div className="text-2xl leading-none text-[var(--accent)]/65">“</div>
                                              <div className="min-w-0 flex-1 text-[11px] leading-7 text-[var(--text-primary)]">
                                                {selectedSliceDetail.dialogue}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="space-y-3">
                                            {selectedSliceDetail.frames
                                              .filter((frame) => !(selectedSliceDetail.kind === 'merged' && frame.label === '中段'))
                                              .map((frame) => {
                                              const toneClasses = getMockSliceFrameToneClasses(frame.tone);
                                              return (
                                                <div key={frame.id} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] ${toneClasses.badge}`}>
                                                    {frame.label}
                                                  </span>
                                                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{frame.timecode}</span>
                                                </div>

                                                {frame.imageUrl ? (
                                                  <button
                                                    type="button"
                                                    onClick={(event) => {
                                                      const currentImage = event.currentTarget.querySelector('img');
                                                      const resolvedImageUrl = currentImage?.currentSrc || currentImage?.getAttribute('src') || frame.imageUrl;
                                                      handleOpenSliceFrameViewer(frame, `${selectedSliceDetail.label} · ${selectedSliceDetail.title}`, resolvedImageUrl || undefined);
                                                    }}
                                                    className="group relative block w-full aspect-video overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-2 text-left transition-colors hover:border-[var(--border-secondary)]"
                                                    aria-label={`查看${selectedSliceDetail.title}${frame.label}大图`}
                                                  >
                                                    <img
                                                      src={frame.imageUrl}
                                                      alt={`${selectedSliceDetail.title} ${frame.label}`}
                                                      className="h-full w-full rounded-lg object-contain"
                                                      data-fallback-urls={JSON.stringify(frame.fallbackImageUrls || [])}
                                                      data-fallback-index="0"
                                                      onError={(event) => {
                                                        const target = event.currentTarget;
                                                        const fallbackUrls = JSON.parse(target.dataset.fallbackUrls || '[]') as string[];
                                                        const nextIndex = Number.parseInt(target.dataset.fallbackIndex || '0', 10);
                                                        const nextUrl = fallbackUrls[nextIndex];
                                                        if (nextUrl) {
                                                          target.dataset.fallbackIndex = String(nextIndex + 1);
                                                          target.src = nextUrl;
                                                          return;
                                                        }
                                                        target.onerror = null;
                                                      }}
                                                    />
                                                    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between rounded-b-lg bg-[var(--bg-base)]/82 px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                                      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-secondary)]">点击查看大图</span>
                                                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{frame.timecode}</span>
                                                    </div>
                                                  </button>
                                                ) : (
                                                  <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[linear-gradient(135deg,var(--bg-hover)_0%,var(--bg-sunken)_100%)] px-4 py-4">
                                                    <div className={`absolute -right-8 top-5 h-24 w-24 rounded-full blur-2xl ${toneClasses.glow}`} />
                                                    <div className="absolute inset-x-4 top-4 flex items-start justify-between">
                                                      <div className="h-10 w-16 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)]/60" />
                                                      <div className="h-7 w-7 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-primary)]/50" />
                                                    </div>
                                                    <div className="absolute inset-x-4 bottom-4 space-y-2">
                                                      <div className={`h-1.5 w-16 rounded-full ${toneClasses.line}`} />
                                                      <div className="h-1.5 w-24 rounded-full bg-[var(--border-secondary)]" />
                                                      <div className="h-1.5 w-20 rounded-full bg-[var(--border-secondary)]/70" />
                                                    </div>
                                                  </div>
                                                )}

                                                  <div>
                                                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">{frame.caption}</div>
                                                  <div className="mt-2 text-[10px] leading-5 text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? '用于预览该合并段落在段首 / 段中 / 段尾上的代表性信息密度和构图落点。' : '用于预览该镜头在首帧 / 中段 / 尾帧上的信息密度和构图落点。'}</div>
                                                  {hasMeaningfulSliceText(frame.promptText) && (
                                                    <div className="mt-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-3">
                                                      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">图片反推提示词</div>
                                                      <div className="mt-2 text-[11px] leading-6 text-[var(--text-primary)]">{frame.promptText}</div>
                                                    </div>
                                                  )}
                                                  {frame.imageUrl && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleInsertFrameIntoAdaptation({
                                                        imageUrl: frame.imageUrl!,
                                                        fallbackImageUrls: frame.fallbackImageUrls,
                                                        shotLabel: selectedSliceDetail.label,
                                                        shotTitle: selectedSliceDetail.title,
                                                        frameLabel: frame.label,
                                                        timecode: frame.timecode,
                                                        caption: frame.caption,
                                                        source: 'slice-frame',
                                                      })}
                                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-[11px] font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                      <Plus className="h-3.5 w-3.5" />
                                                      插入改编稿
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>

                                          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">图片反推提示词</div>
                                              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                                                {getSliceReconstructionStatusLabel(selectedSliceDetail.reconstructionStatus)}
                                                {hasMeaningfulSliceText(selectedSliceDetail.reconstructionConfidence) ? ` · ${selectedSliceDetail.reconstructionConfidence}` : ''}
                                              </div>
                                            </div>
                                            <div className="mt-4 space-y-3">
                                              {selectedSliceDetail.frames.some((frame) => hasMeaningfulSliceText(frame.promptText)) ? (
                                                selectedSliceDetail.frames.map((frame) => (
                                                  hasMeaningfulSliceText(frame.promptText) ? (
                                                    <div key={`${frame.id}-prompt-summary`} className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-3">
                                                      <div className="flex items-center justify-between gap-3">
                                                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{frame.label}反推提示词</div>
                                                      <div className="text-[10px] font-mono text-[var(--text-muted)]">{frame.timecode}</div>
                                                    </div>
                                                    <div className="mt-2 text-[11px] leading-6 text-[var(--text-primary)]">{frame.promptText}</div>
                                                  </div>
                                                ) : null
                                              ))
                                              ) : (
                                                <div className="rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-primary)]/50 px-3 py-3 text-[11px] leading-6 text-[var(--text-muted)]">
                                                  {selectedSliceDetail.kind === 'merged' ? '当前合并段落暂无可展示的聚合图片反推提示词。' : '当前镜头暂无可展示的图片反推提示词。'}
                                                </div>
                                              )}

                                              {hasMeaningfulSliceText(selectedSliceDetail.reconstructionCombinedPrompt) && (
                                                <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">整体提示词总结</div>
                                                  <div className="mt-2 text-[11px] leading-6 text-[var(--text-primary)]">{selectedSliceDetail.reconstructionCombinedPrompt}</div>
                                                </div>
                                              )}

                                              {hasMeaningfulSliceText(selectedSliceDetail.reconstructionTransitionSummary) && (
                                                <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? '段落演化摘要' : '镜头演化摘要'}</div>
                                                  <div className="mt-2 text-[11px] leading-6 text-[var(--text-primary)]">{selectedSliceDetail.reconstructionTransitionSummary}</div>
                                                </div>
                                              )}

                                              {hasMeaningfulSliceText(selectedSliceDetail.reconstructionNegativePrompt) && (
                                                <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">负向提示词</div>
                                                  <div className="mt-2 text-[11px] leading-6 text-[var(--text-primary)]">{selectedSliceDetail.reconstructionNegativePrompt}</div>
                                                </div>
                                              )}

                                            {selectedSliceContinuityNotes.length > 0 && (
                                              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">连戏备注</div>
                                                <ul className="mt-2 space-y-2 text-[11px] leading-6 text-[var(--text-primary)]">
                                                  {selectedSliceContinuityNotes.map((note) => (
                                                    <li key={note} className="flex gap-2"><span className="text-[var(--text-muted)]">•</span><span>{note}</span></li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}

                                            {selectedSliceMissingDetails.length > 0 && (
                                              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">缺失信息</div>
                                                <ul className="mt-2 space-y-2 text-[11px] leading-6 text-[var(--text-primary)]">
                                                  {selectedSliceMissingDetails.map((detail) => (
                                                    <li key={detail} className="flex gap-2"><span className="text-[var(--text-muted)]">•</span><span>{detail}</span></li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">{selectedSliceDetail.kind === 'merged' ? '段落元数据' : '镜头元数据'}</div>
                                          <div className="mt-4 space-y-3">
                                            {selectedSliceMetadataItems.map((item) => (
                                              <div key={item.label} className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.label}</div>
                                                <div className="mt-1 text-[11px] leading-5 text-[var(--text-primary)]">{item.value}</div>
                                              </div>
                                            ))}
                                          </div>
                                          {selectedSliceReconstructionWarnings.length > 0 && (
                                            <div className="mt-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">重建提示</div>
                                              <ul className="mt-2 space-y-2 text-[11px] leading-6 text-[var(--text-primary)]">
                                                {selectedSliceReconstructionWarnings.map((warning) => (
                                                  <li key={warning} className="flex gap-2"><span className="text-[var(--text-muted)]">•</span><span>{warning}</span></li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>

                                        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">后续操作</div>
                                          <div className="mt-4 space-y-3">
                                            <button
                                              type="button"
                                              disabled
                                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-3 text-[11px] font-bold text-[var(--accent-text)] opacity-60"
                                            >
                                              <Wand2 className="w-3.5 h-3.5" />
                                              生成镜头批注
                                            </button>
                                            <button
                                              type="button"
                                              disabled
                                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-4 py-3 text-[11px] font-bold text-[var(--text-primary)] opacity-70"
                                            >
                                              <Archive className="w-3.5 h-3.5" />
                                              导出三帧卡片
                                            </button>
                                            <button
                                              type="button"
                                              disabled
                                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-4 py-3 text-[11px] font-bold text-[var(--text-primary)] opacity-70"
                                            >
                                              <ExternalLink className="w-3.5 h-3.5" />
                                              同步到导演台
                                            </button>
                                          </div>
                                          <p className="mt-4 text-[11px] leading-5 text-[var(--text-muted)]">
                                            当前这一组按钮主要用于承接后续镜头批注、三帧导出和同步导演台等动作；真实切片结果已经可以直接复用这套布局。
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </section>


                    </>
                  ) : (
                    <>
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-2 max-w-3xl">
                            <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">首页数据分析总览</h3>
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                              这里聚合当前项目库中的分析相关资产与创作准备度。你可以先在首页查看总体状态，再进入具体项目继续做视频分析、模板沉淀和创作反哺。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCreate}
                            className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium tracking-wide whitespace-nowrap"
                          >
                            <Plus className="w-4 h-4" />
                            新建项目
                          </button>
                        </div>
                      </section>

                      <section className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                        {[
                          { label: '项目数', value: projects.length, icon: Folder },
                          { label: '角色资产', value: totalCharacters, icon: Users },
                          { label: '场景资产', value: totalScenes, icon: MapPin },
                          { label: '道具资产', value: totalProps, icon: Package },
                          { label: '模板资产', value: totalTemplates, icon: Database },
                        ].map((stat) => (
                          <div key={stat.label} className="bg-[var(--bg-primary)] border border-[var(--border-primary)] p-5">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
                              <stat.icon className="w-4 h-4" />
                              <span className="text-[10px] font-mono uppercase tracking-widest">{stat.label}</span>
                            </div>
                            <div className="text-2xl font-light text-[var(--text-primary)]">{stat.value}</div>
                          </div>
                        ))}
                      </section>

                      <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                        <div className="border border-[var(--border-primary)] bg-[var(--bg-base)]">
                          <div className="px-5 md:px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                              <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">项目分析入口</h3>
                              <p className="text-[11px] text-[var(--text-tertiary)] mt-2">选择项目后进入项目概览，再从具体集数进入视频分析工作台。</p>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{projectsWithTemplates} 个项目已沉淀模板</div>
                          </div>

                          <div className="p-5 md:p-6 space-y-4">
                            {isLoading ? (
                              <div className="flex justify-center py-20">
                                <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
                              </div>
                            ) : projects.length === 0 ? (
                              <div className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 text-center space-y-3">
                                <div className="text-sm font-bold text-[var(--text-primary)]">还没有可分析的项目</div>
                                <p className="text-xs text-[var(--text-tertiary)]">先创建一个项目，然后进入具体剧集开展视频分析。</p>
                                <button
                                  type="button"
                                  onClick={handleCreate}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest"
                                >
                                  <Plus className="w-4 h-4" />
                                  创建项目
                                </button>
                              </div>
                            ) : (
                              projects.map((proj) => (
                                <div key={proj.id} className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                  <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                                      <Search className="w-3.5 h-3.5" />
                                      项目入口
                                    </div>
                                    <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{proj.title}</h4>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Users className="w-3 h-3 inline mr-1" />{proj.characterLibrary?.length || 0} 角色
                                      </span>
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Database className="w-3 h-3 inline mr-1" />{proj.viralTemplateLibrary?.length || 0} 模板
                                      </span>
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Calendar className="w-3 h-3 inline mr-1" />{formatDate(proj.lastModified)}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/project/${proj.id}`)}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                                  >
                                    进入项目概览
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">分析快照</div>
                            <div className="space-y-4">
                              <div>
                                <div className="text-sm font-bold text-[var(--text-primary)]">最近更新项目</div>
                                <div className="text-xs text-[var(--text-tertiary)] mt-2">
                                  {latestProject ? `${latestProject.title} · ${formatDate(latestProject.lastModified)}` : '暂无项目数据'}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-bold text-[var(--text-primary)]">模板沉淀覆盖率</div>
                                <div className="text-xs text-[var(--text-tertiary)] mt-2">
                                  {projects.length > 0 ? `${projectsWithTemplates} / ${projects.length} 个项目已经沉淀了可复用模板。` : '创建项目后可在这里查看模板覆盖率。'}
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">分析路径</div>
                            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                              {[
                                { step: '01', title: '选择项目', description: '进入项目概览，选择要研究的视频对应项目。' },
                                { step: '02', title: '进入剧集', description: '从项目概览进入具体集数，打开视频分析 stage。' },
                                { step: '03', title: '沉淀模板', description: '在分析 stage 中完成拆解、模板沉淀和创作反哺。' },
                              ].map((item) => (
                                <div key={item.step} className="border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">Step {item.step}</div>
                                  <div className="text-sm font-bold text-[var(--text-primary)] mb-1">{item.title}</div>
                                  <div className="text-xs text-[var(--text-tertiary)] leading-relaxed">{item.description}</div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {sliceFrameViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/88 p-4 md:p-6" onClick={handleCloseSliceFrameViewer}>
          <div
            className="relative w-full max-w-6xl rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 md:p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-1 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">Slice Frame Viewer</div>
                <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{sliceFrameViewer.shotTitle} · {sliceFrameViewer.frameLabel}</div>
                <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">时间码 {sliceFrameViewer.timecode} · 点击遮罩或右上角关闭</div>
              </div>
              <button
                type="button"
                onClick={handleCloseSliceFrameViewer}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="关闭预览"
                aria-label="关闭预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex max-h-[calc(100vh-10rem)] items-center justify-center overflow-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-3 md:px-4 md:py-4">
              <img
                src={sliceFrameViewer.imageUrl}
                alt={`${sliceFrameViewer.shotTitle} ${sliceFrameViewer.frameLabel}`}
                className="max-h-[calc(100vh-12rem)] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {showDashboardCharacterAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowDashboardCharacterAddModal(false)}>
          <div className="w-full max-w-md bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest mb-4">添加角色到全局角色库</h3>
            <div className="space-y-3">
              <input
                value={newDashboardCharacterForm.name}
                onChange={(event) => setNewDashboardCharacterForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="角色名称 *"
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-secondary)]"
                autoFocus
              />
              <div className="flex gap-3">
                <input
                  value={newDashboardCharacterForm.gender}
                  onChange={(event) => setNewDashboardCharacterForm((prev) => ({ ...prev, gender: event.target.value }))}
                  placeholder="性别"
                  className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
                <input
                  value={newDashboardCharacterForm.age}
                  onChange={(event) => setNewDashboardCharacterForm((prev) => ({ ...prev, age: event.target.value }))}
                  placeholder="年龄"
                  className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
              </div>
              <textarea
                value={newDashboardCharacterForm.personality}
                onChange={(event) => setNewDashboardCharacterForm((prev) => ({ ...prev, personality: event.target.value }))}
                placeholder="性格描述"
                rows={2}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddDashboardCharacter}
                className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold uppercase tracking-widest hover:bg-[var(--btn-primary-hover)]"
              >
                添加
              </button>
              <button
                onClick={() => setShowDashboardCharacterAddModal(false)}
                className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] text-xs font-bold uppercase tracking-widest hover:text-[var(--text-primary)]"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {dashboardCharacterPreviewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/90 p-6 cursor-pointer" onClick={() => setDashboardCharacterPreviewImage(null)}>
          <img src={dashboardCharacterPreviewImage} alt="角色预览" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowSettingsModal(false)}>
          <div
            className="relative w-full max-w-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-4 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--accent-text)]" />
                  系统设置
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Settings</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">管理模型配置、资产库以及数据导入导出</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {onShowModelConfig && (
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    onShowModelConfig();
                  }}
                  className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                    <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
                    模型配置
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">管理模型与 API 设置</div>
                </button>
              )}

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowLibraryModal(true);
                }}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">浏览并复用角色与场景资产</div>
              </button>

              <button
                onClick={handleExportData}
                disabled={isDataExporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导出数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导出全部项目与资产库备份</div>
              </button>

              <button
                onClick={handleImportData}
                disabled={isDataImporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导入数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导入全部项目与资产库备份</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowLibraryModal(false)}>
          <div
            className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLibraryModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-6 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Asset Library</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  在项目里将角色与场景加入资产库，跨项目复用
                </p>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                {libraryItems.length} assets
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="搜索资产名称..."
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-secondary)]"
                />
              </div>
              <div className="min-w-[180px]">
                <select
                  value={libraryProjectFilter}
                  onChange={(e) => setLibraryProjectFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-secondary)]"
                >
                  <option value="all">全部项目</option>
                  {projectNameOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {(['all', 'character', 'scene', 'prop'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLibraryFilter(type)}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border rounded ${
                      libraryFilter === type
                        ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                        : 'bg-transparent text-[var(--text-tertiary)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    {type === 'all' ? '全部' : type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具'}
                  </button>
                ))}
              </div>
            </div>

            {isLibraryLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
              </div>
            ) : filteredLibraryItems.length === 0 ? (
              <div className="border border-dashed border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
                暂无资产。可在项目的“角色与场景”中加入资产库。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredLibraryItems.map((item) => {
                  const preview =
                    item.type === 'character'
                      ? (item.data as Character).referenceImage
                      : item.type === 'scene'
                      ? (item.data as Scene).referenceImage
                      : (item.data as Prop).referenceImage;
                  return (
                    <div
                      key={item.id}
                      className="bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] transition-colors rounded-xl overflow-hidden"
                    >
                      <div className="aspect-video bg-[var(--bg-elevated)]">
                        {preview ? (
                          <img src={preview} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                            {item.type === 'character' ? (
                              <Users className="w-8 h-8 opacity-30" />
                            ) : item.type === 'scene' ? (
                              <MapPin className="w-8 h-8 opacity-30" />
                            ) : (
                              <Package className="w-8 h-8 opacity-30" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{item.name}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest mt-1">
                            {item.type === 'character' ? '角色' : item.type === 'scene' ? '场景' : '道具'}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1 line-clamp-1">
                            {(item.projectName && item.projectName.trim()) || '未知项目'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAssetToUse(item)}
                            className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            选择项目使用
                          </button>
                          <button
                            onClick={() => handleDeleteLibraryItem(item.id)}
                            className="p-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Library Project Picker */}
      {assetToUse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setAssetToUse(null)}>
          <div
            className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAssetToUse(null)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">选择项目使用</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                将资产“{assetToUse.name}”导入到以下项目
              </div>
              {projects.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">暂无项目可用</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleUseAsset(proj.id)}
                      className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">最后修改: {formatDate(proj.lastModified)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {benchmarkToImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => importingBenchmarkProjectId ? null : setBenchmarkToImport(null)}>
          <div
            className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setBenchmarkToImport(null)}
              disabled={Boolean(importingBenchmarkProjectId)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">选择项目导入</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono leading-6">
                将“{benchmarkToImport.title}”导入为新的 analysis Episode。系统会保留当前对标镜头、字幕/元数据结论和 warning，不会伪造本地视频文件。
              </div>
              {projects.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">暂无项目可用，请先创建项目。</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((proj) => {
                    const isImporting = importingBenchmarkProjectId === proj.id;
                    return (
                      <button
                        key={proj.id}
                        onClick={() => handleImportBenchmarkIntoProject(proj.id)}
                        disabled={Boolean(importingBenchmarkProjectId)}
                        className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                          {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">最后修改: {formatDate(proj.lastModified)}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono mt-2">{isImporting ? '正在创建导入 Episode…' : '导入后会直接跳转到分析工作台'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  );
};

export default Dashboard;
