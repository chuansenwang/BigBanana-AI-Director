import React, { useEffect, useState } from 'react';
import { SearchCheck, Sparkles, LayoutPanelTop } from 'lucide-react';
import { ProjectState } from '../../types';
import {
  HERO_CLASS_NAME,
  SUBNAV_BUTTON_ACTIVE_CLASS_NAME,
  SUBNAV_BUTTON_BASE_CLASS_NAME,
  SUBNAV_BUTTON_INACTIVE_CLASS_NAME,
  SUBNAV_SHELL_CLASS_NAME,
} from './constants';
import IngestPanel from './IngestPanel';
import PanelCard from './PanelCard';
import BreakdownPanel from './BreakdownPanel';
import TemplatePanel from './TemplatePanel';
import ApplyPanel from './ApplyPanel';
import BenchmarkOverviewPanel from './BenchmarkOverviewPanel';

interface StageAnalysisProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
  onShowModelConfig?: () => void;
}

type AnalysisSubView = 'benchmark' | 'overview';

const SUB_VIEWS: Array<{
  id: AnalysisSubView;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    id: 'benchmark',
    label: '复刻对标',
    description: '进入参考视频拆解、模板沉淀与创作反哺流程。',
    icon: Sparkles,
  },
  {
    id: 'overview',
    label: '阶段概览',
    description: '查看前期方案沉淀下来的边界、路径与交付重点。',
    icon: LayoutPanelTop,
  },
];

const StageAnalysis: React.FC<StageAnalysisProps> = ({ project, updateProject, onGeneratingChange, onShowModelConfig }) => {
  const [activeSubView, setActiveSubView] = useState<AnalysisSubView>('benchmark');

  useEffect(() => {
    setActiveSubView('benchmark');
  }, [project.id]);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-8 py-8">
        <section className={HERO_CLASS_NAME}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                <SearchCheck className="h-3.5 w-3.5" />
                Analysis Stage
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-wide text-[var(--text-primary)]">视频风格分析工作台</h1>
                <p className="mt-2 max-w-4xl text-sm leading-7 text-[var(--text-tertiary)]">
                  这个工作台将承载视频输入、结构化拆解、爆款模板沉淀与创作草稿反哺。当前版本已经具备阶段接入、输入壳层与本地持久化边界，后续任务将继续补齐分析、模板与派生流程。
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-4 py-3 text-right">
              <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">当前集数</div>
              <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{project.title || '未命名项目'}</div>
            </div>
          </div>
        </section>

        <section className={SUBNAV_SHELL_CLASS_NAME}>
          <div className="grid gap-3 md:grid-cols-2">
            {SUB_VIEWS.map((view) => {
              const Icon = view.icon;
              const isActive = activeSubView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveSubView(view.id)}
                  aria-pressed={isActive}
                  className={`${SUBNAV_BUTTON_BASE_CLASS_NAME} ${isActive ? SUBNAV_BUTTON_ACTIVE_CLASS_NAME : SUBNAV_BUTTON_INACTIVE_CLASS_NAME}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
                  <span>
                    <span className="block font-medium text-xs tracking-wider uppercase">{view.label}</span>
                    <span className={`mt-1 block text-[10px] font-mono leading-5 ${isActive ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-muted)]'}`}>{view.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {activeSubView === 'benchmark' ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr_1fr]">
              <IngestPanel project={project} updateProject={updateProject} onGeneratingChange={onGeneratingChange} />
              <PanelCard eyebrow="Roadmap" title="后续能力补齐" description="下一批任务将继续把分析结果转成可保存模板、可编辑复核、可派生草稿的完整流。" bullets={[
                '分析编排与可解释评分',
                '模板库跨 episode 复用',
                '显式创建新的创作草稿',
              ]} />
              <PanelCard eyebrow="Status" title="当前状态" description="现已打通阶段接入、输入壳层、分析数据契约与模板库持久化边界，为后续完整工作流做准备。" bullets={[
                '路由与导航已接入',
                'source 持久化与本地恢复可用',
                'analysis / template / apply 数据结构已落地',
              ]} />
            </div>

            <BreakdownPanel
              project={project}
              updateProject={updateProject}
              onGeneratingChange={onGeneratingChange}
              onOpenLocalAnalysisSettings={onShowModelConfig}
            />
            <TemplatePanel project={project} />
            <ApplyPanel project={project} updateProject={updateProject} />
          </>
        ) : (
          <BenchmarkOverviewPanel />
        )}
      </div>
    </div>
  );
};

export default StageAnalysis;
