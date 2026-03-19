import { Episode, ProjectState, Scene, ScriptData, Shot } from '../types';

const createId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createSceneFromAnalysis = (project: ProjectState): Scene => ({
  id: createId('analysis_scene'),
  location: project.analysisData?.source?.title || '参考视频场景',
  time: '未指定',
  atmosphere: '高密度、快节奏、短视频风格',
  visualPrompt: project.analysisData?.transcript?.summary || '根据参考视频拆解出的场景氛围',
});

const createScriptData = (project: ProjectState, scene: Scene): ScriptData => {
  const transcript = project.analysisData?.transcript;
  return {
    title: `${project.title} - 分析派生草稿`,
    genre: '短视频分析派生',
    logline: transcript?.summary || '由视频分析结果自动生成的创作草稿。',
    targetDuration: project.targetDuration,
    language: project.language,
    visualStyle: project.visualStyle,
    shotGenerationModel: project.shotGenerationModel,
    planningShotDuration: undefined,
    characters: [],
    scenes: [scene],
    props: [],
    storyParagraphs: (transcript?.lines || []).map((line, index) => ({
      id: index + 1,
      text: line.text,
      sceneRefId: scene.id,
    })),
  };
};

const createShots = (project: ProjectState, sceneId: string): Shot[] => {
  return (project.analysisData?.shots || []).map((segment, index) => ({
    id: createId(`derived_shot_${index + 1}`),
    sceneId,
    actionSummary: segment.summary,
    dialogue: segment.scriptSnippet,
    cameraMovement: index === 0 ? 'push-in' : index === 1 ? 'tracking-shot' : 'static',
    shotSize: index === 0 ? '特写' : index === 1 ? '中景' : '近景',
    characters: [],
    props: [],
    keyframes: [],
    qualityAssessment: undefined,
    videoInputMode: 'keyframes',
    dubbing: segment.scriptSnippet
      ? {
          mode: 'narration',
          text: segment.scriptSnippet,
          modelId: project.shotGenerationModel,
          status: 'pending',
        }
      : undefined,
  }));
};

export interface DerivedEpisodeBuildResult {
  title: string;
  rawScript: string;
  scriptData: ScriptData;
  shots: Shot[];
}

export const buildDerivedEpisodeDraft = (project: ProjectState): DerivedEpisodeBuildResult => {
  const transcript = project.analysisData?.transcript;
  const scene = createSceneFromAnalysis(project);
  const scriptData = createScriptData(project, scene);
  const shots = createShots(project, scene.id);
  const sourceTitle = project.analysisData?.source?.title || project.title || '分析视频';

  return {
    title: `${sourceTitle} - 派生草稿`,
    rawScript: transcript?.mergedScript || transcript?.summary || '由分析结果派生的脚本草稿。',
    scriptData,
    shots,
  };
};

export const applyDerivedDraftToEpisode = (episode: Episode, draft: DerivedEpisodeBuildResult): Episode => {
  return {
    ...episode,
    stage: 'script',
    title: draft.title,
    rawScript: draft.rawScript,
    scriptData: draft.scriptData,
    shots: draft.shots,
    lastModified: Date.now(),
  };
};
