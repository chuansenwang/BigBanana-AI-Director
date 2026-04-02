import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Folder, ChevronDown, ChevronRight, Calendar, AlertTriangle, X, Cpu, Archive, Search, SearchCheck, Sparkles, LayoutPanelTop, Users, MapPin, Package, Database, Settings, Sun, Moon, Film, ExternalLink, User, Link as LinkIcon, Wand2 } from 'lucide-react';
import { SeriesProject, AssetLibraryItem, Character, Scene, Prop, ProjectState, BenchmarkVideo, BenchmarkDownloadArtifact, BenchmarkSliceArtifact, BenchmarkSliceManifestShot } from '../types';
import { getAllSeriesProjects, createNewSeriesProject, saveSeriesProject, deleteSeriesProject, createNewSeries, saveSeries, createNewEpisode, saveEpisode, getAllAssetLibraryItems, deleteAssetFromLibrary, exportIndexedDBData, getAllBenchmarkVideos, saveBenchmarkVideo, deleteBenchmarkVideo } from '../services/storageService';
import { useAlert } from './GlobalAlert';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
  useBackupTransfer,
  DEFAULT_BACKUP_TRANSFER_MESSAGES,
  globalBackupFileName,
} from '../hooks/useBackupTransfer';
import { DIRECTOR_HUB_URL } from '../constants/links';
import { analyzeYouTubeBenchmark, downloadYouTubeBenchmarkVideo, fetchYouTubeBenchmarkIntake } from '../services/youtubeBenchmarkService';
import { importBenchmarkToProject } from '../services/benchmarkImportService';
import { loadArtifactStorageUserConfig } from '../services/artifactStorageConfigService';
import { buildBenchmarkSlicingShots, buildStoryboardSlicingAssetUrl, runBenchmarkSlicing } from '../services/storyboardSlicingService';

interface Props {
  onOpenProject: (project: ProjectState) => void;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
}

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
  transition: string;
  cameraLanguage: string;
  emotionAnchor: string;
  soundDesign: string;
  promptFocus: string;
  frames: MockSliceFrame[];
}

interface SliceFrameViewerState {
  imageUrl: string;
  shotTitle: string;
  frameLabel: string;
  timecode: string;
}

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

const buildSlicePreviewFrames = (shot: BenchmarkSliceManifestShot, sourceRow?: Record<string, unknown>, outputDir?: string): MockSliceFrame[] => {
  const startSeconds = parseSliceTimecodeToSeconds(shot.start_time);
  const endSeconds = parseSliceTimecodeToSeconds(shot.end_time);
  const midpointSeconds = startSeconds !== null && endSeconds !== null ? (startSeconds + endSeconds) / 2 : null;
  const summary = readSliceSourceValue(sourceRow, 'summary', 'beat_summary', 'notes', 'desc') || '用于快速浏览当前镜头的节奏和构图。';
  const middlePath = shot.middle_frame_path || shot.middle_frame_paths?.[0];

  return [
    {
      id: `${shot.base_name}-first`,
      label: '首帧',
      timecode: shot.start_time,
      caption: `起始落点：${summary}`,
      tone: 'warning',
      imageUrl: buildStoryboardSlicingAssetUrl(shot.first_frame_path, outputDir),
    },
    {
      id: `${shot.base_name}-middle`,
      label: '中段',
      timecode: midpointSeconds !== null ? formatMockSliceTimecode(midpointSeconds) : shot.start_time,
      caption: readSliceSourceValue(sourceRow, 'middle_caption', 'prompt_focus') || '中段参考帧用于查看镜头中段的信息密度与动作推进。',
      tone: 'accent',
      imageUrl: buildStoryboardSlicingAssetUrl(middlePath, outputDir),
    },
    {
      id: `${shot.base_name}-last`,
      label: '尾帧',
      timecode: shot.end_time,
      caption: readSliceSourceValue(sourceRow, 'tail_caption', 'adjustment') || '尾帧用于确认镜头收束、转场落点与可衔接性。',
      tone: 'success',
      imageUrl: buildStoryboardSlicingAssetUrl(shot.last_frame_path, outputDir),
    },
  ];
};

const mapSliceArtifactToPreviewShots = (sliceArtifact?: BenchmarkSliceArtifact): MockSliceShot[] => {
  const manifestShots = sliceArtifact?.manifest?.shots || [];
  return manifestShots
    .filter((shot) => shot.status !== 'failed' || shot.first_frame_path || shot.last_frame_path)
    .map((shot, index) => {
      const sourceRow = shot.source_row;
      const indexLabel = String(shot.shot_number || index + 1).padStart(2, '0');
      const durationSeconds = typeof shot.duration_seconds === 'number' && Number.isFinite(shot.duration_seconds) ? shot.duration_seconds : 0;
      const title = readSliceSourceValue(sourceRow, 'title') || `镜头 ${indexLabel}`;
      const beatSummary = readSliceSourceValue(sourceRow, 'summary', 'beat_summary', 'notes', 'desc') || '当前镜头已完成拆片，可继续检查三帧和节奏落点。';

      return {
        id: shot.base_name || `slice-shot-${indexLabel}`,
        indexLabel,
        startSecond: parseSliceTimecodeToSeconds(shot.start_time) ?? index * 3,
        endSecond: parseSliceTimecodeToSeconds(shot.end_time) ?? ((index + 1) * 3),
        durationSeconds,
        title,
        timeRange: `${shot.start_time} - ${shot.end_time}`,
        durationLabel: formatSliceDurationLabel(durationSeconds),
        beatSummary,
        transition: readSliceSourceValue(sourceRow, 'transition', 'transition_mode') || shot.status,
        cameraLanguage: readSliceSourceValue(sourceRow, 'camera_language', 'camera_movement', 'camera') || '-',
        emotionAnchor: readSliceSourceValue(sourceRow, 'emotion_anchor', 'emotion') || '-',
        soundDesign: readSliceSourceValue(sourceRow, 'sound_design', 'sound') || '-',
        promptFocus: readSliceSourceValue(sourceRow, 'prompt_focus', 'props_vfx', 'visual_focus') || '-',
        frames: buildSlicePreviewFrames(shot, sourceRow, sliceArtifact?.outputDir),
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
    transition: template.transition,
    cameraLanguage: template.cameraLanguage,
    emotionAnchor: template.emotionAnchor,
    soundDesign: template.soundDesign,
    promptFocus: template.promptFocus,
    frames: template.frames.map((frame, frameIndex) => ({
      id: `${shotId}-frame-${padMockSliceNumber(frameIndex + 1)}`,
      label: frame.label,
      timecode: formatMockSliceTimecode(startSecond + Math.min(template.durationSeconds, Math.max(0, frame.timeOffsetSeconds))),
      caption: frame.caption,
      tone: frame.tone,
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

const Dashboard: React.FC<Props> = ({ onOpenProject, onShowModelConfig }) => {
  const { showAlert } = useAlert();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SeriesProject[]>([]);
  const [homeSection, setHomeSection] = useState<'projects' | 'analysis'>('projects');
  const [analysisSubView, setAnalysisSubView] = useState<'benchmark' | 'overview'>('benchmark');
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

  // Video Deconstruct State
  const [videoLink, setVideoLink] = useState('');
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [benchmarkList, setBenchmarkList] = useState<BenchmarkVideo[]>([]);
  const [currentBenchmarkId, setCurrentBenchmarkId] = useState<string | null>(null);
  const [isEditingBenchmarkBreakdown, setIsEditingBenchmarkBreakdown] = useState(false);
  const [isBenchmarkBreakdownExpanded, setIsBenchmarkBreakdownExpanded] = useState(false);
  const [benchmarkBreakdownDraft, setBenchmarkBreakdownDraft] = useState('');
  const [isSavingBenchmarkBreakdown, setIsSavingBenchmarkBreakdown] = useState(false);
  const [selectedSliceShotId, setSelectedSliceShotId] = useState(DEFAULT_MOCK_SLICE_SHOT_ID);
  const [sliceFrameViewer, setSliceFrameViewer] = useState<SliceFrameViewerState | null>(null);
  const [activeBenchmarkDownloadArtifacts, setActiveBenchmarkDownloadArtifacts] = useState<Record<string, BenchmarkDownloadArtifact>>({});

  const loadBenchmarks = async () => {
    try {
      const list = await getAllBenchmarkVideos();
      setBenchmarkList(list);
    } catch (e) {
      console.error('Failed to load benchmarks', e);
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
  const isBenchmarkBreakdownEditable = !!currentBenchmark && currentBenchmark.status !== 'analyzing';
  const availableSlicingShots = currentBenchmark ? buildBenchmarkSlicingShots(currentBenchmark) : [];
  const currentSliceShots = currentBenchmark?.sliceArtifact?.manifest?.shots?.length
    ? mapSliceArtifactToPreviewShots(currentBenchmark.sliceArtifact)
    : MOCK_SLICE_SHOTS;
  const selectedSliceShot = currentSliceShots.find((shot) => shot.id === selectedSliceShotId) || currentSliceShots[0] || null;
  const isUsingRealSliceData = !!currentBenchmark?.sliceArtifact?.manifest?.shots?.length;
  const currentSliceArtifact = currentBenchmark?.sliceArtifact;
  const isSliceRunning = currentSliceArtifact?.status === 'running';
  const canRunSlicing = !!currentBenchmark && currentBenchmark.status === 'completed' && !!currentDownloadArtifact?.localPath && availableSlicingShots.length > 0 && !isSliceRunning;
  const sliceCoverageSeconds = currentSliceShots.length > 0
    ? currentSliceShots[currentSliceShots.length - 1].endSecond - currentSliceShots[0].startSecond
    : 0;
  const sliceCoverageLabel = formatMockSliceTimestamp(sliceCoverageSeconds);
  const sliceFrameCount = currentSliceShots.reduce((total, shot) => total + shot.frames.length, 0);

  useEffect(() => {
    setIsEditingBenchmarkBreakdown(false);
    setIsBenchmarkBreakdownExpanded(false);
    setIsSavingBenchmarkBreakdown(false);
    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
  }, [currentBenchmarkId, currentBenchmark?.lastModified, benchmarkBreakdownDisplayText]);

  useEffect(() => {
    setSelectedSliceShotId('');
  }, [currentBenchmarkId]);

  useEffect(() => {
    if (!selectedSliceShotId && currentSliceShots[0]?.id) {
      setSelectedSliceShotId(currentSliceShots[0].id);
      return;
    }
    if (selectedSliceShotId && !currentSliceShots.some((shot) => shot.id === selectedSliceShotId)) {
      setSelectedSliceShotId(currentSliceShots[0]?.id || '');
    }
  }, [currentSliceShots, selectedSliceShotId]);

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

  const handleOpenSliceFrameViewer = (frame: MockSliceFrame, shot: MockSliceShot) => {
    if (!frame.imageUrl) {
      return;
    }

    setSliceFrameViewer({
      imageUrl: frame.imageUrl,
      shotTitle: shot.title,
      frameLabel: frame.label,
      timecode: frame.timecode,
    });
  };

  const handleCloseSliceFrameViewer = () => {
    setSliceFrameViewer(null);
  };

  const handleStartEditBenchmarkBreakdown = () => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
    setIsBenchmarkBreakdownExpanded(true);
    setIsEditingBenchmarkBreakdown(true);
  };

  const handleCancelEditBenchmarkBreakdown = () => {
    setBenchmarkBreakdownDraft(benchmarkBreakdownDisplayText);
    setIsEditingBenchmarkBreakdown(false);
    setIsBenchmarkBreakdownExpanded(false);
  };

  const handleSaveBenchmarkBreakdown = async () => {
    if (!currentBenchmark || currentBenchmark.status === 'analyzing') {
      return;
    }

    const nextBreakdownReport = benchmarkBreakdownDraft.trim() || undefined;
    const benchmarkId = currentBenchmark.id;

    setIsSavingBenchmarkBreakdown(true);
    try {
      await saveBenchmarkVideo({
        ...currentBenchmark,
        breakdownReport: nextBreakdownReport,
      });
      await loadBenchmarks();
      setCurrentBenchmarkId(benchmarkId);
      setIsEditingBenchmarkBreakdown(false);
      setIsBenchmarkBreakdownExpanded(false);
      showAlert('视频拆解方案已保存', { type: 'success' });
    } catch (error) {
      showAlert(`保存拆解方案失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
      setIsSavingBenchmarkBreakdown(false);
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
          middleFrames: 1,
          enableSceneDetect: false,
        },
      },
    };

    try {
      await saveBenchmarkVideo(runningBenchmark);
      await loadBenchmarks();
      setCurrentBenchmarkId(currentBenchmark.id);

      const completedSliceArtifact = await runBenchmarkSlicing(currentBenchmark, {
        middleFrames: 1,
        enableSceneDetect: false,
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

  const openAnalysisView = (view?: 'benchmark' | 'overview') => {
    setHomeSection('analysis');
    if (view) {
      setAnalysisSubView(view);
    }
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
                    {homeSection === 'projects' ? '项目库' : '数据分析'}
                    <span className="text-[var(--text-muted)] text-lg">/</span>
                    <span className="text-[var(--text-muted)] text-sm font-mono tracking-widest uppercase">{homeSection === 'projects' ? 'Projects Database' : analysisSubView === 'benchmark' ? 'Benchmark Analysis' : 'Analysis Overview'}</span>
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
                                onClick={() => { setCurrentBenchmarkId(null); setVideoLink(''); }}
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
                                      onClick={() => setCurrentBenchmarkId(item.id)}
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

                              {currentSliceArtifact?.status === 'completed' && (
                                <div className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-xs leading-6 text-[var(--success-text)]">
                                  已生成真实拆片结果：{currentSliceArtifact.manifest?.summary?.ok_rows ?? currentSliceArtifact.manifest?.shots?.length ?? 0} 条镜头可预览。
                                  {currentSliceArtifact.outputDir ? <span className="ml-2 font-mono break-all">{currentSliceArtifact.outputDir}</span> : null}
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
                                    展示当前记录生成的长文本报告；旧记录会基于已保存的分析结果做保守回填。
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
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveBenchmarkBreakdown}
                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                      className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isSavingBenchmarkBreakdown ? '保存中...' : '保存'}
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
                                    <textarea
                                      value={benchmarkBreakdownDraft}
                                      onChange={(e) => setBenchmarkBreakdownDraft(e.target.value)}
                                      disabled={!isBenchmarkBreakdownEditable || isSavingBenchmarkBreakdown}
                                      className="min-h-[360px] max-h-[720px] w-full resize-y rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                  ) : (
                                    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-7 text-[var(--text-tertiary)]">
                                      {benchmarkBreakdownDisplayText}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {currentBenchmarkId && currentBenchmark && selectedSliceShot && (
                            <div className="mt-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6 space-y-5">
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[420px]">
                                  {[
                                    { label: isUsingRealSliceData ? '真实镜头' : 'Mock 镜头', value: `${currentSliceShots.length} 条` },
                                    { label: '关键帧卡', value: `${sliceFrameCount} 张` },
                                    { label: '覆盖时长', value: sliceCoverageLabel },
                                    { label: '当前选择', value: `镜头 ${selectedSliceShot.indexLabel}` },
                                  ].map((item) => (
                                    <div key={item.label} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-3">
                                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">{item.label}</div>
                                      <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{item.value}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] xl:items-start">
                                <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)]/40 p-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                    <div>
                                      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">镜头矩阵</div>
                                      <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">平铺浏览全部切片镜头，直接挑选想要精修的段落</div>
                                    </div>
                                    <div className="text-[11px] text-[var(--text-tertiary)] xl:max-w-xs">
                                      {isUsingRealSliceData ? '当前列表来自真实切片 manifest；选中后，右侧会固定显示首中尾三帧、节奏摘要和元数据。' : '所有 mock 镜头默认平铺展示；选中后，右侧检视器会持续显示三帧占位、节奏注解和演化动作入口。'}
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                                    {currentSliceShots.map((shot) => {
                                      const isActive = shot.id === selectedSliceShot.id;
                                      return (
                                        <button
                                          key={shot.id}
                                          type="button"
                                          aria-pressed={isActive}
                                          onClick={() => setSelectedSliceShotId(shot.id)}
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
                                          <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{shot.timeRange}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="self-start xl:sticky xl:top-6">
                                  <div className="space-y-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)]/40 p-4 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
                                    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-4">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                        <div>
                                          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">选中镜头详情</div>
                                          <div className="mt-2 text-base font-semibold text-[var(--text-primary)]">镜头 {selectedSliceShot.indexLabel} · {selectedSliceShot.title}</div>
                                          <div className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">{selectedSliceShot.beatSummary}</div>
                                        </div>
                                        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{selectedSliceShot.timeRange}</div>
                                      </div>
                                      <p className="text-[11px] leading-5 text-[var(--text-muted)]">
                                        浏览左侧镜头矩阵时，当前镜头的三帧摘要、元数据和后续操作会固定保留在右侧，方便持续对照。
                                      </p>
                                    </div>

                                    <div className="space-y-3">
                                      {selectedSliceShot.frames.map((frame) => {
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
                                                onClick={() => handleOpenSliceFrameViewer(frame, selectedSliceShot)}
                                                className="group relative block w-full aspect-video overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-2 text-left transition-colors hover:border-[var(--border-secondary)]"
                                                aria-label={`查看${selectedSliceShot.title}${frame.label}大图`}
                                              >
                                                <img src={frame.imageUrl} alt={`${selectedSliceShot.title} ${frame.label}`} className="h-full w-full rounded-lg object-contain" />
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
                                              <div className="mt-2 text-[10px] leading-5 text-[var(--text-muted)]">用于预览该镜头在首帧 / 中段 / 尾帧上的信息密度和构图落点。</div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">镜头元数据</div>
                                      <div className="mt-4 space-y-3">
                                        {[
                                          { label: '镜头时长', value: selectedSliceShot.durationLabel },
                                          { label: '转场方式', value: selectedSliceShot.transition },
                                          { label: '运镜语言', value: selectedSliceShot.cameraLanguage },
                                          { label: '情绪落点', value: selectedSliceShot.emotionAnchor },
                                          { label: '声音设计', value: selectedSliceShot.soundDesign },
                                          { label: '提示词聚焦', value: selectedSliceShot.promptFocus },
                                        ].map((item) => (
                                          <div key={item.label} className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
                                            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.label}</div>
                                            <div className="mt-1 text-[11px] leading-5 text-[var(--text-primary)]">{item.value}</div>
                                          </div>
                                        ))}
                                      </div>
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
