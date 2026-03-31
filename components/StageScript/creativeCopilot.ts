export type CreativeCopilotRole = 'assistant' | 'user';

export interface CreativeCopilotMessage {
  id: string;
  role: CreativeCopilotRole;
  content: string;
}

export interface CreativeCopilotStarterPrompt {
  id: string;
  label: string;
  prompt: string;
}

export const CREATIVE_COPILOT_STARTER_PROMPTS: CreativeCopilotStarterPrompt[] = [
  {
    id: 'opening-hook',
    label: '开场三秒更抓人',
    prompt: '帮我想一版更抓人的开场前三秒，要有立刻吸引观众继续看下去的钩子。'
  },
  {
    id: 'conflict-upgrade',
    label: '强化冲突升级',
    prompt: '帮我拆一下这段戏的冲突升级节奏，看看哪里还能更紧、更有压迫感。'
  },
  {
    id: 'character-motivation',
    label: '补强人物动机',
    prompt: '从人物目标、阻力和情绪变化三个角度，帮我补强这段戏的人物动机。'
  },
  {
    id: 'visual-language',
    label: '更有画面感',
    prompt: '请把这段内容往更有画面感、更适合分镜拆解的方向给我一些创意建议。'
  }
];

const clipText = (value: string, maxLength = 88): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
};

const containsAny = (value: string, keywords: string[]): boolean =>
  keywords.some((keyword) => value.includes(keyword));

const buildSelectionSummary = (selectedText: string): string => {
  const normalizedSelection = selectedText.trim();
  if (!normalizedSelection) {
    return '当前没有锁定选段，我会先按整场戏的创作目标来给建议。';
  }

  return `我会优先围绕你当前锁定的片段来想：\n“${clipText(normalizedSelection)}”`;
};

const buildSuggestionLines = (prompt: string, selectedText: string): string[] => {
  const normalizedPrompt = prompt.trim().toLowerCase();
  const hasSelection = selectedText.trim().length > 0;

  if (containsAny(normalizedPrompt, ['开场', '前三秒', 'hook', '钩子'])) {
    return [
      '先把最反常、最危险或最有悬念的信息提前，不要让观众先等背景介绍。',
      hasSelection
        ? '如果就改当前选段，优先让第一句里出现动作、反差或结果，减少铺垫句。'
        : '给主角一个立刻可见的处境压力，让观众先看到问题，再慢慢理解原因。',
      '结尾最好挂一个未回答的问题，逼着观众继续往下看。'
    ];
  }

  if (containsAny(normalizedPrompt, ['冲突', '节奏', '升级', '反转'])) {
    return [
      '确认这一段里谁最想达成目标、谁在阻拦，把对抗写成连续加码而不是一次性爆发。',
      hasSelection
        ? '围绕当前选段，可以把情绪变化拆成“试探 → 受阻 → 失控”三拍，推进会更清晰。'
        : '每一小段都要有代价变化，最好让局面比上一拍更糟一点。',
      '如果要做反转，尽量让反转来自人物选择，而不是单纯补充设定。'
    ];
  }

  if (containsAny(normalizedPrompt, ['人物', '角色', '动机', '关系', '情绪'])) {
    return [
      '先写清角色此刻最想要什么，再决定他说话是争取、掩饰还是试探。',
      hasSelection
        ? '当前选段可以补一个更具体的情绪触发点，让人物反应不只是“生气/难过”，而是有原因的。'
        : '给人物一个只属于他的表达习惯，关系张力会更容易立住。',
      '重要对白前后最好带一个动作或停顿，让情绪落在画面里。'
    ];
  }

  if (containsAny(normalizedPrompt, ['对白', '台词', '对话'])) {
    return [
      '把解释性台词再压缩一点，尽量让人物通过对抗和回避来暴露信息。',
      hasSelection
        ? '如果你要改当前选段，可以优先删掉最直白的判断句，把潜台词留给动作和语气。'
        : '让每个人的说话节奏不同：有人短促、有人绕弯、有人故意不说完。',
      '一句真正有效的台词，最好同时推动关系和信息，而不是只做说明。'
    ];
  }

  if (containsAny(normalizedPrompt, ['画面', '镜头', '分镜', '视觉'])) {
    return [
      '把抽象感受改写成可以拍到的动作、视线、环境变化，分镜会更容易拆。',
      hasSelection
        ? '当前选段适合先找一个“主动作”和一个“情绪细节”，这样画面焦点会更稳。'
        : '每段戏尽量只保留一个最值得被镜头强调的视觉点，不要平均发力。',
      '如果需要电影感，可以加入前景遮挡、空间反差或动作节奏变化。'
    ];
  }

  return [
    '先确认这一段最重要的戏剧任务：抛信息、推关系、造悬念，三者里尽量只抓一个主目标。',
    hasSelection
      ? '结合当前选段，我会建议你优先增强动作触发和情绪转折，让这段更容易成立。'
      : '如果还没锁定选段，可以先挑最关键的一场戏，我们再往下细化。',
    '你接下来可以继续让我从节奏、人物、对白或镜头化表达任一方向继续展开。'
  ];
};

export const createCreativeCopilotMessage = (
  role: CreativeCopilotRole,
  content: string,
  sequence: number
): CreativeCopilotMessage => ({
  id: `creative-copilot-${role}-${sequence}`,
  role,
  content,
});

export const createInitialCreativeCopilotMessages = (): CreativeCopilotMessage[] => [
  createCreativeCopilotMessage(
    'assistant',
    '这里是本地创意副驾 MVP。你可以让我陪你拆开场钩子、人物动机、冲突节奏或镜头化表达；它只负责聊天，不会自动改动剧本。',
    0
  )
];

export const buildCreativeCopilotReply = (prompt: string, selectedText: string): string => {
  const safePrompt = prompt.trim();
  const suggestionLines = buildSuggestionLines(safePrompt, selectedText);

  return [
    `收到，我先按“${safePrompt}”这个方向陪你拆。`,
    buildSelectionSummary(selectedText),
    '我建议你先这样处理：',
    ...suggestionLines.map((line, index) => `${index + 1}. ${line}`),
    '如果你愿意，下一轮我可以继续把这条思路细化成“场面调度 / 情绪推进 / 对白口吻”其中一条。'
  ].join('\n\n');
};
