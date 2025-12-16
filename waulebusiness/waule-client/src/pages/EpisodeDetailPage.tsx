import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient, api } from '../lib/api'
import { generateAssetName } from '../utils/assetNaming'

interface Episode {
  id: string
  name: string
  description?: string
  episodeNumber?: number
  canEdit?: boolean
  isOwner?: boolean
}

interface Project {
  id: string
  name: string
  description?: string
  isOwner?: boolean
  isShared?: boolean
}

type ScriptShot = {
  shotIndex: number
  '画面': string
  '景别/镜头': string
  '内容/动作': string
  '声音/对话': string
  '时长': string
  '提示词': string
  media?: { type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square'; nodeId?: string }
  mediaList?: Array<{ type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square'; nodeId?: string }>
  // 每个分镜选中的资产
  selectedRoles?: Array<{ id: string; name: string; thumbnail?: string }>
  selectedScenes?: Array<{ id: string; name: string; url?: string }>
  selectedProps?: Array<{ id: string; name: string; url?: string }>
  selectedAudios?: Array<{ id: string; name: string; url?: string }>
}

interface AssetLibrary {
  id: string
  name: string
  category: 'ROLE' | 'SCENE' | 'PROP' | 'AUDIO' | 'OTHER'
  thumbnail?: string
}

interface RoleAsset {
  id: string
  name: string
  thumbnail?: string
  metadata?: any
}

export default function EpisodeDetailPageNew() {
  const { projectId, episodeId } = useParams<{ projectId: string; episodeId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  // 从 URL 读取初始分镜索引
  const initialShotFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const shot = Number(params.get('shot'))
    return Number.isFinite(shot) && shot > 0 ? shot : null
  }, [location.search])
  
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [shots, setShots] = useState<ScriptShot[]>([])
  const [currentShotIndex, setCurrentShotIndex] = useState(1)
  const [saving, setSaving] = useState(false)
  const [shotListOffset, setShotListOffset] = useState(0)
  const shotItemWidth = 140 // 每个镜头卡片宽度 + 间距
  
  // 自动保存防抖
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>('')

  // 资产库配置
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [availableLibraries, setAvailableLibraries] = useState<AssetLibrary[]>([])
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([])
  const [allRoles, setAllRoles] = useState<RoleAsset[]>([])
  const [allScenes, setAllScenes] = useState<any[]>([])
  const [allProps, setAllProps] = useState<any[]>([])
  const [allAudios, setAllAudios] = useState<any[]>([])
  
  // 资产选择弹窗
  const [showAssetPicker, setShowAssetPicker] = useState<'role' | 'scene' | 'prop' | 'audio' | null>(null)

  // 拖拽排序状态
  const [draggedShotIndex, setDraggedShotIndex] = useState<number | null>(null)
  const [dragOverShotIndex, setDragOverShotIndex] = useState<number | null>(null)

  // 当前选中的镜头
  const currentShot = useMemo(() => {
    return shots.find(s => s.shotIndex === currentShotIndex) || null
  }, [shots, currentShotIndex])

  // 只读模式
  const canEdit = episode?.canEdit ?? true

  // 加载剧集数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await apiClient.episodes.getById(projectId!, episodeId!)
        const ep = (res as any)?.data ?? res
        setEpisode(ep)
        
        // 解析分镜数据 - 扁平化处理（移除幕的概念）
        const acts = (ep as any)?.scriptJson?.acts
        if (Array.isArray(acts) && acts.length > 0) {
          // 将所有幕的镜头合并，重新编号
          const allShots: ScriptShot[] = []
          let shotCounter = 1
          acts.forEach((act: any) => {
            if (Array.isArray(act.shots)) {
              act.shots.forEach((shot: any) => {
                allShots.push({ ...shot, shotIndex: shotCounter++ })
              })
            }
          })
          setShots(allShots)
          lastSavedRef.current = JSON.stringify(allShots) // 记录初始数据
          if (allShots.length > 0) {
            // 如果 URL 有 shot 参数且有效，使用它；否则默认第一个
            const targetShot = initialShotFromUrl && initialShotFromUrl <= allShots.length ? initialShotFromUrl : 1
            setCurrentShotIndex(targetShot)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [projectId, episodeId])

  // 加载项目数据
  useEffect(() => {
    const loadProject = async () => {
      try {
        const res = await apiClient.projects.getById(projectId!)
        setProject(res.data)
      } catch {}
    }
    if (projectId) loadProject()
  }, [projectId])

  // 加载可用资产库列表
  useEffect(() => {
    const loadLibraries = async () => {
      try {
        const res = await apiClient.assetLibraries.getAll()
        setAvailableLibraries(res.data || [])
      } catch {}
    }
    loadLibraries()
  }, [])

  // 从本地存储加载已配置的资产库
  useEffect(() => {
    if (episodeId) {
      const saved = localStorage.getItem(`episode_${episodeId}_libraries`)
      if (saved) {
        try {
          setSelectedLibraryIds(JSON.parse(saved))
        } catch {}
      }
    }
  }, [episodeId])

  // 当选中的资产库变化时，加载可用资产列表（供选择）
  useEffect(() => {
    const loadAssetsFromLibraries = async () => {
      if (selectedLibraryIds.length === 0) {
        setAllRoles([])
        setAllScenes([])
        setAllProps([])
        setAllAudios([])
        return
      }

      const roleLibs = availableLibraries.filter(l => l.category === 'ROLE' && selectedLibraryIds.includes(l.id))
      const sceneLibs = availableLibraries.filter(l => l.category === 'SCENE' && selectedLibraryIds.includes(l.id))
      const propLibs = availableLibraries.filter(l => l.category === 'PROP' && selectedLibraryIds.includes(l.id))
      const audioLibs = availableLibraries.filter(l => l.category === 'AUDIO' && selectedLibraryIds.includes(l.id))

      // 加载角色
      const roles: RoleAsset[] = []
      for (const lib of roleLibs) {
        try {
          const res = await apiClient.assetLibraries.roles.list(lib.id)
          if (res.data) roles.push(...res.data)
        } catch {}
      }
      setAllRoles(roles)

      // 加载场景
      const scenes: any[] = []
      for (const lib of sceneLibs) {
        try {
          const res = await apiClient.assetLibraries.getAssets(lib.id)
          if (res.data) scenes.push(...res.data)
        } catch {}
      }
      setAllScenes(scenes)

      // 加载道具
      const props: any[] = []
      for (const lib of propLibs) {
        try {
          const res = await apiClient.assetLibraries.getAssets(lib.id)
          if (res.data) props.push(...res.data)
        } catch {}
      }
      setAllProps(props)

      // 加载音频
      const audios: any[] = []
      for (const lib of audioLibs) {
        try {
          const res = await apiClient.assetLibraries.getAssets(lib.id)
          if (res.data) audios.push(...res.data)
        } catch {}
      }
      setAllAudios(audios)
    }

    if (availableLibraries.length > 0) {
      loadAssetsFromLibraries()
    }
  }, [selectedLibraryIds, availableLibraries])

  // 为当前分镜添加/移除资产
  const toggleAssetForShot = (type: 'role' | 'scene' | 'prop' | 'audio', asset: any) => {
    if (!currentShot) {
      toast.error('请先选择一个分镜')
      return
    }
    
    setShots(prev => prev.map(s => {
      if (s.shotIndex !== currentShotIndex) return s
      
      const key = type === 'role' ? 'selectedRoles' : type === 'scene' ? 'selectedScenes' : type === 'prop' ? 'selectedProps' : 'selectedAudios'
      const current = (s as any)[key] || []
      const exists = current.some((a: any) => a.id === asset.id)
      
      return {
        ...s,
        [key]: exists 
          ? current.filter((a: any) => a.id !== asset.id)
          : [...current, { id: asset.id, name: asset.name, thumbnail: asset.thumbnail, url: asset.url, metadata: asset.metadata }]
      }
    }))
    // 自动保存由 useEffect 处理
  }

  // 检查资产是否已选中
  const isAssetSelected = (type: 'role' | 'scene' | 'prop' | 'audio', assetId: string) => {
    if (!currentShot) return false
    const key = type === 'role' ? 'selectedRoles' : type === 'scene' ? 'selectedScenes' : type === 'prop' ? 'selectedProps' : 'selectedAudios'
    return (currentShot[key] || []).some((a: any) => a.id === assetId)
  }

  // 保存资产库配置
  const saveLibraryConfig = (ids: string[]) => {
    setSelectedLibraryIds(ids)
    if (episodeId) {
      localStorage.setItem(`episode_${episodeId}_libraries`, JSON.stringify(ids))
    }
    setShowConfigModal(false)
    toast.success('资产库配置已保存')
  }

  // 切换资产库选中状态
  const toggleLibrary = (id: string) => {
    setSelectedLibraryIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // 保存分镜数据（转换回acts格式以保持后端兼容）
  const saveShots = useCallback(async (newShots: ScriptShot[]) => {
    try {
      setSaving(true)
      // 转换为单幕格式
      const acts = [{ actIndex: 1, shots: newShots }]
      await apiClient.episodes.update(projectId!, episodeId!, { scriptJson: { acts } })
      lastSavedRef.current = JSON.stringify(newShots)
    } catch (e: any) {
      toast.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [projectId, episodeId])

  // 防抖自动保存
  const debouncedSave = useCallback((newShots: ScriptShot[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      const currentData = JSON.stringify(newShots)
      if (currentData !== lastSavedRef.current) {
        saveShots(newShots)
      }
    }, 1000) // 1秒后自动保存
  }, [saveShots])

  // 监听 shots 变化，自动保存
  useEffect(() => {
    if (shots.length > 0 && !loading) {
      debouncedSave(shots)
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [shots, loading, debouncedSave])

  // 页面卸载前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      const currentData = JSON.stringify(shots)
      if (currentData !== lastSavedRef.current && shots.length > 0) {
        // 同步保存（尽力而为）
        const acts = [{ actIndex: 1, shots }]
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_API_URL || ''}/api/tenant/projects/${projectId}/episodes/${episodeId}`,
          JSON.stringify({ scriptJson: { acts } })
        )
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [shots, projectId, episodeId])

  // 更新镜头字段
  const updateShotField = (shotIndex: number, key: string, value: string) => {
    setShots(prev => prev.map(s => 
      s.shotIndex === shotIndex ? { ...s, [key]: value } : s
    ))
  }

  // 新增镜头
  const addShot = async () => {
    const newIndex = shots.length > 0 ? Math.max(...shots.map(s => s.shotIndex)) + 1 : 1
    const newShot: ScriptShot = {
      shotIndex: newIndex,
      '画面': '',
      '景别/镜头': '',
      '内容/动作': '',
      '声音/对话': '',
      '时长': '',
      '提示词': '',
    }
    const newShots = [...shots, newShot]
    setShots(newShots)
    setCurrentShotIndex(newIndex)
    await saveShots(newShots)
  }

  // 删除镜头
  const removeShot = async (shotIndex: number) => {
    if (!window.confirm('确认删除该镜头？')) return
    
    const newShots = shots
      .filter(s => s.shotIndex !== shotIndex)
      .map((s, i) => ({ ...s, shotIndex: i + 1 }))
    
    setShots(newShots)
    if (currentShotIndex === shotIndex) {
      setCurrentShotIndex(newShots.length > 0 ? newShots[0].shotIndex : 0)
    } else if (currentShotIndex > shotIndex) {
      setCurrentShotIndex(currentShotIndex - 1)
    }
    await saveShots(newShots)
  }

  // 拖拽排序处理
  const handleDragStart = (e: React.DragEvent, shotIndex: number) => {
    if (!canEdit) return
    setDraggedShotIndex(shotIndex)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, shotIndex: number) => {
    e.preventDefault()
    if (draggedShotIndex === null || draggedShotIndex === shotIndex) return
    setDragOverShotIndex(shotIndex)
  }

  const handleDragLeave = () => {
    setDragOverShotIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedShotIndex === null || draggedShotIndex === targetIndex) {
      setDraggedShotIndex(null)
      setDragOverShotIndex(null)
      return
    }

    // 重新排序
    const newShots = [...shots]
    const draggedIdx = newShots.findIndex(s => s.shotIndex === draggedShotIndex)
    const targetIdx = newShots.findIndex(s => s.shotIndex === targetIndex)
    
    if (draggedIdx === -1 || targetIdx === -1) return

    const [removed] = newShots.splice(draggedIdx, 1)
    newShots.splice(targetIdx, 0, removed)
    
    // 重新编号
    const reindexedShots = newShots.map((s, i) => ({ ...s, shotIndex: i + 1 }))
    
    setShots(reindexedShots)
    // 更新当前选中的镜头索引
    if (currentShotIndex === draggedShotIndex) {
      setCurrentShotIndex(targetIndex)
    }
    
    setDraggedShotIndex(null)
    setDragOverShotIndex(null)
    await saveShots(reindexedShots)
  }

  const handleDragEnd = () => {
    setDraggedShotIndex(null)
    setDragOverShotIndex(null)
  }

  // 下载视频
  const downloadVideo = async (videoUrl: string, shotIndex: number, mediaIndex?: number) => {
    try {
      let fileName = '视频.mp4'
      if (project && episode) {
        const assetName = generateAssetName({
          project: { id: project.id, name: project.name, type: (project as any).type || 'QUICK' },
          episode: { id: episode.id, episodeNumber: (episode as any).episodeNumber || 1 },
          nodeGroup: { id: `shot-${shotIndex}`, scene: 1, shot: shotIndex, nodeIds: [] },
          nodeId: `video-${shotIndex}-${mediaIndex || 0}`,
          assetType: 'video',
          preview: false
        })
        if (assetName) fileName = assetName
      }
      
      const response = await api.get('/assets/proxy-download-with-name', {
        params: { url: videoUrl, filename: fileName },
        responseType: 'blob'
      })
      
      const blob = response.data
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error: any) {
      toast.error('下载失败: ' + (error.message || '未知错误'))
    }
  }

  // 进入工作流
  const enterWorkflow = async () => {
    // 先保存当前数据
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    if (shots.length > 0) {
      await saveShots(shots)
    }
    
    // 构建资产参数
    const assets: any[] = []
    if (currentShot?.selectedRoles) {
      currentShot.selectedRoles.forEach((r: any) => assets.push({ type: 'role', ...r }))
    }
    if (currentShot?.selectedScenes) {
      currentShot.selectedScenes.forEach((s: any) => assets.push({ type: 'scene', ...s }))
    }
    if (currentShot?.selectedProps) {
      currentShot.selectedProps.forEach((p: any) => assets.push({ type: 'prop', ...p }))
    }
    
    const assetsParam = assets.length > 0 ? `&assets=${encodeURIComponent(JSON.stringify(assets))}` : ''
    navigate(`/projects/${projectId}/episodes/${episodeId}/workflow?scene=1&shot=${currentShotIndex}${assetsParam}`)
  }

  const projectName = project?.name || ''
  const epNo = episode?.episodeNumber && episode.episodeNumber > 0 ? episode.episodeNumber : undefined

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="h-14 border-b border-slate-400 dark:border-white/20 flex items-center justify-between px-4 bg-white/70 dark:bg-black/30 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
            className="text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="h-5 w-px bg-border-light dark:bg-border-dark"></div>
          <h2 className="text-text-light-primary dark:text-text-dark-primary font-bold">
            《{projectName}》{epNo && <span className="font-normal text-text-light-secondary dark:text-text-dark-secondary text-sm ml-2">第{epNo}集</span>}
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary uppercase tracking-wider">
            {canEdit ? 'Draft' : 'View Only'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-text-light-secondary dark:text-text-dark-secondary">保存中...</span>}
          <button 
            onClick={() => setShowConfigModal(true)}
            className="h-8 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white text-sm font-medium hover:shadow-lg hover:scale-105 transition-all shadow-md flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">inventory_2</span>
            配置资产库
            {selectedLibraryIds.length > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{selectedLibraryIds.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Three Columns */}
      <div className="flex-1 grid grid-cols-[320px_1fr_420px] min-h-0 overflow-hidden">
        {/* Left Sidebar - Materials */}
        <div className="border-r border-slate-400 dark:border-white/20 flex flex-col bg-white/70 dark:bg-black/30 backdrop-blur-xl">
          <div className="h-10 flex items-center px-4 border-b border-slate-400 dark:border-white/20">
            <span className="text-text-light-primary dark:text-text-dark-primary font-bold text-sm">素材列表</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {currentShot && (
              <>
                {/* 显示当前镜头的媒体 */}
                {Array.isArray(currentShot.mediaList) && currentShot.mediaList.length > 0 ? (
                  currentShot.mediaList.map((m, idx) => (
                    <div key={idx} className="group relative flex gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-card-dark-hover cursor-pointer transition-colors border border-transparent hover:border-border-light dark:hover:border-border-dark">
                      <div className="w-24 aspect-video bg-slate-200 dark:bg-border-dark rounded overflow-hidden relative">
                        {m?.type === 'video' && m?.url ? (
                          <video src={m.url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">movie</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <p className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">视频 {idx + 1}</p>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[14px] text-text-light-secondary dark:text-text-dark-secondary">videocam</span>
                          <p className="text-text-light-secondary dark:text-text-dark-secondary text-xs">{m.aspectRatio || '16:9'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : currentShot.media?.url ? (
                  <div className="group relative flex gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-card-dark-hover cursor-pointer transition-colors border border-transparent hover:border-border-light dark:hover:border-border-dark">
                    <div className="w-24 aspect-video bg-slate-200 dark:bg-border-dark rounded overflow-hidden relative">
                      <video src={currentShot.media.url} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <p className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">主视频</p>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] text-text-light-secondary dark:text-text-dark-secondary">videocam</span>
                        <p className="text-text-light-secondary dark:text-text-dark-secondary text-xs">{currentShot.media.aspectRatio || '16:9'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-text-light-secondary dark:text-text-dark-secondary text-sm py-8">
                    <span className="material-symbols-outlined text-4xl mb-2 block">movie</span>
                    暂无素材
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-4 border-t border-slate-400 dark:border-white/20">
            <button 
              onClick={enterWorkflow}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 text-white text-sm font-medium hover:shadow-lg hover:scale-[1.02] transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              生成素材
            </button>
          </div>
        </div>

        {/* Center - Preview */}
        <div className="bg-white/70 dark:bg-black/30 backdrop-blur-xl flex flex-col relative">
          <div className="h-10 flex items-center justify-between px-4 border-b border-slate-400 dark:border-white/20">
            <div className="flex items-center gap-3 text-text-light-secondary dark:text-text-dark-secondary text-sm">
              <span className="font-bold text-text-light-primary dark:text-text-dark-primary">Shot {currentShotIndex.toString().padStart(2, '0')}</span>
              <span>/</span>
              <span>共 {shots.length} 镜</span>
            </div>
            <div className="flex items-center gap-2">
              {currentShot && (currentShot.mediaList?.[0]?.url || currentShot.media?.url) && (
                <button 
                  onClick={() => downloadVideo(currentShot.mediaList?.[0]?.url || currentShot.media?.url || '', currentShotIndex)}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                </button>
              )}
            </div>
          </div>
          
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <div className="max-w-full max-h-full aspect-video bg-slate-900 rounded-lg shadow-2xl relative overflow-hidden group border border-border-light dark:border-border-dark">
              {currentShot && (currentShot.mediaList?.[0]?.url || currentShot.media?.url) ? (
                <video 
                  src={currentShot.mediaList?.[0]?.url || currentShot.media?.url} 
                  controls 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-500 mb-2">movie</span>
                    <p className="text-slate-400 text-sm">暂无视频</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Script */}
        <div className="border-l border-slate-400 dark:border-white/20 bg-white/70 dark:bg-black/30 backdrop-blur-xl flex flex-col">
          <div className="h-10 flex items-center justify-between px-4 border-b border-slate-400 dark:border-white/20">
            <span className="text-text-light-primary dark:text-text-dark-primary font-bold text-sm">脚本</span>
            {canEdit && (
              <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary transition-colors">
                <span className="material-symbols-outlined text-lg">edit_note</span>
              </button>
            )}
          </div>
          <div className="flex-1 p-4 flex flex-col min-h-0">
            {currentShot ? (
              <div className="flex flex-col gap-3 h-full">
                {/* 画面 - 22.5% */}
                <div className="flex flex-col" style={{ flex: '0 0 22.5%' }}>
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">画面</label>
                  <textarea
                    value={currentShot['画面']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '画面', e.target.value) : undefined}
                    onBlur={canEdit ? () => saveShots(shots) : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-purple-500 focus:outline-none backdrop-blur-sm"
                    placeholder="描述画面内容..."
                  />
                </div>
                {/* 动作 - 22.5% */}
                <div className="flex flex-col" style={{ flex: '0 0 22.5%' }}>
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">动作</label>
                  <textarea
                    value={currentShot['内容/动作']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '内容/动作', e.target.value) : undefined}
                    onBlur={canEdit ? () => saveShots(shots) : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-purple-500 focus:outline-none backdrop-blur-sm"
                    placeholder="描述角色动作..."
                  />
                </div>
                {/* 提示词 - 剩余空间 */}
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">提示词</label>
                  <textarea
                    value={currentShot['提示词']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '提示词', e.target.value) : undefined}
                    onBlur={canEdit ? () => saveShots(shots) : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-purple-500 focus:outline-none backdrop-blur-sm"
                    placeholder="AI 生成提示词..."
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-text-light-secondary dark:text-text-dark-secondary py-8">
                选择一个镜头查看脚本
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Shot Timeline + Resources */}
      <div className="h-80 border-t border-slate-400 dark:border-white/20 bg-white/70 dark:bg-black/30 backdrop-blur-xl shrink-0 flex flex-col">
        {/* Shot Timeline */}
        <div className="flex-1 flex items-center justify-center px-4 gap-3 border-b border-slate-400 dark:border-white/20">
          {/* Left Arrow */}
          <button
            onClick={() => setShotListOffset(Math.max(0, shotListOffset - 1))}
            disabled={shotListOffset <= 0}
            className="shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-border-dark flex items-center justify-center text-text-light-secondary dark:text-text-dark-secondary hover:bg-slate-300 dark:hover:bg-border-dark-hover hover:text-text-light-primary dark:hover:text-text-dark-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          
          {/* Shot List Container */}
          <div className="flex-1 overflow-x-hidden overflow-y-visible py-2 px-4">
            <div 
              className="flex gap-3 transition-transform duration-300"
              style={{ transform: `translateX(-${shotListOffset * (shotItemWidth + 12)}px)` }}
            >
          {shots.map((shot) => (
            <div 
              key={shot.shotIndex}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, shot.shotIndex)}
              onDragOver={(e) => handleDragOver(e, shot.shotIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, shot.shotIndex)}
              onDragEnd={handleDragEnd}
              onClick={() => setCurrentShotIndex(shot.shotIndex)}
              className={`flex flex-col gap-1 shrink-0 cursor-pointer transition-all ${
                shot.shotIndex === currentShotIndex 
                  ? 'opacity-100' 
                  : 'opacity-60 hover:opacity-100'
              } ${draggedShotIndex === shot.shotIndex ? 'opacity-50 scale-95' : ''} ${dragOverShotIndex === shot.shotIndex ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}
            >
              <div className={`w-32 h-24 bg-slate-200 dark:bg-border-dark rounded-lg overflow-hidden relative ${
                shot.shotIndex === currentShotIndex 
                  ? 'ring-2 ring-purple-500 dark:ring-purple-400 shadow-[0_0_20px_-3px_rgba(168,85,247,0.5)]' 
                  : 'ring-1 ring-slate-200 dark:ring-white/10 hover:ring-purple-400/50 dark:hover:ring-purple-400/30'
              }`}>
                {(shot.mediaList?.[0]?.url || shot.media?.url) ? (
                  <video 
                    src={shot.mediaList?.[0]?.url || shot.media?.url} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-3xl text-text-light-secondary dark:text-text-dark-secondary">movie</span>
                  </div>
                )}
                {shot.shotIndex === currentShotIndex && (
                  <div className="absolute top-1 right-1 size-2 bg-primary-500 rounded-full animate-pulse"></div>
                )}
              </div>
              <span className={`text-[10px] text-center ${
                shot.shotIndex === currentShotIndex 
                  ? 'text-primary-500 font-bold' 
                  : 'text-text-light-secondary dark:text-text-dark-secondary'
              }`}>
                Shot {shot.shotIndex.toString().padStart(2, '0')} - {shot['时长'] || '0s'}
              </span>
            </div>
          ))}
          
          {/* Add Shot Button */}
          {canEdit && (
            <div 
              onClick={addShot}
              className="w-12 h-24 rounded-lg border border-dashed border-border-light dark:border-border-dark flex items-center justify-center text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 cursor-pointer transition-all shrink-0"
            >
              <span className="material-symbols-outlined">add</span>
            </div>
          )}
            </div>
          </div>
          
          {/* Right Arrow */}
          <button
            onClick={() => setShotListOffset(Math.min(Math.max(0, shots.length - 5), shotListOffset + 1))}
            disabled={shotListOffset >= Math.max(0, shots.length - 5)}
            className="shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-border-dark flex items-center justify-center text-text-light-secondary dark:text-text-dark-secondary hover:bg-slate-300 dark:hover:bg-border-dark-hover hover:text-text-light-primary dark:hover:text-text-dark-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
          
          {/* Delete Current Shot */}
          {canEdit && currentShot && shots.length > 0 && (
            <button
              onClick={() => removeShot(currentShotIndex)}
              className="shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              title="删除当前镜头"
            >
              <span className="material-symbols-outlined text-lg">delete</span>
            </button>
          )}
        </div>

        {/* Resources Panel - Characters / Scene / Props / Audio (per shot) */}
        <div className="flex-1 grid grid-cols-4 divide-x divide-slate-400 dark:divide-purple-400/30">
          {/* Characters */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">face</span> 角色 {(currentShot?.selectedRoles?.length || 0) > 0 && <span className="text-primary-500">({currentShot?.selectedRoles?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {/* 已选角色 */}
              {(currentShot?.selectedRoles || []).map((role: any) => (
                <div key={role.id} className="shrink-0 flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity group relative">
                  <div className="size-12 rounded-full border-2 border-slate-400 dark:border-purple-400 overflow-hidden bg-slate-100 dark:bg-border-dark">
                    {role.thumbnail ? (
                      <img src={role.thumbnail} alt={role.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">person</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary truncate max-w-[50px]">{role.name}</span>
                  {/* 删除按钮 */}
                  <button 
                    onClick={() => toggleAssetForShot('role', role)}
                    className="absolute -top-1 -right-1 size-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => selectedLibraryIds.length > 0 ? setShowAssetPicker('role') : setShowConfigModal(true)}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
              >
                <div className="size-12 rounded-full border-2 border-dashed border-border-light dark:border-border-dark p-0.5 flex items-center justify-center hover:border-primary-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">{selectedLibraryIds.length > 0 ? '添加' : '配置'}</span>
              </div>
            </div>
          </div>

          {/* Scene */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">landscape</span> 场景 {(currentShot?.selectedScenes?.length || 0) > 0 && <span className="text-primary-500">({currentShot?.selectedScenes?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选场景 */}
              {(currentShot?.selectedScenes || []).map((scene: any) => (
                <div key={scene.id} className="relative w-24 h-14 rounded-lg overflow-hidden border-2 border-slate-400 dark:border-purple-400 cursor-pointer transition-colors shrink-0 bg-slate-100 dark:bg-border-dark group">
                  {scene.url ? (
                    <img src={scene.url} alt={scene.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">landscape</span>
                    </div>
                  )}
                  <button 
                    onClick={() => toggleAssetForShot('scene', scene)}
                    className="absolute top-0.5 right-0.5 size-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => selectedLibraryIds.length > 0 ? setShowAssetPicker('scene') : setShowConfigModal(true)}
                className="relative w-24 h-14 rounded-lg overflow-hidden border border-dashed border-border-light dark:border-border-dark cursor-pointer hover:border-primary-500 transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
              </div>
            </div>
          </div>

          {/* Props */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">backpack</span> 道具 {(currentShot?.selectedProps?.length || 0) > 0 && <span className="text-primary-500">({currentShot?.selectedProps?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选道具 */}
              {(currentShot?.selectedProps || []).map((prop: any) => (
                <div key={prop.id} className="size-14 rounded-lg bg-slate-100 dark:bg-border-dark border-2 border-slate-400 dark:border-purple-400 overflow-hidden cursor-pointer transition-colors shrink-0 relative group">
                  {prop.url ? (
                    <img src={prop.url} alt={prop.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">backpack</span>
                    </div>
                  )}
                  <button 
                    onClick={() => toggleAssetForShot('prop', prop)}
                    className="absolute top-0.5 right-0.5 size-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => selectedLibraryIds.length > 0 ? setShowAssetPicker('prop') : setShowConfigModal(true)}
                className="size-14 rounded-lg bg-slate-100 dark:bg-border-dark border border-dashed border-border-light dark:border-border-dark flex items-center justify-center cursor-pointer hover:border-primary-500 transition-colors"
              >
                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
              </div>
            </div>
          </div>

          {/* Audio */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">music_note</span> 音频 {(currentShot?.selectedAudios?.length || 0) > 0 && <span className="text-primary-500">({currentShot?.selectedAudios?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选音频 */}
              {(currentShot?.selectedAudios || []).map((audio: any) => (
                <div key={audio.id} className="shrink-0 flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity group relative">
                  <div className="size-12 rounded-lg border-2 border-slate-400 dark:border-purple-400 overflow-hidden bg-slate-100 dark:bg-border-dark flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-500">music_note</span>
                  </div>
                  <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary truncate max-w-[50px]">{audio.name}</span>
                  {/* 删除按钮 */}
                  <button 
                    onClick={() => toggleAssetForShot('audio', audio)}
                    className="absolute -top-1 -right-1 size-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => selectedLibraryIds.length > 0 ? setShowAssetPicker('audio') : setShowConfigModal(true)}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
              >
                <div className="size-12 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark p-0.5 flex items-center justify-center hover:border-primary-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">{selectedLibraryIds.length > 0 ? '添加' : '配置'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 资产选择弹窗 */}
      {showAssetPicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAssetPicker(null)}>
          <div className="bg-card-light dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">
                  选择{showAssetPicker === 'role' ? '角色' : showAssetPicker === 'scene' ? '场景' : showAssetPicker === 'prop' ? '道具' : '音频'}
                </h2>
                <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary mt-1">为当前分镜 (Shot {currentShotIndex}) 选择资产</p>
              </div>
              <button onClick={() => setShowAssetPicker(null)} className="text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {showAssetPicker === 'role' && (
                allRoles.length === 0 ? (
                  <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                    <span className="material-symbols-outlined text-4xl mb-2 block">face</span>
                    <p>暂无可用角色</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4">
                    {allRoles.map((role) => (
                      <div 
                        key={role.id}
                        onClick={() => toggleAssetForShot('role', role)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all ${
                          isAssetSelected('role', role.id) 
                            ? 'bg-primary-100 dark:bg-primary-500/20 ring-2 ring-primary-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="size-16 rounded-full overflow-hidden bg-slate-100 dark:bg-border-dark">
                          {role.thumbnail ? (
                            <img src={role.thumbnail} alt={role.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-2xl text-text-light-secondary dark:text-text-dark-secondary">person</span>
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate max-w-full">{role.name}</span>
                        {isAssetSelected('role', role.id) && (
                          <span className="material-symbols-outlined text-primary-500 text-sm">check_circle</span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {showAssetPicker === 'scene' && (
                allScenes.length === 0 ? (
                  <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                    <span className="material-symbols-outlined text-4xl mb-2 block">landscape</span>
                    <p>暂无可用场景</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {allScenes.map((scene) => (
                      <div 
                        key={scene.id}
                        onClick={() => toggleAssetForShot('scene', scene)}
                        className={`flex flex-col gap-2 p-3 rounded-xl cursor-pointer transition-all ${
                          isAssetSelected('scene', scene.id) 
                            ? 'bg-primary-100 dark:bg-primary-500/20 ring-2 ring-primary-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-border-dark">
                          {scene.url ? (
                            <img src={scene.url} alt={scene.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-2xl text-text-light-secondary dark:text-text-dark-secondary">landscape</span>
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{scene.name}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {showAssetPicker === 'prop' && (
                allProps.length === 0 ? (
                  <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                    <span className="material-symbols-outlined text-4xl mb-2 block">backpack</span>
                    <p>暂无可用道具</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4">
                    {allProps.map((prop) => (
                      <div 
                        key={prop.id}
                        onClick={() => toggleAssetForShot('prop', prop)}
                        className={`flex flex-col gap-2 p-3 rounded-xl cursor-pointer transition-all ${
                          isAssetSelected('prop', prop.id) 
                            ? 'bg-primary-100 dark:bg-primary-500/20 ring-2 ring-primary-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-border-dark">
                          {prop.url ? (
                            <img src={prop.url} alt={prop.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-2xl text-text-light-secondary dark:text-text-dark-secondary">backpack</span>
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{prop.name}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {showAssetPicker === 'audio' && (
                allAudios.length === 0 ? (
                  <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                    <span className="material-symbols-outlined text-4xl mb-2 block">music_note</span>
                    <p>暂无可用音频</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4">
                    {allAudios.map((audio) => (
                      <div 
                        key={audio.id}
                        onClick={() => toggleAssetForShot('audio', audio)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all ${
                          isAssetSelected('audio', audio.id) 
                            ? 'bg-primary-100 dark:bg-primary-500/20 ring-2 ring-primary-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="size-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-border-dark flex items-center justify-center">
                          <span className="material-symbols-outlined text-2xl text-primary-500">music_note</span>
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate max-w-full">{audio.name}</span>
                        {isAssetSelected('audio', audio.id) && (
                          <span className="material-symbols-outlined text-primary-500 text-sm">check_circle</span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="p-6 border-t border-border-light dark:border-border-dark flex justify-end">
              <button 
                onClick={() => setShowAssetPicker(null)}
                className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 资产库配置弹窗 */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowConfigModal(false)}>
          <div className="bg-card-light dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">配置资产库</h2>
                <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary mt-1">为本集选择要使用的资产库</p>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {availableLibraries.length === 0 ? (
                <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                  <span className="material-symbols-outlined text-4xl mb-2 block">inventory_2</span>
                  <p>暂无可用资产库</p>
                  <p className="text-sm mt-1">请先在资产库页面创建资产库</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 角色库 */}
                  <div>
                    <h3 className="text-sm font-bold text-text-light-primary dark:text-text-dark-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">face</span> 角色库
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {availableLibraries.filter(l => l.category === 'ROLE').map(lib => (
                        <label 
                          key={lib.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedLibraryIds.includes(lib.id) 
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' 
                              : 'border-border-light dark:border-border-dark hover:border-primary-300'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedLibraryIds.includes(lib.id)}
                            onChange={() => toggleLibrary(lib.id)}
                            className="sr-only"
                          />
                          <div className="size-10 rounded-lg bg-slate-100 dark:bg-border-dark overflow-hidden shrink-0">
                            {lib.thumbnail ? (
                              <img src={lib.thumbnail} alt={lib.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">folder</span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{lib.name}</span>
                          {selectedLibraryIds.includes(lib.id) && (
                            <span className="material-symbols-outlined text-primary-500 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'ROLE').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无角色库</p>
                      )}
                    </div>
                  </div>

                  {/* 场景库 */}
                  <div>
                    <h3 className="text-sm font-bold text-text-light-primary dark:text-text-dark-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">landscape</span> 场景库
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {availableLibraries.filter(l => l.category === 'SCENE').map(lib => (
                        <label 
                          key={lib.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedLibraryIds.includes(lib.id) 
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' 
                              : 'border-border-light dark:border-border-dark hover:border-primary-300'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedLibraryIds.includes(lib.id)}
                            onChange={() => toggleLibrary(lib.id)}
                            className="sr-only"
                          />
                          <div className="size-10 rounded-lg bg-slate-100 dark:bg-border-dark overflow-hidden shrink-0">
                            {lib.thumbnail ? (
                              <img src={lib.thumbnail} alt={lib.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">folder</span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{lib.name}</span>
                          {selectedLibraryIds.includes(lib.id) && (
                            <span className="material-symbols-outlined text-primary-500 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'SCENE').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无场景库</p>
                      )}
                    </div>
                  </div>

                  {/* 道具库 */}
                  <div>
                    <h3 className="text-sm font-bold text-text-light-primary dark:text-text-dark-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">backpack</span> 道具库
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {availableLibraries.filter(l => l.category === 'PROP').map(lib => (
                        <label 
                          key={lib.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedLibraryIds.includes(lib.id) 
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' 
                              : 'border-border-light dark:border-border-dark hover:border-primary-300'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedLibraryIds.includes(lib.id)}
                            onChange={() => toggleLibrary(lib.id)}
                            className="sr-only"
                          />
                          <div className="size-10 rounded-lg bg-slate-100 dark:bg-border-dark overflow-hidden shrink-0">
                            {lib.thumbnail ? (
                              <img src={lib.thumbnail} alt={lib.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">folder</span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{lib.name}</span>
                          {selectedLibraryIds.includes(lib.id) && (
                            <span className="material-symbols-outlined text-primary-500 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'PROP').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无道具库</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
              <button 
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-border-dark text-text-light-primary dark:text-text-dark-primary text-sm font-medium hover:bg-slate-200 dark:hover:bg-border-dark-hover transition-colors"
              >
                取消
              </button>
              <button 
                onClick={() => saveLibraryConfig(selectedLibraryIds)}
                className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
              >
                确认配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
