import React, { useMemo, useState } from 'react';
import { Film, Sparkles, Wand2 } from 'lucide-react';
import { ProjectState } from '../../types';
import { AnalysisPipelineError, normalizeAnalysisRecord, runAnalysisOrchestration } from '../../services/analysisOrchestrationService';
import { INPUT_CLASS_NAME, PANEL_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME, SECONDARY_BUTTON_CLASS_NAME } from './constants';

interface BreakdownPanelProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

const BreakdownPanel: React.FC<BreakdownPanelProps> = ({ project, updateProject, onGeneratingChange }) => {
  const shots = project.analysisData?.shots || [];
  const transcript = project.analysisData?.transcript;
  const score = project.analysisData?.score;
  const signals = project.analysisData?.viralSignals || [];
  const [activeShotId, setActiveShotId] = useState<string | null>(shots[0]?.id || null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const analysisStatus = project.analysisData?.status || 'idle';

  const activeShot = useMemo(() => shots.find((shot) => shot.id === activeShotId) || shots[0] || null, [shots, activeShotId]);

  const updateAnalysis = (updater: (prev: ProjectState) => ProjectState) => updateProject(updater);

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

      const { record } = await runAnalysisOrchestration(project);
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
          <button type="button" className={PRIMARY_BUTTON_CLASS_NAME} onClick={runAnalysis} disabled={isRunning || project.analysisData?.source?.status !== 'ready'}>
            <Wand2 className="mr-2 h-4 w-4" />{isRunning ? '分析中…' : '运行分析'}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={() => setActiveShotId(shots[0]?.id || null)} disabled={!shots.length}>
            <Film className="mr-2 h-4 w-4" />回到首镜头
          </button>
        </div>
      </div>

      {analysisStatus === 'analyzing' && !isRunning && (
        <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          检测到上次分析在处理中断。现有已保存内容仍然保留，你可以直接重试继续分析。
        </div>
      )}

      {error && <div className="mt-4 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">{error}</div>}

      {analysisStatus === 'failed' && !!shots.length && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          <span>分析部分步骤失败，但已完成的镜头/脚本结果仍可继续查看与编辑。</span>
          <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={runAnalysis}>
            <Wand2 className="mr-2 h-4 w-4" />重试分析
          </button>
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
