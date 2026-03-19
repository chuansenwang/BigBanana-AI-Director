import React, { useMemo, useState } from 'react';
import { LibraryBig, Save, Search } from 'lucide-react';
import { ProjectState, ViralTemplateRecord, ViralTemplateType } from '../../types';
import { useProjectContext } from '../../contexts/ProjectContext';
import { INPUT_CLASS_NAME, PANEL_CLASS_NAME, SECONDARY_BUTTON_CLASS_NAME } from './constants';

interface TemplatePanelProps {
  project: ProjectState;
}

const typeOptions: Array<{ value: 'all' | ViralTemplateType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '整条视频' },
  { value: 'hook', label: 'Hook' },
  { value: 'shot', label: '镜头' },
  { value: 'script', label: '脚本' },
  { value: 'rhythm', label: '节奏' },
  { value: 'emotion', label: '情绪' },
];

const TemplatePanel: React.FC<TemplatePanelProps> = ({ project }) => {
  const { project: projectContext, updateProject } = useProjectContext();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ViralTemplateType>('all');

  const candidateTemplates = project.analysisData?.templateCandidates || [];
  const library = projectContext?.viralTemplateLibrary || [];

  const filteredLibrary = useMemo(() => {
    return library.filter((item) => {
      const matchesType = filter === 'all' || item.type === filter;
      const matchesSearch = !search.trim() || `${item.title} ${item.description} ${item.payload.tags.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [filter, library, search]);

  const saveCandidate = (candidate: ViralTemplateRecord) => {
    updateProject({
      viralTemplateLibrary: [
        ...library.filter((item) => item.id !== candidate.id),
        { ...candidate, updatedAt: Date.now() },
      ],
    });
  };

  const updateLibraryItem = (id: string, patch: Partial<ViralTemplateRecord>) => {
    updateProject({
      viralTemplateLibrary: library.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)),
    });
  };

  return (
    <section className={PANEL_CLASS_NAME}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Template</div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">爆款模板库</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">把分析结果沉淀为项目级模板，并在同一项目的其他 episode 里复用。</p>
        </div>
        <LibraryBig className="h-5 w-5 text-[var(--accent-text)]" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[var(--text-primary)]">候选模板</div>
          {!candidateTemplates.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-primary)] px-4 py-6 text-sm leading-7 text-[var(--text-tertiary)]">运行分析后，这里会出现可保存到项目模板库的候选模板。</div>
          ) : candidateTemplates.map((candidate) => (
            <div key={candidate.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{candidate.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{candidate.type}</div>
                </div>
                <button type="button" className={SECONDARY_BUTTON_CLASS_NAME} onClick={() => saveCandidate(candidate)}>
                  <Save className="mr-2 h-4 w-4" />保存
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-tertiary)]">{candidate.description}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input className={`${INPUT_CLASS_NAME} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模板标题、描述或标签" />
            </div>
            <select className={INPUT_CLASS_NAME} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | ViralTemplateType)}>
              {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {filteredLibrary.length ? filteredLibrary.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--overlay-light)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.type} · {item.source.sourceTitle || item.source.sourceUrl || 'unknown source'}</div>
                  {typeof item.score === 'number' && <div className="text-sm font-medium text-[var(--text-primary)]">{item.score}</div>}
                </div>
                <input className={`${INPUT_CLASS_NAME} mt-3`} value={item.title} onChange={(e) => updateLibraryItem(item.id, { title: e.target.value })} />
                <textarea className={`${INPUT_CLASS_NAME} mt-3 min-h-[90px] resize-y`} value={item.description} onChange={(e) => updateLibraryItem(item.id, { description: e.target.value })} />
                <div className="mt-3 text-xs leading-6 text-[var(--text-tertiary)]">标签：{item.payload.tags.join(' / ')}</div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-primary)] px-4 py-6 text-sm leading-7 text-[var(--text-tertiary)]">当前项目还没有匹配的模板记录。</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TemplatePanel;
