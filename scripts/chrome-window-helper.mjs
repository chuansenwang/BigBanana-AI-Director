import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const usage = 'Usage: node scripts/chrome-window-helper.mjs <list|activate> [--index <number> | --title <substring>]';

const fail = (message, exitCode = 1) => {
  console.error(message);
  process.exit(exitCode);
};

const parseArgs = (argv) => {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    return { help: true };
  }

  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === '--index' || token === '--title') {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for ${token}`);
      }
      const optionName = token.slice(2);
      if (Object.hasOwn(options, optionName)) {
        throw new Error(`Duplicate argument: ${token}`);
      }
      options[optionName] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return { command, options };
};

const buildPowerShellScript = (mode) => `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class User32 {
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

try {
function Get-ChromeWindows {
  $windows = Get-Process -Name chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } |
    Where-Object { [User32]::IsWindowVisible([IntPtr]$_.MainWindowHandle) } |
    ForEach-Object {
      [pscustomobject]@{
        handle = [int64]$_.MainWindowHandle
        title = $_.MainWindowTitle
        pid = $_.Id
      }
    } |
    Sort-Object -Property @{ Expression = { $_.title.ToLowerInvariant() } }, @{ Expression = { $_.handle } }

  $index = 0
  foreach ($window in $windows) {
    $window | Add-Member -NotePropertyName index -NotePropertyValue $index
    $index += 1
  }

  return @($windows)
}

$windows = Get-ChromeWindows

if ($windows.Count -eq 0) {
  throw 'No visible Chrome windows with non-empty titles were found.'
}

if ('${mode}' -eq 'list') {
  [pscustomobject]@{ windows = $windows } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

$selectionJson = $env:CHROME_WINDOW_SELECTION
if ([string]::IsNullOrWhiteSpace($selectionJson)) {
  throw 'Missing activation selection payload.'
}

$selection = $selectionJson | ConvertFrom-Json
$matches = @()

if ($null -ne $selection.index) {
  $requestedIndex = [int]$selection.index
  $matches = @($windows | Where-Object { $_.index -eq $requestedIndex })
} elseif ($null -ne $selection.title) {
  $requestedTitle = [string]$selection.title
  $matches = @($windows | Where-Object { $_.title.IndexOf($requestedTitle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 })
} else {
  throw 'Activation requires either an index or a title substring.'
}

if ($matches.Count -eq 0) {
  throw 'No Chrome window matched the requested selector.'
}

if ($matches.Count -gt 1) {
  throw ('Title selector is ambiguous and matched {0} windows.' -f $matches.Count)
}

$target = $matches[0]
$targetHandle = [IntPtr]$target.handle

if ([User32]::IsIconic($targetHandle)) {
  [void][User32]::ShowWindowAsync($targetHandle, 9)
} else {
  [void][User32]::ShowWindowAsync($targetHandle, 5)
}

if (-not [User32]::SetForegroundWindow($targetHandle)) {
  throw 'Failed to bring the Chrome window to the foreground.'
}

[pscustomobject]@{
  activated = $true
  window = $target
} | ConvertTo-Json -Depth 4 -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

const runPowerShell = async (mode, selection) => {
  const script = buildPowerShellScript(mode);
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
  const env = { ...process.env };

  if (selection) {
    env.CHROME_WINDOW_SELECTION = JSON.stringify(selection);
  }

  try {
    const { stdout, stderr } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand,
    ], {
      env,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    if (stderr && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    const parsed = JSON.parse(stdout.trim());

    if (mode === 'list') {
      const windows = parsed.windows === undefined
        ? []
        : Array.isArray(parsed.windows)
          ? parsed.windows
          : [parsed.windows];

      return { windows };
    }

    return parsed;
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
    const detail = stderr || stdout || error.message;
    throw new Error(detail);
  }
};

const getActivationSelection = (options) => {
  const hasIndex = Object.hasOwn(options, 'index');
  const hasTitle = Object.hasOwn(options, 'title');

  if (hasIndex === hasTitle) {
    throw new Error('Activation requires exactly one of --index or --title.');
  }

  if (hasIndex) {
    if (!/^\d+$/.test(options.index)) {
      throw new Error('--index must be a non-negative integer.');
    }

    return { index: Number(options.index) };
  }

  if (!options.title.trim()) {
    throw new Error('--title must not be empty.');
  }

  return { title: options.title };
};

const validateListOptions = (options) => {
  if (Object.keys(options).length > 0) {
    throw new Error('The list command does not accept --index or --title.');
  }
};

const main = async () => {
  if (process.platform !== 'win32') {
    fail('This helper only runs on Windows.');
  }

  let parsed;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(`${error.message}\n${usage}`);
  }

  if (parsed.help) {
    console.log(usage);
    return;
  }

  const { command, options } = parsed;

  if (command !== 'list' && command !== 'activate') {
    fail(`Unknown command: ${command}\n${usage}`);
  }

  try {
    if (command === 'list') {
      validateListOptions(options);
    }

    const result = command === 'list'
      ? await runPowerShell('list')
      : await runPowerShell('activate', getActivationSelection(options));

    console.log(JSON.stringify(result));
  } catch (error) {
    fail(error.message);
  }
};

await main();
