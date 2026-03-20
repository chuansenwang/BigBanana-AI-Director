import React, { useMemo, useState } from 'react';
import { Film, Sparkles, Wand2 } from 'lucide-react';
import { LocalAnalysisHealthData, ProjectState } from '../../types';
import { AnalysisPipelineError, normalizeAnalysisRecord, runAnalysisOrchestration } from '../../services/analysisOrchestrationService';
import { loadLocalAnalysisUserConfig } from '../../services/localAnalysisConfigService';
import { fetchLocalAnalysisHealth } from '../../services/localAnalysisService';
import { INPUT_CLASS_NAME, PANEL_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME, SECONDARY_BUTTON_CLASS_NAME } from './constants';

interface BreakdownPanelProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
  onOpenLocalAnalysisSettings?: () => void;
}

const BreakdownPanel: React.FC<BreakdownPanelProps> = ({ project, updateProject, onGeneratingChange, onOpenLocalAnalysisSettings }) => {
  const shots = project.analysisData?.shots || [];
  const transcript = project.analysisData?.transcript;
  const score = project.analysisData?.score;
  const signals = project.analysisData?.viralSignals || [];
  const benchmarkImport = project.analysisData?.benchmarkImport;
  const [activeShotId, setActiveShotId] = useState<string | null>(shots[0]?.id || null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [enableSceneDetection, setEnableSceneDetection] = useState(true);
  const [localHealth, setLocalHealth] = useState<LocalAnalysisHealthData | null>(null);
  const [localHealthError, setLocalHealthError] = useState<string | null>(null);
  const [isCheckingLocalHealth, setIsCheckingLocalHealth] = useState(false);
  const analysisStatus = project.analysisData?.status || 'idle';
  const canRunAnalysis = project.analysisData?.source?.status === 'ready' && project.analysisData?.source?.kind !== 'benchmark';
  const localAnalysisConfig = loadLocalAnalysisUserConfig();

  const localAnalysisState = useMemo(() => {
    const raw = project.analysisData?.rawResponse;
    if (!raw) {
      return { mode: null as string | null, warnings: [] as string[], visionModel: null as string | null };
    }

    try {
      const parsed = JSON.parse(raw) as {
        mode?: string;
        localAnalysis?: { warnings?: string[] } | null;
        visionEnhancement?: { warnings?: string[]; model?: string } | null;
      };
      return {
        mode: parsed.mode || null,
        warnings: [
          ...(Array.isArray(parsed.localAnalysis?.warnings) ? parsed.localAnalysis.warnings.filter(Boolean) : []),
          ...(Array.isArray(parsed.visionEnhancement?.warnings) ? parsed.visionEnhancement.warnings.filter(Boolean) : []),
        ],
        visionModel: typeof parsed.visionEnhancement?.model === 'string' ? parsed.visionEnhancement.model : null,
      };
    } catch {
      return { mode: null as string | null, warnings: [] as string[], visionModel: null as string | null };
    }
  }, [project.analysisData?.rawResponse]);

  const activeShot = useMemo(() => shots.find((shot) => shot.id === activeShotId) || shots[0] || null, [shots, activeShotId]);

  const updateAnalysis = (updater: (prev: ProjectState) => ProjectState) => updateProject(updater);

  const handleCheckLocalHealth = async () => {
    setLocalHealthError(null);
    setIsCheckingLocalHealth(true);
    try {
      const health = await fetchLocalAnalysisHealth(loadLocalAnalysisUserConfig());
      setLocalHealth(health);
    } catch (healthError) {
      const message = healthError instanceof Error ? healthError.message : '本地环境检查失败，请稍后重试。';
      setLocalHealth(null);
      setLocalHealthError(message);
    } finally {
      setIsCheckingLocalHealth(false);
    }
  };

  const localSetupSummary = useMemo(() => {
    if (!localHealth) {
      return {
        title: '尚未检查本地环境',
        description: '先到“模型配置 → 全局配置 → 本地分析”填好工具路径，再回来检查。',
        toneClass: 'border-[var(--border-primary)] bg-[var(--bg-base)] text-[var(--text-tertiary)]',
      };
    }

    if (localHealth.whisper.available && (!enableSceneDetection || localHealth.sceneDetect.available)) {
      return {
        title: '本地分析主链路已就绪',
        description: enableSceneDetection
          ? '现在可以运行完整的 whisper.cpp + PySceneDetect 分析；如果视觉模型也可用，还会继续做语义增强。'
          : '现在可以运行 whisper.cpp 转录分析；你当前关闭了自动场景检测。',
        toneClass: 'border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]',
      };
    }

    return {
      title: '本地分析尚未完全就绪',
      description: '至少先把 whisper.cpp 可执行文件和模型文件配好；场景检测可以稍后再补。',
      toneClass: 'border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]',
    };
  }, [localHealth, enableSceneDetection]);

  const runAnalysis = async () => {
    setError(null);
    setIsRunning(true);
    onGeneratingChange?.(true);
    try {
      updateProject(prev => ({
        ...prev,
        analysisData: prev.analysisData
          ? {
              ...prev.analysisData,
              status: 'analyzing',
              updatedAt: Date.now(),
            }
          : prev.analysisData,
      }));

      const { record } = await runAnalysisOrchestration(project, { enableSceneDetection });
      updateProject(prev => ({
        ...prev,
        analysisData: {
          ...record,
          source: prev.analysisData?.source || record.source,
        },
      }));
      setActiveShotId(record.shots[0]?.id || null);
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : '分析失败，请稍后重试。';
      setError(message);
      if (analysisError instanceof AnalysisPipelineError && analysisError.partialRecord) {
        updateProject(prev => ({
          ...prev,
          analysisData: normalizeAnalysisRecord({
            ...analysisError.partialRecord,
            source: prev.analysisData?.source || analysisError.partialRecord.source || null,
            review: {
              ...(prev.analysisData?.review || { status: 'draft', userEdited: false, dirtyFields: [] }),
              status: 'draft',
            },
          }),
        }));
      } else {
        updateProject(prev => ({
          ...prev,
          analysisData: prev.analysisData
            ? {
                ...prev.analysisData,
                status: 'failed',
                updatedAt: Date.now(),
              }
            : prev.analysisData,
        }));
      }
    } finally {
      onGeneratingChange?.(false);
      setIsRunning(false);
    }
  };

  const updateShotField = (field: 'summary' | 'scriptSnippet' | 'visualNotes', value: string) => {
    if (!activeShot) return;
    updateAnalysis(prev => ({
      ...prev,
      analysisData: prev.analysisData
        ? {
            ...prev.analysisData,
            updatedAt: Date.now(),
            review: {
              ...prev.analysisData.review,
              userEdited: true,
              dirtyFields: Array.from(new Set([...(prev.analysisData.review.dirtyFields || []), `shots.${activeShot.id}.${field}`])),
            },
            shots: prev.analysisData.shots.map((shot) => (shot.id === activeShot.id ? { ...shot, [field]: value } : shot)),
          }
        : prev.analysisData,
    }));
  };

  const updateTranscript = (field: 'mergedScript' | 'summary', value: string) => {
    updateAnalysis(prev => ({
      ...prev,
      analysisData: prev.analysisData && prev.analysisData.transcript
        ? {
            ...prev.analysisData,
            updatedAt: Date.now(),
            review: {
              ...prev.analysisData.review,
              userEdited: true,
              dirtyFields: Array.from(new Set([...(prev.analysisData.review.dirtyFields || []), `transcript.${field}`])),
            },
            transcript: {
              ...prev.analysisData.transcript,
              [field]: value,
            },
          }
        : prev.analysisData,
    }));
  };

  const updateSignalEvidence = (signalId: string, value: string) => {
    updateAnalysis(prev => ({
      ...prev,
      analysisData: prev.analysisData
        ? {
            ...prev.analysisData,
            updatedAt: Date.now(),
            review: {
              ...prev.analysisData.review,
              userEdited: true,
              dirtyFields: Array.from(new Set([...(prev.analysisData.review.dirtyFields || []), `signals.${signalId}.evidence`])),
            },
            viralSignals: prev.analysisData.viralSignals.map((signal) => (signal.id === signalId ? { ...signal, evidence: value } : signal)),
          }
        : prev.analysisData,
    }));
  };

  return (
    <section className={PANEL_CLASS_NAME}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Breakdown</div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">镜头拆解与可编辑复核</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">运行结构化分析后，这里会产出镜头、脚本、爆款信号和可解释评分，并允许人工修订。</p>
        </div>
        <div className="flex gap-3">
          <button type="button" className={PRIMARY_BUTTON_CLASS_NAME} onClick={runAnalysis} disabled={isRunning || !canRunAnalysis}>
            <Wand2 className="mr-2 h-4 w-4" />{isRunning ? '分析中…' : project.analysisData?.source?.kind === 'benchmark' ? '需补充视频源' : '运行分析'}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={() => setActiveShotId(shots[0]?.id || null)} disabled={!shots.length}>
            <Film className="mr-2 h-4 w-4" />回到首镜头
          </button>
        </div>
      </div>

      {benchmarkImport && (
        <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm leading-7 text-[var(--warning)]">
          当前结果来自首页 YouTube 对标导入，可直接继续做镜头复核、模板沉淀和草稿派生；如需重新运行本地视频分析，请先补充可直接访问的视频文件直链或本地上传。
        </div>
      )}

      {analysisStatus === 'analyzing' && !isRunning && (
        <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          检测到上次分析在处理中断。现有已保存内容仍然保留，你可以直接重试继续分析。
        </div>
      )}

      {error && <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">{error}</div>}

      <div className="mt-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Windows 本地分析就绪状态</div>
            <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">
              工作站级工具路径和视觉模型已经移到「模型配置 → 全局配置 → 本地分析」。这里保留运行前检查和单次分析开关。
            </p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 text-xs leading-6 ${localSetupSummary.toneClass}`}>
            <div className="font-medium">{localSetupSummary.title}</div>
            <div>{localSetupSummary.description}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] px-4 py-3 text-sm leading-7 text-[var(--text-tertiary)]">
            <div className="font-medium text-[var(--text-primary)]">当前全局本地分析设置</div>
            <div className="mt-2">whisper 路径：{localAnalysisConfig.whisperBinaryPath || '未设置'}</div>
            <div>模型文件：{localAnalysisConfig.whisperModelPath || '未设置'}</div>
            <div>Python：{localAnalysisConfig.pythonBinaryPath || '未设置'}</div>
            <div>视觉模型：{localAnalysisConfig.visionModel || '未设置'}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] px-4 py-3 text-sm leading-7 text-[var(--text-tertiary)]">
            <div className="font-medium text-[var(--text-primary)]">本次运行开关</div>
            <label className="mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={enableSceneDetection}
                onChange={(e) => {
                  setEnableSceneDetection(e.target.checked);
                  setLocalHealth(null);
                  setLocalHealthError(null);
                }}
              />
              <span>启用自动场景检测（需要 Python + PySceneDetect；如果你先只想跑转录，可以先关闭）</span>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={onOpenLocalAnalysisSettings} disabled={!onOpenLocalAnalysisSettings}>
            打开本地分析设置
          </button>
          <button type="button" className={PRIMARY_BUTTON_CLASS_NAME} onClick={handleCheckLocalHealth} disabled={isCheckingLocalHealth}>
            {isCheckingLocalHealth ? '检查中…' : '检查本地环境'}
          </button>
        </div>

        {localHealthError && (
          <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm leading-7 text-[var(--warning)]">
            {localHealthError}
          </div>
        )}

        {localHealth && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] px-4 py-3 text-sm leading-7 text-[var(--text-tertiary)]">
              <div className="font-medium text-[var(--text-primary)]">whisper.cpp</div>
              <div className="mt-2">状态：{localHealth.whisper.available ? '已就绪' : '未就绪'}</div>
              <div>路径：{localHealth.whisper.binaryPath || '未填写'}</div>
              <div>模型：{localHealth.whisper.modelPath || '未填写'}</div>
              {!!localHealth.whisper.warnings[0] && <div className="mt-2 text-[var(--warning)]">{localHealth.whisper.warnings[0]}</div>}
            </div>
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] px-4 py-3 text-sm leading-7 text-[var(--text-tertiary)]">
              <div className="font-medium text-[var(--text-primary)]">PySceneDetect</div>
              <div className="mt-2">状态：{localHealth.sceneDetect.available ? '已就绪' : '未就绪'}</div>
              <div>命令：{localHealth.sceneDetect.command || '未填写'}</div>
              <div>当前平台：{localHealth.platform}</div>
              {!!localHealth.sceneDetect.warnings[0] && <div className="mt-2 text-[var(--warning)]">{localHealth.sceneDetect.warnings[0]}</div>}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs leading-6 text-[var(--text-muted)]">
          详细安装步骤见：<span className="font-mono">docs/local-analysis-windows.md</span>。工作站级路径和视觉模型请到「模型配置 → 全局配置 → 本地分析」维护。
        </div>
      </div>

      {analysisStatus === 'failed' && !!shots.length && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          <span>分析部分步骤失败，但已完成的镜头/脚本结果仍可继续查看与编辑。</span>
          <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={runAnalysis}>
            <Wand2 className="mr-2 h-4 w-4" />重试分析
          </button>
        </div>
      )}

      {localAnalysisState.mode === 'mock-fallback' && (
        <div className="mt-4 rounded-2xl border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-4 py-3 text-sm leading-7 text-[var(--text-tertiary)]">
          当前结果来自内置回退分析，说明本地 `whisper.cpp` 或 `PySceneDetect` 还未就绪，或本次本地分析没有成功返回可用结果。
        </div>
      )}

      {localAnalysisState.mode === 'local-analysis+vision' && (
        <div className="mt-4 rounded-2xl border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm leading-7 text-[var(--success)]">
          当前结果已叠加视觉语义增强{localAnalysisState.visionModel ? `（${localAnalysisState.visionModel}）` : ''}，镜头标题、摘要和画面备注会优先展示抽帧 + 多模态分析后的内容。
        </div>
      )}

      {!!localAnalysisState.warnings.length && (
        <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm leading-7 text-[var(--warning)]">
          {localAnalysisState.warnings[0]}
        </div>
      )}

      {!shots.length ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-primary)] px-5 py-8 text-sm leading-7 text-[var(--text-tertiary)]">
          准备好视频输入后，点击“运行分析”即可生成镜头切分、脚本摘要、爆款元素和模板候选结果。
        </div>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            {shots.map((shot, index) => {
              const isActive = activeShot?.id === shot.id;
              return (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => setActiveShotId(shot.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isActive ? 'border-[var(--accent-text)] bg-[var(--overlay-light)]' : 'border-[var(--border-primary)] bg-[var(--bg-base)] hover:border-[var(--border-secondary)]'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">Shot {index + 1}</span>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round((shot.endMs - shot.startMs) / 1000)}s</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{shot.title || `镜头 ${index + 1}`}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">{shot.summary}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-5">
            {activeShot && (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Film className="h-4 w-4" />当前镜头
                </div>
                <div className="mt-4 space-y-3">
                  <textarea className={`${INPUT_CLASS_NAME} min-h-[88px] resize-y`} value={activeShot.summary} onChange={(e) => updateShotField('summary', e.target.value)} />
                  <textarea className={`${INPUT_CLASS_NAME} min-h-[88px] resize-y`} value={activeShot.scriptSnippet || ''} onChange={(e) => updateShotField('scriptSnippet', e.target.value)} placeholder="镜头对应脚本/台词" />
                  <textarea className={`${INPUT_CLASS_NAME} min-h-[88px] resize-y`} value={activeShot.visualNotes || ''} onChange={(e) => updateShotField('visualNotes', e.target.value)} placeholder="镜头画面/风格备注" />
                </div>
              </div>
            )}

            {transcript && (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
                <div className="text-sm font-semibold text-[var(--text-primary)]">脚本与转录</div>
                <div className="mt-4 space-y-3">
                  <textarea className={`${INPUT_CLASS_NAME} min-h-[100px] resize-y`} value={transcript.summary} onChange={(e) => updateTranscript('summary', e.target.value)} />
                  <textarea className={`${INPUT_CLASS_NAME} min-h-[120px] resize-y`} value={transcript.mergedScript} onChange={(e) => updateTranscript('mergedScript', e.target.value)} />
                </div>
              </div>
            )}

            {!!signals.length && (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-4 w-4" />爆款信号
                </div>
                <div className="mt-4 space-y-3">
                  {signals.map((signal) => (
                    <div key={signal.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-3">
                      <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-primary)]">
                        <span>{signal.label}</span>
                        <span className="text-xs text-[var(--text-muted)]">{signal.category} · {signal.score ?? '--'}</span>
                      </div>
                      <textarea className={`${INPUT_CLASS_NAME} mt-3 min-h-[76px] resize-y`} value={signal.evidence} onChange={(e) => updateSignalEvidence(signal.id, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {score && (
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
                <div className="text-sm font-semibold text-[var(--text-primary)]">爆款评分：{score.overall}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">{score.rationale}</p>
                <div className="mt-4 space-y-3">
                  {score.factors.map((factor) => (
                    <div key={factor.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--text-primary)]">
                        <span>{factor.label}</span>
                        <span>{factor.score} × {factor.weight}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">{factor.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default BreakdownPanel;
