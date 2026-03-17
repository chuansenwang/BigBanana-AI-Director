import { ModelProvider } from '../types/model';

export const providerRequiresApiKey = (provider?: ModelProvider | null): boolean => {
  return (provider?.authMode || 'required') !== 'none';
};

export const buildAuthHeaders = (provider: ModelProvider | undefined | null, apiKey?: string): Record<string, string> => {
  if (!providerRequiresApiKey(provider)) {
    return {};
  }

  if (!apiKey) {
    return {};
  }

  switch (provider?.authHeaderType || 'authorization-bearer') {
    case 'x-api-key':
      return { 'x-api-key': apiKey };
    case 'x-goog-api-key':
      return { 'x-goog-api-key': apiKey };
    case 'authorization-bearer':
    default:
      return { Authorization: `Bearer ${apiKey}` };
  }
};
