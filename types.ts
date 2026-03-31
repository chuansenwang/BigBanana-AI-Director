export interface CharacterVariation {
  id: string;
  name: string; // e.g., "Casual", "Tactical Gear", "Injured"
  visualPrompt: string;
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  referenceImage?: string; // 角色变体参考图，存储为base64格式（data:image/png;base64,...）
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
}

export type PromptVersionSource = 'ai-generated' | 'manual-edit' | 'rollback' | 'imported' | 'system';

export interface PromptVersion {
  id: string;
  prompt: string;
  createdAt: number;
  source: PromptVersionSource;
  note?: string;
}

/**
 * 分镜阶段提示词模板配置（可编辑）
 */
export interface StoryboardPromptTemplateConfig {
  shotGeneration: string;
  shotRepair: string;
  actionSuggestion: string;
  shotSplit: string;
}

/**
 * 首尾帧提示词模板配置（可编辑）
 */
export interface KeyframePromptTemplateConfig {
  startFrameGuide: string;
  endFrameGuide: string;
  characterConsistencyGuide: string;
  propWithImageGuide: string;
  propWithoutImageGuide: string;
  nineGridSourceMeta: string;
  optimizeBoth: string;
  optimizeSingle: string;
  enhance: string;
}

/**
 * 网格分镜提示词模板配置（可编辑）
 */
export interface NineGridPromptTemplateConfig {
  splitSystem: string;
  splitUser: string;
  imagePrefix: string;
  imagePanelTemplate: string;
  imageSuffix: string;
  imageNoTextConstraint: string;
  translatePrompt: string;
  rewritePrompt: string;
}

/**
 * 视频生成提示词模板配置（可编辑）
 */
export interface VideoPromptTemplateConfig {
  sora2Chinese: string;
  sora2English: string;
  sora2NineGridChinese: string;
  sora2NineGridEnglish: string;
  veoStartOnly: string;
  veoStartEnd: string;
  nineGridGuardrailsChinese: string;
  nineGridGuardrailsEnglish: string;
  endFrameConstraintNote: string;
  ignoredEndFrameNote: string;
}

/**
 * 当前项目可编辑的提示词模板集合
 */
export interface PromptTemplateConfig {
  storyboard: StoryboardPromptTemplateConfig;
  keyframe: KeyframePromptTemplateConfig;
  nineGrid: NineGridPromptTemplateConfig;
  video: VideoPromptTemplateConfig;
}

/**
 * 模板覆盖配置（仅存储用户改动）
 */
export interface PromptTemplateOverrides {
  storyboard?: Partial<StoryboardPromptTemplateConfig>;
  keyframe?: Partial<KeyframePromptTemplateConfig>;
  nineGrid?: Partial<NineGridPromptTemplateConfig>;
  video?: Partial<VideoPromptTemplateConfig>;
}

export interface QualityCheck {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number; // Weight percentage in total score
  passed: boolean;
  details?: string;
}

export interface ShotQualityAssessment {
  version: number; // Quality scoring schema version
  score: number; // 0-100
  grade: 'pass' | 'warning' | 'fail';
  generatedAt: number;
  checks: QualityCheck[];
  summary: string;
}

/**
 * 角色九宫格造型设计 - 单个视角面板数据
 * 用于多视角展示角色外观，提升镜头图生成时的角色一致性
 */
export interface CharacterTurnaroundPanel {
  index: number;           // 0-8, 九宫格位置索引
  viewAngle: string;       // 视角：正面/左侧面/右侧面/背面/3/4左侧/3/4右侧/俯视/仰视 等
  shotSize: string;        // 景别：全身/半身/特写 等
  description: string;     // 该格子的视觉描述
}

/**
 * 角色九宫格造型设计数据
 * 提供角色的多视角参考图，用于在分镜生成时按镜头角度匹配最佳参考
 */
export interface CharacterTurnaroundData {
  panels: CharacterTurnaroundPanel[];  // 9个格子的描述数据
  imageUrl?: string;                    // 生成的九宫格整图 (base64)，直接作为多视角参考图使用
  prompt?: string;                      // 生成时使用的完整提示词
  status: 'pending' | 'generating_panels' | 'panels_ready' | 'generating_image' | 'completed' | 'failed';
  // generating_panels: AI正在生成9个视角描述
  // panels_ready: 视角描述已生成，等待用户确认/编辑后再生成图片
  // generating_image: 用户已确认，正在生成九宫格图片
}

export interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  personality: string;
  visualPrompt?: string;
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  negativePrompt?: string;
  coreFeatures?: string;
  shapeReferenceImage?: string; // Optional reference image used only for shape/silhouette guidance during generation
  referenceImage?: string;
  turnaround?: CharacterTurnaroundData;
  variations: CharacterVariation[];
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  libraryId?: string;
  libraryVersion?: number;
  version?: number;
}

export interface Scene {
  id: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  shapeReferenceImage?: string; // Optional reference image used only for shape/silhouette guidance during generation
  referenceImage?: string; // 场景参考图，存储为base64格式（data:image/png;base64,...）
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
  libraryId?: string;
  libraryVersion?: number;
  version?: number;
}

/**
 * 道具/物品 - 用于保持多分镜间物品视觉一致性
 * 如星图、武器、地图、信件等需要在多个镜头中重复出现的物品
 */
export interface Prop {
  id: string;
  name: string;           // 道具名称，如"星图"、"古剑"
  category: string;       // 分类：武器、文件/书信、食物/饮品、交通工具、装饰品、科技设备、其他
  description: string;    // 道具描述
  visualPrompt?: string;  // 视觉提示词
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  negativePrompt?: string; // 负面提示词，用于排除不想要的元素
  shapeReferenceImage?: string; // Optional reference image used only for shape/silhouette guidance during generation
  referenceImage?: string; // 道具参考图，存储为base64格式（data:image/png;base64,...）
  status?: 'pending' | 'generating' | 'completed' | 'failed'; // 生成状态，用于loading状态持久化
  libraryId?: string;
  libraryVersion?: number;
  version?: number;
}

export type AssetLibraryItemType = 'character' | 'scene' | 'prop';

export interface AssetLibraryItem {
  id: string;
  type: AssetLibraryItemType;
  name: string;
  projectId?: string;
  projectName?: string;
  createdAt: number;
  updatedAt: number;
  data: Character | Scene | Prop;
}

export interface Keyframe {
  id: string;
  type: 'start' | 'end';
  visualPrompt: string;
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  imageUrl?: string; // 关键帧图像，存储为base64格式（data:image/png;base64,...）
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;
  motionStrength: number;
  videoUrl?: string; // 视频数据，存储为base64格式（data:video/mp4;base64,...），避免URL过期问题
  videoPrompt?: string; // 视频生成时使用的提示词
  promptVersions?: PromptVersion[]; // Prompt edit history with rollback support
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

/**
 * 分镜网格面板数量（导演工作台）
 */
export type StoryboardGridPanelCount = 4 | 6 | 9;

/**
 * 分镜网格布局元信息
 */
export interface StoryboardGridLayoutMeta {
  panelCount: StoryboardGridPanelCount;
  rows: number;
  cols: number;
}

/**
 * 九宫格分镜预览 - 单个面板数据
 */
export interface NineGridPanel {
  index: number;           // 0-(panelCount-1), 网格位置索引
  shotSize: string;        // 景别：特写/近景/中景/全景/远景 等
  cameraAngle: string;     // 机位角度：俯拍/仰拍/平视/斜拍 等
  description: string;     // 该格子的视觉描述
  descriptionZh?: string;  // 英文描述的中文展示翻译（可选）
}

/**
 * 九宫格分镜预览数据
 */
export interface NineGridData {
  panels: NineGridPanel[];  // 网格格子的描述数据
  layout?: StoryboardGridLayoutMeta; // 当前网格布局（4/6/9）
  imageUrl?: string;        // 生成的网格图片 (base64)
  prompt?: string;          // 生成时使用的完整提示词
  status: 'pending' | 'generating_panels' | 'panels_ready' | 'generating_image' | 'completed' | 'failed';
  // generating_panels: AI正在生成网格镜头描述
  // panels_ready: 镜头描述已生成，等待用户确认/编辑后再生成图片
  // generating_image: 用户已确认，正在生成网格图片
}

export type DubbingMode = 'narration' | 'dialogue';
export type DubbingStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type DubbingOutputFormat = 'wav' | 'mp3';

export interface ShotDubbing {
  mode: DubbingMode;
  text: string;
  modelId: string;
  voice?: string;
  outputFormat?: DubbingOutputFormat;
  audioUrl?: string; // base64 data url
  transcript?: string;
  status: DubbingStatus;
  error?: string;
  generatedAt?: number;
}

export interface Shot {
  id: string;
  sceneId: string;
  actionSummary: string;
  dialogue?: string; 
  cameraMovement: string;
  shotSize?: string; 
  characters: string[]; // Character IDs
  characterVariations?: { [characterId: string]: string }; // Added: Map char ID to variation ID for this shot
  props?: string[]; // 道具ID数组，引用 ScriptData.props 中的道具
  keyframes: Keyframe[];
  interval?: VideoInterval;
  qualityAssessment?: ShotQualityAssessment;
  videoModel?: 'veo' | 'sora-2' | 'veo_3_1-fast' | 'veo_3_1-fast-4K' | 'veo_3_1_t2v_fast_landscape' | 'veo_3_1_t2v_fast_portrait' | 'veo_3_1_i2v_s_fast_fl_landscape' | 'veo_3_1_i2v_s_fast_fl_portrait' | 'doubao-seedance-1-5-pro' | 'doubao-seedance-1-5-pro-251215' | 'doubao-seedance-2-0-260128'; // Video generation model selection
  videoInputMode?: 'keyframes' | 'storyboard-grid'; // 视频驱动方式：首尾帧 / 网格分镜（互斥）
  nineGrid?: NineGridData; // 可选的九宫格分镜预览数据（高级功能）
  dubbing?: ShotDubbing; // 镜头配音（旁白/对话）
}

/**
 * 全局美术指导文档 - 用于统一所有角色和场景的视觉风格
 * 在生成任何角色/场景提示词之前，先由 AI 根据剧本内容生成此文档，
 * 后续所有视觉提示词生成都以此为约束，确保风格一致性。
 */
export interface ArtDirection {
  /** 全局色彩方案 */
  colorPalette: {
    primary: string;      // 主色调描述
    secondary: string;    // 辅色调
    accent: string;       // 点缀色
    skinTones: string;    // 肤色范围描述
    saturation: string;   // 整体饱和度倾向
    temperature: string;  // 整体色温倾向
  };
  /** 角色设计统一规则 */
  characterDesignRules: {
    proportions: string;   // 头身比、体型风格
    eyeStyle: string;      // 眼睛画法统一
    lineWeight: string;    // 线条粗细风格
    detailLevel: string;   // 细节密度级别
  };
  /** 统一光影处理方式 */
  lightingStyle: string;
  /** 材质/质感风格 */
  textureStyle: string;
  /** 3-5个核心风格关键词 */
  moodKeywords: string[];
  /** 一段统一风格的文字锚点描述，所有提示词生成时注入 */
  consistencyAnchors: string;
}

export interface ScriptData {
  title: string;
  genre: string;
  logline: string;
  targetDuration?: string;
  language?: string;
  visualStyle?: string; // Visual style: live-action, anime, 3d-animation, etc.
  shotGenerationModel?: string; // Model used for shot generation
  planningShotDuration?: number; // Locked shot duration baseline (seconds) used for shot count planning
  artDirection?: ArtDirection; // 全局美术指导文档，用于统一角色和场景的视觉风格
  characters: Character[];
  scenes: Scene[];
  props: Prop[]; // 道具列表，用于保持多分镜间物品视觉一致性
  storyParagraphs: { id: number; text: string; sceneRefId: string }[];
  generationMeta?: {
    // Fingerprint of raw script + language (structure extraction inputs).
    structureKey?: string;
    // Fingerprint of structure + style/model/language (visual enrichment inputs).
    visualsKey?: string;
    // Fingerprint of visualized script + duration/model (shot generation inputs).
    shotsKey?: string;
    generatedAt?: number;
  };
}

export interface LongScriptChunkPlan {
  chunkId: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  text: string;
  estimatedDurationSeconds: number;
  estimatedShotCount: number;
  paragraphCount: number;
}

export interface LongScriptChunkResult {
  plan: LongScriptChunkPlan;
  scriptData: ScriptData;
  shots: Shot[];
  characterIdMap: Record<string, string>;
  sceneIdMap: Record<string, string>;
  propIdMap: Record<string, string>;
}

export interface RenderLog {
  id: string;
  timestamp: number; // Unix timestamp when API was called
  type: 'character' | 'character-variation' | 'scene' | 'prop' | 'keyframe' | 'video' | 'script-parsing';
  resourceId: string; // ID of the resource being generated
  resourceName: string; // Human-readable name
  status: 'success' | 'failed';
  model: string; // Model used (e.g., 'imagen-3', 'veo_3_1_i2v_s_fast_fl_landscape', 'gpt-5.4')
  prompt?: string; // The prompt used (optional, for debugging)
  error?: string; // Error message if failed
  inputTokens?: number; // Input tokens consumed
  outputTokens?: number; // Output tokens generated
  totalTokens?: number; // Total tokens (if available from API)
  duration?: number; // Time taken in milliseconds
}

export interface SeriesProject {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt: number;
  lastModified: number;
  visualStyle: string;
  language: string;
  artDirection?: ArtDirection;
  characterLibrary: Character[];
  sceneLibrary: Scene[];
  propLibrary: Prop[];
  viralTemplateLibrary?: ViralTemplateRecord[];
}

export interface Series {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  sortOrder: number;
  createdAt: number;
  lastModified: number;
}

export type AssetSyncStatus = 'synced' | 'outdated' | 'local-only';

export interface EpisodeCharacterRef {
  characterId: string;
  syncedVersion: number;
  syncStatus: AssetSyncStatus;
}

export interface EpisodeSceneRef {
  sceneId: string;
  syncedVersion: number;
  syncStatus: AssetSyncStatus;
}

export interface EpisodePropRef {
  propId: string;
  syncedVersion: number;
  syncStatus: AssetSyncStatus;
}

export type ScriptGenerationStep = 'structure' | 'visuals' | 'shots';

export type AnalysisInputKind = 'url' | 'upload' | 'benchmark';
export type AnalysisLineSource = 'subtitle' | 'ocr' | 'stt' | 'merged';
export type ViralSignalCategory = 'hook' | 'shot' | 'script' | 'rhythm' | 'emotion' | 'cta';

export interface VideoAnalysisSource {
  id: string;
  kind: AnalysisInputKind;
  title?: string;
  originalUrl?: string;
  persistedVideoRef?: string;
  mimeType?: string;
  fileName?: string;
  durationMs?: number;
  thumbnailUrl?: string;
  status: 'idle' | 'ingesting' | 'ready' | 'failed';
  error?: string;
}

export interface AnalysisShotSegment {
  id: string;
  startMs: number;
  endMs: number;
  title?: string;
  summary: string;
  scriptSnippet?: string;
  visualNotes?: string;
  viralElements: string[];
  confidence?: number;
}

export interface AnalysisTranscriptLine {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  source: AnalysisLineSource;
  speaker?: string;
}

export interface AnalysisTranscriptArtifact {
  language?: string;
  mergedScript: string;
  summary: string;
  lines: AnalysisTranscriptLine[];
}

export interface ViralScoreFactor {
  id: string;
  label: string;
  score: number;
  weight: number;
  explanation: string;
}

export interface ViralScoreCard {
  overall: number;
  rationale: string;
  version: string;
  factors: ViralScoreFactor[];
}

export interface ViralSignal {
  id: string;
  category: ViralSignalCategory;
  label: string;
  evidence: string;
  score?: number;
  shotId?: string;
  startMs?: number;
  endMs?: number;
}

export interface AnalysisReviewState {
  status: 'draft' | 'reviewed' | 'applied';
  userEdited: boolean;
  lastReviewedAt?: number;
  notes?: string;
  dirtyFields: string[];
}

export interface AnalysisDerivedDraftPayload {
  title: string;
  draftEpisodeId?: string;
  rawScript: string;
  summary?: string;
  mappedShotIds: string[];
  shotCount: number;
}

export interface AnalysisApplyHistoryEntry {
  id: string;
  createdAt: number;
  target: 'script' | 'director' | 'script+director';
  summary: string;
  draftEpisodeId?: string;
  draftEpisodeTitle?: string;
  templateIds: string[];
}

export interface VideoAnalysisRecord {
  source: VideoAnalysisSource | null;
  status: 'idle' | 'ready' | 'analyzing' | 'completed' | 'failed';
  createdAt?: number;
  updatedAt?: number;
  rawResponse?: string | null;
  shots: AnalysisShotSegment[];
  transcript: AnalysisTranscriptArtifact | null;
  viralSignals: ViralSignal[];
  score: ViralScoreCard | null;
  review: AnalysisReviewState;
  derivedDraft: AnalysisDerivedDraftPayload | null;
  templateCandidates: ViralTemplateRecord[];
  applyHistory: AnalysisApplyHistoryEntry[];
  benchmarkImport?: BenchmarkAnalysisImportMeta | null;
}

export interface BenchmarkAnalysisImportMeta {
  benchmarkId: string;
  importedAt: number;
  analysisMode?: BenchmarkAnalysisMode;
  transcriptStatus?: BenchmarkTranscriptStatus;
  analysisBasis?: string;
  warnings: string[];
  sourceMeta?: BenchmarkSourceMeta;
}

export interface LocalAnalysisRunOptions {
  enableSceneDetection?: boolean;
  language?: string;
  whisperModel?: string;
  maxDurationMs?: number;
}

export interface LocalAnalysisUserConfig {
  whisperBinaryPath: string;
  whisperModelPath: string;
  pythonBinaryPath: string;
  visionModel: string;
}

export interface ArtifactStorageUserConfig {
  rootFolder: string;
  downloadsFolder: string;
  slicesFolder: string;
  groupByProject: boolean;
  groupByEpisode: boolean;
}

export interface LocalAnalysisToolStatus {
  available: boolean;
  binaryPath?: string;
  modelPath?: string;
  command?: string;
  version?: string;
  warnings: string[];
}

export interface LocalAnalysisHealthData {
  whisper: LocalAnalysisToolStatus;
  sceneDetect: LocalAnalysisToolStatus;
  tempDir: string;
  platform: string;
  warnings: string[];
}

export interface LocalAnalysisToolRunMeta {
  used: boolean;
  model?: string;
  durationMs: number;
  stderrSummary?: string;
}

export interface LocalAnalysisTranscriptLine {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  source: 'stt';
}

export interface LocalAnalysisTranscriptData {
  language?: string;
  lines: LocalAnalysisTranscriptLine[];
  mergedText: string;
}

export interface LocalAnalysisSceneSegment {
  id: string;
  startMs: number;
  endMs: number;
}

export interface LocalAnalysisRawResponse {
  whisperStdout?: string;
  whisperStderr?: string;
  sceneDetectStdout?: string;
  sceneDetectStderr?: string;
}

export interface LocalAnalysisRunData {
  transcript: LocalAnalysisTranscriptData;
  sceneSegments: LocalAnalysisSceneSegment[];
  warnings: string[];
  toolMeta: {
    whisper: LocalAnalysisToolRunMeta;
    sceneDetect?: LocalAnalysisToolRunMeta;
  };
  rawResponse: LocalAnalysisRawResponse;
}

export interface LocalAnalysisHealthResponse {
  ok: boolean;
  data?: LocalAnalysisHealthData;
  error?: string;
}

export interface LocalAnalysisRunResponse {
  ok: boolean;
  data?: LocalAnalysisRunData;
  error?: string;
}

export interface LocalShotVisionAnalysis {
  shotId: string;
  title?: string;
  summary: string;
  visualNotes: string;
  viralElements: string[];
  confidence?: number;
  rawResponse?: string;
}

export interface LocalShotVisionBatchResult {
  analyses: LocalShotVisionAnalysis[];
  warnings: string[];
  model: string;
}

export type ViralTemplateType = 'video' | 'hook' | 'shot' | 'script' | 'rhythm' | 'emotion';

export interface ViralTemplateSourceTrace {
  projectId: string;
  episodeId: string;
  analysisSourceId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  shotId?: string;
  startMs?: number;
  endMs?: number;
}

export interface ViralTemplatePayload {
  summary: string;
  cues: string[];
  tags: string[];
}

export interface ViralTemplateRecord {
  id: string;
  type: ViralTemplateType;
  title: string;
  description: string;
  score?: number;
  createdAt: number;
  updatedAt: number;
  source: ViralTemplateSourceTrace;
  payload: ViralTemplatePayload;
}

export interface ScriptGenerationCheckpoint {
  // Next step to execute in the analyze pipeline.
  step: ScriptGenerationStep;
  // Hash of script/config inputs so stale checkpoints can be invalidated.
  configKey: string;
  // Latest successful intermediate result for resume.
  scriptData?: ScriptData | null;
  updatedAt: number;
}

export interface Episode {
  id: string;
  projectId: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  createdAt: number;
  lastModified: number;
  stage: 'script' | 'assets' | 'director' | 'export' | 'prompts' | 'analysis';
  rawScript: string;
  targetDuration: string;
  language: string;
  visualStyle: string;
  shotGenerationModel: string;
  scriptData: ScriptData | null;
  shots: Shot[];
  isParsingScript: boolean;
  renderLogs: RenderLog[];
  characterRefs: EpisodeCharacterRef[];
  sceneRefs: EpisodeSceneRef[];
  propRefs: EpisodePropRef[];
  analysisData?: VideoAnalysisRecord | null;
  promptTemplateOverrides?: PromptTemplateOverrides;
  scriptGenerationCheckpoint?: ScriptGenerationCheckpoint | null;
}

export type ProjectState = Episode;

// ============================================
// 模型管理相关类型定义
// ============================================

/**
 * 横竖屏比例类型
 * - 16:9: 横屏（默认）
 * - 9:16: 竖屏
 * - 1:1: 方形
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * 视频时长类型（仅异步视频模型支持）
 */
export type VideoDuration = 4 | 5 | 8 | 10 | 12 | 15;

/**
 * 模型提供商配置
 */
export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;  // API 基础 URL，如 'https://api.antsk.cn'
  apiKey?: string;  // 可选的独立 API Key（如果不设置则使用全局 API Key）
  isDefault?: boolean;  // 是否为默认提供商
  isBuiltIn?: boolean;  // 是否为内置提供商（不可删除）
}

/**
 * 对话模型配置
 */
export interface ChatModelConfig {
  providerId: string;
  modelName: string;  // 如 'gpt-5.1', 'gpt-5.2', 'gpt-5.4'
  endpoint?: string;  // API 端点，默认为 '/v1/chat/completions'
}

/**
 * 画图模型配置
 */
export interface ImageModelConfig {
  providerId: string;
  modelName: string;  // 如 'gemini-3-pro-image-preview'
  endpoint?: string;  // API 端点，默认为 '/v1beta/models/{modelName}:generateContent'
}

/**
 * 视频模型配置
 */
export interface VideoModelConfig {
  providerId: string;
  type: 'sora' | 'veo';  // sora 使用异步 API，veo 使用同步 API
  modelName: string;  // 基础模型名，如 'sora-2', 'veo_3_1-fast'
  endpoint?: string;  // API 端点
}

/**
 * 完整的模型配置
 */
export interface ModelConfig {
  chatModel: ChatModelConfig;
  imageModel: ImageModelConfig;
  videoModel: VideoModelConfig;
}

/**
 * 模型管理全局状态
 */
export interface ModelManagerState {
  providers: ModelProvider[];
  currentConfig: ModelConfig;
  defaultAspectRatio: AspectRatio;
  defaultVideoDuration: VideoDuration;
}

// ============================================
// 对标视频库相关类型定义
// ============================================

export interface BenchmarkShotResult {
  id: number;
  time: string;
  desc: string;
  videoClip?: string;
  videoPrompt?: string;
  firstFrame?: string;
  firstFramePrompt?: string;
  lastFrame?: string;
  lastFramePrompt?: string;
  adjustment?: string;
}

export interface BenchmarkMetrics {
  t0_playCount: string;
  t0_storyScript: string;
  t0_viralFactors: string;
  t0_homogenization: string;

  t1_first3sContent: string;
  t1_first3sVisuals: string;
  t1_duration: string;
  t1_shotCount: string;
  t1_shotDuration: string;
  t1_pacing: string;
  t1_mainSubject: string;
  t1_twistCount: string;

  t2_music: string;
  t2_soundEffects: string;
  t2_voiceOver: string;
  t2_artStyle: string;
  t2_visualBrightness: string;
  t2_motionMagnitude: string;
  t2_expressionLiveliness: string;
  t2_clarity: string;
  t2_interactionGuide: string;
  t2_errors: string;
  t2_demographics: string;
  t2_transitions: string;

  t3_subjectiveInterest: string;
  t3_publishTime: string;
  t3_customMetrics: string;
}

export type BenchmarkTranscriptStatus = 'available' | 'unavailable' | 'error';
export type BenchmarkAnalysisMode = 'full' | 'metadata';
export type BenchmarkFallbackReason = 'missing_api_key' | 'no_transcript' | 'ai_failed';

export interface BenchmarkSourceMeta {
  videoId: string;
  canonicalUrl: string;
  channelTitle?: string;
  channelId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  transcriptLanguage?: string;
}

export type BenchmarkDownloadStatus = 'pending' | 'downloading' | 'ready' | 'failed';

export interface BenchmarkDownloadArtifact {
  status: BenchmarkDownloadStatus;
  localPath?: string;
  fileName?: string;
  outputDirectory?: string;
  progressPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  errorMessage?: string;
  warnings?: string[];
}

export interface BenchmarkVideo {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  lastModified: number;
  status: 'draft' | 'analyzing' | 'completed' | 'failed';
  deconstructResult: BenchmarkShotResult[] | null;
  breakdownReport?: string;
  metrics?: BenchmarkMetrics;
  sourceMeta?: BenchmarkSourceMeta;
  transcriptStatus?: BenchmarkTranscriptStatus;
  analysisMode?: BenchmarkAnalysisMode;
  fallbackReason?: BenchmarkFallbackReason;
  analysisBasis?: string;
  warnings?: string[];
  errorMessage?: string;
  downloadArtifact?: BenchmarkDownloadArtifact;
}
