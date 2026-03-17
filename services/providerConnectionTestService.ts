import { DEFAULT_CHAT_VERIFY_MODEL } from './modelIdUtils';
import { ProviderAuthHeaderType, ProviderAuthMode, ProviderConnectionMode, ProviderProtocol } from '../types/model';

export interface ProviderConnectionDraft {
  name: string;
  baseUrl: string;
  apiKey?: string;
  protocol: ProviderProtocol;
  authMode: ProviderAuthMode;
  connectionMode: ProviderConnectionMode;
  authHeaderType: ProviderAuthHeaderType;
}

export interface ProviderConnectionTestResult {
  success: boolean;
  message: string;
  detail?: string;
  status?: number;
}

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

const buildAuthHeaders = (draft: ProviderConnectionDraft): Record<string, string> => {
  if (draft.authMode !== 'required' || !draft.apiKey) return {};
  switch (draft.authHeaderType) {
    case 'x-api-key':
      return { 'x-api-key': draft.apiKey };
    case 'x-goog-api-key':
      return { 'x-goog-api-key': draft.apiKey };
    case 'authorization-bearer':
    default:
      return { Authorization: `Bearer ${draft.apiKey}` };
  }
};

const buildOpenAiRequest = (draft: ProviderConnectionDraft) => ({
  targetUrl: `${normalizeBaseUrl(draft.baseUrl)}/v1/chat/completions`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(draft),
  },
  body: JSON.stringify({
    model: DEFAULT_CHAT_VERIFY_MODEL,
    messages: [{ role: 'user', content: '仅返回1' }],
    temperature: 0.1,
    max_tokens: 5,
  }),
});

const buildGeminiRequest = (draft: ProviderConnectionDraft) => ({
  targetUrl: `${normalizeBaseUrl(draft.baseUrl)}/v1beta/models/gemini-2.0-flash-exp:generateContent`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(draft),
  },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: '仅返回1' }] }],
  }),
});

const mapFailure = (error: any, mode: ProviderConnectionMode): ProviderConnectionTestResult => {
  const message = String(error?.message || error || '连接测试失败');
  if (message.includes('Failed to fetch')) {
    return {
      success: false,
      message: mode === 'direct' ? '浏览器直连失败：通常是 CORS、网络或证书问题' : '代理请求失败：请检查本地代理与上游地址',
      detail: message,
    };
  }
  return { success: false, message: '连接测试失败', detail: message };
};

const mapHttpResult = async (response: Response, mode: ProviderConnectionMode): Promise<ProviderConnectionTestResult> => {
  let detail = '';
  try {
    const payload = await response.clone().json();
    detail = payload?.error?.message || payload?.message || JSON.stringify(payload);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }

  if (response.ok) {
    return {
      success: true,
      status: response.status,
      message: mode === 'proxy' ? '代理连接成功，上游接口可达' : '直连成功，上游接口可达',
      detail,
    };
  }

  if (response.status === 401) {
    return { success: false, status: 401, message: '上游返回 401：需要有效 API Key 或鉴权方式不匹配', detail };
  }
  if (response.status === 403) {
    return { success: false, status: 403, message: mode === 'direct' ? '上游返回 403：可能是 CORS、权限或来源限制' : '上游返回 403：请求被上游拒绝', detail };
  }
  if (response.status === 404) {
    return { success: false, status: 404, message: '上游返回 404：baseUrl 或 endpoint 很可能不正确', detail };
  }

  return { success: false, status: response.status, message: `连接测试失败（HTTP ${response.status}）`, detail };
};

export const testProviderConnection = async (draft: ProviderConnectionDraft): Promise<ProviderConnectionTestResult> => {
  const request = draft.protocol === 'gemini' ? buildGeminiRequest(draft) : buildOpenAiRequest(draft);

  try {
    if (draft.connectionMode === 'direct') {
      const response = await fetch(request.targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return mapHttpResult(response, 'direct');
    }

    const proxyResponse = await fetch('/api/model-proxy/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerKey: `draft:${draft.name || draft.baseUrl}`,
        targetUrl: request.targetUrl,
        method: request.method,
        headers: request.headers,
        bodyType: 'json',
        body: JSON.parse(request.body),
        contentType: 'application/json',
      }),
    });

    const proxyPayload = await proxyResponse.json();
    const response = new Response(
      proxyPayload.bodyType === 'json' ? JSON.stringify(proxyPayload.body ?? null) : null,
      {
        status: proxyPayload.status || proxyResponse.status,
        headers: proxyPayload.headers || {},
      }
    );
    return mapHttpResult(response, 'proxy');
  } catch (error) {
    return mapFailure(error, draft.connectionMode);
  }
};
