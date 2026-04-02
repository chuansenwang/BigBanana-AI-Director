import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import StageScript from './components/StageScript';
import StageAssets from './components/StageAssets';
import StageDirector from './components/StageDirector';
import StageExport from './components/StageExport';
import StagePrompts from './components/StagePrompts';
import StageAnalysis from './components/StageAnalysis';
import Dashboard from './components/Dashboard';
import ProjectOverview from './components/ProjectOverview';
import CharacterLibraryPage from './components/CharacterLibrary';
import NewApiConsole from './components/NewApiConsole';
import Onboarding, { shouldShowOnboarding, resetOnboarding } from './components/Onboarding';
import ModelConfigModal from './components/ModelConfig';
import { ProjectState } from './types';
import { Save, CheckCircle, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { saveEpisode, loadEpisode } from './services/storageService';
import { setGlobalApiKey } from './services/aiService';
import { setLogCallback, clearLogCallback } from './services/renderLogService';
import { useAlert } from './components/GlobalAlert';
import { ProjectProvider, useProjectContext } from './contexts/ProjectContext';
import { checkCharacterSync, checkSceneSync, checkPropSync } from './services/characterSyncService';
import AssetSyncBanner from './components/CharacterLibrary/AssetSyncBanner';
import logoImg from './logo.png';

const isNineGridGenerating = (status?: string): boolean =>
  status === 'generating_panels' ||
  status === 'generating_image' ||
  status === 'generating';

const clearInFlightGenerationStates = (episode: ProjectState): ProjectState => {
  const scriptData = episode.scriptData
    ? {
        ...episode.scriptData,
        characters: episode.scriptData.characters.map(char => ({
          ...char,
          status: char.status === 'generating' ? 'failed' : char.status,
          turnaround: char.turnaround && (char.turnaround.status === 'generating_panels' || char.turnaround.status === 'generating_image')
            ? { ...char.turnaround, status: 'failed' as const }
            : char.turnaround,
          variations: char.variations.map(variation => ({
            ...variation,
            status: variation.status === 'generating' ? 'failed' : variation.status
          }))
        })),
        scenes: episode.scriptData.scenes.map(scene => ({
          ...scene,
          status: scene.status === 'generating' ? 'failed' : scene.status
        })),
        props: episode.scriptData.props.map(prop => ({
          ...prop,
          status: prop.status === 'generating' ? 'failed' : prop.status
        })),
      }
    : null;

  return {
    ...episode,
    isParsingScript: false,
    scriptGenerationCheckpoint: null,
    scriptData,
    analysisData: episode.analysisData
      ? {
          ...episode.analysisData,
          status: episode.analysisData.status === 'analyzing' ? 'failed' : episode.analysisData.status,
          updatedAt: Date.now(),
        }
      : episode.analysisData,
    shots: episode.shots.map(shot => ({
      ...shot,
      keyframes: shot.keyframes?.map(kf => (
        kf.status === 'generating' ? { ...kf, status: 'failed' as const } : kf
      )),
      interval: shot.interval?.status === 'generating'
        ? { ...shot.interval, status: 'failed' as const }
        : shot.interval,
      nineGrid: shot.nineGrid && isNineGridGenerating(shot.nineGrid.status)
        ? { ...shot.nineGrid, status: 'failed' as const }
        : shot.nineGrid,
    }))
  };
};

function MobileWarning() {
  return (
    <div className="h-screen bg-[var(--bg-base)] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <img src={logoImg} alt="Logo" className="w-20 h-20 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">BigBanana AI Director</h1>
        <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-8">
          <p className="text-[var(--text-tertiary)] text-base leading-relaxed mb-4">为了获得最佳体验，请使用 PC 端浏览器访问。</p>
          <p className="text-[var(--text-muted)] text-sm">本应用需要较大的屏幕空间和桌面级浏览器环境才能正常运行。</p>
        </div>
      </div>
    </div>
  );
}

type EpisodeLoadError = {
  kind: 'not_found' | 'load_failed';
  message: string;
};

const isEpisodeNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const normalizedMessage = error.message.trim().toLowerCase();
  return normalizedMessage === 'episode not found' || normalizedMessage.endsWith('not found');
};

function EpisodeLoadErrorState({
  error,
  onRetry,
  onBack,
}: {
  error: EpisodeLoadError;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const title = error.kind === 'not_found' ? '当前剧集不存在' : '当前页面加载失败';
  const description = error.kind === 'not_found'
    ? '这个剧集可能已被删除，或者当前链接对应的数据已不在本地数据库中。'
    : '本地数据读取失败，页面已保留在当前地址。你可以先重试，如果问题持续，再返回项目页检查数据。';

  return (
    <div className="h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-2xl p-8 md:p-10 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="inline-flex items-center gap-3 rounded-full border border-[var(--border-primary)] bg-[var(--bg-sunken)] px-4 py-2 text-[var(--text-tertiary)] text-xs font-mono uppercase tracking-[0.24em]">
          <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
          Load Error
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">{title}</h1>
            <p className="mt-3 text-sm md:text-base leading-7 text-[var(--text-tertiary)]">{description}</p>
          </div>

          <div className="border border-[var(--border-subtle)] bg-[var(--bg-sunken)] rounded-xl px-4 py-3 text-xs md:text-sm text-[var(--text-muted)] font-mono break-all">
            {error.message}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest"
          >
            <RefreshCw className="w-4 h-4" />
            重新加载
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors text-xs font-bold uppercase tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              返回项目页
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EpisodeWorkspace() {
  const { projectId, episodeId } = useParams<{ projectId: string; episodeId: string }>();
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const {
    project,
    currentEpisode,
    setCurrentEpisode,
    updateProject: updateSeriesProject,
    updateEpisode,
    syncAllCharactersToEpisode,
    syncAllScenesToEpisode,
    syncAllPropsToEpisode,
  } = useProjectContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [modelConfigVersion, setModelConfigVersion] = useState(0);
  const [episodeLoadStatus, setEpisodeLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [episodeLoadError, setEpisodeLoadError] = useState<EpisodeLoadError | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const saveTimeoutRef = useRef<any>(null);
  const hideStatusTimeoutRef = useRef<any>(null);

  const handleCloseModelConfig = () => {
    setShowModelConfig(false);
    setModelConfigVersion(prev => prev + 1);
  };

  useEffect(() => {
    if (!episodeId) {
      setCurrentEpisode(null);
      setEpisodeLoadStatus('error');
      setEpisodeLoadError({ kind: 'not_found', message: 'Missing episode id in route.' });
      return undefined;
    }

    let cancelled = false;
    setEpisodeLoadStatus('loading');
    setEpisodeLoadError(null);

    void loadEpisode(episodeId)
      .then(ep => {
        if (cancelled) return;
        if (!ep) {
          setCurrentEpisode(null);
          setEpisodeLoadStatus('error');
          setEpisodeLoadError({ kind: 'not_found', message: 'Episode not found' });
          return;
        }
        setCurrentEpisode(ep);
        setEpisodeLoadStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown episode load failure';
        setCurrentEpisode(null);
        setEpisodeLoadStatus('error');
        setEpisodeLoadError({
          kind: isEpisodeNotFoundError(error) ? 'not_found' : 'load_failed',
          message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [episodeId, reloadVersion, setCurrentEpisode]);

  useEffect(() => {
    if (currentEpisode) {
      setLogCallback((log) => {
        updateEpisode(prev => ({
          ...prev,
          renderLogs: [...(prev.renderLogs || []), log]
        }));
      });
    } else {
      clearLogCallback();
    }
    return () => clearLogCallback();
  }, [currentEpisode?.id]);

  useEffect(() => {
    if (!currentEpisode) return;
    setSaveStatus('unsaved');
    setShowSaveStatus(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveEpisode(currentEpisode);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 1000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [currentEpisode]);

  useEffect(() => {
    if (saveStatus === 'saved') {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
      hideStatusTimeoutRef.current = setTimeout(() => setShowSaveStatus(false), 2000);
    } else if (saveStatus === 'saving') {
      setShowSaveStatus(true);
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    }
    return () => { if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current); };
  }, [saveStatus]);

  useEffect(() => {
    if (!project || !currentEpisode) return;
    if (currentEpisode.episodeNumber !== 1) return;

    const projectTitle = (project.title || '').trim();
    const isProjectPlaceholder =
      !projectTitle ||
      projectTitle === '未命名项目' ||
      /^新建项目\s\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(projectTitle);

    if (!isProjectPlaceholder) return;

    const candidateTitle = (currentEpisode.scriptData?.title || currentEpisode.title || '').trim();
    if (!candidateTitle) return;
    if (/^第\s*\d+\s*集$/u.test(candidateTitle)) return;
    if (candidateTitle === projectTitle) return;

    updateSeriesProject({ title: candidateTitle });
  }, [project, currentEpisode, updateSeriesProject]);

  const handleUpdateProject = (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => {
    updateEpisode(updates);
  };

  const setStage = (stage: 'script' | 'assets' | 'director' | 'export' | 'prompts' | 'analysis') => {
    if (isGenerating) {
      showAlert('当前正在执行生成任务，切换页面会导致生成数据丢失。\n\n确定要离开当前页面吗？', {
        title: '生成任务进行中', type: 'warning', showCancel: true, confirmText: '确定离开', cancelText: '继续等待',
        onConfirm: () => {
          setIsGenerating(false);
          updateEpisode(prev => ({ ...clearInFlightGenerationStates(prev), stage }));
        }
      });
      return;
    }
    handleUpdateProject({ stage });
  };

  const handleExit = async () => {
    if (isGenerating) {
      showAlert('当前正在执行生成任务，退出会导致数据丢失。\n\n确定要退出吗？', {
        title: '生成任务进行中', type: 'warning', showCancel: true, confirmText: '确定退出', cancelText: '继续等待',
        onConfirm: async () => {
          setIsGenerating(false);
          if (currentEpisode) {
            const cleanedEpisode = clearInFlightGenerationStates(currentEpisode);
            await saveEpisode(cleanedEpisode);
          }
          navigate(`/project/${currentEpisode?.projectId || ''}`);
        }
      });
      return;
    }
    if (currentEpisode) await saveEpisode(currentEpisode);
    navigate(`/project/${currentEpisode?.projectId || ''}`);
  };

  if (episodeLoadStatus === 'error' && episodeLoadError && !currentEpisode) {
    return (
      <EpisodeLoadErrorState
        error={episodeLoadError}
        onRetry={() => setReloadVersion(prev => prev + 1)}
        onBack={projectId ? () => navigate(`/project/${projectId}`) : undefined}
      />
    );
  }

  if (episodeLoadStatus === 'loading' || !currentEpisode) {
    return <div className="h-screen flex items-center justify-center text-[var(--text-muted)]">加载中...</div>;
  }

  const renderStage = () => {
    switch (currentEpisode.stage) {
      case 'script':
        return <StageScript project={currentEpisode} updateProject={handleUpdateProject} onShowModelConfig={() => setShowModelConfig(true)} onGeneratingChange={setIsGenerating} modelConfigVersion={modelConfigVersion} />;
      case 'assets':
        return <StageAssets project={currentEpisode} updateProject={handleUpdateProject} onGeneratingChange={setIsGenerating} />;
      case 'director':
        return <StageDirector project={currentEpisode} updateProject={handleUpdateProject} onGeneratingChange={setIsGenerating} modelConfigVersion={modelConfigVersion} />;
      case 'export':
        return <StageExport project={currentEpisode} />;
      case 'prompts':
        return <StagePrompts project={currentEpisode} updateProject={handleUpdateProject} />;
      case 'analysis':
        return <StageAnalysis project={currentEpisode} updateProject={handleUpdateProject} onGeneratingChange={setIsGenerating} onShowModelConfig={() => setShowModelConfig(true)} />;
      default:
        return <div className="text-[var(--text-primary)]">未知阶段</div>;
    }
  };

  const displayEpisodeTitle =
    project &&
    currentEpisode.episodeNumber === 1 &&
    currentEpisode.title?.trim() === project.title?.trim()
      ? `第 ${currentEpisode.episodeNumber} 集`
      : currentEpisode.title;
  const episodeLabel = project ? `${project.title} / ${displayEpisodeTitle}` : displayEpisodeTitle;

  return (
    <div className="flex h-screen bg-[var(--bg-secondary)] font-sans text-[var(--text-secondary)] selection:bg-[var(--accent-bg)]">
      <Sidebar
        currentStage={currentEpisode.stage}
        setStage={setStage}
        onExit={handleExit}
        projectName={episodeLabel}
        onShowOnboarding={() => { resetOnboarding(); setShowOnboarding(true); }}
        onShowModelConfig={() => setShowModelConfig(true)}
        isNavigationLocked={isGenerating}
        episodeInfo={project ? { projectId: project.id, projectTitle: project.title, episodeTitle: displayEpisodeTitle } : undefined}
        onGoToProject={project ? () => navigate(`/project/${project.id}`) : undefined}
      />
      <main className="ml-72 flex-1 h-screen overflow-hidden relative">
        {project && currentEpisode && (() => {
          const { outdatedRefs: outdatedCharacters } = checkCharacterSync(currentEpisode, project);
          const { outdatedRefs: outdatedScenes } = checkSceneSync(currentEpisode, project);
          const { outdatedRefs: outdatedProps } = checkPropSync(currentEpisode, project);

          return (
            <>
              <AssetSyncBanner
                title="Characters"
                outdatedRefs={outdatedCharacters.map(ref => ({ assetId: ref.characterId, syncedVersion: ref.syncedVersion }))}
                resolveName={(assetId) => project.characterLibrary.find(ch => ch.id === assetId)?.name || assetId}
                onSyncAll={syncAllCharactersToEpisode}
              />
              <AssetSyncBanner
                title="Scenes"
                outdatedRefs={outdatedScenes.map(ref => ({ assetId: ref.sceneId, syncedVersion: ref.syncedVersion }))}
                resolveName={(assetId) => project.sceneLibrary.find(sc => sc.id === assetId)?.location || assetId}
                onSyncAll={syncAllScenesToEpisode}
              />
              <AssetSyncBanner
                title="Props"
                outdatedRefs={outdatedProps.map(ref => ({ assetId: ref.propId, syncedVersion: ref.syncedVersion }))}
                resolveName={(assetId) => project.propLibrary.find(pr => pr.id === assetId)?.name || assetId}
                onSyncAll={syncAllPropsToEpisode}
              />
            </>
          );
        })()}
        {renderStage()}
        {showSaveStatus && (
          <div className="absolute top-4 right-6 pointer-events-none flex items-center gap-2 text-xs font-mono text-[var(--text-tertiary)] bg-[var(--overlay-medium)] px-2 py-1 rounded-full backdrop-blur-sm z-50">
            {saveStatus === 'saving' ? (<><Save className="w-3 h-3 animate-pulse" />保存中...</>) : (<><CheckCircle className="w-3 h-3 text-[var(--success)]" />已保存</>)}
          </div>
        )}
      </main>
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} onQuickStart={() => setShowOnboarding(false)} currentApiKey="" onSaveApiKey={() => {}} />}
      <ModelConfigModal isOpen={showModelConfig} onClose={handleCloseModelConfig} />
    </div>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [apiKey, setApiKeyState] = useState('');

  useEffect(() => {
    const storedKey = localStorage.getItem('antsk_api_key');
    if (storedKey) { setApiKeyState(storedKey); setGlobalApiKey(storedKey); }
    if (shouldShowOnboarding()) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('API Key missing') || event.error?.message?.includes('AntSK API Key')) {
        setShowModelConfig(true); event.preventDefault();
      }
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('API Key missing') || event.reason?.message?.includes('AntSK API Key')) {
        setShowModelConfig(true); event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => { window.removeEventListener('error', handleError); window.removeEventListener('unhandledrejection', handleRejection); };
  }, []);

  const handleSaveApiKey = (key: string) => {
    if (key) { setApiKeyState(key); setGlobalApiKey(key); localStorage.setItem('antsk_api_key', key); }
    else { setApiKeyState(''); setGlobalApiKey(''); localStorage.removeItem('antsk_api_key'); }
  };

  return (
    <>
      <Routes>
        <Route path="/" element={
          <Dashboard
            onOpenProject={(proj) => {
              if (proj.projectId) navigate(`/project/${proj.projectId}`);
              else navigate(`/project/${proj.id}/episode/${proj.id}`);
            }}
            onShowOnboarding={() => { resetOnboarding(); setShowOnboarding(true); }}
            onShowModelConfig={() => setShowModelConfig(true)}
          />
        } />
        <Route path="/project/:projectId" element={
          <ProjectProvider>
            <ProjectOverview />
          </ProjectProvider>
        } />
        <Route path="/project/:projectId/characters" element={
          <ProjectProvider>
            <CharacterLibraryPage />
          </ProjectProvider>
        } />
        <Route path="/project/:projectId/episode/:episodeId" element={
          <ProjectProvider>
            <EpisodeWorkspace />
          </ProjectProvider>
        } />
        <Route path="/account" element={<NewApiConsole />} />
      </Routes>
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} onQuickStart={() => setShowOnboarding(false)} currentApiKey={apiKey} onSaveApiKey={handleSaveApiKey} />}
      <ModelConfigModal isOpen={showModelConfig} onClose={() => setShowModelConfig(false)} />
    </>
  );
}

function App() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (isMobile) return <MobileWarning />;
  return <AppRoutes />;
}

export default App;
