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

  const handleDeconstruct = async () => {
    if (!videoLink.trim()) {
      showAlert('请输入视频链接', { type: 'warning' });
      return;
    }
    
    setIsDeconstructing(true);
    const newId = 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const newVideo: BenchmarkVideo = {
      id: newId,
      url: videoLink.trim(),
      title: '正在解析...',
      createdAt: Date.now(),
      lastModified: Date.now(),
      status: 'analyzing',
      deconstructResult: null,
    };
    await saveBenchmarkVideo(newVideo);
    setCurrentBenchmarkId(newId);
    setVideoLink('');
    await loadBenchmarks();

    setTimeout(async () => {
      setIsDeconstructing(false);
      const mockRows = [
        { id: 1, time: '00:00-00:04', desc: '一个可爱的小女孩坐在生日蛋糕后，蛋糕上插满了点燃的蜡烛。家人和朋友在背景中为她唱生日歌。 情绪/表演: 女孩面带微笑，眼神充满幸福和期待。女孩深吸一口气，用力吹灭所有蜡烛。' },
        { id: 2, time: '00:04-00:05', desc: '（快速剪辑开始）女孩穿着校服（红色开衫），在厨房里吃着巧克力棒。背景是贴满画的冰箱与做饭的妈妈。' },
        { id: 3, time: '00:05-00:06', desc: '女孩戴着一顶夸张的白色大檐帽，在镜子前笨拙地涂抹口红，模仿大人。' },
        { id: 4, time: '00:06-00:07', desc: '女孩穿着校服，抱着一只白色毛绒兔子，脸颊亲昵地蹭着它。' },
        { id: 5, time: '00:07-00:08', desc: '女孩鼓起腮帮，双眼圆睁，用力吹奏竖笛。' },
        { id: 6, time: '00:08-00:09', desc: '女孩在客厅里，爸爸捏她的脸颊，她笑着把手推开' },
        { id: 7, time: '00:09-00:10', desc: '女孩在书房里，笨拙地念着单词' },
        { id: 8, time: '00:10-00:11', desc: '女孩在厨房，嘴里吃着意大利面，表情搞怪，背后是爸爸在做饭。' },
        { id: 9, time: '00:11-00:12', desc: '女孩躺在公园的旋转椅子上，父亲在推动，她开心地看着天空。' },
        { id: 10, time: '00:12-00:13', desc: '晚上在卧室，妈妈在为她梳头，问她做了作业没有，女孩表情平静地看着前方。' },
        { id: 11, time: '00:13-00:14', desc: '女孩在自家后院，穿着校服，一个男孩子凑上来亲她，她推开男孩，笑着骂adam' },
        { id: 12, time: '00:14-00:15', desc: '女孩在汽车后座睡着了，怀里抱着毛绒兔子。汽车音响在播报袭击的新闻' },
        { id: 13, time: '00:15-00:16', desc: '晚上，女孩穿着大毛衣，戴着一个有趣的青蛙面具，对着镜头微笑，似乎是万圣节。' },
        { id: 14, time: '00:16-00:17', desc: '女孩和另一个孩子在玩捉迷藏，她躲在衣物后面，抬头向上看，表情期待。' },
        { id: 15, time: '00:17-00:18', desc: '女孩穿着羽绒服，戴着自行车头盔，直视镜头，笑着骑车。' },
        { id: 16, time: '00:18-00:19', desc: '女孩在足球场和爸爸踢球，侧头微笑。' },
        { id: 17, time: '00:19-00:20', desc: '女孩低头专注地玩着魔方。 妈妈在看电视，背景中的电视正在播放袭击的新闻，字幕显示“HUNDREDS DEAD”（数百人死亡）。' },
        { id: 18, time: '00:20-00:21', desc: '女孩在床上安睡，抱着毛绒兔子，光线昏暗。' },
        { id: 19, time: '00:21-00:22', desc: '女孩在公园荡秋千，父亲在后面推，她笑得非常灿烂。' },
        { id: 20, time: '00:22-00:23', desc: '女孩低头看着手机。背景中父亲显得有些焦虑。' },
        { id: 21, time: '00:23-00:24', desc: '女孩低着头。背景中，两个男人在街上激烈地争吵，一个人说“he deserve to get shoot”' },
        { id: 22, time: '00:24-00:25', desc: '女孩下车，和车里的妈妈说，“bye mom”' },
        { id: 23, time: '00:25-00:26', desc: '晚上，女孩和家人一起玩着烟花棒（仙女棒），脸上带着微笑。' },
        { id: 24, time: '00:26-00:27', desc: '女孩在做功课。 背景中，家人正在读报纸，报纸头条是“Government declares Martial Law”（政府宣布戒严）。' },
        { id: 25, time: '00:27-00:28', desc: '女孩在后院，抬头看着天上的飞机飞过，表情疑惑。背景传来飞机的轰鸣声。' },
        { id: 26, time: '00:28-00:29', desc: '女孩站在街边，背着书包，看着镜头，表情严肃。背景中家人正匆忙地把行李装进汽车后备箱。' },
        { id: 27, time: '00:29-00:30', desc: '在室内，女孩闭着眼睛，疲惫地晃动了一下背完重物的肩膀。背景中父亲在拿出收拾的东西。' },
        { id: 28, time: '00:30-00:32', desc: '女孩举着一张自己的画半遮住脸，脸上带着一丝期待地微笑，但爸爸拿开了她的画，继续看背景的新闻播报，女孩的笑容消失。' },
        { id: 29, time: '00:32-00:33', desc: '镜头: 女孩在被子里睁着眼' },
        { id: 30, time: '00:33-00:34', desc: '镜头: 女孩在室内瘪着嘴做作业' },
        { id: 31, time: '00:34-00:35', desc: '女孩在昏暗的房间里看平板电脑，跳闸了，灯灭了，女孩看向天花板' },
        { id: 32, time: '00:35-00:36', desc: '镜头: 昏暗的室内，手持晃动，女孩表情惶恐的和家人一起下楼，轻声喊“What\'s happening?”。' },
        { id: 33, time: '00:36-00:37', desc: '女孩在昏暗的地下室，害怕地缩着肩膀，眼睛看向上方，天花板掉落了厚厚的灰尘下来' },
        { id: 34, time: '00:37-00:38', desc: '停电了，室内只有烛光。女孩靠在父亲身边，眼神里充满了恐惧和迷茫。' },
        { id: 35, time: '00:38-00:39', desc: '冬天女孩只穿了薄薄的衣服，因为停电没有暖气，冻感冒了，打了个喷嚏' },
        { id: 36, time: '00:39-00:40', desc: '女孩拿着水瓶喝水，但水瓶里没有多少水' },
        { id: 37, time: '00:40-00:41', desc: '家人给她喂药水。她的表情麻木。' },
        { id: 38, time: '00:41-00:42', desc: '女孩站在昏暗的房间里，头发遮住了眼睛，表情失落，妈妈在背景里找东西。' },
        { id: 39, time: '00:42-00:43', desc: '一家人彻底离开家。搬家公司的卡车正在装载邻居的物品。女孩被父亲搂着，表情悲伤。' },
        { id: 40, time: '00:43-00:44', desc: '女孩站在一楼楼房下，眼睛看向远方，在等人的样子，突然一枚导弹击中了女孩身后的楼房，整栋楼房轰然倒塌，女孩抱头尖叫，镜头被掀翻' },
        { id: 41, time: '00:44-00:45', desc: '女孩抓着毛绒兔子哭着跑上车，身后跟着奶奶' },
        { id: 42, time: '00:45-00:46', desc: '夜晚，女孩在车后座，瞪着大大的眼睛惊恐地看着窗外闪过的火光和混乱，眼眶红红的，蓄满了泪水' },
        { id: 43, time: '00:46-00:47', desc: '白天，女孩坐在车里，黑眼圈很重了，头发凌乱脸颊和衣服已经有些脏了。她一遍嚼着嘴里的面包，一遍掰开一小块面包，眼神空洞失焦' },
        { id: 44, time: '00:47-00:48', desc: '白天，但车里光线阴暗，女孩害怕地缩着头看着窗外，吃着面包，头顶掠过直升机的声音' },
        { id: 45, time: '00:48-00:49', desc: '白天，女孩吃着手里的干粮，瞪大眼睛害怕地看着前方，问“where are we”' },
        { id: 46, time: '00:49-00:50', desc: '白天，女孩缩着头，拿着手里的干粮，害怕地看着前方' },
        { id: 47, time: '00:50-00:51', desc: '手持镜头，街上一片混乱，到处是爆炸和硝烟，还有枪声，女孩和奶奶爸爸一起奔跑逃离，女孩回头看，（女孩乘坐的）车被击中报废在路边' },
        { id: 48, time: '00:51-00:52', desc: '女孩和爸爸奶奶走在楼房边，硝烟弥漫，女孩被呛到咳嗽，眼睛也眯着' },
        { id: 49, time: '00:52-00:53', desc: '在浓烟中，奶奶惊慌地将一个防毒面具戴在女孩的脸上。' },
        { id: 50, time: '00:53-00:54', desc: '女孩不安地看着镜头，和家人走在废弃的公路上，她的脸脏脏的，头发凌乱，抱着兔子。背景有“DANGER”（危险）和“WRONG WAY”（此路不通）的标志。' },
        { id: 51, time: '00:54-00:55', desc: '黑暗的桥洞下，白天，奶奶给女孩梳头，女孩不安地瞪大眼睛低头看向前方' },
        { id: 52, time: '00:55-00:56', desc: '夜晚，在桥洞下的帐篷，女孩侧躺在脏兮兮的被褥里，害怕地看着周围，奶奶坐在后面，手里拿着蜡烛祈祷' },
        { id: 53, time: '00:56-00:57', desc: '白天，女孩坐在破旧的楼房边，脸上脏兮兮的，头发乱七八糟，用同样脏兮兮的手整理自己的头发' },
        { id: 54, time: '00:57-00:58', desc: '女孩和家人背着行囊，走过一片荒芜的草地。远处的城市天际线已经变得残破，冒着黑烟。' },
        { id: 55, time: '00:58-00:59', desc: '女孩脏兮兮的脸，嫌弃地吃着手上脏兮兮的苹果，背景里奶奶在锄草' },
        { id: 56, time: '00:59-01:00', desc: '女孩慌乱地在树林里逃跑，害怕地回头看，爸爸跟在后面，密集的枪声似乎就在旁边' },
        { id: 57, time: '00:59-01:00', desc: '在一个检查站，人群混乱，女孩被奶奶拉着往前走，大喊着“Daddy!”，爸爸被拦在了后面的铁丝网门后，徒劳地拍打。' },
        { id: 58, time: '01:01-01:02', desc: '在黑暗的避难所里，女孩浑身颤抖，瞪大眼睛哭泣，紧紧抱着毛绒兔子，奶奶表情悲戚地抱着她，同样在哭泣。' },
        { id: 59, time: '01:02-01:03', desc: '白天，女孩独自站在废墟前发呆，表情绝望，眼神空洞，眼泪不停地流下' },
        { id: 60, time: '01:03-01:04', desc: '夜晚，奶奶推着女孩在街上走，女孩向旁边看，表情木然' },
        { id: 61, time: '01:04-01:05', desc: '在难民营，一个士兵用捏女孩的脸，她表情麻木，头发凌乱，浑身脏兮兮' },
        { id: 62, time: '01:05-01:06', desc: '在一个临时的医疗帐篷里，一个医生用听诊器为女孩检查。她穿着病号服，眼神空洞，脸恢复了干净。' },
        { id: 63, time: '01:06-01:07', desc: '在一个不同的医疗帐篷，一个女医生为女孩注射' },
        { id: 64, time: '01:07-01:08', desc: '女孩坐在床边，拿着一个金属杯子，神情呆滞。她穿着病号服，眼神空洞' },
        { id: 65, time: '01:08-01:09', desc: '夜晚，医疗帐篷里，昏暗的灯光，女孩拿着一个大杯子，眼神空洞，神情呆滞，怔怔地发呆' },
        { id: 66, time: '01:08-01:18', desc: '奶奶端着一个金属盘子，上面插着一根小小的、点燃的蜡烛和一块面包，端在女孩的面前，轻声唱着“Happy birthday to you，make a wish darlin ”。女孩披着毯子，眼泪无声地落下，向下抿起嘴，眼神空洞地盯着那微弱的烛光，没有任何反应。' },
      ];
      
      const mappedRows = mockRows.map((row, index) => ({
        ...row,
        // Mock data logic for demonstration, later real analysis data will populate these fields
        videoClip: index === 0 ? 'bg-[var(--bg-sunken)]' : undefined,
        videoPrompt: index === 0 ? '镜头平移或推近，特写小女孩吹蜡烛的动作和神态' : undefined,
        firstFrame: index === 0 ? 'bg-[var(--bg-sunken)]' : undefined,
        firstFramePrompt: index === 0 ? '镜头内，昏暗的室内，有一个点燃蜡烛的蛋糕在中心，一个小女孩坐在蛋糕后，表情期待' : undefined,
        lastFrame: index === 0 ? 'bg-[var(--bg-sunken)]' : undefined,
        lastFramePrompt: index === 0 ? '女孩用力吹灭蜡烛，房间瞬间暗下来' : undefined,
        adjustment: ''
      }));

      const mockMetrics = {
        t0_playCount: '8500万+',
        t0_storyScript: '一个小女孩在战火中长大的故事。以生日吹蜡烛为线索，从和平幸福的日常，急转直下到战争逃难、生离死别，最后在难民营中面对蜡烛毫无生气的反差。',
        t0_viralFactors: '极大的人性共情力、反战题材、孩童视角的强烈反差、首尾呼应的镜头设计（吹蜡烛）',
        t0_homogenization: '极低。属于顶级创意短片，难以低成本被复制或翻拍，具有很强的不可替代性。',
        
        t1_first3sContent: '展示了一个可爱小女孩在家人环绕下幸福吹生日蜡烛的完美童年画面。',
        t1_first3sVisuals: '明亮、温暖、充满期待的特写镜头。',
        t1_duration: '78秒',
        t1_shotCount: '66镜',
        t1_shotDuration: '平均1.18秒/镜（前段快剪），结尾长镜头（10秒）',
        t1_pacing: '节奏感极强：前段（和平）快节奏闪回 -> 中段（战争爆发）混乱急促 -> 结尾（难民营）缓慢而死寂。',
        t1_mainSubject: '小女孩（贯穿始终的核心主角）',
        t1_twistCount: '1次大反转：00:30处新闻播报战争爆发，打破和平日常。',

        t2_music: '采用了能体现童真但随着剧情逐渐扭曲或消失的配乐（通常此类短片前半段欢快，后半段压抑无声或低沉萦绕）',
        t2_soundEffects: '极其逼真：新闻播报声、爆炸轰鸣、人群尖叫、防空警报、直升机声等，强化沉浸感。',
        t2_voiceOver: '无旁白。全靠人物情景环境音和少量台词。',
        t2_artStyle: '真实感极强的纪实/电影质感。',
        t2_visualBrightness: '色彩演变：从前半段的高饱和度、高明度（暖色调） -> 逐渐过渡到低饱和度、低明度（灰暗黑调）。',
        t2_motionMagnitude: '大动态。尤其是中段战争逃亡的纯手持晃动镜头，剧烈且真实。',
        t2_expressionLiveliness: '极高。从小女孩的笑颜、期待 -> 到疑惑 -> 到惊恐绝望 -> 最后是彻底的麻木（PTSD状态），表现力极强。',
        t2_clarity: '高清影视级。',
        t2_interactionGuide: '无显性互动引导，依靠内容本身带来的冲击力驱动用户自发分享与保存。',
        t2_errors: '无明显视觉或逻辑错误。',
        t2_demographics: '全人群覆盖，具有跨越文化和地域的普世反战情感通杀力。',
        t2_transitions: '前半段采用了大量的硬切（快速闪躲），呈现时间流逝；中段大量跳切和手持跟拍；结尾长镜头凝视。',

        t3_subjectiveInterest: '非常有吸引力，非常压抑且震撼，会反思和转发。',
        t3_publishTime: '无特定时效限制，属于长期具备共鸣的经典内容。',
        t3_customMetrics: '情绪反差指数: 最高级 / 泪点刺激: 高 / 人性冲击力: 极强'
      };

      const updatedVideo: BenchmarkVideo = {
        ...newVideo,
        title: '小女孩的一生片段',
        status: 'completed',
        lastModified: Date.now(),
        deconstructResult: mappedRows,
        metrics: mockMetrics
      };
      await saveBenchmarkVideo(updatedVideo);
      await loadBenchmarks();
    }, 1500);
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
                                        <span>{item.status === 'completed' && item.deconstructResult ? `${item.deconstructResult.length} 镜头` : item.status}</span>
                                      </div>
                                    </div>
                                  ))}
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
