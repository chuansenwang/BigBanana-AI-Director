/**
 * 全局配置组件
 * 包含 API Key 配置和折扣广告
 */

import React, { useState, useEffect } from 'react';
import { Key, Loader2, CheckCircle, AlertCircle, ExternalLink, Gift, Sparkles, Server, Pencil, Check, X } from 'lucide-react';
import { ModelProvider, ProviderAuthHeaderType, ProviderAuthMode, ProviderConnectionMode, ProviderProtocol } from '../../types/model';
import { getGlobalApiKey, setGlobalApiKey, getProviders, addProvider, updateProvider } from '../../services/modelRegistry';
import { verifyApiKey } from '../../services/modelService';
import { USER_MANUAL_URL } from '../../constants/links';
import { CUSTOM_PROVIDER_PROTOCOLS } from '../../services/modelProtocolService';
import { validateProviderDraft } from '../../services/modelValidationService';
import { useAlert } from '../GlobalAlert';
import { testProviderConnection } from '../../services/providerConnectionTestService';

interface GlobalSettingsProps {
  onRefresh: () => void;
}

const GlobalSettings: React.FC<GlobalSettingsProps> = ({ onRefresh }) => {
  const { showAlert } = useAlert();
  const [apiKey, setApiKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerDraft, setProviderDraft] = useState({ name: '', baseUrl: '', apiKey: '', protocol: 'openai' as ProviderProtocol, authMode: 'required' as ProviderAuthMode, connectionMode: 'proxy' as ProviderConnectionMode, authHeaderType: 'authorization-bearer' as ProviderAuthHeaderType });
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [providerTestMessage, setProviderTestMessage] = useState('');
  const [providerTestStatus, setProviderTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const currentKey = getGlobalApiKey() || '';
    setApiKey(currentKey);
    setProviders(getProviders());
    if (currentKey) {
      setVerifyStatus('success');
      setVerifyMessage('API Key 已配置');
    }
  }, []);

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim()) {
      setVerifyStatus('error');
      setVerifyMessage('请输入 API Key');
      return;
    }

    setIsVerifying(true);
    setVerifyStatus('idle');
    setVerifyMessage('');

    try {
      const result = await verifyApiKey(apiKey.trim());
      
      if (result.success) {
        setVerifyStatus('success');
        setVerifyMessage('验证成功！API Key 已保存');
        setGlobalApiKey(apiKey.trim());
        onRefresh();
      } else {
        setVerifyStatus('error');
        setVerifyMessage(result.message);
      }
    } catch (error: any) {
      setVerifyStatus('error');
      setVerifyMessage(error.message || '验证过程出错');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
    setApiKey('');
    setVerifyStatus('idle');
    setVerifyMessage('');
    setGlobalApiKey('');
    onRefresh();
  };

  const reloadProviders = () => {
    setProviders(getProviders());
    onRefresh();
  };

  const startAddProvider = () => {
    setEditingProviderId(null);
    setProviderDraft({ name: '', baseUrl: '', apiKey: '', protocol: 'openai', authMode: 'required', connectionMode: 'proxy', authHeaderType: 'authorization-bearer' });
    setIsAddingProvider(true);
    setProviderTestMessage('');
    setProviderTestStatus('idle');
  };

  const startEditProvider = (provider: ModelProvider) => {
    setIsAddingProvider(false);
    setEditingProviderId(provider.id);
      setProviderDraft({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || '',
        protocol: provider.protocol,
        authMode: provider.authMode,
        connectionMode: provider.connectionMode,
        authHeaderType: provider.authHeaderType,
      });
      setProviderTestMessage('');
      setProviderTestStatus('idle');
  };

  const cancelProviderEdit = () => {
    setEditingProviderId(null);
    setIsAddingProvider(false);
    setProviderDraft({ name: '', baseUrl: '', apiKey: '', protocol: 'openai', authMode: 'required', connectionMode: 'proxy', authHeaderType: 'authorization-bearer' });
    setProviderTestMessage('');
    setProviderTestStatus('idle');
  };

  const handleTestProvider = async () => {
    const validation = validateProviderDraft({
      name: providerDraft.name,
      baseUrl: providerDraft.baseUrl,
      protocol: providerDraft.protocol,
      authMode: providerDraft.authMode,
      connectionMode: providerDraft.connectionMode,
      authHeaderType: providerDraft.authHeaderType,
    });

    if (!validation.valid) {
      setProviderTestStatus('error');
      setProviderTestMessage(validation.errors.join('\n'));
      return;
    }

    setIsTestingProvider(true);
    setProviderTestStatus('idle');
    setProviderTestMessage('');

    try {
      const result = await testProviderConnection({
        name: providerDraft.name,
        baseUrl: providerDraft.baseUrl,
        apiKey: providerDraft.apiKey.trim() || undefined,
        protocol: providerDraft.protocol,
        authMode: providerDraft.authMode,
        connectionMode: providerDraft.connectionMode,
        authHeaderType: providerDraft.authHeaderType,
      });

      setProviderTestStatus(result.success ? 'success' : 'error');
      setProviderTestMessage(result.detail ? `${result.message}\n${result.detail}` : result.message);
    } finally {
      setIsTestingProvider(false);
    }
  };

  const saveProviderDraft = () => {
      const validation = validateProviderDraft({
        name: providerDraft.name,
        baseUrl: providerDraft.baseUrl,
        protocol: providerDraft.protocol,
        authMode: providerDraft.authMode,
        connectionMode: providerDraft.connectionMode,
        authHeaderType: providerDraft.authHeaderType,
      });
    if (!validation.valid) {
      showAlert(validation.errors.join('\n'), { type: 'warning' });
      return;
    }

    if (editingProviderId) {
      updateProvider(editingProviderId, {
        name: providerDraft.name.trim(),
        baseUrl: providerDraft.baseUrl.trim(),
        apiKey: providerDraft.apiKey.trim() || undefined,
        protocol: providerDraft.protocol,
        authMode: providerDraft.authMode,
        connectionMode: providerDraft.connectionMode,
      });
    } else {
      addProvider({
        name: providerDraft.name.trim(),
        baseUrl: providerDraft.baseUrl.trim(),
        apiKey: providerDraft.apiKey.trim() || undefined,
        protocol: providerDraft.protocol,
        authMode: providerDraft.authMode,
        connectionMode: providerDraft.connectionMode,
        authHeaderType: providerDraft.authHeaderType,
        isDefault: false,
      });
    }

    cancelProviderEdit();
    reloadProviders();
  };

  return (
    <div className="space-y-6">
      {/* 折扣广告卡片 */}
      <div className="bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Gift className="w-6 h-6 text-[var(--text-primary)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--warning-text)]" />
              推荐使用 BigBanana API
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3 leading-relaxed">
              支持 GPT-5 系列、Claude 4.6 / 4.5、Gemini 3.1 Pro Preview、Gemini-3、Veo 3.1、Sora-2 等多种模型。
              稳定快速，价格优惠。本开源项目由 BigBanana API 提供支持。
            </p>
            <div className="flex items-center gap-3">
              <a 
                href="https://api.antsk.cn" 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold rounded-lg hover:bg-[var(--btn-primary-hover)] transition-colors inline-flex items-center gap-1.5"
              >
                立即购买
                <ExternalLink className="w-3 h-3" />
              </a>
              <a 
                href={USER_MANUAL_URL}
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-bold rounded-lg hover:bg-[var(--border-secondary)] transition-colors inline-flex items-center gap-1.5"
              >
                使用教程
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* API Key 配置 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-4 h-4 text-[var(--accent-text)]" />
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
            全局 API Key
          </label>
        </div>
        
        <div className="space-y-3">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setVerifyStatus('idle');
              setVerifyMessage('');
            }}
            placeholder="输入你的 API Key..."
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-3 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-hover)] transition-all font-mono placeholder:text-[var(--text-muted)]"
            disabled={isVerifying}
          />
          
          {/* 状态提示 */}
          {verifyMessage && (
            <div className={`flex items-center gap-2 text-xs ${
              verifyStatus === 'success' ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'
            }`}>
              {verifyStatus === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {verifyMessage}
            </div>
          )}

          {/* 说明文字 */}
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            全局 API Key 仅作为需要鉴权的模型调用兜底。你也可以为单个提供商配置独立的 API Key，或把自定义提供商设为“无需鉴权”。
          </p>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            {getGlobalApiKey() && (
              <button
                onClick={handleClearKey}
                className="flex-1 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider transition-colors rounded-lg border border-[var(--border-primary)]"
              >
                清除 Key
              </button>
            )}
            <button
              onClick={handleVerifyAndSave}
              disabled={isVerifying || !apiKey.trim()}
              className="flex-1 py-3 bg-[var(--accent)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  验证中...
                </>
              ) : (
                '验证并保存'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 提示 */}
      <div className="p-4 bg-[var(--bg-elevated)]/50 rounded-lg border border-[var(--border-primary)]">
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] mb-2">配置说明</h4>
        <ul className="text-[10px] text-[var(--text-muted)] space-y-1 list-disc list-inside">
          <li>全局 API Key 用于所有BigBanana API 内置模型的调用</li>
          <li>你可以在各模型类别中调整模型参数（温度、Token 等）</li>
          <li>支持添加自定义模型，使用其他 API 服务</li>
          <li>所有配置仅保存在本地浏览器，不会上传到服务器</li>
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--accent-text)]" />
            <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
              自定义提供商
            </label>
          </div>
          {!isAddingProvider && !editingProviderId && (
            <button
              onClick={startAddProvider}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-[10px] rounded hover:bg-[var(--border-secondary)] transition-colors"
            >
              添加提供商
            </button>
          )}
        </div>

        <div className="space-y-3">
          {(isAddingProvider || editingProviderId) && (
            <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-secondary)] rounded-lg p-4 space-y-3">
              <input
                type="text"
                placeholder="提供商名称"
                value={providerDraft.name}
                onChange={(e) => setProviderDraft((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)]"
              />
              <input
                type="text"
                placeholder="https://api.example.com"
                value={providerDraft.baseUrl}
                onChange={(e) => setProviderDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                {CUSTOM_PROVIDER_PROTOCOLS.map((protocol) => (
                  <button
                    key={protocol}
                    onClick={() => setProviderDraft((prev) => ({ ...prev, protocol }))}
                    className={`py-2 text-xs rounded transition-colors ${
                      providerDraft.protocol === protocol
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    {protocol === 'openai' ? 'OpenAI-compatible' : 'Gemini-style'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setProviderDraft((prev) => ({ ...prev, authMode: 'required' }))}
                  className={`py-2 text-xs rounded transition-colors ${
                    providerDraft.authMode === 'required'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  需要 API Key
                </button>
                <button
                  onClick={() => setProviderDraft((prev) => ({ ...prev, authMode: 'none' }))}
                  className={`py-2 text-xs rounded transition-colors ${
                    providerDraft.authMode === 'none'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  无需鉴权
                </button>
              </div>
              {providerDraft.authMode === 'required' && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setProviderDraft((prev) => ({ ...prev, authHeaderType: 'authorization-bearer' }))}
                    className={`py-2 text-xs rounded transition-colors ${
                      providerDraft.authHeaderType === 'authorization-bearer'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    Bearer
                  </button>
                  <button
                    onClick={() => setProviderDraft((prev) => ({ ...prev, authHeaderType: 'x-api-key' }))}
                    className={`py-2 text-xs rounded transition-colors ${
                      providerDraft.authHeaderType === 'x-api-key'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    x-api-key
                  </button>
                  <button
                    onClick={() => setProviderDraft((prev) => ({ ...prev, authHeaderType: 'x-goog-api-key' }))}
                    className={`py-2 text-xs rounded transition-colors ${
                      providerDraft.authHeaderType === 'x-goog-api-key'
                        ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                    }`}
                  >
                    x-goog-api-key
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setProviderDraft((prev) => ({ ...prev, connectionMode: 'direct' }))}
                  className={`py-2 text-xs rounded transition-colors ${
                    providerDraft.connectionMode === 'direct'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  浏览器直连
                </button>
                <button
                  onClick={() => setProviderDraft((prev) => ({ ...prev, connectionMode: 'proxy' }))}
                  className={`py-2 text-xs rounded transition-colors ${
                    providerDraft.connectionMode === 'proxy'
                      ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)]'
                  }`}
                >
                  本地代理
                </button>
              </div>
              <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                浏览器直连适合已放行 CORS 的接口；多数第三方 OpenAI 兼容接口更适合使用本地代理。
              </p>
              <input
                type="password"
                placeholder={providerDraft.authMode === 'none' ? '该提供商无需 API Key' : '提供商 API Key（可选）'}
                value={providerDraft.apiKey}
                onChange={(e) => setProviderDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                className="w-full bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] font-mono"
              />
              <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                {providerDraft.authMode === 'none'
                  ? providerDraft.connectionMode === 'proxy'
                    ? '当前会通过本地代理转发请求，但不会附带 Authorization 头。若上游返回 401，请改成“需要 API Key”。'
                    : '当前会浏览器直连且不会附带 Authorization 头。若接口存在鉴权要求或 CORS 限制，请改用“需要 API Key”或“本地代理”。'
                  : providerDraft.connectionMode === 'proxy'
                    ? `当前会通过本地代理转发请求，并携带 ${providerDraft.authHeaderType} 形式的 API Key。适合第三方接口的 CORS 场景。`
                    : `当前会由浏览器直接请求上游接口，并携带 ${providerDraft.authHeaderType} 形式的 API Key。`}
              </p>
              {providerTestMessage && (
                <div className={`text-[10px] whitespace-pre-wrap ${providerTestStatus === 'success' ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'}`}>
                  {providerTestMessage}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleTestProvider}
                  disabled={isTestingProvider}
                  className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded hover:bg-[var(--border-secondary)] transition-colors disabled:opacity-50"
                >
                  {isTestingProvider ? '测试中...' : '连接测试'}
                </button>
                <button
                  onClick={saveProviderDraft}
                  className="flex-1 py-2 bg-[var(--accent)] text-[var(--text-primary)] text-xs font-bold rounded hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  保存提供商
                </button>
                <button
                  onClick={cancelProviderEdit}
                  className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-tertiary)] text-xs rounded hover:bg-[var(--border-secondary)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {providers.map((provider) => (
            <div key={provider.id} className="bg-[var(--bg-elevated)]/50 border border-[var(--border-primary)] rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</span>
                  {provider.isBuiltIn && <span className="px-1.5 py-0.5 bg-[var(--border-secondary)] text-[var(--text-tertiary)] text-[10px] rounded">内置</span>}
                  {!provider.isBuiltIn && <span className="px-1.5 py-0.5 bg-[var(--accent-bg)] text-[var(--accent-text)] text-[10px] rounded">自定义</span>}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{provider.baseUrl}</p>
                <p className="text-[10px] text-[var(--text-muted)]">协议：{provider.protocol} · 鉴权：{provider.authMode === 'none' ? '无' : 'API Key'} · 连接：{provider.connectionMode === 'proxy' ? '代理' : '直连'}</p>
              </div>
              {!provider.isBuiltIn && (
                <button
                  onClick={() => startEditProvider(provider)}
                  className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  title="编辑提供商"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GlobalSettings;
