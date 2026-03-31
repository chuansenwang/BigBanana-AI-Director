import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, FileImage, FileText, Film, Loader2, MessageSquare, Paperclip, Send, Settings2, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { BenchmarkVideo } from '../types';
import ModelSelector from './ModelSelector';
import { useAlert } from './GlobalAlert';
import {
  DashboardAnalysisChatAttachment,
  DashboardAnalysisChatMessage,
  getDashboardAnalysisChatDefaultModelId,
  getDashboardAnalysisChatSupportedModelIds,
  requestDashboardAnalysisChatStream,
  validateDashboardAnalysisChatModel,
} from '../services/dashboardAnalysisChatService';

interface DashboardAnalysisChatProps {
  benchmarks: BenchmarkVideo[];
  currentBenchmarkId: string | null;
  onSelectBenchmark: (benchmarkId: string | null) => void;
  onShowModelConfig?: () => void;
}

const TEXT_ATTACHMENT_EXTENSIONS = ['txt', 'md', 'json', 'csv'];
const IMAGE_ATTACHMENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const VIDEO_ATTACHMENT_EXTENSIONS = ['mp4', 'webm', 'mov'];
const SUPPORTED_ATTACHMENT_EXTENSIONS = [
  ...TEXT_ATTACHMENT_EXTENSIONS,
  ...IMAGE_ATTACHMENT_EXTENSIONS,
  ...VIDEO_ATTACHMENT_EXTENSIONS,
];
const SUPPORTED_ATTACHMENT_LABEL = '.txt · .md · .json · .csv · .png · .jpg · .jpeg · .webp · .gif · .mp4 · .webm · .mov';
const SUPPORTED_ATTACHMENT_ACCEPT = [
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
].join(',');

type DashboardAnalysisChatAttachmentKind = 'text' | 'image' | 'video';

type DashboardAnalysisChatUiAttachment = DashboardAnalysisChatAttachment & {
  kind: DashboardAnalysisChatAttachmentKind;
  previewUrl?: string;
  extension?: string;
};

const MAX_VIDEO_FRAME_WIDTH = 960;
const MAX_VIDEO_FRAME_SAMPLES = 3;

const createAttachmentId = (): string => {
  return `attachment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const getAttachmentExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toLowerCase() || '';
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const formatAttachmentKindLabel = (kind: DashboardAnalysisChatAttachmentKind): string => {
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  return 'Text';
};

const formatAttachmentTypeLabel = (attachment: Pick<DashboardAnalysisChatUiAttachment, 'extension' | 'mimeType'>): string => {
  if (attachment.extension) return attachment.extension.toUpperCase();
  if (attachment.mimeType === 'application/json') return 'JSON';
  if (attachment.mimeType === 'text/plain') return 'TXT';
  if (attachment.mimeType === 'text/markdown') return 'MD';
  if (attachment.mimeType === 'text/csv') return 'CSV';
  const mimeTail = attachment.mimeType?.split('/').pop();
  return mimeTail ? mimeTail.toUpperCase() : 'FILE';
};

const resolveAttachmentKind = (file: Pick<File, 'name' | 'type'>): DashboardAnalysisChatAttachmentKind | null => {
  const extension = getAttachmentExtension(file.name);
  const mimeType = file.type.toLowerCase();

  if (TEXT_ATTACHMENT_EXTENSIONS.includes(extension)) {
    return 'text';
  }

  if (
    IMAGE_ATTACHMENT_EXTENSIONS.includes(extension)
    || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)
  ) {
    return 'image';
  }

  if (
    VIDEO_ATTACHMENT_EXTENSIONS.includes(extension)
    || ['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)
  ) {
    return 'video';
  }

  return null;
};

const buildMediaAttachmentContent = (
  file: Pick<File, 'name' | 'size' | 'type'>,
  kind: 'image' | 'video',
  extension: string
): string => {
  return [
    `${kind === 'image' ? '图片' : '视频'}附件`,
    `文件名: ${file.name}`,
    `格式: ${formatAttachmentTypeLabel({ extension, mimeType: file.type || undefined })}`,
    `大小: ${formatFileSize(file.size)} (${file.size} bytes)`,
    `MIME: ${file.type || '未知'}`,
  ].join('\n');
};

const revokeAttachmentPreview = (attachment?: Pick<DashboardAnalysisChatUiAttachment, 'previewUrl'> | null) => {
  if (attachment?.previewUrl && attachment.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
};

const loadVideoForSampling = async (file: File): Promise<{ video: HTMLVideoElement; objectUrl: string }> => {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`读取视频元数据失败：${file.name}`));
    };
  });

  return { video, objectUrl };
};

const seekVideo = (video: HTMLVideoElement, targetSeconds: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.onseeked = null;
      video.onerror = null;
    };

    video.onseeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('视频抽帧 seek 失败。'));
    };

    video.currentTime = Math.max(0, Math.min(targetSeconds, Math.max(0, video.duration || 0)));
  });
};

const captureVideoFrame = async (video: HTMLVideoElement, timeMs: number): Promise<string> => {
  await seekVideo(video, timeMs / 1000);

  const scale = Math.min(1, MAX_VIDEO_FRAME_WIDTH / Math.max(1, video.videoWidth || MAX_VIDEO_FRAME_WIDTH));
  const width = Math.max(1, Math.round((video.videoWidth || MAX_VIDEO_FRAME_WIDTH) * scale));
  const height = Math.max(1, Math.round((video.videoHeight || Math.round(MAX_VIDEO_FRAME_WIDTH * 9 / 16)) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建视频抽帧画布。');
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
};

const buildVideoSampleTimes = (durationMs: number): number[] => {
  if (durationMs <= 0) return [0];
  if (durationMs < 1600) return [durationMs * 0.5];
  if (durationMs < 4500) return [durationMs * 0.2, durationMs * 0.75];
  return [durationMs * 0.12, durationMs * 0.5, durationMs * 0.86].slice(0, MAX_VIDEO_FRAME_SAMPLES);
};

const extractVideoAttachmentData = async (file: File) => {
  const { video, objectUrl } = await loadVideoForSampling(file);

  try {
    const durationMs = Math.max(0, Math.round((video.duration || 0) * 1000));
    const sampleTimes = buildVideoSampleTimes(durationMs);
    const videoFrames: NonNullable<DashboardAnalysisChatAttachment['videoFrames']> = [];

    for (const timeMs of sampleTimes) {
      const dataUrl = await captureVideoFrame(video, timeMs);
      videoFrames.push({
        id: `${createAttachmentId()}_frame_${videoFrames.length + 1}`,
        timeMs: Math.round(timeMs),
        dataUrl,
      });
    }

    return {
      previewUrl: videoFrames[0]?.dataUrl,
      videoDurationMs: durationMs,
      videoFrames,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const formatDuration = (durationMs?: number): string => {
  if (!durationMs || durationMs <= 0) return '0.0s';
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTranscriptStatus = (benchmark?: BenchmarkVideo | null): string => {
  if (!benchmark?.transcriptStatus) return '未知';
  if (benchmark.transcriptStatus === 'available') {
    return benchmark.sourceMeta?.transcriptLanguage ? `可用 · ${benchmark.sourceMeta.transcriptLanguage}` : '可用';
  }
  if (benchmark.transcriptStatus === 'error') return '获取失败';
  return '不可用';
};

const formatAnalysisMode = (benchmark?: BenchmarkVideo | null): string => {
  if (!benchmark?.analysisMode) return '未知';
  if (benchmark.analysisMode === 'metadata') {
    return benchmark.fallbackReason === 'missing_api_key' ? '降级分析' : '元数据分析';
  }
  return '完整分析';
};

const createMessage = (
  role: DashboardAnalysisChatMessage['role'],
  content: string
): DashboardAnalysisChatMessage => ({
  id: `dashboard_chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  createdAt: Date.now(),
});

const DashboardAnalysisChat: React.FC<DashboardAnalysisChatProps> = ({
  benchmarks,
  currentBenchmarkId,
  onSelectBenchmark,
  onShowModelConfig,
}) => {
  const { showAlert } = useAlert();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const attachmentsRef = useRef<DashboardAnalysisChatUiAttachment[]>([]);

  const defaultModelId = getDashboardAnalysisChatDefaultModelId();
  const supportedModelIds = getDashboardAnalysisChatSupportedModelIds();
  const [selectedModelId, setSelectedModelId] = useState(() => getDashboardAnalysisChatDefaultModelId());
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokensInput, setMaxTokensInput] = useState('');
  const [messages, setMessages] = useState<DashboardAnalysisChatMessage[]>([]);
  const [attachments, setAttachments] = useState<DashboardAnalysisChatUiAttachment[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  const currentBenchmark = useMemo(
    () => benchmarks.find((item) => item.id === currentBenchmarkId) || null,
    [benchmarks, currentBenchmarkId]
  );
  const modelValidation = useMemo(() => validateDashboardAnalysisChatModel(selectedModelId), [selectedModelId]);
  const canShowModelConfigAction = Boolean(
    onShowModelConfig
    && (
      !modelValidation.supported
      || (error && /api key|provider|提供商|模型配置|chat 模型|对话模型/i.test(error))
    )
  );

  useEffect(() => {
    if (!selectedModelId && defaultModelId) {
      setSelectedModelId(defaultModelId);
    }
  }, [defaultModelId, selectedModelId]);

  useEffect(() => {
    if (!modelValidation.model) return;
    setTemperature(modelValidation.model.params.temperature);
    setMaxTokensInput(modelValidation.model.params.maxTokens ? String(modelValidation.model.params.maxTokens) : '');
  }, [selectedModelId, modelValidation.model]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => revokeAttachmentPreview(attachment));
    };
  }, []);

  const handleAttachFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(event.target.files || []);
    event.target.value = '';

    if (!files.length) return;

    const accepted: DashboardAnalysisChatUiAttachment[] = [];
    const rejected: string[] = [];
    const failed: string[] = [];

    for (const file of files) {
      const extension = getAttachmentExtension(file.name);
      const kind = resolveAttachmentKind(file);

      if (!kind || (extension && !SUPPORTED_ATTACHMENT_EXTENSIONS.includes(extension))) {
        rejected.push(file.name);
        continue;
      }

      try {
        if (kind === 'text') {
          accepted.push({
            id: createAttachmentId(),
            name: file.name,
            content: await file.text(),
            size: file.size,
            mimeType: file.type || undefined,
            kind,
            extension,
          });
          continue;
        }

        if (kind === 'image') {
          const dataUrl = await readFileAsDataUrl(file);
          accepted.push({
            id: createAttachmentId(),
            name: file.name,
            content: buildMediaAttachmentContent(file, kind, extension),
            size: file.size,
            mimeType: file.type || undefined,
            kind,
            previewUrl: dataUrl,
            extension,
            imageDataUrl: dataUrl,
          });
          continue;
        }

        const videoData = await extractVideoAttachmentData(file);
        accepted.push({
          id: createAttachmentId(),
          name: file.name,
          content: `${buildMediaAttachmentContent(file, kind, extension)}\n抽帧数: ${videoData.videoFrames.length}`,
          size: file.size,
          mimeType: file.type || undefined,
          kind,
          previewUrl: videoData.previewUrl,
          extension,
          videoDurationMs: videoData.videoDurationMs,
          videoFrames: videoData.videoFrames,
        });
      } catch (attachmentError) {
        failed.push(`${file.name}${attachmentError instanceof Error ? `（${attachmentError.message}）` : ''}`);
      }
    }

    if (accepted.length > 0) {
      setAttachments((previous) => [...previous, ...accepted]);
      if (rejected.length === 0) {
        setError(null);
      }
    }

    if (rejected.length > 0) {
      const message = `仅支持文本、图片、视频附件：.txt、.md、.json、.csv、.png、.jpg、.jpeg、.webp、.gif、.mp4、.webm、.mov。已忽略：${rejected.join('、')}`;
      setError(message);
      showAlert(message, { type: 'warning' });
    }

    if (failed.length > 0) {
      const message = `以下附件处理失败：${failed.join('、')}`;
      setError(message);
      showAlert(message, { type: 'warning' });
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((previous) => {
      const target = previous.find((item) => item.id === attachmentId);
      revokeAttachmentPreview(target);
      return previous.filter((item) => item.id !== attachmentId);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt) {
      setError('请输入要发送的问题。');
      return;
    }

    if (!modelValidation.supported || !modelValidation.model) {
      setError(modelValidation.reason || '当前模型不支持分析助手对话。');
      return;
    }

    const trimmedMaxTokens = maxTokensInput.trim();
    const parsedMaxTokens = trimmedMaxTokens ? Number(trimmedMaxTokens) : undefined;
    if (trimmedMaxTokens && (!Number.isFinite(parsedMaxTokens) || Number(parsedMaxTokens) <= 0)) {
      setError('maxTokens 必须是大于 0 的数字，或留空使用模型默认值。');
      return;
    }

    const nextUserMessage = createMessage('user', prompt);
    const nextAssistantMessage = createMessage('assistant', '');
    const controller = new AbortController();

    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    setMessages((previous) => [...previous, nextUserMessage, nextAssistantMessage]);
    setDraft('');
    setIsSending(true);
    setStreamingMessageId(nextAssistantMessage.id);
    setError(null);

    try {
      const result = await requestDashboardAnalysisChatStream({
        benchmark: currentBenchmark,
        attachments,
        history: messages,
        prompt,
        modelId: modelValidation.model.id,
        temperature,
        maxTokens: parsedMaxTokens,
        abortSignal: controller.signal,
        onDelta: (delta) => {
          if (!delta) return;
          setMessages((previous) => previous.map((message) => (
            message.id === nextAssistantMessage.id
              ? { ...message, content: message.content + delta }
              : message
          )));
        },
      });

      setMessages((previous) => previous.map((message) => (
        message.id === nextAssistantMessage.id
          ? { ...message, content: result.content }
          : message
      )));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '分析助手请求失败，请稍后重试。';
      setMessages((previous) => previous.filter((entry) => (
        entry.id !== nextAssistantMessage.id || entry.content.trim().length > 0
      )));
      if (message !== 'Request cancelled') {
        setError(message);
      }
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
      setStreamingMessageId(null);
    }
  };

  const handleCancelStreaming = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className="space-y-6">
      <section className="flex min-h-[720px] flex-col overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-base)]">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 px-5 py-4 backdrop-blur-sm md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                <MessageSquare className="h-3.5 w-3.5" />
                Analysis Assistant
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-wide text-[var(--text-primary)] md:text-2xl">首页分析助手</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">
                  以聊天为主工作区，长对话时模型、上下文和附件仍然停留在输入区附近，方便持续切换与追问。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{messages.length} Messages</span>
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{attachments.length} Attachments</span>
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{currentBenchmark ? 'Benchmark Bound' : 'No Benchmark'}</span>
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Session Only</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              disabled={isSending || messages.length === 0}
              className="inline-flex items-center gap-2 self-start border border-[var(--border-primary)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空会话
            </button>
          </div>

          {currentBenchmark ? (
            <div className="mt-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 xl:max-w-[55%]">
                  <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Current Benchmark</div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">{currentBenchmark.title}</div>
                  <div className="mt-1 break-all text-[11px] leading-5 text-[var(--text-tertiary)]">
                    {currentBenchmark.sourceMeta?.canonicalUrl || currentBenchmark.url}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)] xl:justify-end">
                  <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{formatAnalysisMode(currentBenchmark)}</span>
                  <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">字幕 {formatTranscriptStatus(currentBenchmark)}</span>
                  <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Warnings {currentBenchmark.warnings?.length || 0}</span>
                  <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Shots {currentBenchmark.deconstructResult?.length || 0}</span>
                </div>
              </div>
              {currentBenchmark.analysisBasis && (
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[11px] leading-5 text-[var(--text-tertiary)] line-clamp-2">
                  {currentBenchmark.analysisBasis}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-3 text-xs leading-6 text-[var(--text-tertiary)]">
              当前未绑定 Benchmark。你仍然可以直接对话，也可以在下方输入区旁边随时切换到某个已完成的对标视频上下文。
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mt-5 rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] px-4 py-3 text-xs leading-6 text-[var(--error-text)] md:mx-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="space-y-2">
                <div>{error}</div>
                {canShowModelConfigAction && onShowModelConfig && (
                  <button
                    type="button"
                    onClick={onShowModelConfig}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--error-border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    检查模型配置
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[var(--bg-base)]">
          <div className="mx-auto flex min-h-[280px] w-full max-w-5xl flex-col px-4 py-5 md:px-6 md:py-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[220px] flex-1 items-start">
                <div className="w-full rounded-3xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                  <div className="max-w-3xl space-y-3">
                    <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                      <Sparkles className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                      Ready for Analysis
                    </div>
                    <div className="text-lg font-semibold text-[var(--text-primary)] md:text-xl">把长线程当成主工作台，但把关键控制留在输入区附近。</div>
                    <div className="text-sm leading-6 text-[var(--text-tertiary)]">
                      例如：帮我总结这个 benchmark 的爆款因子；结合附件里的脚本草案，指出哪些镜头节奏可以借鉴；如果只基于 metadata 分析，哪些结论仍然不够稳。
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                      <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Benchmark Context</span>
                      <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Local Attachments</span>
                      <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Streaming Reply</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
                <div className="space-y-4 pb-6">
                {messages.map((message) => {
                  const isAssistant = message.role === 'assistant';
                  const isStreamingMessage = message.id === streamingMessageId;
                  return (
                    <div key={message.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl border px-4 py-3 md:px-5 ${
                          isAssistant
                            ? 'rounded-bl-md border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                            : 'rounded-br-md border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                            {isAssistant ? 'Assistant' : 'You'}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
                            {isStreamingMessage && isSending && <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-text)]" />}
                            <span>{formatDateTime(message.createdAt)}</span>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm leading-7">
                          {message.content || (isStreamingMessage && isSending ? '正在接收回复…' : '')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="sticky bottom-0 z-20 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-md">
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={handleAttachFiles}
          />

          <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 shadow-[0_-12px_32px_var(--overlay-light)] md:px-6 md:py-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1 md:max-w-[280px]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Benchmark</label>
                <div className="relative">
                  <select
                    value={currentBenchmarkId || ''}
                    onChange={(event) => onSelectBenchmark(event.target.value || null)}
                    disabled={isSending}
                    className="w-full appearance-none rounded border border-[var(--border-secondary)] bg-[var(--bg-hover)] px-3 py-1.5 pr-8 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">不绑定 Benchmark</option>
                    {benchmarks.map((benchmark) => (
                      <option key={benchmark.id} value={benchmark.id}>
                        {benchmark.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-tertiary)]" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Chat Model</label>
                <ModelSelector
                  type="chat"
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  disabled={isSending}
                  compact
                />
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="inline-flex items-center gap-2 border border-[var(--border-secondary)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Paperclip className="h-3.5 w-3.5" />
                添加附件
              </button>

              {onShowModelConfig && (
                <button
                  type="button"
                  onClick={onShowModelConfig}
                  className="inline-flex items-center gap-2 border border-[var(--border-secondary)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  模型配置
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowAdvancedControls((previous) => !previous)}
                className="inline-flex items-center gap-2 border border-[var(--border-primary)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                高级参数
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedControls ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
              <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">支持模型 {supportedModelIds.length}</span>
              {modelValidation.model && (
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">
                  {modelValidation.model.name}
                  {modelValidation.provider ? ` · ${modelValidation.provider.name}` : ''}
                </span>
              )}
              <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">Temperature {temperature.toFixed(1)}</span>
              <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{maxTokensInput ? `MaxTokens ${maxTokensInput}` : 'MaxTokens Default'}</span>
              {!modelValidation.supported && modelValidation.reason && (
                <span className="rounded-full border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-1 text-[var(--error-text)]">
                  {modelValidation.reason}
                </span>
              )}
              {modelValidation.capabilityNote && !modelValidation.supported && (
                <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-3 py-1">{modelValidation.capabilityNote}</span>
              )}
            </div>

            {showAdvancedControls && (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                      <SlidersHorizontal className="h-3 w-3" />
                      Temperature
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(event) => setTemperature(Number(event.target.value))}
                      disabled={isSending}
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                      <Sparkles className="h-3 w-3" />
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={maxTokensInput}
                      onChange={(event) => setMaxTokensInput(event.target.value)}
                      placeholder="留空"
                      disabled={isSending}
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Local Attachments</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">{SUPPORTED_ATTACHMENT_LABEL}</div>
              </div>

              {attachments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-3 text-xs leading-6 text-[var(--text-tertiary)]">
                  文本附件会通过 <span className="font-mono">File.text()</span> 读取内容；图片会转为本地 data URL，视频会在浏览器内抽取少量关键帧，且全部只存在当前页面内存中。
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {attachments.map((attachment) => {
                    const isTextAttachment = attachment.kind === 'text';
                    const isImageAttachment = attachment.kind === 'image';
                    const Icon = isTextAttachment ? FileText : isImageAttachment ? FileImage : Film;
                    const contentLength = typeof attachment.content === 'string' ? attachment.content.length : 0;
                    const metadata = isTextAttachment
                      ? `${contentLength} chars · ${formatFileSize(attachment.size)}`
                      : `${formatFileSize(attachment.size)}${attachment.mimeType ? ` · ${attachment.mimeType}` : ''}${attachment.kind === 'video' ? ` · ${formatDuration(attachment.videoDurationMs)} · ${attachment.videoFrames?.length || 0} frames` : ''}`;

                    return (
                      <div
                        key={attachment.id}
                        className={`rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-sunken)] ${isTextAttachment ? 'flex min-w-0 max-w-full items-center gap-3 px-3 py-2' : 'flex w-full min-w-0 flex-col gap-3 p-3 sm:w-[260px]'}`}
                      >
                        {isImageAttachment && attachment.previewUrl && (
                          <div className="overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.name}
                              className="h-28 w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {attachment.kind === 'video' && (
                          <div className="flex aspect-video items-center justify-center rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--accent-text)]">
                            {attachment.previewUrl ? (
                              <div className="relative h-full w-full overflow-hidden rounded-xl">
                                <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover opacity-80" loading="lazy" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <div className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--accent-text)]">
                                    {attachment.videoFrames?.length || 0} Frames
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-center">
                                <Film className="h-6 w-6" />
                                <div className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--accent-text)]">
                                  Video Attachment
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`min-w-0 ${isTextAttachment ? 'flex flex-1 items-center gap-3' : 'flex items-start gap-3'}`}>
                          <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isTextAttachment ? 'text-[var(--accent-text)]' : 'mt-0.5 text-[var(--text-tertiary)]'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1">{formatAttachmentKindLabel(attachment.kind)}</span>
                              <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1">{formatAttachmentTypeLabel(attachment)}</span>
                            </div>
                            <div className="mt-2 truncate text-xs font-bold text-[var(--text-primary)]">{attachment.name}</div>
                            <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                              {metadata}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(attachment.id)}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-[var(--border-primary)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--error-border)] hover:text-[var(--error-text)]"
                            title="移除附件"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">消息输入</label>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="输入你想让分析助手处理的问题..."
                    rows={4}
                    disabled={isSending}
                    className="w-full resize-y rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 lg:pb-1">
                  {isSending && (
                    <button
                      type="button"
                      onClick={handleCancelStreaming}
                      className="inline-flex min-w-[120px] items-center justify-center gap-2 border border-[var(--border-secondary)] px-4 py-3 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <X className="h-4 w-4" />
                      取消
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    className="inline-flex min-w-[140px] items-center justify-center gap-2 bg-[var(--btn-primary-bg)] px-5 py-3 text-xs font-bold uppercase tracking-widest text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {isSending ? '接收中' : '发送'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                <span>Session only</span>
                <span>·</span>
                <span>不写入 IndexedDB / localStorage</span>
                <span>·</span>
                <span>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{currentBenchmark ? '已附带 Benchmark 上下文' : '纯文本对话模式'}</span>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardAnalysisChat;
