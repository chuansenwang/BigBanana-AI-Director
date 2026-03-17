import { ModelType, ProviderProtocol } from '../types/model';

export interface ProtocolCapability {
  supported: boolean;
  defaultEndpoint?: string;
  notes?: string;
}

export const CUSTOM_PROVIDER_PROTOCOLS: ProviderProtocol[] = ['openai', 'gemini'];

export const PROVIDER_PROTOCOL_CAPABILITIES: Record<ProviderProtocol, Record<ModelType, ProtocolCapability>> = {
  openai: {
    chat: { supported: true, defaultEndpoint: '/v1/chat/completions' },
    image: { supported: true, defaultEndpoint: '/v1/images/generations' },
    video: { supported: true, defaultEndpoint: '/v1/videos' },
    audio: { supported: true, defaultEndpoint: '/v1/chat/completions' },
  },
  gemini: {
    chat: { supported: false, notes: 'Gemini-style custom providers are only supported for image generation in v1.' },
    image: { supported: true, defaultEndpoint: '/v1beta/models/{model}:generateContent' },
    video: { supported: false, notes: 'Gemini-style video routing is out of scope in v1.' },
    audio: { supported: false, notes: 'Gemini-style audio routing is out of scope in v1.' },
  },
  'volcengine-task': {
    chat: { supported: false, notes: 'Volcengine task routing is a built-in compatibility path, not a custom-provider target.' },
    image: { supported: false, notes: 'Volcengine task routing is not used for image generation here.' },
    video: { supported: true, defaultEndpoint: '/api/v3/contents/generations/tasks' },
    audio: { supported: false, notes: 'Volcengine task routing is not used for audio generation here.' },
  },
};

export const inferProviderProtocol = (baseUrl?: string): ProviderProtocol => {
  const normalized = (baseUrl || '').trim().toLowerCase();
  if (normalized.includes('volces.com')) return 'volcengine-task';
  if (normalized.includes('googleapis.com') || normalized.includes('generativelanguage')) return 'gemini';
  return 'openai';
};

export const isProtocolSupportedForType = (protocol: ProviderProtocol, type: ModelType): boolean => {
  return PROVIDER_PROTOCOL_CAPABILITIES[protocol][type].supported;
};

export const getProtocolCapability = (protocol: ProviderProtocol, type: ModelType): ProtocolCapability => {
  return PROVIDER_PROTOCOL_CAPABILITIES[protocol][type];
};

export const getDefaultEndpointForProtocol = (
  protocol: ProviderProtocol,
  type: ModelType
): string | undefined => {
  return getProtocolCapability(protocol, type).defaultEndpoint;
};
