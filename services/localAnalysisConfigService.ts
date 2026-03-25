import { LocalAnalysisUserConfig } from '../types';

const STORAGE_KEY = 'bb.localAnalysis.userConfig';

export const DEFAULT_LOCAL_ANALYSIS_USER_CONFIG: LocalAnalysisUserConfig = {
  whisperBinaryPath: '',
  whisperModelPath: '',
  pythonBinaryPath: 'python',
  visionModel: 'gpt-4o',
};

const sanitizeString = (value: unknown): string => String(value || '').trim();

export const normalizeLocalAnalysisUserConfig = (value: Partial<LocalAnalysisUserConfig> | null | undefined): LocalAnalysisUserConfig => {
  return {
    whisperBinaryPath: sanitizeString(value?.whisperBinaryPath),
    whisperModelPath: sanitizeString(value?.whisperModelPath),
    pythonBinaryPath: sanitizeString(value?.pythonBinaryPath) || DEFAULT_LOCAL_ANALYSIS_USER_CONFIG.pythonBinaryPath,
    visionModel: sanitizeString(value?.visionModel) || DEFAULT_LOCAL_ANALYSIS_USER_CONFIG.visionModel,
  };
};

export const loadLocalAnalysisUserConfig = (): LocalAnalysisUserConfig => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_LOCAL_ANALYSIS_USER_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_ANALYSIS_USER_CONFIG;
    return normalizeLocalAnalysisUserConfig(JSON.parse(raw) as Partial<LocalAnalysisUserConfig>);
  } catch {
    return DEFAULT_LOCAL_ANALYSIS_USER_CONFIG;
  }
};

export const saveLocalAnalysisUserConfig = (value: Partial<LocalAnalysisUserConfig>): LocalAnalysisUserConfig => {
  const normalized = normalizeLocalAnalysisUserConfig(value);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
};

export const clearLocalAnalysisUserConfig = (): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};
