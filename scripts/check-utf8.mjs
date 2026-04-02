import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const SKIP_DIRS = new Set([
  '.git',
  '.sisyphus',
  'dist',
  'node_modules',
  'coverage',
  '.idea',
  '.vscode',
]);

const TEXT_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.txt',
  '.yml',
  '.yaml',
  '.svg',
  '.csv',
  '.env',
]);

const TEXT_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'README',
  'README.md',
  'LICENSE',
]);

const INVALID_BOMS = [
  Buffer.from([0xff, 0xfe]),
  Buffer.from([0xfe, 0xff]),
  Buffer.from([0xff, 0xfe, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0xfe, 0xff]),
];

const hasInvalidBom = (buffer) => INVALID_BOMS.some((bom) => buffer.subarray(0, bom.length).equals(bom));

const shouldCheckFile = (absolutePath) => {
  const baseName = path.basename(absolutePath);
  if (TEXT_BASENAMES.has(baseName)) return true;

  const ext = path.extname(absolutePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
};

const walk = async (currentDir, collector) => {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(absolutePath, collector);
      continue;
    }

    if (entry.isFile() && shouldCheckFile(absolutePath)) {
      collector.push(absolutePath);
    }
  }
};

const main = async () => {
  const files = [];
  await walk(ROOT_DIR, files);

  const invalidFiles = [];
  const warnings = [];

  for (const filePath of files) {
    try {
      const buffer = await fs.readFile(filePath);
      if (buffer.length === 0) continue;

      if (hasInvalidBom(buffer)) {
        invalidFiles.push({
          filePath,
          reason: 'detected UTF-16/UTF-32 BOM; expected UTF-8',
        });
        continue;
      }

      UTF8_DECODER.decode(buffer);
    } catch (error) {
      if (error instanceof TypeError) {
        invalidFiles.push({
          filePath,
          reason: error.message || 'invalid UTF-8 sequence',
        });
        continue;
      }

      warnings.push({
        filePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  warnings.forEach(({ filePath, reason }) => {
    console.warn(`[utf8-check] Skipped ${path.relative(ROOT_DIR, filePath)}: ${reason}`);
  });

  if (invalidFiles.length > 0) {
    console.error(`[utf8-check] Found ${invalidFiles.length} file(s) that are not valid UTF-8:`);
    invalidFiles.forEach(({ filePath, reason }) => {
      console.error(`- ${path.relative(ROOT_DIR, filePath)}: ${reason}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log(`UTF-8 guardrail passed (${files.length} files checked).`);
};

main().catch((error) => {
  console.error('[utf8-check] Fatal error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
