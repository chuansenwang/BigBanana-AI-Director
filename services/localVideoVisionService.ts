import {
  AnalysisShotSegment,
  AnalysisTranscriptArtifact,
  LocalShotVisionAnalysis,
  LocalShotVisionBatchResult,
  VideoAnalysisSource,
} from '../types';
import { resolveVideoToBlob } from './videoStorageService';
import {
  checkApiKey,
  parseHttpError,
  parseJsonWithRecovery,
  requestModelEndpoint,
  resolveModel,
  resolveRequestModel,
  retryOperation,
} from './ai/apiCore';
import { getProviderById } from './modelRegistry';
import { buildAuthHeaders } from './providerAuthService';

const DEFAULT_VISION_MODEL = 'gpt-4o';
const MAX_FRAMES_PER_SHOT = 3;
const MAX_IMAGE_WIDTH = 960;
const MAX_ANALYZED_SHOTS = 8;

interface ShotFrameSample {
  shotId: string;
  dataUrl: string;
  timeMs: number;
}

interface VisionModelResponse {
  title?: unknown;
  summary?: unknown;
  visualNotes?: unknown;
  viralElements?: unknown;
  confidence?: unknown;
}

interface ChatMessagePart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

const toChatMessageText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';

      if ('text' in item && typeof item.text === 'string') {
        return item.text;
      }
      if ('content' in item && typeof item.content === 'string') {
        return item.content;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const normalizeImageInput = (image: string): string => {
  const trimmed = String(image || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `data:image/png;base64,${trimmed.replace(/^data:image\/(png|jpeg|jpg);base64,/i, '')}`;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const uniqueTimes = (times: number[]): number[] => {
  return Array.from(new Set(times.map((value) => Math.max(0, Math.round(value)))));
};

const getSourceReference = (source: VideoAnalysisSource): string => {
  const reference = source.persistedVideoRef || source.originalUrl;
  if (!reference) {
    throw new Error('当前分析源缺少可读取的视频引用。');
  }
  return reference;
};

const loadVideo = async (blob: Blob): Promise<{ video: HTMLVideoElement; revoke: () => void }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(blob);
    let settled = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        video,
        revoke: () => URL.revokeObjectURL(objectUrl),
      });
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取视频元数据，不能执行视觉增强分析。'));
    };

    video.src = objectUrl;
  });
};

const seekVideo = async (video: HTMLVideoElement, targetSeconds: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      video.onseeked = null;
      video.onerror = null;
    };

    video.onseeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('视频抽帧 seek 失败。'));
    };

    video.currentTime = targetSeconds;
  });
};

const captureFrame = async (video: HTMLVideoElement, timeMs: number): Promise<string> => {
  const targetSeconds = clamp(timeMs / 1000, 0, Math.max(0, video.duration || 0));
  await seekVideo(video, targetSeconds);

  const scale = Math.min(1, MAX_IMAGE_WIDTH / Math.max(1, video.videoWidth || MAX_IMAGE_WIDTH));
  const width = Math.max(1, Math.round((video.videoWidth || MAX_IMAGE_WIDTH) * scale));
  const height = Math.max(1, Math.round((video.videoHeight || Math.round(MAX_IMAGE_WIDTH * 9 / 16)) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建 canvas 上下文，不能执行视觉增强分析。');
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
};

const buildFrameTimes = (shot: AnalysisShotSegment): number[] => {
  const duration = Math.max(0, shot.endMs - shot.startMs);
  if (duration <= 0) {
    return [shot.startMs];
  }

  if (duration < 1600) {
    return uniqueTimes([shot.startMs + duration * 0.5]);
  }

  if (duration < 4500) {
    return uniqueTimes([shot.startMs + duration * 0.2, shot.startMs + duration * 0.75]);
  }

  return uniqueTimes([
    shot.startMs + duration * 0.12,
    shot.startMs + duration * 0.5,
    shot.startMs + duration * 0.86,
  ]).slice(0, MAX_FRAMES_PER_SHOT);
};

const extractShotFrames = async (
  video: HTMLVideoElement,
  shot: AnalysisShotSegment,
): Promise<ShotFrameSample[]> => {
  const times = buildFrameTimes(shot);
  const samples: ShotFrameSample[] = [];

  for (const timeMs of times) {
    const dataUrl = await captureFrame(video, timeMs);
    samples.push({ shotId: shot.id, dataUrl, timeMs });
  }

  return samples;
};

const buildTranscriptExcerpt = (transcript: AnalysisTranscriptArtifact | null, shot: AnalysisShotSegment): string => {
  const lines = transcript?.lines.filter(line => line.endMs > shot.startMs && line.startMs < shot.endMs) || [];
  const merged = lines.map(line => line.text.trim()).filter(Boolean).join(' / ');
  return merged || shot.scriptSnippet || shot.summary;
};

const buildVisionPrompt = (shot: AnalysisShotSegment, transcript: AnalysisTranscriptArtifact | null): string => {
  const transcriptExcerpt = buildTranscriptExcerpt(transcript, shot);
  return [
    'You are analyzing a short-video segment for creative breakdown.',
    'Focus on what is visible in the sampled frames, not imagined details.',
    'Use the transcript excerpt only as supporting context, not as proof of unseen visuals.',
    'Return strict JSON only.',
    '',
    `Shot time range: ${shot.startMs}ms -> ${shot.endMs}ms`,
    `Existing transcript excerpt: ${transcriptExcerpt || 'N/A'}`,
    '',
    'Return JSON with exactly this shape:',
    '{"title":"...","summary":"...","visualNotes":"...","viralElements":["..."],"confidence":0.0}',
    '',
    'Requirements:',
    '- title: concise shot label, <= 24 chars in Chinese or <= 6 English words',
    '- summary: 1 sentence describing the segment’s visual/semantic role',
    '- visualNotes: 1-2 sentences about framing, subject, motion, text overlays, or pacing cues visible in the frames',
    '- viralElements: 1-4 short tags like hook, contrast, payoff, rhythm, subtitle-density, face-closeup, demo, reveal',
    '- confidence: number between 0 and 1',
    '- Do not mention uncertainty unless the frames are genuinely insufficient',
  ].join('\n');
};

const parseViralElements = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
};

const toVisionAnalysis = (
  shotId: string,
  responseText: string,
  fallbackShot: AnalysisShotSegment,
): LocalShotVisionAnalysis => {
  const parsed = parseJsonWithRecovery<VisionModelResponse>(responseText, {});
  const title = String(parsed.title || '').trim() || fallbackShot.title;
  const summary = String(parsed.summary || '').trim() || fallbackShot.summary;
  const visualNotes = String(parsed.visualNotes || '').trim() || fallbackShot.visualNotes || '建议回看关键帧，补充主体、构图和节奏备注。';
  const confidenceRaw = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 1) : fallbackShot.confidence;
  const viralElements = parseViralElements(parsed.viralElements);

  return {
    shotId,
    title,
    summary,
    visualNotes,
    viralElements: viralElements.length > 0 ? viralElements : fallbackShot.viralElements,
    confidence,
    rawResponse: responseText,
  };
};

const analyzeShotWithVision = async (
  shot: AnalysisShotSegment,
  transcript: AnalysisTranscriptArtifact | null,
  frames: ShotFrameSample[],
  model: string,
): Promise<LocalShotVisionAnalysis> => {
  const apiKey = checkApiKey('chat', model);
  const resolvedChatModel = resolveModel('chat', model);
  const provider = getProviderById(resolvedChatModel?.providerId || '');
  const authHeaders = buildAuthHeaders(provider, apiKey);
  const requestModel = resolveRequestModel('chat', model);
  const endpoint = resolvedChatModel?.endpoint || '/v1/chat/completions';

  const content: ChatMessagePart[] = [
    {
      type: 'text',
      text: buildVisionPrompt(shot, transcript),
    },
    ...frames.map((frame) => ({
      type: 'image_url' as const,
      image_url: { url: normalizeImageInput(frame.dataUrl) },
    })),
  ];

  const requestBody = {
    model: requestModel,
    messages: [
      {
        role: 'system',
        content: 'You are a multimodal short-video analyst. Return strict JSON only.',
      },
      {
        role: 'user',
        content,
      },
    ],
    temperature: 0.2,
    max_tokens: 500,
  };

  const response = await retryOperation(async () => {
    const res = await requestModelEndpoint('chat', resolvedChatModel?.id || model, endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      throw await parseHttpError(res);
    }

    return res;
  }, 2, 1200);

  const data = await response.json();
  const responseText = toChatMessageText(data?.choices?.[0]?.message?.content);
  return toVisionAnalysis(shot.id, responseText, shot);
};

export const analyzeVideoShotsWithVision = async (
  source: VideoAnalysisSource,
  shots: AnalysisShotSegment[],
  transcript: AnalysisTranscriptArtifact | null,
  model: string = DEFAULT_VISION_MODEL,
): Promise<LocalShotVisionBatchResult> => {
  if (shots.length === 0) {
    return { analyses: [], warnings: [], model };
  }

  const reference = getSourceReference(source);
  const blob = await resolveVideoToBlob(reference);
  const { video, revoke } = await loadVideo(blob);
  const warnings: string[] = [];
  const analyses: LocalShotVisionAnalysis[] = [];

  try {
    for (const shot of shots.slice(0, MAX_ANALYZED_SHOTS)) {
      try {
        const frames = await extractShotFrames(video, shot);
        const analysis = await analyzeShotWithVision(shot, transcript, frames, model);
        analyses.push(analysis);
      } catch (error) {
        warnings.push(`镜头 ${shot.title || shot.id} 的视觉增强失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (shots.length > MAX_ANALYZED_SHOTS) {
      warnings.push(`当前仅对前 ${MAX_ANALYZED_SHOTS} 个镜头执行 GPT-4o 视觉增强，剩余镜头保留基础分析结果。`);
    }

    return {
      analyses,
      warnings,
      model,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    revoke();
  }
};
