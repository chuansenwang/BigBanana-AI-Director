import { BenchmarkVideo } from '../types';
import { chatCompletion, chatCompletionStream } from './aiService';
import type { ChatCompletionMessage } from './aiService';
import { getActiveChatModel, getChatModels, getProviderById } from './modelRegistry';
import { getProtocolCapability, isProtocolSupportedForType } from './modelProtocolService';
import { ChatModelDefinition, ModelProvider } from '../types/model';

export interface DashboardAnalysisChatAttachment {
  id: string;
  name: string;
  content: string;
  size: number;
  mimeType?: string;
  kind?: 'text' | 'image' | 'video';
  extension?: string;
  imageDataUrl?: string;
  videoDurationMs?: number;
  videoFrames?: Array<{
    id: string;
    timeMs: number;
    dataUrl: string;
  }>;
}

export interface DashboardAnalysisChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface DashboardAnalysisChatModelValidation {
  supported: boolean;
  model?: ChatModelDefinition;
  provider?: ModelProvider;
  reason?: string;
  capabilityNote?: string;
}

export interface DashboardAnalysisChatRequest {
  benchmark?: BenchmarkVideo | null;
  attachments?: DashboardAnalysisChatAttachment[];
  history?: DashboardAnalysisChatMessage[];
  prompt: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  abortSignal?: AbortSignal;
}

export interface DashboardAnalysisChatResponse {
  content: string;
  modelId: string;
  modelName: string;
}

export interface DashboardAnalysisChatStreamRequest extends DashboardAnalysisChatRequest {
  onDelta?: (delta: string) => void;
}

const clipText = (value: string | undefined, maxLength: number): string => {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
};

const MAX_ATTACHMENT_LENGTH = 6000;
const MAX_TOTAL_ATTACHMENT_LENGTH = 16000;

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const summarizeTextAttachments = (attachments: DashboardAnalysisChatAttachment[]): string => {
  const textAttachments = attachments.filter((attachment) => (attachment.kind || 'text') === 'text');
  if (!textAttachments.length) return '无文本附件';

  let remaining = MAX_TOTAL_ATTACHMENT_LENGTH;
  const lines = textAttachments.map((attachment) => {
    const safeLength = Math.max(0, remaining);
    const excerpt = clipText(attachment.content, Math.min(MAX_ATTACHMENT_LENGTH, safeLength));
    remaining -= excerpt.length;
    return [
      `文件: ${attachment.name}`,
      `字符数: ${attachment.content.length}`,
      excerpt ? `内容摘录:\n${excerpt}` : '内容摘录: 已因上下文长度限制省略',
    ].join('\n');
  });

  return lines.join('\n\n');
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const buildBenchmarkContext = (benchmark?: BenchmarkVideo | null): string => {
  if (!benchmark) {
    return '当前未选择 BenchmarkVideo。';
  }

  return [
    `标题: ${benchmark.title || '未命名视频'}`,
    `原始链接: ${benchmark.url || '未知'}`,
    `规范链接: ${benchmark.sourceMeta?.canonicalUrl || benchmark.url || '未知'}`,
    `分析状态: ${benchmark.status}`,
    `分析依据: ${benchmark.analysisBasis || '未提供'}`,
  ].join('\n');
};

const buildMediaParts = (attachments: DashboardAnalysisChatAttachment[]): ChatContentPart[] => {
  const parts: ChatContentPart[] = [];

  attachments.forEach((attachment) => {
    if (attachment.kind === 'image' && attachment.imageDataUrl) {
      parts.push({
        type: 'text',
        text: `图片附件：${attachment.name}\n格式: ${(attachment.extension || attachment.mimeType || 'image').toUpperCase()}\n大小: ${formatFileSize(attachment.size)}`,
      });
      parts.push({
        type: 'image_url',
        image_url: { url: attachment.imageDataUrl },
      });
      return;
    }

    if (attachment.kind === 'video' && attachment.videoFrames?.length) {
      parts.push({
        type: 'text',
        text: [
          `视频附件：${attachment.name}`,
          `格式: ${(attachment.extension || attachment.mimeType || 'video').toUpperCase()}`,
          `大小: ${formatFileSize(attachment.size)}`,
          attachment.videoDurationMs ? `时长: ${(attachment.videoDurationMs / 1000).toFixed(1)}s` : '',
          `已抽取 ${attachment.videoFrames.length} 帧供模型参考`,
        ].filter(Boolean).join('\n'),
      });

      attachment.videoFrames.forEach((frame, index) => {
        parts.push({
          type: 'text',
          text: `视频帧 ${index + 1} · ${(frame.timeMs / 1000).toFixed(2)}s`,
        });
        parts.push({
          type: 'image_url',
          image_url: { url: frame.dataUrl },
        });
      });
    }
  });

  return parts;
};

const buildContextMessageContent = (request: DashboardAnalysisChatRequest): string | ChatContentPart[] => {
  const textSummary = [
    '## 当前 Context',
    buildBenchmarkContext(request.benchmark),
    '',
    '## 本地文本附件（仅当前会话内存）',
    summarizeTextAttachments(request.attachments || []),
  ].join('\n');

  const mediaParts = buildMediaParts(request.attachments || []);
  if (!mediaParts.length) {
    return textSummary;
  }

  return [
    { type: 'text', text: textSummary },
    ...mediaParts,
  ];
};

const buildContextAndUserMessages = (request: DashboardAnalysisChatRequest): ChatCompletionMessage[] => {
  const userPrompt = clipText(request.prompt, 4000) || '请先帮助我总结当前上下文。';

  return [
    {
      role: 'user',
      content: buildContextMessageContent(request),
    },
    { role: 'user', content: userPrompt },
  ];
};

export const getDashboardAnalysisChatSupportedModelIds = (): string[] => {
  return getChatModels()
    .filter((model) => model.isEnabled)
    .filter((model) => {
      const provider = getProviderById(model.providerId);
      return provider ? isProtocolSupportedForType(provider.protocol, 'chat') : false;
    })
    .map((model) => model.id);
};

export const getDashboardAnalysisChatDefaultModelId = (): string => {
  const activeModel = getActiveChatModel();
  if (activeModel?.isEnabled) {
    const provider = getProviderById(activeModel.providerId);
    if (provider && isProtocolSupportedForType(provider.protocol, 'chat')) {
      return activeModel.id;
    }
  }

  return getDashboardAnalysisChatSupportedModelIds()[0] || getChatModels().find((model) => model.isEnabled)?.id || '';
};

export const validateDashboardAnalysisChatModel = (modelId?: string): DashboardAnalysisChatModelValidation => {
  const enabledModels = getChatModels().filter((model) => model.isEnabled);
  const resolvedModel = enabledModels.find((model) => model.id === modelId)
    || enabledModels.find((model) => model.id === getActiveChatModel()?.id)
    || enabledModels[0];

  if (!resolvedModel) {
    return {
      supported: false,
      reason: '当前没有可用的对话模型，请先在“模型配置”中启用一个 chat 模型。',
    };
  }

  const provider = getProviderById(resolvedModel.providerId);
  if (!provider) {
    return {
      supported: false,
      model: resolvedModel,
      reason: `模型“${resolvedModel.name}”缺少可用的提供商配置。`,
    };
  }

  const supported = isProtocolSupportedForType(provider.protocol, 'chat');
  const capability = getProtocolCapability(provider.protocol, 'chat');
  if (!supported) {
    return {
      supported: false,
      model: resolvedModel,
      provider,
      reason: `模型“${resolvedModel.name}”所属提供商「${provider.name}」当前不支持 chat 请求。`,
      capabilityNote: capability.notes,
    };
  }

  return {
    supported: true,
    model: resolvedModel,
    provider,
    capabilityNote: capability.notes,
  };
};

export const requestDashboardAnalysisChat = async (
  request: DashboardAnalysisChatRequest
): Promise<DashboardAnalysisChatResponse> => {
  const validation = validateDashboardAnalysisChatModel(request.modelId);
  if (!validation.supported || !validation.model) {
    throw new Error(validation.reason || '当前模型不支持分析助手对话。');
  }

  const raw = await chatCompletion(
    buildContextAndUserMessages(request),
    validation.model.id,
    Number.isFinite(request.temperature) ? Number(request.temperature) : validation.model.params.temperature,
    Number.isFinite(request.maxTokens) ? Number(request.maxTokens) : validation.model.params.maxTokens,
    undefined,
    request.timeout || 300000,
    request.abortSignal
  );

  const content = String(raw || '').trim();
  if (!content) {
    throw new Error('分析助手没有返回有效内容，请稍后重试。');
  }

  return {
    content,
    modelId: validation.model.id,
    modelName: validation.model.name,
  };
};

export const requestDashboardAnalysisChatStream = async (
  request: DashboardAnalysisChatStreamRequest
): Promise<DashboardAnalysisChatResponse> => {
  const validation = validateDashboardAnalysisChatModel(request.modelId);
  if (!validation.supported || !validation.model) {
    throw new Error(validation.reason || '当前模型不支持分析助手对话。');
  }

  const raw = await chatCompletionStream(
    buildContextAndUserMessages(request),
    validation.model.id,
    Number.isFinite(request.temperature) ? Number(request.temperature) : validation.model.params.temperature,
    undefined,
    request.timeout || 300000,
    request.onDelta,
    request.abortSignal,
    Number.isFinite(request.maxTokens) ? Number(request.maxTokens) : validation.model.params.maxTokens,
  );

  const content = String(raw || '').trim();
  if (!content) {
    throw new Error('分析助手没有返回有效内容，请稍后重试。');
  }

  return {
    content,
    modelId: validation.model.id,
    modelName: validation.model.name,
  };
};
