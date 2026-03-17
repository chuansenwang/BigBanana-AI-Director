/**
 * 添加模型表单组件
 * 支持自定义提供商和 endpoint
 */

import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { 
  ModelType, 
  ModelDefinition,
  ProviderAuthHeaderType,
  ProviderAuthMode,
  ProviderConnectionMode,
  ModelProvider,
  ProviderProtocol,
  ImageApiFormat,
  AudioOutputFormat,
  ChatModelParams,
  ImageModelParams,
  VideoModelParams,
  AudioModelParams,
  DEFAULT_CHAT_PARAMS,
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_IMAGE_PARAMS_OPENAI,
  DEFAULT_VIDEO_PARAMS_SORA,
  DEFAULT_VIDEO_PARAMS_VEO,
  DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE,
  DEFAULT_AUDIO_PARAMS,
} from '../../types/model';
import { getProviders, addProvider } from '../../services/modelRegistry';
import { useAlert } from '../GlobalAlert';
import { CUSTOM_PROVIDER_PROTOCOLS, getDefaultEndpointForProtocol, isProtocolSupportedForType } from '../../services/modelProtocolService';
import { validateCustomModelDraft, validateProviderDraft } from '../../services/modelValidationService';

interface AddModelFormProps {
  type: ModelType;
  onSave: (model: Omit<ModelDefinition, 'id' | 'isBuiltIn'>) => void;
  onCancel: () => void;
}

const AddModelForm: React.FC<AddModelFormProps> = ({ type, onSave, onCancel }) => {
  const existingProviders = getProviders();
  const { showAlert } = useAlert();
  
  const [name, setName] = useState('');
  const [apiModel, setApiModel] = useState('');
  const [description, setDescription] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [imageApiFormat, setImageApiFormat] = useState<ImageApiFormat>('gemini');
  const [videoMode, setVideoMode] = useState<'sync' | 'async' | 'task'>('sync');
  const [audioVoice, setAudioVoice] = useState<string>(DEFAULT_AUDIO_PARAMS.defaultVoice);
  const [audioOutputFormat, setAudioOutputFormat] = useState<AudioOutputFormat>(DEFAULT_AUDIO_PARAMS.outputFormat);
  
  // 提供商配置
  const [providerMode, setProviderMode] = useState<'existing' | 'custom'>('existing');
  const [selectedProviderId, setSelectedProviderId] = useState(existingProviders[0]?.id || 'antsk');
  const [customProviderName, setCustomProviderName] = useState('');
  const [customProviderBaseUrl, setCustomProviderBaseUrl] = useState('');
  const [customProviderApiKey, setCustomProviderApiKey] = useState('');
  const [customProviderProtocol, setCustomProviderProtocol] = useState<ProviderProtocol>('openai');
  const [customProviderAuthMode, setCustomProviderAuthMode] = useState<ProviderAuthMode>('required');
  const [customProviderConnectionMode, setCustomProviderConnectionMode] = useState<ProviderConnectionMode>('proxy');
  const [customProviderAuthHeaderType, setCustomProviderAuthHeaderType] = useState<ProviderAuthHeaderType>('authorization-bearer');

  const availableProviders = existingProviders.filter((provider) => isProtocolSupportedForType(provider.protocol, type));
  const selectedProvider = availableProviders.find((provider) => provider.id === selectedProviderId) || availableProviders[0];
  
  useEffect(() => {
    if (type !== 'video' || providerMode !== 'existing' || videoMode !== 'task') return;
    const volcengineProvider = existingProviders.find(
      p => p.id === 'volcengine' || p.baseUrl.toLowerCase().includes('volces.com')
    );
    if (volcengineProvider) {
      setSelectedProviderId(volcengineProvider.id);
    }
  }, [type, videoMode, providerMode]);

  useEffect(() => {
    if (providerMode !== 'existing') return;
    if (!selectedProvider && availableProviders[0]) {
      setSelectedProviderId(availableProviders[0].id);
    }
  }, [providerMode, selectedProviderId, availableProviders, selectedProvider]);

  useEffect(() => {
    const currentProtocol = providerMode === 'custom'
      ? customProviderProtocol
      : (selectedProvider?.protocol || 'openai');

    if (type === 'image') {
      setImageApiFormat(currentProtocol === 'gemini' ? 'gemini' : 'openai');
    }

    if (type === 'video' && currentProtocol !== 'volcengine-task' && videoMode === 'task') {
      setVideoMode('async');
    }
  }, [providerMode, customProviderProtocol, selectedProvider?.protocol, type, videoMode]);

  const handleSave = () => {
    if (!name.trim() || !apiModel.trim()) {
      showAlert('请填写模型名称和 API 模型名', { type: 'warning' });
      return;
    }

    // 处理提供商
    let providerId = selectedProviderId;
    let provider: ModelProvider | undefined = selectedProvider;
    
    if (providerMode === 'custom') {
      const providerValidation = validateProviderDraft({
        name: customProviderName,
        baseUrl: customProviderBaseUrl,
        protocol: customProviderProtocol,
        authMode: customProviderAuthMode,
        connectionMode: customProviderConnectionMode,
        authHeaderType: customProviderAuthHeaderType,
      });
      if (!providerValidation.valid) {
        showAlert(providerValidation.errors.join('\n'), { type: 'warning' });
        return;
      }
      const sanitizedBaseUrl = customProviderBaseUrl.trim().replace(/\/+$/, '');
      const newProvider = addProvider({
        name: customProviderName.trim(),
        baseUrl: sanitizedBaseUrl,
        protocol: customProviderProtocol,
        authMode: customProviderAuthMode,
        connectionMode: customProviderConnectionMode,
        authHeaderType: customProviderAuthHeaderType,
        apiKey: customProviderApiKey.trim() || undefined,
        isDefault: false,
      });
      providerId = newProvider.id;
      provider = newProvider;
    } else if (!provider) {
      showAlert('当前没有可用的提供商，请先添加支持该模型类型的提供商', { type: 'warning' });
      return;
    }

    // 根据模型类型设置默认参数
    let params: ChatModelParams | ImageModelParams | VideoModelParams | AudioModelParams;
    let resolvedEndpoint = endpoint.trim() || undefined;
    
    if (type === 'chat') {
      params = { ...DEFAULT_CHAT_PARAMS };
      if (!resolvedEndpoint) resolvedEndpoint = getDefaultEndpointForProtocol(provider?.protocol || 'openai', 'chat') || '/v1/chat/completions';
    } else if (type === 'image') {
      params =
        imageApiFormat === 'openai'
          ? { ...DEFAULT_IMAGE_PARAMS_OPENAI }
          : { ...DEFAULT_IMAGE_PARAMS };
      if (!resolvedEndpoint) {
        resolvedEndpoint = getDefaultEndpointForProtocol(provider?.protocol || 'openai', 'image');
      }
    } else if (type === 'video') {
      params =
        videoMode === 'sync'
          ? { ...DEFAULT_VIDEO_PARAMS_VEO }
          : videoMode === 'task'
            ? { ...DEFAULT_VIDEO_PARAMS_DOUBAO_SEEDANCE }
            : { ...DEFAULT_VIDEO_PARAMS_SORA };

      if (!resolvedEndpoint) {
        resolvedEndpoint =
          videoMode === 'sync'
            ? '/v1/chat/completions'
            : videoMode === 'task'
              ? '/api/v3/contents/generations/tasks'
              : '/v1/videos';
      }
    } else {
      params = {
        ...DEFAULT_AUDIO_PARAMS,
        defaultVoice: audioVoice.trim() || DEFAULT_AUDIO_PARAMS.defaultVoice,
        outputFormat: audioOutputFormat,
      };
      if (!resolvedEndpoint) {
        resolvedEndpoint = getDefaultEndpointForProtocol(provider?.protocol || 'openai', 'audio') || '/v1/chat/completions';
      }
    }

    const validation = validateCustomModelDraft({
      name,
      apiModel,
      type,
      provider,
      endpoint: resolvedEndpoint,
      params,
    });

    if (!validation.valid) {
      showAlert(validation.errors.join('\n'), { type: 'warning' });
      return;
    }

    const model: Omit<ModelDefinition, 'id' | 'isBuiltIn'> = {
      name: name.trim(),
      apiModel: apiModel.trim(),
      type,
      providerId,
      endpoint: resolvedEndpoint,
      description: description.trim() || undefined,
      apiKey: providerMode === 'existing' ? (apiKey.trim() || undefined) : undefined,
      isEnabled: true,
      params,
    } as any;

    onSave(model);
  };

  return (
    <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-secondary)] rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-bold text-[var(--text-primary)]">添加自定义模型</h4>
      
      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">模型名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：GPT-4 Turbo"
            className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API 模型名 *（可与内置重复）</label>
          <input
            type="text"
            value={apiModel}
            onChange={(e) => setApiModel(e.target.value)}
            placeholder="如：gpt-4-turbo、claude-3-opus"
            className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
          />
          <p className="text-[9px] text-[var(--text-muted)] mt-1">
            该字段会作为 API 请求中的 model 参数；内部 ID 会自动生成
          </p>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">描述（可选）</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选的描述信息"
          className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      {/* 图片模型特有选项 */}
      {type === 'image' && (
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">图片 API 协议</label>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setImageApiFormat('gemini')}
              className={`flex-1 py-2 text-xs rounded transition-colors ${
                imageApiFormat === 'gemini'
                  ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
              }`}
            >
              Gemini GenerateContent
            </button>
            <button
              onClick={() => setImageApiFormat('openai')}
              className={`flex-1 py-2 text-xs rounded transition-colors ${
                imageApiFormat === 'openai'
                  ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
              }`}
            >
              OpenAI Images（支持参考图）
            </button>
          </div>
          <p className="text-[9px] text-[var(--text-muted)] mt-1">
            OpenAI 协议下无参考图走 `/v1/images/generations`，带参考图会自动走 `/v1/images/edits`。
          </p>
        </div>
      )}

      {/* 配音模型特有选项 */}
      {type === 'audio' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">默认音色</label>
            <input
              type="text"
              value={audioVoice}
              onChange={(e) => setAudioVoice(e.target.value)}
              placeholder="如：alloy"
              className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">输出格式</label>
            <select
              value={audioOutputFormat}
              onChange={(e) => setAudioOutputFormat(e.target.value as AudioOutputFormat)}
              className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              <option value="wav">wav</option>
              <option value="mp3">mp3</option>
            </select>
          </div>
        </div>
      )}

      {/* API 端点 */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API 端点 (Endpoint)</label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={
            type === 'chat'
              ? '/v1/chat/completions'
              : type === 'image'
                ? imageApiFormat === 'openai'
                  ? '/v1/images/generations'
                  : '/v1beta/models/{model}:generateContent'
                : type === 'video'
                  ? '/v1/videos 或 /api/v3/contents/generations/tasks'
                  : '/v1/chat/completions'
          }
          className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
        />
        <p className="text-[9px] text-[var(--text-muted)] mt-1">
          留空则使用默认端点
        </p>
      </div>

      {/* 模型专属 API Key（仅在使用已有提供商时显示） */}
      {providerMode === 'existing' && (
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API Key（可选）</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="留空则使用全局 API Key"
            className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
          />
          <p className="text-[9px] text-[var(--text-muted)] mt-1">
            为此模型单独配置 API Key，留空则使用全局配置的 Key
          </p>
        </div>
      )}

      {/* 提供商选择 */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] block mb-2">API 提供商</label>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setProviderMode('existing')}
            className={`flex-1 py-2 text-xs rounded transition-colors ${
              providerMode === 'existing'
                ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
            }`}
          >
            使用已有提供商
          </button>
          <button
            onClick={() => setProviderMode('custom')}
            className={`flex-1 py-2 text-xs rounded transition-colors ${
              providerMode === 'custom'
                ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
            }`}
          >
            添加新提供商
          </button>
        </div>
        
        {providerMode === 'existing' ? (
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)]"
          >
            {availableProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.baseUrl})</option>
            ))}
          </select>
        ) : null}

        {providerMode === 'existing' && !availableProviders.length ? (
          <p className="text-[10px] text-[var(--warning-text)]">
            当前没有支持该模型类型的提供商，请切换为“添加新提供商”。
          </p>
        ) : providerMode === 'custom' ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">提供商名称 *</label>
              <input
                type="text"
                value={customProviderName}
                onChange={(e) => setCustomProviderName(e.target.value)}
                placeholder="如：OpenAI Official"
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API 基础 URL *</label>
              <input
                type="text"
                value={customProviderBaseUrl}
                onChange={(e) => setCustomProviderBaseUrl(e.target.value)}
                placeholder="如：https://api.openai.com"
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">提供商协议 *</label>
              <div className="grid grid-cols-2 gap-2">
                {CUSTOM_PROVIDER_PROTOCOLS.map((protocol) => (
                  <button
                    key={protocol}
                    onClick={() => setCustomProviderProtocol(protocol)}
                    className={`py-2 text-xs rounded transition-colors ${
                      customProviderProtocol === protocol
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    {protocol === 'openai' ? 'OpenAI-compatible' : 'Gemini-style'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">鉴权方式 *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCustomProviderAuthMode('required')}
                  className={`py-2 text-xs rounded transition-colors ${
                    customProviderAuthMode === 'required'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  需要 API Key
                </button>
                <button
                  onClick={() => setCustomProviderAuthMode('none')}
                  className={`py-2 text-xs rounded transition-colors ${
                    customProviderAuthMode === 'none'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  无需鉴权
                </button>
              </div>
              {customProviderAuthMode === 'required' && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    onClick={() => setCustomProviderAuthHeaderType('authorization-bearer')}
                    className={`py-2 text-xs rounded transition-colors ${
                      customProviderAuthHeaderType === 'authorization-bearer'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    Bearer
                  </button>
                  <button
                    onClick={() => setCustomProviderAuthHeaderType('x-api-key')}
                    className={`py-2 text-xs rounded transition-colors ${
                      customProviderAuthHeaderType === 'x-api-key'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    x-api-key
                  </button>
                  <button
                    onClick={() => setCustomProviderAuthHeaderType('x-goog-api-key')}
                    className={`py-2 text-xs rounded transition-colors ${
                      customProviderAuthHeaderType === 'x-goog-api-key'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    x-goog-api-key
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">连接方式 *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCustomProviderConnectionMode('direct')}
                  className={`py-2 text-xs rounded transition-colors ${
                    customProviderConnectionMode === 'direct'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  浏览器直连
                </button>
                <button
                  onClick={() => setCustomProviderConnectionMode('proxy')}
                  className={`py-2 text-xs rounded transition-colors ${
                    customProviderConnectionMode === 'proxy'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  本地代理
                </button>
              </div>
              <p className="text-[9px] text-[var(--text-muted)] mt-1 leading-relaxed">
                自定义 provider 默认推荐使用本地代理，能绕过大多数第三方接口的浏览器跨域限制。
              </p>
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">提供商 API Key</label>
              <input
                type="password"
                value={customProviderApiKey}
                onChange={(e) => setCustomProviderApiKey(e.target.value)}
                placeholder={customProviderAuthMode === 'none' ? '该提供商无需 API Key' : '输入此提供商的 API Key'}
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
              />
              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                {customProviderAuthMode === 'none'
                  ? customProviderConnectionMode === 'proxy'
                    ? '该提供商会通过本地代理转发请求，但不会附带 Authorization 头。若上游返回 401，请改成“需要 API Key”。'
                    : '该提供商会在浏览器直连时省略 Authorization 头；若接口存在 CORS 或鉴权要求，请改用代理或启用 API Key。'
                  : customProviderConnectionMode === 'proxy'
                    ? `此 API Key 会用于该提供商下的所有模型，并由本地代理通过 ${customProviderAuthHeaderType} 请求头附带到上游请求中。`
                    : `此 API Key 会用于该提供商下的所有模型，并由浏览器直连通过 ${customProviderAuthHeaderType} 请求头附带。`}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* 视频模型特有选项 */}
      {type === 'video' && (
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API 模式</label>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setVideoMode('sync')}
              className={`flex-1 py-2 text-xs rounded transition-colors ${
                videoMode === 'sync'
                  ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
              }`}
            >
              同步模式（Chat Completion 类）
            </button>
            <button
              onClick={() => setVideoMode('async')}
              className={`flex-1 py-2 text-xs rounded transition-colors ${
                videoMode === 'async'
                  ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
              }`}
            >
              异步模式（Sora 类）
            </button>
            {(providerMode === 'existing' && selectedProvider?.protocol === 'volcengine-task') && (
              <button
                onClick={() => setVideoMode('task')}
                className={`flex-1 py-2 text-xs rounded transition-colors ${
                  videoMode === 'task'
                    ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                }`}
              >
                异步模式（火山任务类）
              </button>
            )}
          </div>
          <p className="text-[9px] text-[var(--text-muted)] mt-1">
            同步模式：直接返回结果；Sora 类异步：`/v1/videos`；火山任务类：`/api/v3/contents/generations/tasks`
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--text-primary)] text-xs font-bold rounded hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-1"
        >
          <Check className="w-3 h-3" />
          添加模型
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-[var(--bg-hover)] text-[var(--text-tertiary)] text-xs rounded hover:bg-[var(--border-secondary)] transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default AddModelForm;
