import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import JSZip from 'jszip'
import { apiClient, api } from '../lib/api'
import AILoadingAnimation from '../components/AILoadingAnimation'

// 生成分镜唯一ID
const generateShotId = () => `shot_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

interface Episode {
  id: string
  name: string
  description?: string
  episodeNumber?: number
  canEdit?: boolean
  isOwner?: boolean
  configuredLibraryIds?: string[]
}

interface Project {
  id: string
  name: string
  description?: string
  isOwner?: boolean
  isShared?: boolean
}

type ScriptShot = {
  shotId?: string // 分镜唯一标识，用于关联工作流
  shotIndex: number
  '画面': string
  '景别/镜头': string
  '内容/动作': string
  '声音/对话': string
  '时长': string
  '提示词': string
  media?: { type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square'; nodeId?: string; isPrimary?: boolean; duration?: number }
  mediaList?: Array<{ type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square'; nodeId?: string; isPrimary?: boolean; duration?: number }>
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
  
  // 从 URL 读取初始分镜索引（支持 scene + shot 参数）
  const initialShotParams = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const scene = Number(params.get('scene'))
    const shot = Number(params.get('shot'))
    return {
      scene: Number.isFinite(scene) && scene > 0 ? scene : null,
      shot: Number.isFinite(shot) && shot > 0 ? shot : null,
    }
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
  const [refreshing, setRefreshing] = useState(false)
  const [allRoles, setAllRoles] = useState<RoleAsset[]>([])
  const [allScenes, setAllScenes] = useState<any[]>([])
  const [allProps, setAllProps] = useState<any[]>([])
  const [allAudios, setAllAudios] = useState<any[]>([])
  const [allOthers, setAllOthers] = useState<any[]>([])
  
  // 资产选择弹窗
  const [showAssetPicker, setShowAssetPicker] = useState<'role' | 'scene' | 'prop' | 'audio' | null>(null)
  
  // 导入素材弹窗
  const [showMediaImporter, setShowMediaImporter] = useState(false)

  // 导出到剪映弹窗（缺少主素材提示）
  const [showExportWarning, setShowExportWarning] = useState(false)
  const [missingShotsForExport, setMissingShotsForExport] = useState<number[]>([])

  // 创建分镜脚本弹窗
  const [showScriptCreator, setShowScriptCreator] = useState(false)
  const [scriptCreatorAgents, setScriptCreatorAgents] = useState<any[]>([])
  const [scriptCreatorRoles, setScriptCreatorRoles] = useState<any[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [scriptFile, setScriptFile] = useState<File | null>(null)
  const [scriptFileUrl, setScriptFileUrl] = useState<string>('')  // 上传后的文件URL
  const [scriptFileMimeType, setScriptFileMimeType] = useState<string>('')  // 文件MIME类型
  const [scriptText, setScriptText] = useState('')
  const [scriptRequirements, setScriptRequirements] = useState('')
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)

  // 拖拽排序状态
  const [draggedShotIndex, setDraggedShotIndex] = useState<number | null>(null)
  const [dragOverShotIndex, setDragOverShotIndex] = useState<number | null>(null)
  
  // 当前选中的素材索引
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0)
  
  // 存储每个 shot 的主素材时长
  const [shotDurations, setShotDurations] = useState<Record<number, number>>({})
  
  // 全局资产（应用到所有分镜）- 从localStorage加载
  const [globalAssets, setGlobalAssets] = useState<{
    roles: string[];
    scenes: string[];
    props: string[];
    audios: string[];
  }>(() => {
    if (episodeId) {
      try {
        const saved = localStorage.getItem(`episode_${episodeId}_globalAssets`)
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return { roles: [], scenes: [], props: [], audios: [] }
  })
  
  // 保存全局资产到localStorage
  useEffect(() => {
    if (episodeId) {
      localStorage.setItem(`episode_${episodeId}_globalAssets`, JSON.stringify(globalAssets))
    }
  }, [episodeId, globalAssets])

  // 当前选中的镜头
  const currentShot = useMemo(() => {
    return shots.find(s => s.shotIndex === currentShotIndex) || null
  }, [shots, currentShotIndex])

  // 切换镜头时默认选中主素材，没有主素材则选中第一个
  useEffect(() => {
    const currentShot = shots.find(s => s.shotIndex === currentShotIndex)
    if (currentShot?.mediaList && currentShot.mediaList.length > 0) {
      const primaryIndex = currentShot.mediaList.findIndex(m => m?.isPrimary)
      setSelectedMediaIndex(primaryIndex >= 0 ? primaryIndex : 0)
    } else {
      setSelectedMediaIndex(0)
    }
  }, [currentShotIndex, shots])
  
  // 动态获取每个 shot 的主素材时长
  useEffect(() => {
    shots.forEach(shot => {
      const primaryMedia = shot.mediaList?.find(m => m?.isPrimary) || shot.mediaList?.[0] || shot.media
      if (!primaryMedia?.url) return
      // 如果已有 duration 字段，直接使用
      if (primaryMedia.duration && primaryMedia.duration > 0) {
        setShotDurations(prev => ({ ...prev, [shot.shotIndex]: primaryMedia.duration! }))
        return
      }
      // 如果是图片，默认5秒
      if (primaryMedia.type === 'image') {
        setShotDurations(prev => ({ ...prev, [shot.shotIndex]: 5 }))
        return
      }
      // 视频或音频：动态获取时长
      if (primaryMedia.type === 'video' || !primaryMedia.type) {
        const video = document.createElement('video')
        video.src = primaryMedia.url
        video.preload = 'metadata'
        video.onloadedmetadata = () => {
          if (video.duration && isFinite(video.duration)) {
            setShotDurations(prev => ({ ...prev, [shot.shotIndex]: video.duration }))
          }
        }
      } else if (primaryMedia.type === 'audio') {
        const audio = document.createElement('audio')
        audio.src = primaryMedia.url
        audio.preload = 'metadata'
        audio.onloadedmetadata = () => {
          if (audio.duration && isFinite(audio.duration)) {
            setShotDurations(prev => ({ ...prev, [shot.shotIndex]: audio.duration }))
          }
        }
      }
    })
  }, [shots])

  // 只读模式
  const canEdit = episode?.canEdit ?? true

  // 刷新数据函数
  const refreshData = async () => {
    if (!projectId || !episodeId) return
    setRefreshing(true)
    try {
      const res = await apiClient.episodes.getById(projectId, episodeId)
      const ep = (res as any)?.data ?? res
      setEpisode(ep)

      // 解析分镜数据 - 扁平化处理（移除幕的概念）
      const acts = (ep as any)?.scriptJson?.acts
      if (Array.isArray(acts) && acts.length > 0) {
        const allShots: ScriptShot[] = []
        let shotCounter = 1
        acts.forEach((act: any) => {
          if (Array.isArray(act.shots)) {
            act.shots.forEach((shot: any) => {
              // 为没有 shotId 的旧数据生成 shotId
              allShots.push({ ...shot, shotId: shot.shotId || generateShotId(), shotIndex: shotCounter++ })
            })
          }
        })
        setShots(allShots)
        lastSavedRef.current = JSON.stringify(allShots)
      }
      toast.success('刷新成功')
    } catch {
      toast.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

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
                // 为没有 shotId 的旧数据生成 shotId
                allShots.push({ ...shot, shotId: shot.shotId || generateShotId(), shotIndex: shotCounter++ })
              })
            }
          })
          setShots(allShots)
          lastSavedRef.current = JSON.stringify(allShots) // 记录初始数据
          if (allShots.length > 0) {
            // 如果 URL 有 shot 参数，使用它；否则默认第一个
            let targetShot = 1
            if (initialShotParams.shot && initialShotParams.shot <= allShots.length) {
              targetShot = initialShotParams.shot
            }
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
        const res = await apiClient.assetLibraries.getAll({ includeShared: 'true' })
        setAvailableLibraries(res.data || [])
      } catch {}
    }
    loadLibraries()
  }, [])

  // 从服务端剧集数据加载已配置的资产库（优先），本地存储作为备用
  useEffect(() => {
    if (episode && episodeId) {
      // 优先使用服务端的 configuredLibraryIds（协作者也能看到）
      const serverIds = episode.configuredLibraryIds
      if (Array.isArray(serverIds) && serverIds.length > 0) {
        setSelectedLibraryIds(serverIds)
        // 同步到本地存储
        localStorage.setItem(`episode_${episodeId}_libraries`, JSON.stringify(serverIds))
      } else {
        // 回退到本地存储
        const saved = localStorage.getItem(`episode_${episodeId}_libraries`)
        if (saved) {
          try {
            setSelectedLibraryIds(JSON.parse(saved))
          } catch {}
        }
      }
    }
  }, [episode, episodeId])

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
      const otherLibs = availableLibraries.filter(l => l.category === 'OTHER' && selectedLibraryIds.includes(l.id))

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

      // 加载其它素材
      const others: any[] = []
      for (const lib of otherLibs) {
        try {
          const res = await apiClient.assetLibraries.getAssets(lib.id)
          if (res.data) others.push(...res.data)
        } catch {}
      }
      setAllOthers(others)
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

  // 检查资产是否为全局
  const isAssetGlobal = (type: 'role' | 'scene' | 'prop' | 'audio', assetId: string) => {
    const key = type === 'role' ? 'roles' : type === 'scene' ? 'scenes' : type === 'prop' ? 'props' : 'audios'
    return globalAssets[key].includes(assetId)
  }

  // 切换资产的全局状态
  const toggleAssetGlobal = (type: 'role' | 'scene' | 'prop' | 'audio', asset: any) => {
    const globalKey = type === 'role' ? 'roles' : type === 'scene' ? 'scenes' : type === 'prop' ? 'props' : 'audios'
    const shotKey = type === 'role' ? 'selectedRoles' : type === 'scene' ? 'selectedScenes' : type === 'prop' ? 'selectedProps' : 'selectedAudios'
    const isCurrentlyGlobal = globalAssets[globalKey].includes(asset.id)
    
    if (isCurrentlyGlobal) {
      // 关闭全局：从全局列表移除
      setGlobalAssets(prev => ({
        ...prev,
        [globalKey]: prev[globalKey].filter(id => id !== asset.id)
      }))
    } else {
      // 开启全局：添加到全局列表，并添加到所有分镜
      setGlobalAssets(prev => ({
        ...prev,
        [globalKey]: [...prev[globalKey], asset.id]
      }))
      // 将该资产添加到所有分镜
      setShots(prev => prev.map(s => {
        const current = (s as any)[shotKey] || []
        const exists = current.some((a: any) => a.id === asset.id)
        if (exists) return s
        return {
          ...s,
          [shotKey]: [...current, { id: asset.id, name: asset.name, thumbnail: asset.thumbnail, url: asset.url, metadata: asset.metadata }]
        }
      }))
    }
  }

  // 保存资产库配置
  const saveLibraryConfig = async (ids: string[]) => {
    setSelectedLibraryIds(ids)
    if (episodeId) {
      localStorage.setItem(`episode_${episodeId}_libraries`, JSON.stringify(ids))
      // 同步到服务端（用于自动共享给项目协作者）
      try {
        await apiClient.episodes.update(projectId!, episodeId, { configuredLibraryIds: ids })
      } catch (err) {
        console.warn('[EpisodeDetail] 保存资产库配置到服务端失败:', err)
      }
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

  // 设置主素材
  const setPrimaryMedia = (mediaIndex: number) => {
    if (!currentShot) return
    const newShots = shots.map(s => {
      if (s.shotIndex === currentShotIndex) {
        const mediaList = [...(s.mediaList || [])]
        // 先清除所有素材的 isPrimary 标记
        mediaList.forEach(m => { if (m) m.isPrimary = false })
        // 设置指定素材为主素材
        if (mediaList[mediaIndex]) {
          mediaList[mediaIndex].isPrimary = true
        }
        return { ...s, mediaList }
      }
      return s
    })
    setShots(newShots)
  }

  // 取消主素材
  const unsetPrimaryMedia = () => {
    if (!currentShot) return
    const newShots = shots.map(s => {
      if (s.shotIndex === currentShotIndex) {
        const mediaList = [...(s.mediaList || [])]
        mediaList.forEach(m => { if (m) m.isPrimary = false })
        return { ...s, mediaList }
      }
      return s
    })
    setShots(newShots)
  }

  // 保存单个分镜数据（增量更新）
  const saveSingleShot = useCallback(async (shot: ScriptShot) => {
    if (!shot.shotId) return
    try {
      setSaving(true)
      await apiClient.episodes.updateShot(projectId!, episodeId!, shot.shotId, shot)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [projectId, episodeId])

  // 保存当前分镜
  const saveCurrentShot = useCallback(() => {
    const shot = shots.find(s => s.shotIndex === currentShotIndex)
    if (shot) {
      saveSingleShot(shot)
    }
  }, [shots, currentShotIndex, saveSingleShot])

  // 保存分镜数据（整体保存，仅用于兼容旧逻辑）
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

  // 新增镜头（使用增量 API）
  const addShot = async () => {
    const newIndex = shots.length > 0 ? Math.max(...shots.map(s => s.shotIndex)) + 1 : 1

    // 获取全局资产
    const globalRoleAssets = allRoles.filter(r => globalAssets.roles.includes(r.id)).map(r => ({ id: r.id, name: r.name, thumbnail: r.thumbnail, metadata: r.metadata }))
    const globalSceneAssets = allScenes.filter(s => globalAssets.scenes.includes(s.id)).map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail, url: s.url, metadata: s.metadata }))
    const globalPropAssets = allProps.filter(p => globalAssets.props.includes(p.id)).map(p => ({ id: p.id, name: p.name, thumbnail: p.thumbnail, url: p.url, metadata: p.metadata }))
    const globalAudioAssets = allAudios.filter(a => globalAssets.audios.includes(a.id)).map(a => ({ id: a.id, name: a.name, thumbnail: a.thumbnail, url: a.url, metadata: a.metadata }))

    const newShot: ScriptShot = {
      shotId: generateShotId(), // 生成唯一ID
      shotIndex: newIndex,
      '画面': '',
      '景别/镜头': '',
      '内容/动作': '',
      '声音/对话': '',
      '时长': '',
      '提示词': '',
      // 添加全局资产
      selectedRoles: globalRoleAssets,
      selectedScenes: globalSceneAssets,
      selectedProps: globalPropAssets,
      selectedAudios: globalAudioAssets,
    }

    try {
      // 使用增量 API 添加分镜
      await apiClient.episodes.addShot(projectId!, episodeId!, newShot)
      const newShots = [...shots, newShot]
      setShots(newShots)
      setCurrentShotIndex(newIndex)
      lastSavedRef.current = JSON.stringify(newShots)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || '添加分镜失败')
    }
  }

  // 删除镜头（使用增量 API，只有所有者可以删除）
  const removeShot = async (shotIndex: number) => {
    if (!window.confirm('确认删除该镜头？')) return

    const shotToDelete = shots.find(s => s.shotIndex === shotIndex)
    if (!shotToDelete?.shotId) {
      toast.error('分镜数据异常')
      return
    }

    try {
      // 使用增量 API 删除分镜
      await apiClient.episodes.deleteShot(projectId!, episodeId!, shotToDelete.shotId)

      const newShots = shots
        .filter(s => s.shotIndex !== shotIndex)
        .map((s, i) => ({ ...s, shotIndex: i + 1 }))

      setShots(newShots)
      if (currentShotIndex === shotIndex) {
        setCurrentShotIndex(newShots.length > 0 ? newShots[0].shotIndex : 0)
      } else if (currentShotIndex > shotIndex) {
        setCurrentShotIndex(currentShotIndex - 1)
      }
      lastSavedRef.current = JSON.stringify(newShots)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || '删除分镜失败')
    }
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
    
    // 拖动时自动滚动列表
    const container = e.currentTarget.parentElement?.parentElement
    if (container) {
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX
      const edgeThreshold = 80 // 距离边缘多少像素开始滚动
      
      if (mouseX < rect.left + edgeThreshold) {
        // 靠近左边缘，向左滚动
        setShotListOffset(prev => Math.max(0, prev - 1))
      } else if (mouseX > rect.right - edgeThreshold) {
        // 靠近右边缘，向右滚动
        setShotListOffset(prev => Math.min(Math.max(0, shots.length - 5), prev + 1))
      }
    }
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

    try {
      // 使用增量 API 更新排序
      const shotIds = reindexedShots.map(s => s.shotId).filter(Boolean) as string[]
      await apiClient.episodes.reorderShots(projectId!, episodeId!, shotIds)
      lastSavedRef.current = JSON.stringify(reindexedShots)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || '排序失败')
    }
  }

  const handleDragEnd = () => {
    setDraggedShotIndex(null)
    setDragOverShotIndex(null)
  }

  // 下载素材
  const downloadMedia = async (mediaUrl: string, shotIndex: number, mediaIndex: number, mediaType?: string) => {
    try {
      // 命名规则：剧名_S集数_Shot分镜号_序号
      const projectName = project?.name || '未命名'
      const epNumber = (episode as any)?.episodeNumber || 1
      const ext = mediaType === 'image' ? 'png' : mediaType === 'audio' ? 'mp3' : 'mp4'
      const fileName = `${projectName}_S${epNumber}_Shot${shotIndex}_${String(mediaIndex + 1).padStart(2, '0')}.${ext}`
      
      const response = await api.get('/assets/proxy-download-with-name', {
        params: { url: mediaUrl, filename: fileName },
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

  // 导出全部素材为zip
  const exportAllMedia = async () => {
    const projectName = project?.name || '未命名'
    const epNumber = (episode as any)?.episodeNumber || 1
    const mainFolderName = `${projectName}_S${epNumber}`
    const zipFileName = `${projectName}_S${epNumber}_素材.zip`
    
    // 收集所有素材
    const allMedia: Array<{ url: string; shotIndex: number; mediaIndex: number; type: string }> = []
    for (const shot of shots) {
      if (shot.mediaList && Array.isArray(shot.mediaList)) {
        shot.mediaList.forEach((m: any, idx: number) => {
          if (m?.url) {
            allMedia.push({
              url: m.url,
              shotIndex: shot.shotIndex,
              mediaIndex: idx,
              type: m.type || 'video'
            })
          }
        })
      }
    }
    
    if (allMedia.length === 0) {
      toast.info('没有可导出的素材')
      return
    }
    
    const toastId = toast.loading(`正在打包 ${allMedia.length} 个素材...`)
    
    try {
      const zip = new JSZip()
      const mainFolder = zip.folder(mainFolderName)
      
      let completed = 0
      for (const media of allMedia) {
        try {
          // 下载文件
          const response = await api.get('/assets/proxy-download', {
            params: { url: media.url },
            responseType: 'blob'
          })
          
          // 文件命名规则：剧名_S集数_Shot分镜号_序号.ext
          const ext = media.type === 'image' ? 'png' : media.type === 'audio' ? 'mp3' : 'mp4'
          const fileName = `${projectName}_S${epNumber}_Shot${media.shotIndex}_${String(media.mediaIndex + 1).padStart(2, '0')}.${ext}`
          
          // 分镜文件夹命名：shot01, shot02...
          const shotFolderName = `shot${String(media.shotIndex).padStart(2, '0')}`
          const shotFolder = mainFolder?.folder(shotFolderName)
          shotFolder?.file(fileName, response.data)
          
          completed++
          toast.loading(`正在打包 ${completed}/${allMedia.length}...`, { id: toastId })
        } catch (e) {
          console.error(`下载素材失败: ${media.url}`, e)
        }
      }
      
      // 生成zip并下载
      toast.loading('正在生成压缩包...', { id: toastId })
      const content = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(content)
      link.download = zipFileName
      link.click()
      URL.revokeObjectURL(link.href)
      
      toast.success(`已导出 ${completed} 个素材`, { id: toastId })
    } catch (error: any) {
      toast.error('导出失败: ' + (error.message || '未知错误'), { id: toastId })
    }
  }

  // 导出到剪映 - 检查主素材
  const handleExportToJianying = () => {
    // 检查哪些分镜没有设置主素材
    const missingShots: number[] = []
    for (const shot of shots) {
      const hasPrimary = shot.mediaList?.some((m: any) => m?.isPrimary && m?.url)
      if (!hasPrimary) {
        missingShots.push(shot.shotIndex)
      }
    }
    
    if (missingShots.length > 0) {
      setMissingShotsForExport(missingShots)
      setShowExportWarning(true)
    } else {
      // 所有分镜都有主素材，直接导出
      doExportToJianying()
    }
  }

  // 执行导出到剪映
  const doExportToJianying = async () => {
    const projectName = project?.name || '未命名'
    const epNumber = (episode as any)?.episodeNumber || 1
    const draftName = `${projectName}_S${epNumber}`
    const zipFileName = `${draftName}_剪映项目.zip`
    
    // 收集所有主素材（按分镜顺序）
    const primaryMedia: Array<{ url: string; shotIndex: number; type: string; duration?: number }>  = []
    for (const shot of shots.sort((a, b) => a.shotIndex - b.shotIndex)) {
      const primary = shot.mediaList?.find((m: any) => m?.isPrimary && m?.url)
      if (primary && primary.url) {
        primaryMedia.push({
          url: primary.url!,
          shotIndex: shot.shotIndex,
          type: primary.type || 'video',
          duration: primary.duration || 5
        })
      }
    }
    
    if (primaryMedia.length === 0) {
      toast.info('没有可导出的主素材')
      return
    }
    
    setShowExportWarning(false)
    const toastId = toast.loading(`正在生成剪映项目...`)
    
    try {
      const zip = new JSZip()
      const draftFolder = zip.folder(draftName)
      
      // 生成 UUID
      const genId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16).toUpperCase()
      })
      
      // 下载素材并构建项目结构
      const videos: any[] = []
      const segments: any[] = []
      let completed = 0
      let totalDuration = 0
      let timelinePosition = 0
      
      for (const media of primaryMedia) {
        try {
          toast.loading(`正在下载素材 ${completed + 1}/${primaryMedia.length}...`, { id: toastId })
          
          const response = await api.get('/assets/proxy-download', {
            params: { url: media.url },
            responseType: 'blob'
          })
          
          const ext = media.type === 'image' ? 'png' : media.type === 'audio' ? 'mp3' : 'mp4'
          const fileName = `${String(completed + 1).padStart(3, '0')}_Shot${String(media.shotIndex).padStart(2, '0')}.${ext}`
          
          // 保存素材文件
          draftFolder?.file(fileName, response.data)
          
          // 素材时长（微秒）
          const durationUs = Math.round((media.duration || 5) * 1000000)
          const materialId = genId()
          
          // 添加到素材库
          videos.push({
            id: materialId,
            type: media.type === 'audio' ? 'audio' : 'video',
            duration: durationUs,
            path: fileName,
            material_name: fileName
          })
          
          // 添加到时间轴
          segments.push({
            id: genId(),
            material_id: materialId,
            source_timerange: { duration: durationUs, start: 0 },
            target_timerange: { duration: durationUs, start: timelinePosition }
          })
          
          timelinePosition += durationUs
          totalDuration += media.duration || 5
          completed++
        } catch (e) {
          console.error(`下载素材失败: ${media.url}`, e)
        }
      }
      
      toast.loading('正在生成项目文件...', { id: toastId })
      
      // 生成 draft_content.json
      const draftContent = {
        id: genId(),
        name: draftName,
        duration: timelinePosition,
        materials: { videos },
        tracks: [{ id: genId(), type: 'video', segments }]
      }
      draftFolder?.file('draft_content.json', JSON.stringify(draftContent, null, 2))
      
      // 生成 draft_meta_info.json
      const draftMetaInfo = {
        draft_id: draftContent.id,
        draft_name: draftName,
        draft_root_path: '',
        tm_draft_create: Date.now(),
        tm_draft_modified: Date.now()
      }
      draftFolder?.file('draft_meta_info.json', JSON.stringify(draftMetaInfo, null, 2))
      
      // 生成使用说明
      const readmeLines = [
        '# ' + draftName + ' - 剪映素材包',
        '',
        '## 导入方法',
        '',
        '1. 打开剪映专业版，新建项目',
        '2. 全选素材文件夹中的所有文件',
        '3. 拖入剪映时间轴',
        '',
        '素材已按顺序命名（001_Shot01, 002_Shot02...），拖入后会自动按正确顺序排列。',
        '',
        '## 素材列表',
        ...primaryMedia.map((m, i) => '- ' + String(i + 1).padStart(3, '0') + '_Shot' + String(m.shotIndex).padStart(2, '0') + ': ' + (m.type === 'image' ? '图片' : m.type === 'audio' ? '音频' : '视频') + ' (' + (m.duration || 5) + '秒)'),
        '',
        '共 ' + completed + ' 个素材，总时长约 ' + Math.round(totalDuration) + ' 秒'
      ]
      const readme = readmeLines.join('\r\n')
      
      // 说明文档放在素材文件夹内
      draftFolder?.file('使用说明.txt', readme)
      
      // 生成zip并下载
      const content = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(content)
      link.download = zipFileName
      link.click()
      URL.revokeObjectURL(link.href)
      
      toast.success(`已导出剪映项目（${completed} 个素材）`, { id: toastId })
    } catch (error: any) {
      toast.error('导出失败: ' + (error.message || '未知错误'), { id: toastId })
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
    // 传递 shotId 用于关联工作流
    const shotIdParam = currentShot?.shotId ? `&shotId=${currentShot.shotId}` : ''
    navigate(`/projects/${projectId}/episodes/${episodeId}/workflow?scene=1&shot=${currentShotIndex}${shotIdParam}${assetsParam}`)
  }

  const projectName = project?.name || ''
  const epNo = episode?.episodeNumber && episode.episodeNumber > 0 ? episode.episodeNumber : undefined

  // 打开创建分镜脚本弹窗
  const openScriptCreator = async () => {
    setShowScriptCreator(true)
    setSelectedAgentId('')
    setSelectedRoleId('')
    setScriptFile(null)
    setScriptFileUrl('')
    setScriptFileMimeType('')
    setScriptText('')
    setScriptRequirements('')
    setScriptCreatorRoles([])
    
    // 加载剧集创作类型的智能体
    try {
      const response = await apiClient.agents.getAll()
      const agentList = response?.data || response || []
      // 只显示启用且使用场景为"剧集创作"的智能体
      const episodeAgents = agentList.filter((a: any) => a.isActive && a.usageScene === 'episode')
      setScriptCreatorAgents(episodeAgents)
    } catch (error) {
      console.error('加载智能体失败:', error)
      toast.error('加载智能体列表失败')
    }
  }

  // 选择智能体后加载角色列表
  const handleAgentSelect = async (agentId: string) => {
    setSelectedAgentId(agentId)
    setSelectedRoleId('')
    setScriptCreatorRoles([])
    
    if (!agentId) return
    
    try {
      const response = await apiClient.agents.roles.listByAgent(agentId)
      const roleList = response?.data || response || []
      // 只显示启用的角色
      const activeRoles = roleList.filter((r: any) => r.isActive)
      setScriptCreatorRoles(activeRoles)
    } catch (error) {
      console.error('加载角色列表失败:', error)
      toast.error('加载角色列表失败')
    }
  }

  // 处理脚本文件上传
  const handleScriptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setScriptFile(file)
    setScriptFileUrl('')
    setScriptFileMimeType('')
    
    // 如果是文本文件，直接读取内容
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text()
      setScriptText(text)
    } else {
      // 对于PDF、Word等，上传文件后直接传给AI模型
      setScriptText('')
      const toastId = toast.loading('正在上传文档...')
      try {
        const uploadRes = await apiClient.assets.upload(file)
        const fileUrl = uploadRes?.data?.url || uploadRes?.url
        if (fileUrl) {
          setScriptFileUrl(fileUrl)
          setScriptFileMimeType(file.type)
          toast.success('文档上传成功，将直接传给AI分析', { id: toastId })
        } else {
          toast.error('文件上传失败', { id: toastId })
        }
      } catch (error) {
        console.error('上传文档失败:', error)
        toast.error('文档上传失败，请重试', { id: toastId })
      }
    }
  }

  // 生成分镜脚本
  const generateStoryboardScript = async () => {
    if (!selectedRoleId) {
      toast.error('请选择一个创作风格（角色）')
      return
    }
    if (!scriptText && !scriptFileUrl) {
      toast.error('请上传剧本/故事文件或输入文本')
      return
    }
    
    setIsGeneratingScript(true)
    const toastId = toast.loading('正在生成分镜脚本...')
    
    try {
      // 构建用户提示词（简洁，主要内容在文档里）
      const prompt = scriptText || '请根据我上传的文档内容创建分镜脚本，严格按照JSON格式输出。'
      
      // 构建附加系统提示词（创作需求 + 输出格式要求，放到智能体提示词后面）
      let additionalSystemPrompt = ''
      if (scriptRequirements) {
        additionalSystemPrompt += `\n\n对于这一集，我具体的需求是：${scriptRequirements}`
      }
      additionalSystemPrompt += `\n\n【输出格式要求】
你必须严格按照以下JSON格式输出分镜脚本，不要输出任何其他内容：
{
  "shots": [
    {
      "画面": "详细的画面描述",
      "景别/镜头": "远景/中景/近景/特写等",
      "内容/动作": "人物动作和内容描述",
      "声音/对话": "台词、旁白或音效描述",
      "时长": "建议时长如5s",
      "提示词": "用于AI生成视频的中文提示词，包含主体、动作、环境、风格等"
    }
  ]
}`
      
      // 构建文档文件参数（如果有上传的文档）
      const documentFiles = scriptFileUrl ? [{ filePath: scriptFileUrl, mimeType: scriptFileMimeType }] : undefined
      
      // 调用智能体角色执行API（systemPrompt会追加到角色的系统提示词后面）
      const response = await apiClient.agents.roles.execute(selectedRoleId, {
        prompt,
        systemPrompt: additionalSystemPrompt,
        maxTokens: 16384,
        documentFiles,
      })
      
      const result = response?.data || response
      let generatedText = result?.text || result?.content || ''
      
      // 尝试解析JSON
      try {
        // 提取JSON部分
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const newShots: ScriptShot[] = (parsed.shots || []).map((s: any, index: number) => ({
            shotId: generateShotId(), // 生成唯一ID
            shotIndex: index + 1,
            '画面': s['画面'] || s.scene || '',
            '景别/镜头': s['景别/镜头'] || s.shotType || '',
            '内容/动作': s['内容/动作'] || s.action || '',
            '声音/对话': s['声音/对话'] || s.dialogue || '',
            '时长': s['时长'] || s.duration || '5s',
            '提示词': s['提示词'] || s.prompt || '',
          }))
          
          if (newShots.length > 0) {
            // 询问用户是替换还是追加
            const shouldReplace = shots.length === 0 || window.confirm(`当前已有 ${shots.length} 个分镜，是否替换？\n点击"确定"替换，点击"取消"追加到末尾`)
            
            if (shouldReplace) {
              setShots(newShots)
              setCurrentShotIndex(1)
            } else {
              const startIndex = shots.length > 0 ? Math.max(...shots.map(s => s.shotIndex)) + 1 : 1
              const appendedShots = newShots.map((s, i) => ({ ...s, shotIndex: startIndex + i }))
              setShots([...shots, ...appendedShots])
            }
            
            toast.success(`成功生成 ${newShots.length} 个分镜`, { id: toastId })
            setShowScriptCreator(false)
          } else {
            toast.error('生成的分镜脚本为空', { id: toastId })
          }
        } else {
          toast.error('无法解析生成的内容，请重试', { id: toastId })
          console.error('生成内容:', generatedText)
        }
      } catch (parseError) {
        console.error('解析JSON失败:', parseError, generatedText)
        toast.error('解析分镜脚本失败，请重试', { id: toastId })
      }
    } catch (error: any) {
      console.error('生成分镜脚本失败:', error)
      toast.error(error?.message || '生成失败，请重试', { id: toastId })
    } finally {
      setIsGeneratingScript(false)
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-neutral-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-background-light dark:bg-background-dark p-2 gap-2">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl shrink-0 overflow-visible relative z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
            className="text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="h-5 w-px bg-border-light dark:bg-border-dark"></div>
          <h2 className="text-text-light-primary dark:text-text-dark-primary font-bold">
            {projectName}{epNo && <span className="font-normal text-text-light-secondary dark:text-text-dark-secondary text-sm ml-2">第{epNo}集</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-text-light-secondary dark:text-text-dark-secondary">保存中...</span>}
          {/* 刷新按钮 */}
          <div className="group relative">
            <button 
              onClick={refreshData}
              disabled={refreshing}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-lg ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">刷新</span>
          </div>
          {/* 配置资产库 */}
          <div className="group relative">
            <button 
              onClick={() => setShowConfigModal(true)}
              className="relative w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">settings</span>
              {selectedLibraryIds.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-slate-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">{selectedLibraryIds.length}</span>
              )}
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">配置资产库</span>
          </div>
          {/* 分隔线 */}
          <div className="h-5 w-px bg-slate-300 dark:bg-white/20"></div>
          {/* 第二组：脚本操作 */}
          <div className="group relative">
            <button 
              onClick={openScriptCreator}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">edit_note</span>
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">创建分镜脚本</span>
          </div>
          {/* 分隔线 */}
          <div className="h-5 w-px bg-slate-300 dark:bg-white/20"></div>
          {/* 第三组：导出 */}
          <div className="group relative">
            <button 
              onClick={handleExportToJianying}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">content_cut</span>
            </button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">导出到剪映</span>
          </div>
          {/* 分隔线 */}
          <div className="h-5 w-px bg-slate-300 dark:bg-white/20"></div>
          <div className="group relative">
            <button 
              onClick={exportAllMedia}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">ios_share</span>
            </button>
            <span className="absolute top-full right-0 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">导出全部素材</span>
          </div>
        </div>
      </header>

      {/* Main Content - Three Columns */}
      <div className="flex-1 grid grid-cols-[320px_1fr_420px] min-h-0 overflow-hidden gap-2">
        {/* Left Sidebar - Materials */}
        <div className="flex flex-col bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl min-h-0 overflow-hidden">
          <div className="h-10 shrink-0 flex items-center px-4">
            <span className="text-text-light-primary dark:text-text-dark-primary font-bold text-sm">素材列表</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
            {currentShot && (
              <>
                {/* 显示当前镜头的媒体 */}
                {Array.isArray(currentShot.mediaList) && currentShot.mediaList.length > 0 ? (
                  (() => {
                    const hasPrimary = currentShot.mediaList.some(m => m?.isPrimary)
                    return currentShot.mediaList.map((m, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedMediaIndex(idx)}
                      className={`group relative flex gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedMediaIndex === idx 
                          ? 'bg-neutral-100 dark:bg-neutral-800' 
                          : 'hover:bg-slate-100 dark:hover:bg-card-dark-hover'
                      }`}
                      style={selectedMediaIndex === idx ? { border: '2px solid #71717a' } : {}}>
                      <div className="w-24 aspect-video bg-slate-200 dark:bg-border-dark rounded overflow-hidden relative">
                        {m?.type === 'video' && m?.url ? (
                          <video src={m.url} className="w-full h-full object-cover" />
                        ) : m?.type === 'image' && m?.url ? (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        ) : m?.type === 'audio' && m?.url ? (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-700">
                            <span className="material-symbols-outlined text-2xl text-neutral-500">music_note</span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">movie</span>
                          </div>
                        )}
                        {/* 主素材标记 */}
                        {m?.isPrimary && (
                          <div className="absolute top-1 left-1 bg-neutral-800 dark:bg-white text-white dark:text-black text-[10px] px-1.5 py-0.5 rounded font-bold">主</div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">
                          {m?.type === 'video' ? '视频' : m?.type === 'image' ? '图片' : m?.type === 'audio' ? '音频' : '素材'} {idx + 1}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[14px] text-text-light-secondary dark:text-text-dark-secondary">
                            {m?.type === 'video' ? 'videocam' : m?.type === 'image' ? 'image' : m?.type === 'audio' ? 'music_note' : 'attachment'}
                          </span>
                          <p className="text-text-light-secondary dark:text-text-dark-secondary text-xs">{m.aspectRatio || (m?.type === 'audio' ? '音频' : '16:9')}</p>
                        </div>
                      </div>
                      {/* 设为主素材按钮 */}
                      {m?.isPrimary ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); unsetPrimaryMedia() }}
                          className="shrink-0 self-center w-7 h-7 flex items-center justify-center bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-all opacity-0 group-hover:opacity-100"
                          title="取消主素材"
                        >
                          <span className="material-symbols-outlined text-base">star</span>
                        </button>
                      ) : !hasPrimary && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPrimaryMedia(idx) }}
                          className="shrink-0 self-center w-7 h-7 flex items-center justify-center bg-slate-200 dark:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary rounded-lg hover:bg-neutral-800 dark:hover:bg-white hover:text-white dark:hover:text-black transition-all opacity-0 group-hover:opacity-100"
                          title="设为主素材"
                        >
                          <span className="material-symbols-outlined text-base">star_outline</span>
                        </button>
                      )}
                      {/* 下载按钮 */}
                      {m?.url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadMedia(m.url!, currentShotIndex, idx, m.type) }}
                          className="shrink-0 self-center w-7 h-7 flex items-center justify-center bg-slate-200 dark:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-all opacity-0 group-hover:opacity-100"
                          title="下载素材"
                        >
                          <span className="material-symbols-outlined text-base">download</span>
                        </button>
                      )}
                      {/* 删除按钮 - 主素材不显示 */}
                      {!m?.isPrimary && (
                        <button
                          onClick={(e) => { 
                            e.stopPropagation()
                            // 从 mediaList 中移除该素材
                            setShots(prev => prev.map(s => 
                              s.shotIndex === currentShotIndex 
                                ? { ...s, mediaList: s.mediaList?.filter((_, i) => i !== idx) }
                                : s
                            ))
                            // 调整选中索引
                            if (selectedMediaIndex >= idx && selectedMediaIndex > 0) {
                              setSelectedMediaIndex(selectedMediaIndex - 1)
                            }
                          }}
                          className="shrink-0 self-center w-7 h-7 flex items-center justify-center bg-slate-200 dark:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary rounded-lg hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                          title="删除素材"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      )}
                    </div>
                  ))})()
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
        </div>

        {/* Center - Preview */}
        <div className="bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl flex flex-col relative overflow-hidden h-full">
          <div className="h-10 shrink-0 flex items-center justify-between px-4">
            <div className="flex items-center gap-3 text-text-light-secondary dark:text-text-dark-secondary text-sm">
              <span className="font-bold text-text-light-primary dark:text-text-dark-primary">分镜头 {currentShotIndex.toString().padStart(2, '0')}</span>
              <span>/</span>
              <span>共 {shots.length} 镜</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="group relative">
                <button 
                  onClick={() => {
                    if (selectedLibraryIds.length === 0) {
                      toast.info('请先配置资产库')
                      setShowConfigModal(true)
                    } else {
                      setShowMediaImporter(true)
                    }
                  }}
                  className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-lg">library_add</span>
                </button>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">导入素材</span>
              </div>
              <div className="group relative ml-2">
                <button 
                  onClick={enterWorkflow}
                  className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 border border-slate-400 dark:border-white/30 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105 transition-all flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                </button>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs text-white bg-slate-800 dark:bg-slate-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999]">生成素材</span>
              </div>
            </div>
          </div>
          
          {/* Media Preview */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0 min-w-0 overflow-hidden">
            {currentShot && (currentShot.mediaList?.[selectedMediaIndex]?.url || currentShot.mediaList?.[0]?.url || currentShot.media?.url) ? (
              (() => {
                const media = currentShot.mediaList?.[selectedMediaIndex] || currentShot.mediaList?.[0] || currentShot.media;
                const mediaType = media?.type || 'video';
                const mediaUrl = media?.url;
                if (mediaType === 'video') {
                  return <video src={mediaUrl} controls className="max-w-full max-h-full rounded-lg object-contain" />;
                } else if (mediaType === 'image') {
                  return <img src={mediaUrl} alt="" className="max-w-full max-h-full rounded-lg object-contain" />;
                } else if (mediaType === 'audio') {
                  return (
                    <div className="w-80 p-8 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-neutral-500 mb-4">music_note</span>
                      <audio src={mediaUrl} controls className="w-full" />
                    </div>
                  );
                }
                return <video src={mediaUrl} controls className="max-w-full max-h-full rounded-lg object-contain" />;
              })()
            ) : (
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 mb-2">movie</span>
                  <p className="text-slate-400 dark:text-slate-500 text-sm">暂无素材</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Script */}
        <div className="bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl flex flex-col">
          <div className="h-10 flex items-center justify-between px-4">
            <span className="text-text-light-primary dark:text-text-dark-primary font-bold text-sm">脚本</span>
            {canEdit && false && (
              <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-border-dark text-text-light-secondary dark:text-text-dark-secondary transition-colors">
                <span className="material-symbols-outlined text-lg">edit_note</span>
              </button>
            )}
          </div>
          <div className="flex-1 p-4 flex flex-col min-h-0">
            {currentShot ? (
              <div className="flex flex-col gap-3 h-full">
                {/* 画面 - 1/3 */}
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">画面</label>
                  <textarea
                    value={currentShot['画面']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '画面', e.target.value) : undefined}
                    onBlur={canEdit ? saveCurrentShot : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-neutral-500 focus:outline-none backdrop-blur-sm"
                    placeholder="描述画面内容..."
                  />
                </div>
                {/* 动作 - 1/3 */}
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">动作</label>
                  <textarea
                    value={currentShot['内容/动作']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '内容/动作', e.target.value) : undefined}
                    onBlur={canEdit ? saveCurrentShot : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-neutral-500 focus:outline-none backdrop-blur-sm"
                    placeholder="描述角色动作..."
                  />
                </div>
                {/* 台词/旁白 - 1/3 */}
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="block text-xs font-bold text-text-light-secondary dark:text-text-dark-secondary mb-1 uppercase shrink-0">台词/旁白</label>
                  <textarea
                    value={currentShot['声音/对话']}
                    onChange={canEdit ? (e) => updateShotField(currentShotIndex, '声音/对话', e.target.value) : undefined}
                    onBlur={canEdit ? saveCurrentShot : undefined}
                    readOnly={!canEdit}
                    className="flex-1 w-full bg-white/30 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary rounded-lg p-3 text-sm resize-none border border-slate-400 dark:border-white/20 focus:border-neutral-500 focus:outline-none backdrop-blur-sm"
                    placeholder="描述台词或旁白..."
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

      {/* Bottom Section - Shot Timeline + Resources */}
      <div className="h-80 shrink-0 flex flex-col gap-2">
        {/* Shot Timeline Panel */}
        <div className="h-32 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl flex items-center justify-center px-4 gap-3">
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
              } ${draggedShotIndex === shot.shotIndex ? 'opacity-50 scale-95' : ''} ${dragOverShotIndex === shot.shotIndex ? 'ring-2 ring-neutral-500 ring-offset-2' : ''}`}
            >
              <div 
                className={`w-32 h-24 rounded-lg overflow-hidden relative ${
                  shot.shotIndex === currentShotIndex 
                    ? 'ring-2 ring-neutral-800 dark:ring-white shadow-lg' 
                    : 'bg-slate-200 dark:bg-border-dark ring-1 ring-slate-200 dark:ring-white/10 hover:ring-neutral-400 dark:hover:ring-neutral-500'
                }`}>
                <div className={`w-full h-full rounded-md overflow-hidden ${shot.shotIndex === currentShotIndex ? 'bg-slate-200 dark:bg-border-dark' : ''}`}>
                {(() => {
                  // 优先显示主素材，否则显示第一个素材
                  const primaryMedia = shot.mediaList?.find(m => m?.isPrimary) || shot.mediaList?.[0] || shot.media
                  if (primaryMedia?.url) {
                    if (primaryMedia.type === 'image') {
                      return <img src={primaryMedia.url} alt="" className="w-full h-full object-cover" />
                    } else if (primaryMedia.type === 'audio') {
                      return (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-700">
                          <span className="material-symbols-outlined text-2xl text-neutral-500">music_note</span>
                        </div>
                      )
                    }
                    return <video src={primaryMedia.url} className="w-full h-full object-cover" />
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-text-light-secondary dark:text-text-dark-secondary">movie</span>
                    </div>
                  )
                })()}
                {shot.shotIndex === currentShotIndex && (
                  <div className="absolute top-1 right-1 size-2 bg-neutral-500 rounded-full animate-pulse"></div>
                )}
                </div>
              </div>
              <span className={`text-[10px] text-center ${
                shot.shotIndex === currentShotIndex 
                  ? 'text-neutral-600 dark:text-neutral-400 font-bold' 
                  : 'text-text-light-secondary dark:text-text-dark-secondary'
              }`}>
                Shot {shot.shotIndex.toString().padStart(2, '0')} - {shotDurations[shot.shotIndex] ? `${Math.round(shotDurations[shot.shotIndex])}s` : (shot['时长'] || '0s')}
              </span>
            </div>
          ))}
          
          {/* Add Shot Button */}
          {canEdit && (
            <div 
              onClick={addShot}
              className="w-12 h-24 rounded-lg border border-dashed border-border-light dark:border-border-dark flex items-center justify-center text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-all shrink-0"
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
        <div className="flex-1 grid grid-cols-4 gap-2">
          {/* Characters */}
          <div className="px-4 py-3 flex flex-col gap-2 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">face</span> 角色 {(currentShot?.selectedRoles?.length || 0) > 0 && <span className="text-neutral-600 dark:text-neutral-400">({currentShot?.selectedRoles?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {/* 已选角色 */}
              {(currentShot?.selectedRoles || []).map((role: any) => (
                <div key={role.id} className="shrink-0 flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity group relative mt-2">
                  <div className="size-12 rounded overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    {role.thumbnail ? (
                      <img src={role.thumbnail} alt={role.name} className="w-full h-full object-cover object-top" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">person</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary truncate max-w-[50px]">{role.name}</span>
                  {/* 全局开关 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleAssetGlobal('role', role) }}
                    className={`text-[8px] px-1.5 py-0.5 rounded-full transition-all ${isAssetGlobal('role', role.id) ? 'bg-neutral-800 dark:bg-white text-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                    title={isAssetGlobal('role', role.id) ? '已应用到所有分镜' : '点击应用到所有分镜'}
                  >
                    全局
                  </button>
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
                onClick={() => {
                  if (selectedLibraryIds.length === 0) {
                    toast.info('请先配置资产库')
                    setShowConfigModal(true)
                  } else {
                    setShowAssetPicker('role')
                  }
                }}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity mt-2"
              >
                <div className="size-12 rounded border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center hover:border-neutral-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">添加</span>
              </div>
            </div>
          </div>

          {/* Scene */}
          <div className="px-4 py-3 flex flex-col gap-2 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">landscape</span> 场景 {(currentShot?.selectedScenes?.length || 0) > 0 && <span className="text-neutral-600 dark:text-neutral-400">({currentShot?.selectedScenes?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选场景 */}
              {(currentShot?.selectedScenes || []).map((scene: any) => (
                <div key={scene.id} className="shrink-0 flex flex-col items-center gap-1 mt-2">
                  <div className="relative w-24 h-14 rounded overflow-hidden cursor-pointer transition-colors group bg-neutral-100 dark:bg-neutral-800">
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
                  {/* 全局开关 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleAssetGlobal('scene', scene) }}
                    className={`text-[8px] px-1.5 py-0.5 rounded-full transition-all ${isAssetGlobal('scene', scene.id) ? 'bg-neutral-800 dark:bg-white text-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                    title={isAssetGlobal('scene', scene.id) ? '已应用到所有分镜' : '点击应用到所有分镜'}
                  >
                    全局
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => {
                  if (selectedLibraryIds.length === 0) {
                    toast.info('请先配置资产库')
                    setShowConfigModal(true)
                  } else {
                    setShowAssetPicker('scene')
                  }
                }}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity mt-2"
              >
                <div className="size-12 rounded border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center hover:border-neutral-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">添加</span>
              </div>
            </div>
          </div>

          {/* Props */}
          <div className="px-4 py-3 flex flex-col gap-2 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">backpack</span> 道具 {(currentShot?.selectedProps?.length || 0) > 0 && <span className="text-neutral-600 dark:text-neutral-400">({currentShot?.selectedProps?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选道具 */}
              {(currentShot?.selectedProps || []).map((prop: any) => (
                <div key={prop.id} className="shrink-0 flex flex-col items-center gap-1 mt-2">
                  <div className="size-14 rounded overflow-hidden cursor-pointer transition-colors relative group bg-neutral-100 dark:bg-neutral-800">
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
                  {/* 全局开关 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleAssetGlobal('prop', prop) }}
                    className={`text-[8px] px-1.5 py-0.5 rounded-full transition-all ${isAssetGlobal('prop', prop.id) ? 'bg-neutral-800 dark:bg-white text-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                    title={isAssetGlobal('prop', prop.id) ? '已应用到所有分镜' : '点击应用到所有分镜'}
                  >
                    全局
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <div 
                onClick={() => {
                  if (selectedLibraryIds.length === 0) {
                    toast.info('请先配置资产库')
                    setShowConfigModal(true)
                  } else {
                    setShowAssetPicker('prop')
                  }
                }}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity mt-2"
              >
                <div className="size-12 rounded border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center hover:border-neutral-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">添加</span>
              </div>
            </div>
          </div>

          {/* Audio */}
          <div className="px-4 py-3 flex flex-col gap-2 bg-white dark:bg-[#18181b] border border-black/10 dark:border-neutral-700 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-xl">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-text-light-secondary dark:text-text-dark-secondary tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">music_note</span> 音频 {(currentShot?.selectedAudios?.length || 0) > 0 && <span className="text-neutral-600 dark:text-neutral-400">({currentShot?.selectedAudios?.length})</span>}
              </h4>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {/* 已选音频 */}
              {(currentShot?.selectedAudios || []).map((audio: any) => (
                <div key={audio.id} className="shrink-0 flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity group relative mt-2">
                  <div className="size-12 rounded overflow-hidden flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                    <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400">music_note</span>
                  </div>
                  <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary truncate max-w-[50px]">{audio.name}</span>
                  {/* 全局开关 */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleAssetGlobal('audio', audio) }}
                    className={`text-[8px] px-1.5 py-0.5 rounded-full transition-all ${isAssetGlobal('audio', audio.id) ? 'bg-neutral-800 dark:bg-white text-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                    title={isAssetGlobal('audio', audio.id) ? '已应用到所有分镜' : '点击应用到所有分镜'}
                  >
                    全局
                  </button>
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
                onClick={() => {
                  if (selectedLibraryIds.length === 0) {
                    toast.info('请先配置资产库')
                    setShowConfigModal(true)
                  } else {
                    setShowAssetPicker('audio')
                  }
                }}
                className="shrink-0 flex flex-col items-center gap-1 cursor-pointer opacity-50 hover:opacity-100 transition-opacity mt-2"
              >
                <div className="size-12 rounded border-2 border-dashed border-border-light dark:border-border-dark flex items-center justify-center hover:border-neutral-500">
                  <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">add</span>
                </div>
                <span className="text-[10px] text-text-light-secondary dark:text-text-dark-secondary">添加</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 资产选择弹窗 - 只有配置了资产库才显示 */}
      {showAssetPicker && selectedLibraryIds.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAssetPicker(null)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
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
                            ? 'bg-neutral-100 dark:bg-neutral-700 ring-2 ring-neutral-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="size-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-border-dark">
                          {role.thumbnail ? (
                            <img src={role.thumbnail} alt={role.name} className="w-full h-full object-cover object-top" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-2xl text-text-light-secondary dark:text-text-dark-secondary">person</span>
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate max-w-full">{role.name}</span>
                        {isAssetSelected('role', role.id) && (
                          <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 text-sm">check_circle</span>
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
                            ? 'bg-neutral-100 dark:bg-neutral-700 ring-2 ring-neutral-500' 
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
                            ? 'bg-neutral-100 dark:bg-neutral-700 ring-2 ring-neutral-500' 
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
                            ? 'bg-neutral-100 dark:bg-neutral-700 ring-2 ring-neutral-500' 
                            : 'hover:bg-slate-100 dark:hover:bg-border-dark'
                        }`}
                      >
                        <div className="size-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-border-dark flex items-center justify-center">
                          <span className="material-symbols-outlined text-2xl text-neutral-600 dark:text-neutral-400">music_note</span>
                        </div>
                        <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate max-w-full">{audio.name}</span>
                        {isAssetSelected('audio', audio.id) && (
                          <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 text-sm">check_circle</span>
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
                className="px-4 py-2 rounded-lg bg-neutral-800 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
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
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
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
                              ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' 
                              : 'border-border-light dark:border-border-dark hover:border-neutral-400'
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
                            <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 ml-auto">check_circle</span>
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
                              ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' 
                              : 'border-border-light dark:border-border-dark hover:border-neutral-400'
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
                            <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 ml-auto">check_circle</span>
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
                              ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' 
                              : 'border-border-light dark:border-border-dark hover:border-neutral-400'
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
                            <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'PROP').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无道具库</p>
                      )}
                    </div>
                  </div>

                  {/* 音频库 */}
                  <div>
                    <h3 className="text-sm font-bold text-text-light-primary dark:text-text-dark-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">music_note</span> 音频库
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {availableLibraries.filter(l => l.category === 'AUDIO').map(lib => (
                        <label 
                          key={lib.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedLibraryIds.includes(lib.id) 
                              ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' 
                              : 'border-border-light dark:border-border-dark hover:border-neutral-400'
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
                                <span className="material-symbols-outlined text-text-light-secondary dark:text-text-dark-secondary">music_note</span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary truncate">{lib.name}</span>
                          {selectedLibraryIds.includes(lib.id) && (
                            <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'AUDIO').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无音频库</p>
                      )}
                    </div>
                  </div>

                  {/* 其它库 */}
                  <div>
                    <h3 className="text-sm font-bold text-text-light-primary dark:text-text-dark-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">folder</span> 其它素材库
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {availableLibraries.filter(l => l.category === 'OTHER').map(lib => (
                        <label 
                          key={lib.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedLibraryIds.includes(lib.id) 
                              ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' 
                              : 'border-border-light dark:border-border-dark hover:border-neutral-400'
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
                            <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 ml-auto">check_circle</span>
                          )}
                        </label>
                      ))}
                      {availableLibraries.filter(l => l.category === 'OTHER').length === 0 && (
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary col-span-2">暂无其它素材库</p>
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
                className="px-4 py-2 rounded-lg bg-neutral-800 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                确认配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入素材弹窗 */}
      {showMediaImporter && selectedLibraryIds.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowMediaImporter(false)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">导入素材</h2>
                <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary mt-1">从资产库导入图片/视频/音频到当前分镜 (Shot {currentShotIndex})</p>
              </div>
              <button onClick={() => setShowMediaImporter(false)} className="text-text-light-secondary dark:text-text-dark-secondary hover:text-text-light-primary dark:hover:text-text-dark-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* 其它素材库资产 */}
              {allOthers.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                  {allOthers.filter(item => item.url).map((item) => {
                    // 根据 URL 判断类型
                    const isVideo = item.url?.match(/\.(mp4|webm|mov|avi)$/i)
                    const isAudio = item.url?.match(/\.(mp3|wav|ogg|m4a)$/i)
                    const mediaType = isVideo ? 'video' : isAudio ? 'audio' : 'image'
                    
                    return (
                      <div 
                        key={item.id}
                        onClick={() => {
                          const newMedia = { type: mediaType as 'image' | 'video' | 'audio', url: item.url, nodeId: `imported-${item.id}` }
                          setShots(prev => prev.map(s => 
                            s.shotIndex === currentShotIndex 
                              ? { ...s, mediaList: [...(s.mediaList || []), newMedia] }
                              : s
                          ))
                          toast.success('素材已导入')
                        }}
                        className="relative aspect-video rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-neutral-500 transition-all group"
                      >
                        {isVideo ? (
                          <video src={item.url} className="w-full h-full object-cover" />
                        ) : isAudio ? (
                          <div className="w-full h-full bg-gradient-to-br from-neutral-800/20 to-neutral-800/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl text-neutral-800">music_note</span>
                          </div>
                        ) : (
                          <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-2xl">add_circle</span>
                        </div>
                        <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white bg-black/50 px-1 py-0.5 rounded truncate">{item.name}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-text-light-secondary dark:text-text-dark-secondary">
                  <span className="material-symbols-outlined text-4xl mb-2 block">inventory_2</span>
                  <p>暂无可导入的素材</p>
                  <p className="text-sm mt-1">请先配置并添加"其它素材库"</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border-light dark:border-border-dark flex justify-end">
              <button 
                onClick={() => setShowMediaImporter(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出到剪映警告弹窗 */}

      {/* 创建分镜脚本弹窗 */}
      {showScriptCreator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#18181b] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col min-h-[500px]">
            {isGeneratingScript ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <AILoadingAnimation />
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-border-light dark:border-border-dark shrink-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">AI 创建分镜脚本</h2>
                    <button 
                      onClick={() => setShowScriptCreator(false)}
                      className="text-text-light-tertiary dark:text-text-dark-tertiary hover:text-text-light-primary dark:hover:text-text-dark-primary"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {/* 选择智能体 */}
                  <div>
                    <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                      选择创作智能体 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => handleAgentSelect(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-black text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-neutral-500"
                    >
                      <option value="">请选择智能体</option>
                      {scriptCreatorAgents.map((agent: any) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </select>
                    {scriptCreatorAgents.length === 0 && (
                      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        暂无可用的剧集创作智能体，请先在管理后台配置
                      </p>
                    )}
                  </div>

                  {/* 选择角色（风格） */}
                  {selectedAgentId && (
                    <div>
                      <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                        选择创作风格 <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {scriptCreatorRoles.map((role: any) => (
                          <label
                            key={role.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                              selectedRoleId === role.id
                                ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800'
                                : 'border-border-light dark:border-border-dark hover:border-neutral-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="scriptRole"
                              value={role.id}
                              checked={selectedRoleId === role.id}
                              onChange={(e) => setSelectedRoleId(e.target.value)}
                              className="sr-only"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-text-light-primary dark:text-text-dark-primary">{role.name}</div>
                              {role.description && (
                                <div className="text-xs text-text-light-tertiary dark:text-text-dark-tertiary mt-1 line-clamp-2">{role.description}</div>
                              )}
                            </div>
                            {selectedRoleId === role.id && (
                              <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400">check_circle</span>
                            )}
                          </label>
                        ))}
                      </div>
                      {scriptCreatorRoles.length === 0 && (
                        <p className="text-sm text-text-light-tertiary dark:text-text-dark-tertiary">
                          该智能体暂无可用角色
                        </p>
                      )}
                    </div>
                  )}

                  {/* 上传剧本/故事 */}
                  <div>
                    <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                      上传剧本/故事 <span className="text-red-500">*</span>
                    </label>
                    <div className={`border-2 border-dashed rounded-xl p-4 text-center ${scriptFileUrl ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-800' : 'border-border-light dark:border-border-dark'}`}>
                      <input
                        type="file"
                        accept=".txt,.pdf,.doc,.docx"
                        onChange={handleScriptFileChange}
                        className="hidden"
                        id="script-file-input"
                      />
                      <label htmlFor="script-file-input" className="cursor-pointer">
                        <span className={`material-symbols-outlined text-4xl ${scriptFileUrl ? 'text-neutral-600 dark:text-neutral-400' : 'text-text-light-tertiary dark:text-text-dark-tertiary'}`}>
                          {scriptFileUrl ? 'check_circle' : 'upload_file'}
                        </span>
                        <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary mt-2">
                          {scriptFile ? scriptFile.name : '点击上传文件（支持 TXT、PDF、Word）'}
                        </p>
                        {scriptFileUrl && (
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">✓ 已上传，将直接传给AI分析</p>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 创作需求（可选） */}
                  <div>
                    <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                      创作需求（可选）
                    </label>
                    <textarea
                      value={scriptRequirements}
                      onChange={(e) => setScriptRequirements(e.target.value)}
                      placeholder="例如：分镜数量约20个、画风偏卡通、节奏明快..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-black text-text-light-primary dark:text-text-dark-primary placeholder:text-text-light-tertiary dark:placeholder:text-text-dark-tertiary focus:outline-none focus:ring-2 focus:ring-neutral-500 resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-border-light dark:border-border-dark flex gap-3 justify-end shrink-0">
                  <button
                    onClick={() => setShowScriptCreator(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-text-light-primary dark:text-text-dark-primary text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={generateStoryboardScript}
                    disabled={isGeneratingScript || !selectedRoleId || !scriptFile}
                    className="px-6 py-2 rounded-lg bg-neutral-800 dark:bg-white text-white dark:text-black text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">auto_awesome</span>
                    生成分镜脚本
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showExportWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#18181b] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-border-light dark:border-border-dark">
              <h2 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary">部分分镜缺少主素材</h2>
            </div>
            
            <div className="p-6">
              <p className="text-text-light-secondary dark:text-text-dark-secondary mb-4">
                以下分镜尚未设置主素材，导出到剪映需要为每个分镜设置主素材：
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {missingShotsForExport.map(shotIndex => (
                  <span 
                    key={shotIndex}
                    className="px-3 py-1 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm font-medium"
                  >
                    Shot {String(shotIndex).padStart(2, '0')}
                  </span>
                ))}
              </div>
              <p className="text-sm text-text-light-tertiary dark:text-text-dark-tertiary">
                您可以选择忽略这些空镜头继续导出，或返回设置主素材。
              </p>
            </div>

            <div className="p-6 border-t border-border-light dark:border-border-dark flex gap-3 justify-end">
              <button 
                onClick={() => setShowExportWarning(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-text-light-primary dark:text-text-dark-primary text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              >
                去设置主素材
              </button>
              <button 
                onClick={() => doExportToJianying()}
                className="px-4 py-2 rounded-lg bg-neutral-800 dark:bg-white text-white dark:text-black text-sm font-medium hover:shadow-lg transition-all"
              >
                仍要导出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
