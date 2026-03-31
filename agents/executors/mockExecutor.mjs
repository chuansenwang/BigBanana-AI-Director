export const createMockExecutor = () => ({
  startRun({ session, helpers }) {
    const assistantMessageId = helpers.createEntityId('msg');
    const toolCallId = helpers.createEntityId('tool');
    const summaryText = '中段节奏存在重复表达，建议压缩 2 个镜头并把转折动作前置。';

    const schedule = (delayMs, callback) => {
      const timer = setTimeout(() => {
        callback();
      }, delayMs);
      helpers.registerCleanup(() => clearTimeout(timer));
    };

    helpers.emit({ type: 'run_status', status: 'queued' });

    schedule(120, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({ type: 'run_status', status: 'running' });
    });

    schedule(260, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'tool_start',
        toolCallId,
        toolName: 'context_loader',
        summary: '整理当前作用范围的基础上下文',
      });
    });

    schedule(420, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'tool_end',
        toolCallId,
        toolName: 'context_loader',
        summary: session.scope.kind === 'episode'
          ? '已准备当前分集上下文快照'
          : session.scope.kind === 'project'
            ? '已准备当前项目摘要'
            : '已准备全局工作台上下文',
      });
    });

    schedule(560, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'message_start',
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: helpers.now(),
          status: 'streaming',
        },
      });
    });

    schedule(760, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'message_delta',
        messageId: assistantMessageId,
        delta: '我已经整理了当前上下文，',
      });
    });

    schedule(960, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'message_delta',
        messageId: assistantMessageId,
        delta: summaryText,
      });
    });

    schedule(1160, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'artifact_ready',
        artifact: helpers.createReportArtifact('智能体建议摘要', summaryText),
      });
    });

    schedule(1360, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({ type: 'message_done', messageId: assistantMessageId });
    });

    schedule(1480, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({
        type: 'usage',
        usage: {
          promptTokens: 128,
          completionTokens: 84,
          totalTokens: 212,
          toolCalls: 1,
          elapsedMs: 1400,
        },
      });
    });

    schedule(1560, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({ type: 'run_status', status: 'completed' });
    });

    schedule(1640, () => {
      if (helpers.isCancelled()) return;
      helpers.emit({ type: 'done' });
    });
  },
});
