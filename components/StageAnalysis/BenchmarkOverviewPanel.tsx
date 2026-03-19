import React from 'react';
import PanelCard from './PanelCard';

const BenchmarkOverviewPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <PanelCard
          eyebrow="复刻路径"
          title="复刻对标执行漏斗"
          description="复刻对标沿用现有视频分析工作流：先引入样本视频，再完成结构化拆解、模板沉淀和创作反哺。这样可以在同一 stage 内完成从对标研究到草稿派生的闭环。"
          bullets={[
            '视频输入：直链或本地上传',
            '结构拆解：镜头 / 节奏 / 台词 / 信号',
            '模板沉淀：Hook / Shot / Script / Rhythm',
            '创作反哺：生成新的草稿 episode',
          ]}
        />
        <PanelCard
          eyebrow="状态边界"
          title="分析数据如何落库"
          description="notepad 里确认的边界是：analysis 数据保持 episode 级，复用模板进入 project 级库，避免临时候选和长期资产混在一起。"
          bullets={[
            'episode.analysisData 保存输入源与分析结果',
            'SeriesProject.viralTemplateLibrary 保存可复用模板',
            '依赖现有 autosave，无需独立保存流程',
            'applyHistory 记录复刻结果派生轨迹',
          ]}
        />
        <PanelCard
          eyebrow="验证策略"
          title="复刻对标的交付约束"
          description="前期结论强调：先保证输入校验、失败恢复和 reload 后状态可恢复，再继续加深分析精度。这个视图用于把这些实现约束显式呈现给创作者。"
          bullets={[
            '拒绝 YouTube / TikTok 页面链接',
            '分析失败保留部分产物并支持重试',
            'reload 后恢复 source / review / template 状态',
            '优先保证可解释评分和可编辑复核',
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PanelCard
          eyebrow="当前可做"
          title="这一版复刻对标已经具备什么"
          description="现有分析 stage 已经完成阶段接入、输入壳层、本地持久化边界和模板/反哺面板，因此可以直接承载复刻对标流程。"
          bullets={[
            '进入分析 stage 后即可输入参考视频',
            'Breakdown 面板承接可编辑拆解结果',
            'Template 面板沉淀对标抽象模板',
            'Apply 面板将结果反哺为新的草稿',
          ]}
        />
        <PanelCard
          eyebrow="后续增强"
          title="下一步最适合增强的能力"
          description="notepad 的学习记录已经把后续优先级说清楚：先补强编排与评分解释，再继续丰富模板复用与派生草稿质量。"
          bullets={[
            '分析编排与 explainable score',
            '跨 episode 模板复用与来源追踪',
            '更完整的 draft 反哺与跳转闭环',
            '更稳定的 upload / quota 失败恢复 QA',
          ]}
        />
      </div>
    </div>
  );
};

export default BenchmarkOverviewPanel;
