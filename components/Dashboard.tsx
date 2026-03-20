import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Folder, ChevronRight, Calendar, AlertTriangle, X, Cpu, Archive, Search, SearchCheck, Sparkles, LayoutPanelTop, Users, MapPin, Package, Database, Settings, Sun, Moon, Film, ExternalLink, User, Link as LinkIcon, Wand2 } from 'lucide-react';
import { SeriesProject, AssetLibraryItem, Character, Scene, Prop, ProjectState, BenchmarkVideo } from '../types';
import { getAllSeriesProjects, createNewSeriesProject, saveSeriesProject, deleteSeriesProject, createNewSeries, saveSeries, createNewEpisode, saveEpisode, getAllAssetLibraryItems, deleteAssetFromLibrary, exportIndexedDBData, getAllBenchmarkVideos, saveBenchmarkVideo, deleteBenchmarkVideo } from '../services/storageService';
import { useAlert } from './GlobalAlert';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
  useBackupTransfer,
  DEFAULT_BACKUP_TRANSFER_MESSAGES,
  globalBackupFileName,
} from '../hooks/useBackupTransfer';
import { DIRECTOR_HUB_URL } from '../constants/links';
import { analyzeYouTubeBenchmark, fetchYouTubeBenchmarkIntake } from '../services/youtubeBenchmarkService';
import { importBenchmarkToProject } from '../services/benchmarkImportService';

interface Props {
  onOpenProject: (project: ProjectState) => void;
  onShowOnboarding?: () => void;
  onShowModelConfig?: () => void;
}

const Dashboard: React.FC<Props> = ({ onOpenProject, onShowModelConfig }) => {
  const { showAlert } = useAlert();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SeriesProject[]>([]);
  const [homeSection, setHomeSection] = useState<'projects' | 'analysis'>('projects');
  const [analysisSubView, setAnalysisSubView] = useState<'benchmark' | 'overview'>('benchmark');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<AssetLibraryItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'character' | 'scene' | 'prop'>('all');
  const [libraryProjectFilter, setLibraryProjectFilter] = useState('all');
  const [assetToUse, setAssetToUse] = useState<AssetLibraryItem | null>(null);
  const [benchmarkToImport, setBenchmarkToImport] = useState<BenchmarkVideo | null>(null);
  const [importingBenchmarkProjectId, setImportingBenchmarkProjectId] = useState<string | null>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Video Deconstruct State
  const [videoLink, setVideoLink] = useState('');
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [benchmarkList, setBenchmarkList] = useState<BenchmarkVideo[]>([]);
  const [currentBenchmarkId, setCurrentBenchmarkId] = useState<string | null>(null);

  const loadBenchmarks = async () => {
    try {
      const list = await getAllBenchmarkVideos();
      setBenchmarkList(list);
    } catch (e) {
      console.error('Failed to load benchmarks', e);
    }
  };

  useEffect(() => {
    loadBenchmarks();
  }, []);

  const currentBenchmark = currentBenchmarkId ? benchmarkList.find(b => b.id === currentBenchmarkId) : null;
  const deconstructResult = currentBenchmark?.deconstructResult || null;
  const getBenchmarkStatusLabel = (item: BenchmarkVideo) => {
    if (item.status !== 'completed') return item.status;
    if (item.deconstructResult?.length) return `${item.deconstructResult.length} 镜头`;
    if (item.analysisMode === 'metadata') return item.fallbackReason === 'missing_api_key' ? '降级分析' : '元数据分析';
    return item.status;
  };
  const transcriptStatusLabel = currentBenchmark?.transcriptStatus === 'available'
    ? `可用${currentBenchmark.sourceMeta?.transcriptLanguage ? ` · ${currentBenchmark.sourceMeta.transcriptLanguage}` : ''}`
    : currentBenchmark?.transcriptStatus === 'error'
      ? '获取失败'
      : '不可用';
  const analysisModeLabel = currentBenchmark?.status !== 'completed'
    ? '分析中'
    : currentBenchmark?.analysisMode === 'metadata'
      ? currentBenchmark?.fallbackReason === 'missing_api_key'
        ? '降级分析'
        : '元数据分析'
      : '完整分析';
  const shouldShowModelConfigAction = currentBenchmark?.fallbackReason === 'missing_api_key' && !!onShowModelConfig;

  const handleDeconstruct = async () => {
    if (!videoLink.trim()) {
      showAlert('请输入视频链接', { type: 'warning' });
      return;
    }

    const sourceUrl = videoLink.trim();
    setIsDeconstructing(true);
    const newId = 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const newVideo: BenchmarkVideo = {
      id: newId,
      url: sourceUrl,
      title: '正在获取视频信息...',
      createdAt: Date.now(),
      lastModified: Date.now(),
      status: 'analyzing',
      deconstructResult: null,
      warnings: [],
    };
    await saveBenchmarkVideo(newVideo);
    setCurrentBenchmarkId(newId);
    setVideoLink('');
    await loadBenchmarks();

    let partialVideo = newVideo;
    try {
      const intake = await fetchYouTubeBenchmarkIntake(sourceUrl);
      partialVideo = {
        ...partialVideo,
        title: intake.title,
        sourceMeta: {
          videoId: intake.videoId,
          canonicalUrl: intake.canonicalUrl,
          channelTitle: intake.channelTitle,
          channelId: intake.channelId,
          thumbnailUrl: intake.thumbnailUrl,
          durationSeconds: intake.durationSeconds,
          viewCount: intake.viewCount,
          likeCount: intake.likeCount,
          transcriptLanguage: intake.transcriptLanguage,
        },
        transcriptStatus: intake.transcriptStatus,
        warnings: intake.warnings,
      };
      await saveBenchmarkVideo(partialVideo);
      await loadBenchmarks();

      const analyzed = await analyzeYouTubeBenchmark(intake);
      const updatedVideo: BenchmarkVideo = {
        ...partialVideo,
        title: analyzed.title,
        status: 'completed',
        deconstructResult: analyzed.shots.length ? analyzed.shots : null,
        metrics: analyzed.metrics,
        sourceMeta: analyzed.sourceMeta,
        transcriptStatus: analyzed.transcriptStatus,
        analysisMode: analyzed.analysisMode,
        fallbackReason: analyzed.fallbackReason,
        analysisBasis: analyzed.analysisBasis,
        warnings: analyzed.warnings,
        errorMessage: undefined,
      };

      await saveBenchmarkVideo(updatedVideo);
      await loadBenchmarks();
      if (analyzed.warnings.length > 0) {
        const priorityWarning = analyzed.warnings[0];
        showAlert(priorityWarning, { type: 'warning' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '视频解构失败';
      await saveBenchmarkVideo({
        ...partialVideo,
        status: 'failed',
        errorMessage: message,
      });
      await loadBenchmarks();
      showAlert(message, { type: 'error' });
    } finally {
      setIsDeconstructing(false);
    }
  };

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const list = await getAllSeriesProjects();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLibrary = async () => {
    setIsLibraryLoading(true);
    try {
      const items = await getAllAssetLibraryItems();
      setLibraryItems(items);
    } catch (e) {
      console.error('Failed to load asset library', e);
    } finally {
      setIsLibraryLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showLibraryModal) {
      loadLibrary();
    }
  }, [showLibraryModal]);

  const openAnalysisView = (view?: 'benchmark' | 'overview') => {
    setHomeSection('analysis');
    if (view) {
      setAnalysisSubView(view);
    }
  };

  const handleCreate = async () => {
    const sp = createNewSeriesProject();
    await saveSeriesProject(sp);
    const s = createNewSeries(sp.id, '第一季', 0);
    await saveSeries(s);
    const ep = createNewEpisode(sp.id, s.id, 1, '第 1 集');
    await saveEpisode(ep);
    navigate(`/project/${sp.id}`);
  };

  const requestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const confirmDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    const projectName = proj?.title || '未命名项目';
    try {
        await deleteSeriesProject(id);
        await loadProjects();
        console.log(`Project "${projectName}" deleted`);
    } catch (error) {
        showAlert(`删除项目失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
        setDeleteConfirmId(null);
    }
  };

  const handleDeleteLibraryItem = (itemId: string) => {
    showAlert('确定从资产库删除该资源吗？', {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteAssetFromLibrary(itemId);
          setLibraryItems((prev) => prev.filter((item) => item.id !== itemId));
        } catch (error) {
          showAlert(`删除资产失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
        }
      }
    });
  };

  const handleUseAsset = async (projectId: string) => {
    if (!assetToUse) return;
    setAssetToUse(null);
    navigate(`/project/${projectId}`);
  };

  const handleImportBenchmarkIntoProject = async (projectId: string) => {
    if (!benchmarkToImport) return;

    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject) {
      showAlert('目标项目不存在或已被删除，请刷新后重试。', { type: 'error' });
      return;
    }

    setImportingBenchmarkProjectId(projectId);
    try {
      const importedEpisode = await importBenchmarkToProject(benchmarkToImport, targetProject);
      await loadProjects();
      setBenchmarkToImport(null);
      showAlert('已创建新的对标导入 Episode，正在进入分析工作台。', { type: 'success' });
      navigate(`/project/${importedEpisode.projectId}/episode/${importedEpisode.id}`);
    } catch (error) {
      showAlert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
      setImportingBenchmarkProjectId(null);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getLibraryProjectName = (item: AssetLibraryItem): string => {
    const projectName = typeof item.projectName === 'string' ? item.projectName.trim() : '';
    return projectName || 'Unknown Project';
  };

  const projectNameOptions = Array.from<string>(
    new Set<string>(
      libraryItems.map((item) => getLibraryProjectName(item))
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const filteredLibraryItems = libraryItems.filter((item) => {
    if (libraryFilter !== 'all' && item.type !== libraryFilter) return false;
    if (libraryProjectFilter !== 'all') {
      const projectName = getLibraryProjectName(item);
      if (projectName !== libraryProjectFilter) return false;
    }
    if (!libraryQuery.trim()) return true;
    const query = libraryQuery.trim().toLowerCase();
    return item.name.toLowerCase().includes(query);
  });

  const totalCharacters = projects.reduce((sum, project) => sum + (project.characterLibrary?.length || 0), 0);
  const totalScenes = projects.reduce((sum, project) => sum + (project.sceneLibrary?.length || 0), 0);
  const totalProps = projects.reduce((sum, project) => sum + (project.propLibrary?.length || 0), 0);
  const totalTemplates = projects.reduce((sum, project) => sum + (project.viralTemplateLibrary?.length || 0), 0);
  const projectsWithTemplates = projects.filter((project) => (project.viralTemplateLibrary?.length || 0) > 0).length;
  const latestProject = projects.reduce<SeriesProject | null>((latest, project) => {
    if (!latest) return project;
    return project.lastModified > latest.lastModified ? project : latest;
  }, null);

  const {
    importInputRef,
    isDataExporting,
    isDataImporting,
    handleExportData,
    handleImportData,
    handleImportFileChange,
  } = useBackupTransfer({
    exporter: exportIndexedDBData,
    exportFileName: globalBackupFileName,
    showAlert,
    messages: DEFAULT_BACKUP_TRANSFER_MESSAGES,
    onImportSuccess: async () => {
      await loadProjects();
      if (showLibraryModal) {
        await loadLibrary();
      }
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-sans selection:bg-[var(--selection-bg)]">
      <div className="min-h-screen lg:flex">
        <aside className="hidden lg:flex lg:w-72 lg:fixed lg:inset-y-0 lg:left-0 border-r border-[var(--border-primary)] bg-[var(--bg-base)] flex-col z-40 overflow-y-auto">
          <div className="p-6 border-b border-[var(--border-subtle)]">
            <div>
              <h1 className="text-2xl font-light text-[var(--text-primary)] tracking-tight">BigBanana</h1>
              <div className="mt-2 text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">Projects Database</div>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-3">导航</div>
              <div className="space-y-1">
              <button
                type="button"
                onClick={() => setHomeSection('projects')}
                aria-pressed={homeSection === 'projects'}
                className={`w-full flex items-center justify-between px-6 py-4 border-l-2 transition-colors ${homeSection === 'projects' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                <div className="flex items-center gap-3">
                  <Folder className="w-4 h-4" />
                  <span className="font-medium text-xs tracking-wider uppercase">项目库</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">HOME</span>
              </button>
              <button
                type="button"
                onClick={() => openAnalysisView()}
                aria-expanded={homeSection === 'analysis'}
                aria-pressed={homeSection === 'analysis'}
                className={`w-full flex items-center justify-between px-6 py-4 border-l-2 transition-colors ${homeSection === 'analysis' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                <div className="flex items-center gap-3">
                  <Search className={`w-4 h-4 ${homeSection === 'analysis' ? 'text-[var(--accent-text)]' : ''}`} />
                  <span className="font-medium text-xs tracking-wider uppercase">数据分析</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">HOME</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${homeSection === 'analysis' ? 'rotate-90 text-[var(--accent-text)]' : ''}`} />
                </div>
              </button>
              {homeSection === 'analysis' && (
                <div className="ml-6 space-y-1 border-l border-[var(--border-subtle)] pl-4">
                  <button
                    type="button"
                    onClick={() => openAnalysisView('benchmark')}
                    aria-pressed={analysisSubView === 'benchmark'}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${analysisSubView === 'benchmark' ? 'bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className={`w-3.5 h-3.5 ${analysisSubView === 'benchmark' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="font-medium text-[11px] tracking-wider uppercase">对标分析</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">01</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAnalysisView('overview')}
                    aria-pressed={analysisSubView === 'overview'}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${analysisSubView === 'overview' ? 'bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutPanelTop className={`w-3.5 h-3.5 ${analysisSubView === 'overview' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="font-medium text-[11px] tracking-wider uppercase">总览</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">02</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 px-6 py-6 space-y-3">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">系统设置</span>
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">{theme === 'dark' ? '亮色' : '暗色'}</span>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="p-6 border-t border-[var(--border-subtle)] space-y-3">
            <button
              onClick={() => navigate('/account')}
              className="w-full flex items-center justify-between text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="打开账号中心"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">账号中心</span>
              <User className="w-4 h-4" />
            </button>
          </div>
        </aside>

        <div className="flex-1 min-h-screen lg:ml-72">
          <main className="p-6 md:p-8 xl:p-10">
            <div className="max-w-7xl mx-auto space-y-8">
              <header className="border-b border-[var(--border-subtle)] pb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-3xl font-light text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                    {homeSection === 'projects' ? '项目库' : '数据分析'}
                    <span className="text-[var(--text-muted)] text-lg">/</span>
                    <span className="text-[var(--text-muted)] text-sm font-mono tracking-widest uppercase">{homeSection === 'projects' ? 'Projects Database' : analysisSubView === 'benchmark' ? 'Benchmark Analysis' : 'Analysis Overview'}</span>
                  </h2>
                  <div className="flex items-center gap-2 lg:hidden pt-2">
                    <button
                      type="button"
                      onClick={() => setHomeSection('projects')}
                      className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${homeSection === 'projects' ? 'border-[var(--text-primary)] bg-[var(--nav-active-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                    >
                      项目库
                    </button>
                    <button
                      type="button"
                      onClick={() => openAnalysisView()}
                      className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${homeSection === 'analysis' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                    >
                      数据分析
                    </button>
                  </div>
                  {homeSection === 'analysis' && (
                    <div className="flex items-center gap-2 lg:hidden pt-1">
                      <button
                        type="button"
                        onClick={() => openAnalysisView('benchmark')}
                        className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${analysisSubView === 'benchmark' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                      >
                        对标分析
                      </button>
                      <button
                        type="button"
                        onClick={() => openAnalysisView('overview')}
                        className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-colors ${analysisSubView === 'overview' ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'}`}
                      >
                        总览
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:hidden">
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="font-medium text-xs tracking-widest uppercase">系统设置</span>
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="group flex items-center gap-2 px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors"
                    title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <span className="font-medium text-xs tracking-widest uppercase">{theme === 'dark' ? '亮色' : '暗色'}</span>
                  </button>
                  <button
                    onClick={handleCreate}
                    className="group flex items-center gap-3 px-6 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="font-bold text-xs tracking-widest uppercase">新建项目</span>
                  </button>
                  <button
                    onClick={() => navigate('/account')}
                    className="group flex items-center gap-2 px-5 py-3 border border-[var(--accent-border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-bg)] transition-colors"
                    title="打开账号中心"
                  >
                    <User className="w-4 h-4" />
                    <span className="font-medium text-xs tracking-widest uppercase">账号中心</span>
                  </button>
                </div>
              </header>

              {homeSection === 'projects' ? (
                <>
                  <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">DirectorHub 资源共创平台</h3>
                        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-3xl">
                          DirectorHub 是一个面向创作者的资源共创平台。在这里你可以上传、下载并分享优质资源，与更多创作者协作成长。我们鼓励原创与高质量内容，对优秀作品提供平台额度补助。
                        </p>
                      </div>
                      <a
                        href={DIRECTOR_HUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium tracking-wide whitespace-nowrap"
                      >
                        访问 DirectorHub
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </section>

                  <section className="border border-[var(--border-primary)] bg-[var(--bg-base)]">
                    <div className="px-5 md:px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">项目库</h3>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{projects.length} projects</div>
                    </div>

                    <div className="p-5 md:p-6">
                      {isLoading ? (
                        <div className="flex justify-center py-20">
                          <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                          <div
                            onClick={handleCreate}
                            className="group cursor-pointer border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] flex flex-col items-center justify-center min-h-[280px] transition-all"
                          >
                            <div className="w-12 h-12 border border-[var(--border-secondary)] flex items-center justify-center mb-6 group-hover:bg-[var(--bg-hover)] transition-colors">
                              <Plus className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
                            </div>
                            <span className="text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-widest group-hover:text-[var(--text-secondary)]">Create New Project</span>
                          </div>

                          {projects.map((proj) => (
                            <div
                              key={proj.id}
                              onClick={() => navigate(`/project/${proj.id}`)}
                              className="group bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] p-0 flex flex-col cursor-pointer transition-all relative overflow-hidden h-[280px]"
                            >
                              {deleteConfirmId === proj.id && (
                                <div className="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                  <div className="w-10 h-10 bg-[var(--error-hover-bg)] flex items-center justify-center rounded-full">
                                    <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                                  </div>
                                  <div className="text-center space-y-2">
                                    <p className="text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">确认删除项目？</p>
                                    <p className="text-[var(--text-tertiary)] text-[10px] font-mono">将删除所有剧集和角色库数据</p>
                                  </div>
                                  <div className="flex gap-2 w-full pt-2">
                                    <button onClick={cancelDelete} className="flex-1 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--border-primary)]">取消</button>
                                    <button onClick={(e) => confirmDelete(e, proj.id)} className="flex-1 py-3 bg-[var(--error-hover-bg)] text-[var(--error-text)] text-[10px] font-bold uppercase tracking-wider transition-colors border border-[var(--error-border)]">永久删除</button>
                                  </div>
                                </div>
                              )}

                              <div className="flex-1 p-6 relative flex flex-col">
                                <button onClick={(e) => requestDelete(e, proj.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--error-text)] transition-all rounded-sm z-10" title="删除项目">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="flex-1">
                                  <Folder className="w-8 h-8 text-[var(--text-muted)] mb-6 group-hover:text-[var(--text-tertiary)] transition-colors" />
                                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 line-clamp-1 tracking-wide">{proj.title}</h3>
                                  <div className="flex flex-wrap gap-2 mb-4">
                                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                      <Users className="w-3 h-3 inline mr-1" />{proj.characterLibrary?.length || 0} 角色
                                    </span>
                                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                      <Film className="w-3 h-3 inline mr-1" />多剧集
                                    </span>
                                  </div>
                                  {proj.description && (
                                    <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed font-mono border-l border-[var(--border-primary)] pl-2">{proj.description}</p>
                                  )}
                                </div>
                              </div>

                              <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
                                <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(proj.lastModified)}
                                </div>
                                <ChevronRight className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  {analysisSubView === 'benchmark' ? (
                    <>
                      <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 md:p-8">
                        <div className="flex flex-wrap items-start justify-between gap-5">
                          <div className="space-y-3 max-w-4xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              <SearchCheck className="h-3.5 w-3.5" />
                              Benchmark Analysis
                            </div>
                            <div>
                              <h3 className="text-2xl md:text-3xl font-semibold tracking-wide text-[var(--text-primary)]">首页视频对标分析工作台</h3>
                              <p className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">
                                这里承接你在项目创作前的对标研究入口：先选项目，再进入具体剧集打开视频分析工作台，完成参考视频拆解、模板沉淀与创作反哺。
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--overlay-light)] px-4 py-3 text-right min-w-[220px]">
                            <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">当前可进入分析的项目</div>
                            <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{projects.length} 个项目</div>
                          </div>
                        </div>
                      </section>

                      {/* Video Deconstruct UI Section */}
                      <section className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-base)] flex flex-col">
                        <div className="px-5 md:px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-[var(--bg-base)] z-20">
                          <div className="flex items-center gap-3">
                            {currentBenchmarkId && (
                              <button
                                onClick={() => { setCurrentBenchmarkId(null); setVideoLink(''); }}
                                className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
                                title="返回历史库"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            )}
                            <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">
                              {currentBenchmarkId ? '解构详情' : '视频解构'}
                            </h3>
                          </div>
                        </div>
                        <div className="p-5 md:p-6 space-y-6">
                          <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <LinkIcon className="h-4 w-4 text-[var(--text-muted)]" />
                              </div>
                              <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-3 border border-[var(--border-secondary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] text-sm transition-colors"
                                placeholder="输入视频直达链接..."
                                value={videoLink}
                                onChange={(e) => setVideoLink(e.target.value)}
                                disabled={isDeconstructing}
                              />
                            </div>
                            <button
                              onClick={handleDeconstruct}
                              disabled={isDeconstructing || !videoLink.trim()}
                              className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-bold uppercase tracking-wider transition-colors ${
                                isDeconstructing || !videoLink.trim()
                                  ? 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-primary)]'
                                  : 'bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]'
                              }`}
                            >
                              {isDeconstructing ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  解构中...
                                </>
                              ) : (
                                <>
                                  <Wand2 className="w-4 h-4" />
                                  开始解构
                                </>
                              )}
                            </button>
                          </div>
                          
                          {!currentBenchmarkId && (
                            <div className="mt-4">
                              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-4">解构历史库</h4>
                              {benchmarkList.length === 0 ? (
                                <div className="py-12 text-center border border-[var(--border-subtle)] bg-[var(--bg-base)] rounded-lg">
                                  <Archive className="w-8 h-8 text-[var(--border-secondary)] mx-auto mb-3" />
                                  <p className="text-sm text-[var(--text-muted)]">暂无对标分析历史，输入链接开始第一次解构</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                  {benchmarkList.map(item => (
                                    <div 
                                      key={item.id} 
                                      onClick={() => setCurrentBenchmarkId(item.id)}
                                      className="group cursor-pointer border border-[var(--border-primary)] bg-[var(--bg-base)] hover:border-[var(--border-secondary)] p-4 rounded-lg flex flex-col gap-2 transition-colors relative"
                                    >
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteBenchmarkVideo(item.id).then(() => loadBenchmarks());
                                        }}
                                        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--error-hover-bg)] text-[var(--text-muted)] hover:text-[var(--error-text)] rounded transition-all"
                                        title="删除记录"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      <div className="flex items-center gap-2">
                                        {item.status === 'analyzing' ? (
                                          <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                                        ) : (
                                          <Film className="w-4 h-4 text-[var(--text-muted)]" />
                                        )}
                                        <span className="text-sm font-bold text-[var(--text-primary)] line-clamp-1 pr-6">{item.title}</span>
                                      </div>
                                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">{item.url}</div>
                                      <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
                                        <span>{formatDate(item.createdAt)}</span>
                                        <span>{getBenchmarkStatusLabel(item)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {currentBenchmarkId && currentBenchmark && (
                            <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">数据来源</div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-bold text-[var(--text-primary)]">{currentBenchmark.title}</div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${currentBenchmark.status !== 'completed' || currentBenchmark.analysisMode === 'metadata' ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-[var(--success-bg)] text-[var(--success-text)]'}`}>
                                      {analysisModeLabel}
                                    </span>
                                  </div>
                                    <div className="mt-1 text-xs text-[var(--text-tertiary)] break-all">{currentBenchmark.sourceMeta?.canonicalUrl || currentBenchmark.url}</div>
                                    {currentBenchmark.analysisBasis && (
                                      <div className="mt-2 text-[11px] text-[var(--text-muted)]">{currentBenchmark.analysisBasis}</div>
                                    )}
                                  </div>
                                  {currentBenchmark.status === 'completed' && (
                                    <div className="flex flex-wrap items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => setBenchmarkToImport(currentBenchmark)}
                                        disabled={projects.length === 0}
                                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Folder className="w-3.5 h-3.5" />
                                        导入到项目工作台
                                      </button>
                                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                        {projects.length > 0 ? '将创建新的 analysis Episode，并保留当前对标结论。' : '请先创建项目再导入。'}
                                      </span>
                                    </div>
                                  )}
                                <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--text-tertiary)] md:text-right">
                                  <div>
                                    <div className="text-[var(--text-muted)]">频道</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.channelTitle || '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">字幕状态</div>
                                    <div className="text-[var(--text-primary)]">{transcriptStatusLabel}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">播放量</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.viewCount ? currentBenchmark.sourceMeta.viewCount.toLocaleString('zh-CN') : '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)]">点赞</div>
                                    <div className="text-[var(--text-primary)]">{currentBenchmark.sourceMeta?.likeCount ? currentBenchmark.sourceMeta.likeCount.toLocaleString('zh-CN') : '-'}</div>
                                  </div>
                                </div>
                              </div>

                              {currentBenchmark.errorMessage && (
                                <div className="rounded-md border border-[var(--error-border)] bg-[var(--error-hover-bg)] px-3 py-2 text-xs leading-6 text-[var(--error-text)]">
                                  {currentBenchmark.errorMessage}
                                </div>
                              )}

                              {!!currentBenchmark.warnings?.length && (
                                <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-xs leading-6 text-[var(--warning)]">
                                  <div className="space-y-1">
                                    {currentBenchmark.warnings.map((warning, index) => (
                                      <div key={`${warning}-${index}`}>{warning}</div>
                                    ))}
                                  </div>
                                  {shouldShowModelConfigAction && (
                                    <button
                                      onClick={onShowModelConfig}
                                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--bg-primary)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                                    >
                                      <Cpu className="w-3.5 h-3.5" />
                                      配置模型
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Metrics Evaluation Panel */}
                          {currentBenchmarkId && currentBenchmark?.metrics && (
                            <div className="mt-8 space-y-6">
                              <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
                                <Sparkles className="w-4 h-4 text-[var(--error)]" />
                                视频爆款因子结构化评估
                              </h4>
                              
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {/* T0 Panel */}
                                <div className="border border-[var(--error-border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
                                  <div className="bg-[var(--error-hover-bg)] px-4 py-2 border-b border-[var(--error-border)] flex items-center gap-2">
                                    <span className="text-xs font-bold text-[var(--error-text)] uppercase tracking-wider">T0 决定上限</span>
                                    <span className="text-[10px] text-[var(--error-text)] opacity-80 uppercase">最重要的核心指标</span>
                                  </div>
                                  <div className="p-4 space-y-4 text-xs">
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold mr-2">播放量:</span>
                                      <span className="text-[var(--text-primary)]">{currentBenchmark.metrics.t0_playCount}</span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 inline-block mb-1">故事脚本:</span>
                                      <p className="text-[var(--text-tertiary)] leading-relaxed bg-[var(--bg-sunken)] p-2 rounded">{currentBenchmark.metrics.t0_storyScript}</p>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 inline-block mb-1">爆款因子:</span>
                                      <p className="text-[var(--text-primary)] leading-relaxed">{currentBenchmark.metrics.t0_viralFactors}</p>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold mr-2">同质化程度:</span>
                                      <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t0_homogenization}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* T1 Panel */}
                                <div className="border border-[var(--border-secondary)] rounded-lg overflow-hidden bg-[var(--bg-primary)] h-fit">
                                  <div className="bg-[var(--overlay-light)] px-4 py-2 border-b border-[var(--border-secondary)] flex items-center gap-2">
                                    <span className="text-xs font-bold text-[var(--accent-text)] uppercase tracking-wider">T1 硬指标</span>
                                    <span className="text-[10px] text-[var(--accent-text)] opacity-80 uppercase">影响观看率与时长</span>
                                  </div>
                                  <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-2 text-[11px]">
                                    <div className="col-span-2">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2">前三秒内容:</span>
                                      <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t1_first3sContent}</span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2">前三秒画面:</span>
                                      <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t1_first3sVisuals}</span>
                                    </div>
                                    <div className="col-span-1 border-t border-[var(--border-subtle)] pt-2 md:border-t-0 md:pt-0">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 block mb-1">总时长</span>
                                      <span className="text-[var(--text-primary)] font-mono">{currentBenchmark.metrics.t1_duration}</span>
                                    </div>
                                    <div className="col-span-1 border-t border-[var(--border-subtle)] pt-2 md:border-t-0 md:pt-0">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 block mb-1">分镜个数</span>
                                      <span className="text-[var(--text-primary)] font-mono">{currentBenchmark.metrics.t1_shotCount}</span>
                                    </div>
                                    <div className="col-span-1">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 block mb-1">分镜时长</span>
                                      <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t1_shotDuration}</span>
                                    </div>
                                    <div className="col-span-1">
                                      <span className="text-[var(--text-secondary)] font-bold mr-2 block mb-1">反转数量</span>
                                      <span className="text-[var(--text-primary)] font-mono text-[var(--error-text)]">{currentBenchmark.metrics.t1_twistCount}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-4 border-t border-[var(--border-subtle)] pt-3 mt-1">
                                      <div><span className="text-[var(--text-secondary)] font-bold mr-2">形象主体:</span> <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t1_mainSubject}</span></div>
                                      <div><span className="text-[var(--text-secondary)] font-bold mr-2">节奏快慢:</span> <span className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t1_pacing}</span></div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* T2 Panel */}
                                <div className="lg:col-span-2 border border-[var(--border-primary)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
                                  <div className="bg-[var(--bg-sunken)] px-4 py-2 border-b border-[var(--border-primary)] flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">T2 软指标</span>
                                    <span className="text-[10px] text-[var(--text-muted)] uppercase">锦上添花的细节体验</span>
                                  </div>
                                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-[11px] text-[var(--text-tertiary)]">
                                    <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2"><span className="text-[var(--text-secondary)] font-bold">画风</span><span>{currentBenchmark.metrics.t2_artStyle}</span></div>
                                    <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2"><span className="text-[var(--text-secondary)] font-bold">音乐</span><span>{currentBenchmark.metrics.t2_music}</span></div>
                                    <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2"><span className="text-[var(--text-secondary)] font-bold">音效</span><span>{currentBenchmark.metrics.t2_soundEffects}</span></div>
                                    <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2"><span className="text-[var(--text-secondary)] font-bold">画面亮度/艳度</span><span>{currentBenchmark.metrics.t2_visualBrightness}</span></div>
                                    <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2 md:col-span-2"><span className="text-[var(--text-secondary)] font-bold">表情与肢体生动度</span><span>{currentBenchmark.metrics.t2_expressionLiveliness}</span></div>
                                    <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">动作幅度</span><span>{currentBenchmark.metrics.t2_motionMagnitude}</span></div>
                                    <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">转场剪辑处理</span><span>{currentBenchmark.metrics.t2_transitions}</span></div>
                                    <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">清晰度与画质</span><span>{currentBenchmark.metrics.t2_clarity}</span></div>
                                    <div className="col-span-2 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-3 mt-1">
                                      <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">配音</span><span>{currentBenchmark.metrics.t2_voiceOver}</span></div>
                                      <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">人群倾向</span><span>{currentBenchmark.metrics.t2_demographics}</span></div>
                                      <div className="flex flex-col gap-1"><span className="text-[var(--text-secondary)] font-bold">细节与Bug</span><span>{currentBenchmark.metrics.t2_errors}</span></div>
                                    </div>
                                  </div>
                                </div>

                                {/* T3 Panel */}
                                <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
                                  <div className="bg-[var(--bg-sunken)] px-4 py-2 border-b border-[var(--border-primary)] flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">T3 灵活指标</span>
                                    <span className="text-[10px] text-[var(--text-muted)] uppercase">受赛道经验影响</span>
                                  </div>
                                  <div className="p-4 space-y-4 text-[11px]">
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold block mb-1">自己能看下去吗？</span>
                                      <p className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t3_subjectiveInterest}</p>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-secondary)] font-bold block mb-1">发布时间</span>
                                      <p className="text-[var(--text-tertiary)]">{currentBenchmark.metrics.t3_publishTime}</p>
                                    </div>
                                    <div className="bg-[var(--bg-sunken)] p-3 rounded border border-[var(--border-subtle)]">
                                      <span className="text-[var(--text-secondary)] font-bold block mb-1 text-[10px] uppercase font-mono">Custom / 赛道专属</span>
                                      <p className="text-[var(--accent-text)]">{currentBenchmark.metrics.t3_customMetrics}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Deconstruct Results Table */}
                          {currentBenchmarkId && deconstructResult && (
                            <div className="mt-6 border border-[var(--border-primary)] rounded-lg overflow-hidden flex flex-col max-h-[500px]">
                              <div className="bg-[var(--table-header-bg)] border-b border-[var(--border-primary)] px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                  解构分镜列表
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">
                                  {deconstructResult.length} 镜头
                                </span>
                              </div>
                              <div className="overflow-x-auto overflow-y-auto w-full max-h-[500px] bg-[var(--bg-primary)]">
                                <table className="w-full text-left border-collapse text-sm min-w-[1400px]">
                                  <thead className="sticky top-0 bg-[var(--bg-sunken)] border-b border-[var(--border-primary)] z-10 shadow-sm">
                                    <tr>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-16 text-center">镜头</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[120px]">视频片段</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[200px]">视频提示词</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[100px]">时间</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[280px]">原视频分镜设计</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[120px]">视频首帧</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[200px]">视频首帧提示词</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[120px]">视频尾帧</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[200px]">视频尾帧提示词</th>
                                      <th className="px-4 py-3 font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-[120px]">调整</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {deconstructResult.map((shot) => (
                                      <tr key={shot.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                                        <td className="px-4 py-3 align-top text-center text-[var(--text-tertiary)] font-mono text-xs">{shot.id}</td>
                                        <td className="px-4 py-3 align-top">
                                          <div className={`w-20 h-12 flex items-center justify-center border border-[var(--border-subtle)] rounded text-[10px] text-[var(--text-muted)] ${shot.videoClip ? shot.videoClip : 'border-dashed'}`}>
                                            片段
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 align-top text-[var(--text-tertiary)] text-xs">{shot.videoPrompt || '-'}</td>
                                        <td className="px-4 py-3 align-top text-[var(--accent-text)] font-mono text-[11px] whitespace-nowrap">{shot.time}</td>
                                        <td className="px-4 py-3 align-top text-[var(--text-secondary)] leading-relaxed text-xs">{shot.desc}</td>
                                        <td className="px-4 py-3 align-top">
                                          <div className={`w-20 h-12 flex items-center justify-center border border-[var(--border-subtle)] rounded text-[10px] text-[var(--text-muted)] ${shot.firstFrame ? shot.firstFrame : 'border-dashed'}`}>
                                            首帧
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 align-top text-[var(--text-tertiary)] text-xs">{shot.firstFramePrompt || '-'}</td>
                                        <td className="px-4 py-3 align-top">
                                          <div className={`w-20 h-12 flex items-center justify-center border border-[var(--border-subtle)] rounded text-[10px] text-[var(--text-muted)] ${shot.lastFrame ? shot.lastFrame : 'border-dashed'}`}>
                                            尾帧
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 align-top text-[var(--text-tertiary)] text-xs">{shot.lastFramePrompt || '-'}</td>
                                        <td className="px-4 py-3 align-top text-[var(--text-tertiary)] text-xs">{shot.adjustment || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>


                    </>
                  ) : (
                    <>
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-2 max-w-3xl">
                            <h3 className="text-sm md:text-base font-bold text-[var(--text-primary)] tracking-wide">首页数据分析总览</h3>
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                              这里聚合当前项目库中的分析相关资产与创作准备度。你可以先在首页查看总体状态，再进入具体项目继续做视频分析、模板沉淀和创作反哺。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCreate}
                            className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium tracking-wide whitespace-nowrap"
                          >
                            <Plus className="w-4 h-4" />
                            新建项目
                          </button>
                        </div>
                      </section>

                      <section className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                        {[
                          { label: '项目数', value: projects.length, icon: Folder },
                          { label: '角色资产', value: totalCharacters, icon: Users },
                          { label: '场景资产', value: totalScenes, icon: MapPin },
                          { label: '道具资产', value: totalProps, icon: Package },
                          { label: '模板资产', value: totalTemplates, icon: Database },
                        ].map((stat) => (
                          <div key={stat.label} className="bg-[var(--bg-primary)] border border-[var(--border-primary)] p-5">
                            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
                              <stat.icon className="w-4 h-4" />
                              <span className="text-[10px] font-mono uppercase tracking-widest">{stat.label}</span>
                            </div>
                            <div className="text-2xl font-light text-[var(--text-primary)]">{stat.value}</div>
                          </div>
                        ))}
                      </section>

                      <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                        <div className="border border-[var(--border-primary)] bg-[var(--bg-base)]">
                          <div className="px-5 md:px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                              <h3 className="text-lg text-[var(--text-primary)] font-bold tracking-wide">项目分析入口</h3>
                              <p className="text-[11px] text-[var(--text-tertiary)] mt-2">选择项目后进入项目概览，再从具体集数进入视频分析工作台。</p>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{projectsWithTemplates} 个项目已沉淀模板</div>
                          </div>

                          <div className="p-5 md:p-6 space-y-4">
                            {isLoading ? (
                              <div className="flex justify-center py-20">
                                <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
                              </div>
                            ) : projects.length === 0 ? (
                              <div className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 text-center space-y-3">
                                <div className="text-sm font-bold text-[var(--text-primary)]">还没有可分析的项目</div>
                                <p className="text-xs text-[var(--text-tertiary)]">先创建一个项目，然后进入具体剧集开展视频分析。</p>
                                <button
                                  type="button"
                                  onClick={handleCreate}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors text-xs font-bold uppercase tracking-widest"
                                >
                                  <Plus className="w-4 h-4" />
                                  创建项目
                                </button>
                              </div>
                            ) : (
                              projects.map((proj) => (
                                <div key={proj.id} className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                  <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                                      <Search className="w-3.5 h-3.5" />
                                      项目入口
                                    </div>
                                    <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{proj.title}</h4>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Users className="w-3 h-3 inline mr-1" />{proj.characterLibrary?.length || 0} 角色
                                      </span>
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Database className="w-3 h-3 inline mr-1" />{proj.viralTemplateLibrary?.length || 0} 模板
                                      </span>
                                      <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
                                        <Calendar className="w-3 h-3 inline mr-1" />{formatDate(proj.lastModified)}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/project/${proj.id}`)}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--border-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-bold uppercase tracking-widest whitespace-nowrap"
                                  >
                                    进入项目概览
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">分析快照</div>
                            <div className="space-y-4">
                              <div>
                                <div className="text-sm font-bold text-[var(--text-primary)]">最近更新项目</div>
                                <div className="text-xs text-[var(--text-tertiary)] mt-2">
                                  {latestProject ? `${latestProject.title} · ${formatDate(latestProject.lastModified)}` : '暂无项目数据'}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-bold text-[var(--text-primary)]">模板沉淀覆盖率</div>
                                <div className="text-xs text-[var(--text-tertiary)] mt-2">
                                  {projects.length > 0 ? `${projectsWithTemplates} / ${projects.length} 个项目已经沉淀了可复用模板。` : '创建项目后可在这里查看模板覆盖率。'}
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 md:p-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">分析路径</div>
                            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                              {[
                                { step: '01', title: '选择项目', description: '进入项目概览，选择要研究的视频对应项目。' },
                                { step: '02', title: '进入剧集', description: '从项目概览进入具体集数，打开视频分析 stage。' },
                                { step: '03', title: '沉淀模板', description: '在分析 stage 中完成拆解、模板沉淀和创作反哺。' },
                              ].map((item) => (
                                <div key={item.step} className="border border-[var(--border-primary)] bg-[var(--bg-sunken)] p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">Step {item.step}</div>
                                  <div className="text-sm font-bold text-[var(--text-primary)] mb-1">{item.title}</div>
                                  <div className="text-xs text-[var(--text-tertiary)] leading-relaxed">{item.description}</div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowSettingsModal(false)}>
          <div
            className="relative w-full max-w-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-4 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--accent-text)]" />
                  系统设置
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Settings</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">管理模型配置、资产库以及数据导入导出</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {onShowModelConfig && (
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    onShowModelConfig();
                  }}
                  className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                    <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
                    模型配置
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">管理模型与 API 设置</div>
                </button>
              )}

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowLibraryModal(true);
                }}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">浏览并复用角色与场景资产</div>
              </button>

              <button
                onClick={handleExportData}
                disabled={isDataExporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导出数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导出全部项目与资产库备份</div>
              </button>

              <button
                onClick={handleImportData}
                disabled={isDataImporting}
                className="p-4 border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-[var(--text-primary)] text-sm font-bold">
                  <Database className="w-4 h-4 text-[var(--accent-text)]" />
                  导入数据
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2">导入全部项目与资产库备份</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setShowLibraryModal(false)}>
          <div
            className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLibraryModal(false)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-6 mb-6">
              <div>
                <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[var(--accent-text)]" />
                  资产库
                  <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Asset Library</span>
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  在项目里将角色与场景加入资产库，跨项目复用
                </p>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                {libraryItems.length} assets
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="搜索资产名称..."
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-secondary)]"
                />
              </div>
              <div className="min-w-[180px]">
                <select
                  value={libraryProjectFilter}
                  onChange={(e) => setLibraryProjectFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-secondary)]"
                >
                  <option value="all">全部项目</option>
                  {projectNameOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {(['all', 'character', 'scene', 'prop'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLibraryFilter(type)}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border rounded ${
                      libraryFilter === type
                        ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                        : 'bg-transparent text-[var(--text-tertiary)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    {type === 'all' ? '全部' : type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具'}
                  </button>
                ))}
              </div>
            </div>

            {isLibraryLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
              </div>
            ) : filteredLibraryItems.length === 0 ? (
              <div className="border border-dashed border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
                暂无资产。可在项目的“角色与场景”中加入资产库。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredLibraryItems.map((item) => {
                  const preview =
                    item.type === 'character'
                      ? (item.data as Character).referenceImage
                      : item.type === 'scene'
                      ? (item.data as Scene).referenceImage
                      : (item.data as Prop).referenceImage;
                  return (
                    <div
                      key={item.id}
                      className="bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] transition-colors rounded-xl overflow-hidden"
                    >
                      <div className="aspect-video bg-[var(--bg-elevated)]">
                        {preview ? (
                          <img src={preview} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                            {item.type === 'character' ? (
                              <Users className="w-8 h-8 opacity-30" />
                            ) : item.type === 'scene' ? (
                              <MapPin className="w-8 h-8 opacity-30" />
                            ) : (
                              <Package className="w-8 h-8 opacity-30" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{item.name}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest mt-1">
                            {item.type === 'character' ? '角色' : item.type === 'scene' ? '场景' : '道具'}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1 line-clamp-1">
                            {(item.projectName && item.projectName.trim()) || '未知项目'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAssetToUse(item)}
                            className="flex-1 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            选择项目使用
                          </button>
                          <button
                            onClick={() => handleDeleteLibraryItem(item.id)}
                            className="p-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Library Project Picker */}
      {assetToUse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => setAssetToUse(null)}>
          <div
            className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAssetToUse(null)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">选择项目使用</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                将资产“{assetToUse.name}”导入到以下项目
              </div>
              {projects.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">暂无项目可用</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleUseAsset(proj.id)}
                      className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">最后修改: {formatDate(proj.lastModified)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {benchmarkToImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6" onClick={() => importingBenchmarkProjectId ? null : setBenchmarkToImport(null)}>
          <div
            className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setBenchmarkToImport(null)}
              disabled={Boolean(importingBenchmarkProjectId)}
              className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">选择项目导入</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono leading-6">
                将“{benchmarkToImport.title}”导入为新的 analysis Episode。系统会保留当前对标镜头、字幕/元数据结论和 warning，不会伪造本地视频文件。
              </div>
              {projects.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">暂无项目可用，请先创建项目。</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((proj) => {
                    const isImporting = importingBenchmarkProjectId === proj.id;
                    return (
                      <button
                        key={proj.id}
                        onClick={() => handleImportBenchmarkIntoProject(proj.id)}
                        disabled={Boolean(importingBenchmarkProjectId)}
                        className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                          {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">最后修改: {formatDate(proj.lastModified)}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono mt-2">{isImporting ? '正在创建导入 Episode…' : '导入后会直接跳转到分析工作台'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  );
};

export default Dashboard;
