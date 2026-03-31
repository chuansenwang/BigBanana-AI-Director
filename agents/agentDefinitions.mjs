export const AGENT_DEFINITIONS = [
  {
    key: 'sisyphus',
    label: 'Sisyphus',
    description: 'Ultraworker orchestrator，适合统筹复杂任务与跨阶段执行。',
    tone: 'orchestration',
    cliName: 'Sisyphus',
  },
  {
    key: 'hephaestus',
    label: 'Hephaestus',
    description: 'Deep Agent，适合需要深挖上下文和自主推进的任务。',
    tone: 'deep-work',
    cliName: 'Hephaestus',
  },
  {
    key: 'prometheus',
    label: 'Prometheus',
    description: 'Plan Builder，适合规划拆解与工作流设计。',
    tone: 'planning',
    cliName: 'Prometheus',
  },
  {
    key: 'atlas',
    label: 'Atlas',
    description: 'Plan Executor，适合根据既定计划推进执行。',
    tone: 'execution',
    cliName: 'Atlas',
  },
];

export const findAgentDefinition = (agentKey) => AGENT_DEFINITIONS.find((agent) => agent.key === agentKey) || null;
