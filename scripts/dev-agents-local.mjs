import { spawn } from 'node:child_process';

const runtimePort = process.env.AGENT_RUNTIME_PORT || '8796';
const devPort = process.env.PORT || process.env.VITE_PORT || '3000';
const isOpenCodeMode = process.argv.includes('--opencode');

const childProcesses = [];

const spawnCommand = (command, args, extraEnv = {}) => {
  const child = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
          ...process.env,
          ...extraEnv,
        },
      })
    : spawn(command, args, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
          ...process.env,
          ...extraEnv,
        },
      });
  childProcesses.push(child);
  return child;
};

const shutdown = (signal = 'SIGTERM') => {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(143);
});

const runtime = spawnCommand('npm', ['run', 'agent-runtime'], {
  AGENT_RUNTIME_HOST: '127.0.0.1',
  AGENT_RUNTIME_PORT: runtimePort,
  ...(isOpenCodeMode ? {
    AGENT_RUNTIME_EXECUTOR: 'opencode-cli',
    AGENT_RUNTIME_OPENCODE_ENABLE: 'true',
  } : {}),
});

runtime.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[dev:agents-local] agent-runtime exited with code ${code}`);
    shutdown('SIGTERM');
    process.exit(code);
  }
});

const vite = spawnCommand('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', devPort, '--strictPort'], {
  PORT: devPort,
  AGENT_GATEWAY_RUNTIME_MODE: 'forward',
  AGENT_GATEWAY_RUNTIME_BASE_URL: `http://127.0.0.1:${runtimePort}`,
  AGENT_GATEWAY_ALLOW_PRIVATE_HOSTS: 'true',
});

vite.on('exit', (code) => {
  shutdown('SIGTERM');
  process.exit(code ?? 0);
});
