import { Readable } from 'node:stream';
import { createAgentMockHandler } from './agentMockHandler.mjs';
import { createAgentExecutorRuntime } from './executors/index.mjs';

export const createAgentRuntimeHandler = (options = {}) => {
  const runtime = options.executor
    ? {
        executor: options.executor,
        executorMode: options.executorMode || 'mock',
      }
    : createAgentExecutorRuntime(options.executorConfig);

  return createAgentMockHandler({
    executor: runtime.executor,
    runtimeMetadata: {
      executorMode: runtime.executorMode,
    },
  });
};

export const createMockRequest = ({ method = 'GET', url = '/', headers = {}, body } = {}) => {
  const stream = Readable.from(body ? [body] : []);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  stream.socket = { encrypted: false };
  return stream;
};
