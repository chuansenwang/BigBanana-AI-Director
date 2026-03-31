export const SCRIPT_PREPARSE_VERSION = 'v1';

export type ScriptPreparseMode = 'plain' | 'cn-structured' | 'shot-table' | 'mixed';

export type ScriptPreparseWarningCode =
  | 'unknown-header'
  | 'duplicate-header'
  | 'ragged-row'
  | 'mixed-format'
  | 'empty-row-dropped'
  | 'fallback-original';

export interface ScriptPreparseWarning {
  code: ScriptPreparseWarningCode;
  message: string;
  line?: number;
}

export interface ScriptPreparseDetectedStructure {
  sectionCount: number;
  shotTableCount: number;
  shotCount: number;
}

export interface ScriptPreparseResult {
  version: typeof SCRIPT_PREPARSE_VERSION;
  mode: ScriptPreparseMode;
  applied: boolean;
  normalizedText: string;
  warnings: ScriptPreparseWarning[];
  detectedStructure: ScriptPreparseDetectedStructure;
}

type TableDelimiter = 'tab' | 'pipe';
type CanonicalHeaderKey =
  | 'shotNumber'
  | 'timeRange'
  | 'scene'
  | 'shotSize'
  | 'cameraMovement'
  | 'visualContent'
  | 'dialogue'
  | 'sound'
  | 'effects';

interface ParsedDelimitedLine {
  delimiter: TableDelimiter;
  cells: string[];
}

interface ParsedShotTableBlock {
  endIndex: number;
  normalizedBlock: string;
  shotCount: number;
  warnings: ScriptPreparseWarning[];
}

const CANONICAL_LABELS: Record<CanonicalHeaderKey, string> = {
  shotNumber: '镜头号',
  timeRange: '时间段',
  scene: '场景',
  shotSize: '景别',
  cameraMovement: '运镜',
  visualContent: '画面内容',
  dialogue: '台词',
  sound: '声音设计',
  effects: '道具/特效/后期',
};

const FIELD_ORDER: CanonicalHeaderKey[] = [
  'shotNumber',
  'timeRange',
  'scene',
  'shotSize',
  'cameraMovement',
  'visualContent',
  'dialogue',
  'sound',
  'effects',
];

const HEADER_ALIAS_ENTRIES: Array<[CanonicalHeaderKey, string[]]> = [
  ['shotNumber', ['镜头号', '镜头', 'shot', 'shotno', 'shotnumber', '编号']],
  ['timeRange', ['时间段', '时间', '时长', 'timerange', 'time', 'duration']],
  ['scene', ['场景', 'scene', '场景scene']],
  ['shotSize', ['景别', 'shotsize', 'sizeofshot']],
  ['cameraMovement', ['运镜', '镜头运动', '机位', 'camera', 'cameramovement']],
  ['visualContent', ['画面内容', '画面内容表演指令', '表演指令', '动作', '内容', 'visualcontent', 'action']],
  ['dialogue', ['角色台词', '台词', '对白', 'dialogue', 'line']],
  ['sound', ['声音设计', '声音设计sfxbgm', 'sfxbgm', 'sfx', 'bgm', '声音']],
  ['effects', ['道具特效后期', '特效后期', '道具特效', 'propsvfx', 'vfx', '道具', '特效', '后期']],
];

const HEADER_ALIAS_MAP = new Map<string, CanonicalHeaderKey>();
for (const [key, aliases] of HEADER_ALIAS_ENTRIES) {
  for (const alias of aliases) {
    HEADER_ALIAS_MAP.set(alias, key);
  }
}

const SECTION_HINT_RE = /视频|剧本|故事|分镜|镜头|场景|角色|人物|道具|特效|脚本|结构|设计|指南|大纲|部分|章节|时长|主题/u;

const normalizeLineEndings = (text: string): string => {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
};

const stripTrailingWhitespace = (text: string): string => {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+$/g, ''))
    .join('\n');
};

const cleanupFinalText = (text: string): string => {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
};

const normalizeHeaderToken = (value: string): string => {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, '')
    .trim();
};

const cleanCellText = (value: string): string => {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDelimitedLine = (line: string): ParsedDelimitedLine | null => {
  if (!line.trim()) return null;

  if (line.includes('\t')) {
    const cells = line.split(/\t+/g).map((cell) => cleanCellText(cell));
    return cells.length >= 2 ? { delimiter: 'tab', cells } : null;
  }

  if (!line.includes('|')) return null;
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = normalized.split('|').map((cell) => cleanCellText(cell));
  return cells.length >= 2 ? { delimiter: 'pipe', cells } : null;
};

const isPipeSeparatorRow = (cells: string[]): boolean => {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(String(cell || '').trim()));
};

const detectCanonicalHeader = (cell: string): CanonicalHeaderKey | null => {
  const normalized = normalizeHeaderToken(cell);
  return HEADER_ALIAS_MAP.get(normalized) || null;
};

const isLikelyStructuredHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('\t') || trimmed.includes('|')) return false;
  if (trimmed.length > 48) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^第[一二三四五六七八九十0-9]+部分/u.test(trimmed)) return true;
  return SECTION_HINT_RE.test(trimmed);
};

const normalizeStructuredLine = (line: string): { line: string; changed: boolean; heading: boolean } => {
  const trimmed = line.trim();
  if (!trimmed) {
    return { line: '', changed: line !== '', heading: false };
  }
  if (trimmed.includes('\t') || trimmed.includes('|')) {
    return { line: trimmed, changed: trimmed !== line, heading: false };
  }

  if (isLikelyStructuredHeading(trimmed)) {
    const strippedHeading = trimmed.replace(/^[^0-9A-Za-z\u4e00-\u9fff（(【\[#]+/u, '').trim();
    if (strippedHeading && strippedHeading !== trimmed && isLikelyStructuredHeading(strippedHeading)) {
      return { line: strippedHeading, changed: true, heading: true };
    }
  }

  const labelMatch = trimmed.match(/^(?<prefix>(?:[-*•]\s*|\d+[.、)]\s*|第[一二三四五六七八九十0-9]+部分\s*[:：]?\s*)?)(?<label>[^:：]{1,28})\s*[:：]\s*(?<content>.+)$/u);
  if (!labelMatch?.groups) {
    return { line: trimmed, changed: trimmed !== line, heading: false };
  }

  const prefix = String(labelMatch.groups.prefix || '');
  const label = String(labelMatch.groups.label || '').trim();
  const content = String(labelMatch.groups.content || '').trim();
  const normalizedLabel = label.replace(/\s+/g, ' ');
  const looksLikeStructuredLabel = prefix.trim().length > 0 || SECTION_HINT_RE.test(normalizedLabel);
  if (!looksLikeStructuredLabel) {
    return { line: trimmed, changed: trimmed !== line, heading: false };
  }
  const nextLine = `${prefix}${normalizedLabel}：${content}`.trim();
  const heading = isLikelyStructuredHeading(normalizedLabel);
  return { line: nextLine, changed: nextLine !== line, heading };
};

const tryParseShotTableBlock = (lines: string[], startIndex: number): ParsedShotTableBlock | null => {
  const headerLine = parseDelimitedLine(lines[startIndex]);
  if (!headerLine) return null;

  const mappedHeaders = headerLine.cells.map((cell) => detectCanonicalHeader(cell));
  const recognizedHeaderCount = mappedHeaders.filter(Boolean).length;
  const hasShotAnchor = mappedHeaders.includes('shotNumber') || mappedHeaders.includes('visualContent');
  if (recognizedHeaderCount < 3 || !hasShotAnchor) return null;

  const rawBlockLines = [lines[startIndex]];
  let cursor = startIndex + 1;
  if (headerLine.delimiter === 'pipe') {
    const separator = parseDelimitedLine(lines[cursor] || '');
    if (separator && separator.delimiter === 'pipe' && isPipeSeparatorRow(separator.cells)) {
      rawBlockLines.push(lines[cursor]);
      cursor += 1;
    }
  }

  const dataRows: string[][] = [];
  const warnings: ScriptPreparseWarning[] = [];
  const headerIndexByKey = new Map<CanonicalHeaderKey, number>();
  const extraColumnIndexes = new Set<number>();

  mappedHeaders.forEach((key, index) => {
    if (!key) {
      extraColumnIndexes.add(index);
      return;
    }
    if (headerIndexByKey.has(key)) {
      warnings.push({
        code: 'duplicate-header',
        line: startIndex + 1,
        message: `预解析检测到重复列头“${headerLine.cells[index]}”，已保留首个映射。`,
      });
      extraColumnIndexes.add(index);
      return;
    }
    headerIndexByKey.set(key, index);
  });

  headerLine.cells.forEach((cell, index) => {
    if (!mappedHeaders[index]) {
      warnings.push({
        code: 'unknown-header',
        line: startIndex + 1,
        message: `预解析未识别列头“${cell}”，将作为补充字段保留。`,
      });
    }
  });

  while (cursor < lines.length) {
    const currentLine = lines[cursor];
    if (!currentLine.trim()) break;
    const parsed = parseDelimitedLine(currentLine);
    if (!parsed || parsed.delimiter !== headerLine.delimiter) break;
    if (headerLine.delimiter === 'pipe' && isPipeSeparatorRow(parsed.cells)) {
      rawBlockLines.push(currentLine);
      cursor += 1;
      continue;
    }

    rawBlockLines.push(currentLine);

    if (parsed.cells.length > headerLine.cells.length) {
      return {
        endIndex: cursor,
        normalizedBlock: rawBlockLines.join('\n'),
        shotCount: 0,
        warnings: [
          ...warnings,
          {
            code: 'ragged-row',
            line: cursor + 1,
            message: '预解析发现分镜表列数不稳定，已回退原始文本。',
          },
        ],
      };
    }

    const paddedCells = [...parsed.cells];
    while (paddedCells.length < headerLine.cells.length) {
      paddedCells.push('');
    }
    dataRows.push(paddedCells);
    cursor += 1;
  }

  if (dataRows.length === 0) return null;

  const normalizedShots: string[] = [];
  dataRows.forEach((row, rowIndex) => {
    const fields = new Map<CanonicalHeaderKey, string>();
    for (const key of FIELD_ORDER) {
      const index = headerIndexByKey.get(key);
      if (index === undefined) continue;
      const value = cleanCellText(row[index] || '');
      if (value) {
        fields.set(key, value);
      }
    }

    const extraPairs = Array.from(extraColumnIndexes)
      .map((index) => {
        const header = cleanCellText(headerLine.cells[index] || '');
        const value = cleanCellText(row[index] || '');
        if (!header || !value) return null;
        return `${header}：${value}`;
      })
      .filter((value): value is string => Boolean(value));

    const nonEmptyFieldCount = fields.size + extraPairs.length;
    if (nonEmptyFieldCount === 0) {
      warnings.push({
        code: 'empty-row-dropped',
        line: startIndex + rowIndex + 2,
        message: '预解析跳过了一个空白分镜行。',
      });
      return;
    }

    const shotNumber = fields.get('shotNumber') || String(rowIndex + 1).padStart(2, '0');
    const shotLines = [`镜头号：${shotNumber}`];

    for (const key of FIELD_ORDER) {
      if (key === 'shotNumber') continue;
      const value = fields.get(key);
      if (value) {
        shotLines.push(`${CANONICAL_LABELS[key]}：${value}`);
      }
    }

    if (extraPairs.length > 0) {
      shotLines.push(`补充字段：${extraPairs.join('；')}`);
    }

    normalizedShots.push(shotLines.join('\n'));
  });

  if (normalizedShots.length === 0) {
    return {
      endIndex: cursor - 1,
      normalizedBlock: rawBlockLines.join('\n'),
      shotCount: 0,
      warnings: [
        ...warnings,
        {
          code: 'fallback-original',
          line: startIndex + 1,
          message: '预解析未生成有效分镜条目，已回退原始文本。',
        },
      ],
    };
  }

  return {
    endIndex: cursor - 1,
    normalizedBlock: normalizedShots.join('\n\n'),
    shotCount: normalizedShots.length,
    warnings,
  };
};

export const preparseScriptInput = (rawText: string): ScriptPreparseResult => {
  const originalText = String(rawText || '');

  try {
    const baseline = stripTrailingWhitespace(normalizeLineEndings(originalText));
    if (!baseline.trim()) {
      return {
        version: SCRIPT_PREPARSE_VERSION,
        mode: 'plain',
        applied: false,
        normalizedText: originalText,
        warnings: [],
        detectedStructure: {
          sectionCount: 0,
          shotTableCount: 0,
          shotCount: 0,
        },
      };
    }

    const lines = baseline.split('\n');
    const outputLines: string[] = [];
    const warnings: ScriptPreparseWarning[] = [];
    let shotTableCount = 0;
    let shotCount = 0;
    let sectionCount = 0;
    let structuredLineChanges = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const tableBlock = tryParseShotTableBlock(lines, index);
      if (tableBlock) {
        warnings.push(...tableBlock.warnings);
        if (tableBlock.shotCount > 0 && tableBlock.normalizedBlock !== lines.slice(index, tableBlock.endIndex + 1).join('\n')) {
          shotTableCount += 1;
          shotCount += tableBlock.shotCount;
        }
        outputLines.push(tableBlock.normalizedBlock);
        index = tableBlock.endIndex;
        continue;
      }

      const normalizedLine = normalizeStructuredLine(lines[index]);
      if (normalizedLine.heading) {
        sectionCount += 1;
      }
      if (normalizedLine.changed) {
        structuredLineChanges += 1;
      }
      outputLines.push(normalizedLine.line);
    }

    const normalizedText = cleanupFinalText(outputLines.join('\n'));
    const applied = normalizedText.length > 0 && normalizedText !== cleanupFinalText(baseline) && (shotTableCount > 0 || structuredLineChanges > 0);
    const mode: ScriptPreparseMode = shotTableCount > 0
      ? (sectionCount > 0 || structuredLineChanges > 0 ? 'mixed' : 'shot-table')
      : (structuredLineChanges > 0 || sectionCount > 0 ? 'cn-structured' : 'plain');

    return {
      version: SCRIPT_PREPARSE_VERSION,
      mode,
      applied,
      normalizedText: applied ? normalizedText : originalText,
      warnings,
      detectedStructure: {
        sectionCount,
        shotTableCount,
        shotCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '预解析失败';
    return {
      version: SCRIPT_PREPARSE_VERSION,
      mode: 'plain',
      applied: false,
      normalizedText: originalText,
      warnings: [{ code: 'fallback-original', message: `预解析失败，已回退原始文本：${message}` }],
      detectedStructure: {
        sectionCount: 0,
        shotTableCount: 0,
        shotCount: 0,
      },
    };
  }
};
