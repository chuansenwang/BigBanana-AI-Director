import {
  AudioModelParams,
  ChatModelParams,
  ImageModelParams,
  ModelDefinition,
  ModelProvider,
  ProviderAuthMode,
  ProviderAuthHeaderType,
  ProviderConnectionMode,
  ModelType,
  ProviderProtocol,
  VideoModelParams,
} from '../types/model';
import { getDefaultEndpointForProtocol, isProtocolSupportedForType } from './modelProtocolService';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const buildResult = (errors: string[]): ValidationResult => ({
  valid: errors.length === 0,
  errors,
});

const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export interface ProviderDraft {
  name: string;
  baseUrl: string;
  protocol: ProviderProtocol;
  authMode: ProviderAuthMode;
  connectionMode: ProviderConnectionMode;
  authHeaderType: ProviderAuthHeaderType;
}

export const validateProviderDraft = (draft: ProviderDraft): ValidationResult => {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('请填写提供商名称');
  if (!draft.baseUrl.trim()) {
    errors.push('请填写 API 基础 URL');
  } else if (!isValidHttpUrl(draft.baseUrl.trim())) {
    errors.push('API 基础 URL 必须是有效的 http/https 地址');
  }

  if (!['openai', 'gemini'].includes(draft.protocol)) {
    errors.push('自定义提供商仅支持 OpenAI-compatible 或 Gemini-style 协议');
  }

  return buildResult(errors);
};

export interface CustomModelDraft {
  name: string;
  apiModel: string;
  type: ModelType;
  provider: ModelProvider | undefined;
  endpoint?: string;
  params: ChatModelParams | ImageModelParams | VideoModelParams | AudioModelParams;
}

export const validateCustomModelDraft = (draft: CustomModelDraft): ValidationResult => {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('请填写模型名称');
  if (!draft.apiModel.trim()) errors.push('请填写 API 模型名');
  if (!draft.provider) {
    errors.push('请选择提供商');
    return buildResult(errors);
  }

  if (!isProtocolSupportedForType(draft.provider.protocol, draft.type)) {
    errors.push(`当前提供商协议不支持 ${draft.type} 模型`);
  }

  const endpoint = (draft.endpoint || getDefaultEndpointForProtocol(draft.provider.protocol, draft.type) || '').trim();
  if (!endpoint) {
    errors.push('当前协议/模型类型缺少默认端点，请填写 Endpoint');
  }

  if (draft.type === 'image') {
    const params = draft.params as ImageModelParams;
    if (draft.provider.protocol === 'gemini' && params.apiFormat === 'openai') {
      errors.push('Gemini-style 提供商不能保存为 OpenAI Images 协议');
    }
    if (draft.provider.protocol === 'openai' && params.apiFormat === 'gemini') {
      errors.push('OpenAI-compatible 提供商不能保存为 Gemini GenerateContent 协议');
    }
  }

  if (draft.type === 'video') {
    const params = draft.params as VideoModelParams;
    const isTaskEndpoint = endpoint.includes('/contents/generations/tasks');
    if (isTaskEndpoint && draft.provider.protocol !== 'volcengine-task') {
      errors.push('火山任务端点仅允许 volcengine-task 协议使用');
    }
    if (draft.provider.protocol !== 'volcengine-task' && isTaskEndpoint) {
      errors.push('自定义提供商 v1 不支持火山任务协议');
    }
    if (!Array.isArray(params.supportedDurations) || !params.supportedDurations.length) {
      errors.push('请至少保留一个视频时长选项');
    }
  }

  if (draft.type === 'audio') {
    const params = draft.params as AudioModelParams;
    if (!params.defaultVoice?.trim()) {
      errors.push('请填写默认音色');
    }
  }

  return buildResult(errors);
};
