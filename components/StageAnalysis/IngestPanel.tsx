import React, { useRef, useState } from 'react';
import { FileUp, Link2, Loader2, RefreshCw, CheckCircle2, AlertTriangle, DatabaseZap, CircleAlert } from 'lucide-react';
import { ProjectState, VideoAnalysisRecord } from '../../types';
import { ingestAnalysisUpload, ingestAnalysisVideoUrl } from '../../services/analysisIngestionService';
import { INPUT_CLASS_NAME, PANEL_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME, SECONDARY_BUTTON_CLASS_NAME } from './constants';

interface IngestPanelProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

const IngestPanel: React.FC<IngestPanelProps> = ({ project, updateProject, onGeneratingChange }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [directUrl, setDirectUrl] = useState(project.analysisData?.source?.kind === 'url' ? project.analysisData.source.originalUrl || '' : '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const persistSource = (nextSource: Pick<VideoAnalysisRecord, 'source' | 'status'>) => {
    updateProject(prev => ({
      ...prev,
      analysisData: {
        source: nextSource?.source ?? null,
        status: nextSource?.status ?? 'idle',
        createdAt: prev.analysisData?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        rawResponse: prev.analysisData?.rawResponse || null,
        shots: prev.analysisData?.shots || [],
        transcript: prev.analysisData?.transcript || null,
        viralSignals: prev.analysisData?.viralSignals || [],
        score: prev.analysisData?.score || null,
        review: prev.analysisData?.review || { status: 'draft', userEdited: false, dirtyFields: [] },
        derivedDraft: prev.analysisData?.derivedDraft || null,
        templateCandidates: prev.analysisData?.templateCandidates || [],
        applyHistory: prev.analysisData?.applyHistory || [],
        benchmarkImport: nextSource?.source?.kind === 'benchmark' ? prev.analysisData?.benchmarkImport || null : null,
      },
    }));
  };

  const handleUrlSubmit = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    onGeneratingChange?.(true);
    try {
      const result = await ingestAnalysisVideoUrl(directUrl, { projectId: project.projectId || project.id, episodeId: project.id });
      persistSource({ source: result.source, status: result.source.status === 'ready' ? 'ready' : 'failed' });
      setLocalError(result.source.error || result.warnings[0] || null);
    } finally {
      onGeneratingChange?.(false);
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (source?.kind === 'url' || directUrl.trim()) {
      await handleUrlSubmit();
      return;
    }
    setLocalError('上传文件无法自动重试，请重新选择文件。');
  };

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setIsSubmitting(true);
    setLocalError(null);
    onGeneratingChange?.(true);
    try {
      const result = await ingestAnalysisUpload(file, { projectId: project.projectId || project.id, episodeId: project.id });
      persistSource({ source: result.source, status: result.source.status === 'ready' ? 'ready' : 'failed' });
      setLocalError(result.source.error || result.warnings[0] || null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      onGeneratingChange?.(false);
      setIsSubmitting(false);
    }
  };

  const source = project.analysisData?.source;
  const benchmarkImport = project.analysisData?.benchmarkImport;
  const sourceStatus = source?.status || 'idle';
  const isReady = sourceStatus === 'ready';
  const statusIcon = isReady ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />;
  const hasStorageFallbackWarning = Boolean(localError && (localError.includes('存储') || localError.includes('持久化') || localError.includes('OPFS')));

  return (
    <section className={PANEL_CLASS_NAME}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]">Ingest</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">输入可直接访问的视频直链，或上传本地视频文件并持久化到本地工作区。</p>
        </div>
        {isSubmitting && <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-text)]" />}
      </div>

      <div className="mt-5 space-y-4">
        {!source && !localError && !isSubmitting && (
          <div className="rounded-2xl border border-dashed border-[var(--border-primary)] px-4 py-5 text-sm leading-7 text-[var(--text-tertiary)]">
            还没有接入分析素材。你可以粘贴可直接访问的视频文件直链，或上传本地 mp4 / mov / webm 文件开始分析。
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">Direct video URL</label>
          <div className="flex gap-3">
            <input className={INPUT_CLASS_NAME} placeholder="https://cdn.example.com/demo.mp4" value={directUrl} onChange={(e) => setDirectUrl(e.target.value)} />
            <button type="button" className={PRIMARY_BUTTON_CLASS_NAME} onClick={handleUrlSubmit} disabled={isSubmitting}>
              <Link2 className="mr-2 h-4 w-4" />接入直链
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-[0.22em] text-[var(--text-muted)]">Local upload</label>
          <div className="flex gap-3">
            <input ref={fileInputRef} className={`${INPUT_CLASS_NAME} file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--overlay-medium)] file:px-3 file:py-2 file:text-sm file:text-[var(--text-primary)]`} type="file" accept="video/*,.mp4,.mov,.webm,.m4v,.ogv" onChange={(e) => handleUpload(e.target.files?.[0])} />
            <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
              <FileUp className="mr-2 h-4 w-4" />选择文件
            </button>
          </div>
        </div>

        {(source || localError) && (
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              {statusIcon}
              <span>当前输入状态：{sourceStatus}</span>
            </div>
            {source && (
              <div className="mt-3 grid gap-2 text-sm text-[var(--text-tertiary)] md:grid-cols-2">
                <div>类型：{source.kind === 'url' ? '直链' : source.kind === 'upload' ? '上传文件' : '对标导入'}</div>
                <div>标题：{source.title || source.fileName || '未命名视频'}</div>
                <div className="truncate">媒体引用：{source.persistedVideoRef || (source.kind === 'benchmark' ? '对标导入，无本地视频文件' : '未持久化')}</div>
                <div>MIME：{source.mimeType || '未知'}</div>
              </div>
            )}
            {benchmarkImport && (
              <div className="mt-3 rounded-2xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-sm leading-6 text-[var(--warning)]">
                <div>当前内容来自首页 YouTube 对标导入。</div>
                {benchmarkImport.analysisBasis ? <div className="mt-1">分析依据：{benchmarkImport.analysisBasis}</div> : null}
                {benchmarkImport.warnings.length > 0 ? <div className="mt-1">提示：{benchmarkImport.warnings[0]}</div> : <div className="mt-1">如需重新运行本地视频分析，请补充可直接访问的视频文件直链或本地上传。</div>}
              </div>
            )}
            {isSubmitting && (
              <div className="mt-3 flex items-center gap-2 text-sm leading-6 text-[var(--accent-text)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在验证视频链接/文件并准备本地持久化…
              </div>
            )}
            {localError && (
              <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${hasStorageFallbackWarning ? 'border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]' : 'border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]'}`}>
                <div className="flex items-start gap-2">
                  {hasStorageFallbackWarning ? <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{localError}</span>
                </div>
              </div>
            )}
            {sourceStatus === 'failed' && (
              <button type="button" className={`${SECONDARY_BUTTON_CLASS_NAME} mt-4`} onClick={handleRetry} disabled={isSubmitting}>
                <RefreshCw className="mr-2 h-4 w-4" />重试当前输入
              </button>
            )}
            {source && (
              <button type="button" className="mt-4 inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={() => { setDirectUrl(''); setLocalError(null); persistSource({ source: null, status: 'idle' }); }}>
                <RefreshCw className="h-3.5 w-3.5" />重置输入
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default IngestPanel;
