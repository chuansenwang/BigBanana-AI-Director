import { getProviderById } from './modelRegistry';

type ProxyBodyType = 'json' | 'text' | 'form-data' | 'binary-base64';

type ProxyFormDataEntry =
  | { kind: 'field'; name: string; value: string }
  | { kind: 'file'; name: string; filename?: string; mimeType?: string; base64: string };

const formDataToProxyEntries = async (formData: FormData): Promise<ProxyFormDataEntry[]> => {
  const entries: ProxyFormDataEntry[] = [];
  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') {
      entries.push({ kind: 'field', name, value });
      continue;
    }

    const buffer = await value.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    entries.push({
      kind: 'file',
      name,
      filename: value.name,
      mimeType: value.type,
      base64: btoa(binary),
    });
  }
  return entries;
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
};

interface RequestOptions extends RequestInit {
  providerId?: string;
}

export const callProviderFetch = async (
  targetUrl: string,
  options: RequestOptions = {}
): Promise<Response> => {
  const provider = options.providerId ? getProviderById(options.providerId) : undefined;
  const connectionMode = provider?.connectionMode || 'direct';
  if (connectionMode === 'direct') {
    return fetch(targetUrl, options);
  }

  const headers = normalizeHeaders(options.headers);
  let bodyType: ProxyBodyType | undefined;
  let proxyBody: any;

  if (options.body instanceof FormData) {
    bodyType = 'form-data';
    proxyBody = await formDataToProxyEntries(options.body);
    delete headers['Content-Type'];
  } else if (typeof options.body === 'string') {
    bodyType = headers['Content-Type']?.includes('application/json') ? 'json' : 'text';
    proxyBody = bodyType === 'json' ? JSON.parse(options.body || 'null') : options.body;
  }

  const proxyResponse = await fetch('/api/model-proxy/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerKey: provider?.id,
      targetUrl,
      method: options.method || 'POST',
      headers,
      bodyType,
      body: proxyBody,
      contentType: headers['Content-Type'],
    }),
  });

  const proxyPayload = await proxyResponse.json();
  const responseHeaders = new Headers(proxyPayload.headers || {});

  let responseBody: BodyInit | null;
  if (proxyPayload.bodyType === 'json') {
    responseHeaders.set('Content-Type', proxyPayload.contentType || 'application/json');
    responseBody = JSON.stringify(proxyPayload.body ?? null);
  } else if (proxyPayload.bodyType === 'base64') {
    responseBody = Uint8Array.from(atob(proxyPayload.body || ''), (c) => c.charCodeAt(0));
  } else {
    responseHeaders.set('Content-Type', 'application/json');
    responseBody = JSON.stringify({
      error: {
        message: proxyPayload.error || `Proxy request failed (${proxyPayload.status || proxyResponse.status})`,
      },
    });
  }

  return new Response(responseBody, {
    status: proxyPayload.status || proxyResponse.status,
    headers: responseHeaders,
  });
};
