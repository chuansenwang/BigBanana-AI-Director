import React, { useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '../../contexts/ProjectContext';
import { ProjectState } from '../../types';
import { applyDerivedDraftToEpisode, buildDerivedEpisodeDraft } from '../../services/analysisDraftService';
import { saveEpisode } from '../../services/storageService';
import { PANEL_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME, SECONDARY_BUTTON_CLASS_NAME } from './constants';

interface ApplyPanelProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
}

const ApplyPanel: React.FC<ApplyPanelProps> = ({ project, updateProject }) => {
  const navigate = useNavigate();
  const { createEpisode } = useProjectContext();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!project.analysisData?.shots.length || !project.analysisData?.transcript) return null;
    return buildDerivedEpisodeDraft(project);
  }, [project]);

  const handleCreateDraft = async () => {
    if (!preview) return;
    setError(null);
    setIsCreating(true);
    try {
      const draftEpisode = await createEpisode(project.seriesId, preview.title);
      const appliedEpisode = applyDerivedDraftToEpisode(draftEpisode, preview);
      await saveEpisode(appliedEpisode);

      updateProject(prev => ({
        ...prev,
        analysisData: prev.analysisData
          ? {
              ...prev.analysisData,
              updatedAt: Date.now(),
              derivedDraft: {
                title: preview.title,
                draftEpisodeId: appliedEpisode.id,
                rawScript: preview.rawScript,
                summary: prev.analysisData.transcript?.summary,
                mappedShotIds: prev.analysisData.shots.map((shot) => shot.id),
                shotCount: prev.analysisData.shots.length,
              },
              applyHistory: [
                ...prev.analysisData.applyHistory,
                {
                  id: `apply_${Date.now().toString(36)}`,
                  createdAt: Date.now(),
                  target: 'script+director',
                  summary: `创建新草稿《${preview.title}》并写入 Script / Director 初始内容。`,
                  draftEpisodeId: appliedEpisode.id,
                  draftEpisodeTitle: preview.title,
                  templateIds: (prev.analysisData.templateCandidates || []).map((item) => item.id),
                },
              ],
            }
          : prev.analysisData,
      }));

      navigate(`/project/${appliedEpisode.projectId}/episode/${appliedEpisode.id}`);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : '创建草稿失败，请稍后重试。');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className={PANEL_CLASS_NAME}>
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Apply</div>
      <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">创作反哺</h2>
      <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">将分析结果显式转换为一个新的 Episode 草稿，并保留应用历史，避免覆盖当前创作内容。</p>

      {!preview ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-primary)] px-4 py-6 text-sm leading-7 text-[var(--text-tertiary)]">
          先完成一次分析，生成镜头与脚本摘要后，才能创建新的 Script / Director 草稿。
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <FileText className="h-4 w-4" />草稿预览
            </div>
            <div className="mt-3 space-y-2 text-sm text-[var(--text-tertiary)]">
              <div>标题：{preview.title}</div>
              <div>镜头数：{preview.shots.length}</div>
              <div>脚本摘要：{preview.scriptData.logline}</div>
            </div>
          </div>

          {project.analysisData?.applyHistory?.length ? (
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Clapperboard className="h-4 w-4" />已创建历史
              </div>
              <div className="mt-3 space-y-3">
                {project.analysisData.applyHistory.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] p-3 text-sm text-[var(--text-tertiary)]">
                    <div className="font-medium text-[var(--text-primary)]">{entry.draftEpisodeTitle || '未命名草稿'}</div>
                    <div className="mt-1">{entry.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error && <div className="rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">{error}</div>}

          <div className="flex flex-wrap gap-3">
            <button type="button" className={PRIMARY_BUTTON_CLASS_NAME} disabled={isCreating} onClick={handleCreateDraft}>
              <ArrowRight className="mr-2 h-4 w-4" />{isCreating ? '创建中…' : '创建新的 Episode 草稿'}
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={() => navigate(`/project/${project.projectId}`)}>
              返回项目概览
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ApplyPanel;
