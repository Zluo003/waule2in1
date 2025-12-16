import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useParams } from 'react-router-dom'
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

// 删除未使用的方法以通过构建

export default function EpisodeDetailPage() {
  const { projectId, episodeId } = useParams<{ projectId: string; episodeId: string }>()
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const run = async () => {
      try {
        const res = await apiClient.episodes.getById(projectId!, episodeId!)
        const ep = (res as any)?.data ?? res
        setEpisode(ep)
        try {
          const acts = (ep as any)?.scriptJson?.acts
          if (Array.isArray(acts) && acts.length > 0) {
            setActsData(acts as ScriptAct[])
          } else {
            setActsData(null)
          }
        } catch {}
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [projectId, episodeId])

  useEffect(() => {
    const loadProject = async () => {
      try {
        const res = await apiClient.projects.getById(projectId!)
        setProject(res.data)
      } catch {}
    }
    if (projectId) loadProject()
  }, [projectId])

  // 移除未使用的变量以通过构建
  const projectName = project?.name || ''
  const epNo = (episode?.episodeNumber && episode.episodeNumber > 0)
    ? episode.episodeNumber
    : undefined

  // 只读模式：协作者没有编辑权限时禁用所有编辑功能
  const canEdit = episode?.canEdit ?? true

  type ScriptShot = {
    shotIndex: number
    '画面': string
    '景别/镜头': string
    '内容/动作': string
    '声音/对话': string
    '时长': string
    '提示词': string
    media?: { type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square' }
    mediaList?: Array<{ type?: string; url?: string; aspectRatio?: '16:9' | '9:16' | '1:1'; orientation?: 'horizontal' | 'vertical' | 'square' }>
  }
  type ScriptAct = { actIndex: number; shots: ScriptShot[] }
  const [actsData, setActsData] = useState<ScriptAct[] | null>(null)

  // 删除未使用的校验函数以通过构建

  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [agentName, setAgentName] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveQueued, setSaveQueued] = useState(false)
  useEffect(() => {
    const els = document.querySelectorAll<HTMLTextAreaElement>('textarea.auto-resize')
    els.forEach((ta) => {
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    })
  }, [actsData])
  const saveStoryboard = async (acts: ScriptAct[]) => {
    try {
      await apiClient.episodes.update(projectId!, episodeId!, { scriptJson: { acts } })
      // 自动保存成功，不显示提示
    } catch (e: any) {
      toast.error(e?.message || '保存分镜脚本失败')
    }
  }

  const scrollToAnchor = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const updateShotField = (actIdx: number, shotIdx: number, key: string, value: string) => {
    setActsData((prev) => {
      if (!prev) return prev
      return prev.map((act) => act.actIndex === actIdx
        ? { ...act, shots: act.shots.map((s) => s.shotIndex === shotIdx ? { ...s, [key]: value } : s) }
        : act
      )
    })
  }

  const handleSaveStoryboard = async () => {
    if (!actsData) return
    try {
      if (saving) { setSaveQueued(true); return }
      setSaving(true)
      await saveStoryboard(actsData)
    } finally {
      setSaving(false)
      if (saveQueued) {
        setSaveQueued(false)
        handleSaveStoryboard()
      }
    }
  }

  const createDefaultShot = (shotIndex: number): ScriptShot => ({
    shotIndex,
    '画面': '',
    '景别/镜头': '',
    '内容/动作': '',
    '声音/对话': '',
    '时长': '',
    '提示词': '',
    media: { type: 'video', url: '' }
  })

  // 删除未使用的新增/删除幕函数以通过构建

  const addShot = async (actIdx: number, shotIdx?: number) => {
    const prev: ScriptAct[] = actsData || []
    const next: ScriptAct[] = prev.map((a) => {
      if (a.actIndex !== actIdx) return a
      if (shotIdx == null) {
        const nextShotIndex = a.shots && a.shots.length ? Math.max(...a.shots.map((s) => s.shotIndex)) + 1 : 1
        return { ...a, shots: [...a.shots, createDefaultShot(nextShotIndex)] }
      } else {
        const inserted: ScriptShot[] = []
        for (const s of a.shots) {
          if (s.shotIndex === shotIdx) inserted.push(createDefaultShot(shotIdx))
          inserted.push({ ...s, shotIndex: s.shotIndex >= shotIdx ? s.shotIndex + 1 : s.shotIndex })
        }
        return { ...a, shots: inserted }
      }
    })
    setActsData(next)
    await saveStoryboard(next)
  }

  const addAct = async (afterActIdx: number) => {
    try {
      const prev: ScriptAct[] = actsData || []
      
      // 在指定幕后插入新幕，并重新编号后续的幕
      const newActs: ScriptAct[] = []
      for (const act of prev) {
        newActs.push(act)
        if (act.actIndex === afterActIdx) {
          // 在当前幕后插入新幕
          const newActIndex = afterActIdx + 1
          newActs.push({
            actIndex: newActIndex,
            shots: [createDefaultShot(1)]
          })
        }
      }
      
      // 重新编号后续的幕
      const reindexedActs = newActs.map((act, index) => ({
        ...act,
        actIndex: index + 1
      }))
      
      // 保存更新后的分镜脚本
      setActsData(reindexedActs)
      await saveStoryboard(reindexedActs)
      
      // 更新工作流名称
      try {
        const response = await apiClient.workflows.getAll({ projectId, episodeId })
        const workflows = response?.data || response || []
        
        // 找到需要更新的工作流（actIndex > afterActIdx的）
        const workflowsToUpdate = workflows.filter((wf: any) => 
          wf.sceneNumber && wf.sceneNumber > afterActIdx
        )
        
        // 更新每个工作流的sceneNumber
        for (const workflow of workflowsToUpdate) {
          const newSceneNumber = workflow.sceneNumber + 1
          await apiClient.workflows.update(workflow.id, {
            sceneNumber: newSceneNumber,
            name: `第${newSceneNumber}幕-第${workflow.shotNumber}镜`
          })
        }
        
        // 操作成功，不显示提示
      } catch (error) {
        console.error('更新工作流失败:', error)
        toast.warning('幕已添加，但工作流更新失败，请手动检查')
      }
    } catch (error: any) {
      console.error('添加幕失败:', error)
      toast.error('添加幕失败: ' + (error.message || '未知错误'))
    }
  }

  const removeShot = async (actIdx: number, shotIdx: number) => {
    if (!window.confirm('确认删除该镜？')) return
    
    // 更新分镜脚本数据
    const prev: ScriptAct[] = actsData || []
    const next: ScriptAct[] = prev.map((a) => {
      if (a.actIndex !== actIdx) return a
      const filtered = (a.shots || []).filter((s) => s.shotIndex !== shotIdx)
      const reindexed = filtered.map((s, i) => ({ ...s, shotIndex: i + 1 }))
      return { ...a, shots: reindexed }
    })
    setActsData(next)
    
    try { 
      await saveStoryboard(next)
      
      // 更新对应镜头工作流中节点的addedToStoryboard状态
      try {
        // 收集要删除的shot中所有视频的nodeId
        const deletedShot = prev.find((a: any) => a.actIndex === actIdx)?.shots?.find((s: any) => s.shotIndex === shotIdx);
        const nodeIdsToRestore: string[] = [];
        
        if (deletedShot) {
          // 从mediaList收集nodeId
          if (Array.isArray(deletedShot.mediaList)) {
            deletedShot.mediaList.forEach((m: any) => {
              if ((m as any).nodeId) nodeIdsToRestore.push((m as any).nodeId);
            });
          }
          // 从单个media收集nodeId
          if ((deletedShot.media as any)?.nodeId) {
            nodeIdsToRestore.push((deletedShot.media as any).nodeId);
          }
        }
        
        if (nodeIdsToRestore.length > 0) {
          // 获取该剧集的所有工作流
          const response = await apiClient.workflows.getAll({
            projectId,
            episodeId
          });
          
          const workflows = response?.data || response || [];
          const targetWorkflow = workflows.find((wf: any) => wf.sceneNumber === actIdx && wf.shotNumber === shotIdx);
          
          if (targetWorkflow) {
            const workflowData = targetWorkflow.data ? JSON.parse(targetWorkflow.data) : { nodes: [], edges: [] };
            
            // 根据nodeId精确恢复对应节点的状态
            const updatedNodes = workflowData.nodes.map((node: any) => {
              if (nodeIdsToRestore.includes(node.id) && node.data?.addedToStoryboard) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    addedToStoryboard: false
                  }
                };
              }
              return node;
            });
            
            // 保存更新后的workflow
            await apiClient.workflows.update(targetWorkflow.id, {
              data: JSON.stringify({ ...workflowData, nodes: updatedNodes })
            });
            
            // 工作流节点状态恢复成功，不显示提示
          }
        }
      } catch (error) {
        console.error('更新工作流节点状态失败:', error);
        // 不阻止删除操作
      }
    } catch (error) {
      console.error('删除分镜失败:', error);
    }
  }

  // 视频下载
  const downloadVideo = async (videoUrl: string, actIndex: number, shotIndex: number, mediaIndex?: number) => {
    try {
      // 生成文件名
      let fileName = '视频.mp4';
      
      if (project && episode) {
        const nodeGroup = {
          id: `act-${actIndex}-shot-${shotIndex}`,
          scene: actIndex,
          shot: shotIndex,
          nodeIds: []
        };
        
        const assetName = generateAssetName({
          project: {
            id: project.id,
            name: project.name,
            type: (project as any).type || 'QUICK'
          },
          episode: {
            id: episode.id,
            episodeNumber: (episode as any).episodeNumber || 1
          },
          nodeGroup,
          nodeId: `video-${actIndex}-${shotIndex}-${mediaIndex || 0}`,
          assetType: 'video',
          preview: false
        });
        
        if (assetName) {
          fileName = assetName;
        }
      }
      
      // 使用后端代理下载API
      const response = await api.get('/assets/proxy-download-with-name', {
        params: {
          url: videoUrl,
          filename: fileName
        },
        responseType: 'blob'
      });
      
      const blob = response.data;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error: any) {
      console.error('下载视频失败:', error);
      toast.error('下载失败: ' + (error.message || '未知错误'));
    }
  };

  // CSV模板下载
  const downloadCSVTemplate = () => {
    const template = `幕,镜,画面,景别/镜头,内容/动作,声音/对话,时长,提示词
1,1,示例画面,全景,示例内容和动作描述,示例对话或音效,5秒,示例AI生成提示词
1,2,示例画面2,特写,示例内容和动作描述2,示例对话或音效2,3秒,示例AI生成提示词2`;
    
    const blob = new Blob(['\ufeff' + template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '分镜脚本模板.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    // 下载成功，不显示提示
  };

  // CSV导入处理
  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // 移除BOM标记（如果有）
      const cleanText = text.replace(/^\ufeff/, '');
      const lines = cleanText.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('CSV文件格式不正确，至少需要包含表头和一行数据');
        return;
      }

      // 解析表头
      const headers = lines[0].split(',').map(h => h.trim());
      const requiredHeaders = ['幕', '镜', '画面', '景别/镜头', '内容/动作', '声音/对话', '时长', '提示词'];
      const hasAllHeaders = requiredHeaders.every(h => headers.includes(h));
      
      if (!hasAllHeaders) {
        toast.error('CSV文件表头不正确，请使用提供的模板格式');
        return;
      }

      // 解析数据
      const acts = new Map<number, ScriptShot[]>();
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 8) continue;

        const actIndex = parseInt(values[0]);
        const shotIndex = parseInt(values[1]);
        
        if (isNaN(actIndex) || isNaN(shotIndex)) continue;

        const shot: ScriptShot = {
          shotIndex,
          '画面': values[2],
          '景别/镜头': values[3],
          '内容/动作': values[4],
          '声音/对话': values[5],
          '时长': values[6],
          '提示词': values[7],
        };

        if (!acts.has(actIndex)) {
          acts.set(actIndex, []);
        }
        acts.get(actIndex)!.push(shot);
      }

      // 转换为ScriptAct数组
      const importedActs: ScriptAct[] = Array.from(acts.entries()).map(([actIndex, shots]) => ({
        actIndex,
        shots: shots.sort((a, b) => a.shotIndex - b.shotIndex),
      })).sort((a, b) => a.actIndex - b.actIndex);

      if (importedActs.length === 0) {
        toast.error('CSV文件中没有有效的分镜数据');
        return;
      }

      // 保存导入的数据
      setActsData(importedActs);
      await saveStoryboard(importedActs);
      // 导入成功，不显示提示
      
      // 清空文件输入
      event.target.value = '';
    } catch (error: any) {
      console.error('导入CSV失败:', error);
      toast.error('导入失败: ' + (error.message || '文件格式错误'));
      event.target.value = '';
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const agents: any[] = await apiClient.agents.getAll()
        console.log('[EpisodeDetail] 所有智能体:', agents.map(a => ({ id: a.id, name: a.name, isActive: a.isActive })))
        
        // 查找未启用的智能体（用于剧集分镜，区分工作流智能体）
        let target = agents.find(a => (a.name || '').includes('超级导演') && a.isActive === false)
        if (!target) target = agents.find(a => (a.name || '').includes('超级导演'))
        if (!target) target = agents.find(a => a.isActive === false)
        
        console.log('[EpisodeDetail] 选中的智能体:', target ? { id: target.id, name: target.name, isActive: target.isActive } : '未找到')
        
        if (!target) { 
          toast.error('未找到未启用的智能体，请在后台创建一个未启用的智能体用于分镜脚本生成')
          return 
        }
        setAgentName(target.name || '未启用智能体')
        const roleList: any[] = await apiClient.agents.roles.listByAgent(target.id)
        console.log('[EpisodeDetail] 智能体角色:', roleList)
        setRoles(roleList)
        if (roleList[0]?.id) setSelectedRoleId(roleList[0].id)
      } catch (e: any) { 
        console.error('[EpisodeDetail] 加载智能体失败:', e)
        toast.error(e?.message || '加载智能体角色失败') 
      }
    })()
  }, [])

  const handleRunAgent = async () => {
    try {
      const fileTexts: string[] = []
      const imageUrls: string[] = []
      const videoUrls: string[] = []
      const documentFiles: Array<{ filePath: string; mimeType: string }> = []

      for (const f of uploadFiles) {
        try {
          if (f.type.startsWith('text/')) {
            const txt = await f.text()
            fileTexts.push(`【${f.name}】\n${txt}`)
          }
        } catch {}

        try {
          const resp = await apiClient.assets.upload(f)
          const url = resp?.data?.url || resp?.url || ''
          const mime = f.type || resp?.data?.mimeType || ''
          if (!url) continue
          if (mime.startsWith('image/')) {
            imageUrls.push(url)
          } else if (mime.startsWith('video/')) {
            videoUrls.push(url)
          } else if (
            mime === 'application/pdf' ||
            mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            mime.startsWith('text/')
          ) {
            documentFiles.push({ filePath: url, mimeType: mime })
          }
        } catch (e: any) {
          toast.error(e?.message || `上传附件失败：${f.name}`)
        }
      }
      const systemPrompt = '请严格输出符合以下结构的JSON，不要包含多余文字：{"locale":"zh-CN","acts":[{"actIndex":1,"shots":[{"shotIndex":1,"画面":"...","景别/镜头":"...","内容/动作":"...","声音/对话":"...","时长":"6s","提示词":"...","media":{"type":"video","aspectRatio":"16:9","orientation":"horizontal"}}]}]}]}'
      const basePrompt = `${inputText}\n\n${fileTexts.join('\n\n')}`.trim()
      const hasAttachments = (imageUrls.length + videoUrls.length + documentFiles.length) > 0
      if (!basePrompt && !hasAttachments) { toast.error('请输入文本或上传文档'); return }
      const prompt = basePrompt || '请根据附件生成分镜脚本'
      setGenerating(true)
      setScriptModalOpen(false)
      // 根据选中的角色，使用其模型与系统提示
      const role = roles.find((r) => r.id === selectedRoleId)
      // 删除未使用的变量以通过构建
      const sys = role?.systemPrompt ? `${role.systemPrompt}\n\n${systemPrompt}` : systemPrompt
      const task = await apiClient.post(`/tasks/storyboard`, {
        projectId,
        episodeId,
        roleId: role.id,
        prompt,
        systemPrompt: sys,
        temperature: role?.temperature ?? 0,
        attachments: { documentFiles, imageUrls, videoUrls },
      })
      const taskId = (task as any)?.taskId || (task as any)?.data?.taskId
      const deadline = Date.now() + 5 * 60 * 1000
      let saved = false
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000))
        const status = await apiClient.get(`/tasks/${taskId}`)
        const st = (status as any)?.task?.status || (status as any)?.status
        if (st === 'SUCCESS') {
          // 拉取数据库中的剧集脚本
          const epRes = await apiClient.episodes.getById(projectId!, episodeId!)
          const ep = (epRes as any)?.data ?? epRes
          const acts = (ep as any)?.scriptJson?.acts
          if (Array.isArray(acts) && acts.length > 0) {
            setActsData(acts as ScriptAct[])
            saved = true
            break
          }
        } else if (st === 'FAILURE') {
          toast.error('脚本生成失败')
          setGenerating(false)
          break
        }
      }
      if (!saved) {
        toast.error('脚本生成超时或失败')
        setGenerating(false)
      }
      setGenerating(false)
    } catch (e: any) {
      // 从 Axios 错误中提取服务端返回的错误信息
      const errorMsg = e?.response?.data?.error || e?.message || '执行智能体失败'
      toast.error(errorMsg)
      setGenerating(false)
    }
  }

  return (
    <>
    <style>{`
.no-scrollbar::-webkit-scrollbar{display:none}
.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
/* Light模式：紫色到粉色 */
.bg-gradient-brand{background-image:linear-gradient(135deg,#a855f7,#ec4899);}
/* Dark模式：深紫到深粉（不透明）*/
.dark .bg-gradient-brand{background-image:linear-gradient(135deg,#9333ea,#db2777);}
/* 标题区域渐变边框（Aurora风格）*/
.bg-gradient-aurora{background-image:linear-gradient(90deg,rgba(236,72,153,0.2),rgba(168,85,247,0.2),rgba(6,182,212,0.2));}
.dark .bg-gradient-aurora{background-image:linear-gradient(90deg,rgba(236,72,153,0.2),rgba(168,85,247,0.2),rgba(6,182,212,0.2));}
    `}</style>
    <div className="h-full flex bg-background-light dark:bg-background-dark">
      <aside className="w-80 bg-card-light dark:bg-background-dark p-6 flex flex-col border-r border-border-light dark:border-border-dark">
        <div className="mb-10">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            《{projectName}》{epNo && (<span className="font-normal text-slate-600 dark:text-text-dark-secondary text-sm align-baseline">&nbsp;&nbsp;第{epNo}集</span>)}
          </h1>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-text-dark-secondary px-4 mb-3">分镜导航</h2>
          <nav className="flex flex-col gap-1.5 flex-1 overflow-y-auto pr-1 no-scrollbar">
            {actsData ? (
              actsData.map((act) => (
                <div key={`act-nav-${act.actIndex}`} className="mb-2">
                  <a href={`#act-${act.actIndex}`} onClick={(e) => { e.preventDefault(); scrollToAnchor(`act-${act.actIndex}`) }} className="px-4 py-2 text-slate-900 dark:text-text-dark-primary font-semibold hover:text-slate-600 dark:hover:text-text-dark-secondary">第{act.actIndex}幕</a>
                  <div className="flex flex-col gap-1.5">
                    {act.shots.map((shot) => (
                      <a key={`shot-nav-${act.actIndex}-${shot.shotIndex}`} className="flex items-start gap-2 px-3 py-2 rounded-lg text-slate-600 dark:text-text-dark-secondary hover:bg-slate-200 dark:hover:bg-card-dark-hover hover:text-slate-900 dark:hover:text-text-dark-primary transition-colors ml-3" href={`#shot-${act.actIndex}-${shot.shotIndex}`} onClick={(e) => { e.preventDefault(); scrollToAnchor(`shot-${act.actIndex}-${shot.shotIndex}`) }}>
                        <span className="material-symbols-outlined text-base mt-0.5">camera</span>
                        <span className="text-sm">第{shot.shotIndex}镜: {(shot['画面'] || '').slice(0, 18) || '未命名'}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 text-slate-600 dark:text-text-dark-secondary">暂无分镜</div>
            )}
          </nav>
        </div>
        <div className="mt-4 space-y-2">
          {/* 只读模式提示 */}
          {!canEdit && (
            <div className="px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <span className="material-symbols-outlined text-lg">visibility</span>
                <span className="text-sm font-medium">只读模式</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">您只有查看权限，无法编辑</p>
            </div>
          )}
          {/* 自动创建和导入分镜脚本 - 仅所有者可见 */}
          {episode?.isOwner && (
            <>
              <button onClick={() => { console.log('[EpisodeDetail] 点击自动创建分镜脚本按钮'); setScriptModalOpen(true); }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 text-white font-medium hover:shadow-lg transition-all text-sm active:scale-95">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                <span>自动创建分镜脚本</span>
              </button>
              <div className="space-y-1">
                <button onClick={() => document.getElementById('csv-import-input')?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-600/50 dark:to-cyan-600/50 text-white font-medium hover:shadow-lg transition-all text-sm active:scale-95">
                  <span className="material-symbols-outlined text-lg">upload_file</span>
                  <span>导入分镜脚本</span>
                </button>
                <button onClick={downloadCSVTemplate} className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>下载CSV模板</span>
                </button>
              </div>
              <input
                id="csv-import-input"
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                className="hidden"
              />
            </>
          )}
        </div>
      </aside>
      <main className="flex-1 p-8 md:p-12 overflow-y-auto bg-background-light dark:bg-background-dark">
        <div className="max-w-none mx-auto">
          {/* 自动保存已启用，移除右上角的手动保存按钮 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-tiffany-500 border-t-transparent"></div>
            </div>
          ) : (
            <>
              {actsData ? (
                actsData.map((act) => (
                  <div key={act.actIndex} id={`act-${act.actIndex}`} className="mb-12" onDoubleClick={() => {
                    const el = document.getElementById(`act-body-${act.actIndex}`)
                    if (el) {
                      const hidden = el.getAttribute('data-hidden') === 'true'
                      el.setAttribute('data-hidden', hidden ? 'false' : 'true')
                      el.style.display = hidden ? '' : 'none'
                    }
                  }}>
                    <div className="bg-gradient-aurora p-px rounded-lg mb-6">
                      <div className="bg-white dark:bg-background-dark rounded-lg">
                        <div className="px-4 py-2 flex items-center justify-between">
                          <div className="text-slate-900 dark:text-white font-bold text-xl">第{act.actIndex}幕</div>
                          {canEdit && (
                            <button
                              onClick={() => addAct(act.actIndex)}
                              className="flex items-center gap-1 px-3 py-1 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                              title="在此幕后添加新幕"
                            >
                              <span className="material-symbols-outlined text-base">add_circle</span>
                              <span>添加幕</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div id={`act-body-${act.actIndex}`} className="space-y-8 pl-12" data-hidden="false">
                      {act.shots.map((shot) => (
                        <div key={shot.shotIndex} id={`shot-${act.actIndex}-${shot.shotIndex}`} className="grid grid-cols-1 lg:grid-cols-[60px,2fr,minmax(280px,420px)] gap-6 items-stretch">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 lg:w-1/2 h-32 lg:h-[120px]">
                              <div className="bg-gradient-brand p-px rounded-lg w-full h-full">
                                <div className="bg-white dark:bg-background-dark rounded-lg w-full h-full flex flex-col items-center justify-center gap-2 py-1">
                                  <span className="text-slate-900 dark:text-white text-sm leading-tight">第</span>
                                  <span className="text-slate-900 dark:text-white text-base whitespace-nowrap leading-tight">{shot.shotIndex}</span>
                                  <span className="text-slate-900 dark:text-white text-sm leading-tight">镜</span>
                                </div>
                              </div>
                            </div>
                            {/* 进入工作流按钮 - 权限在工作流页面由后端判断 */}
                            <button onClick={() => navigate(`/projects/${projectId}/episodes/${episodeId}/workflow?scene=${act.actIndex}&shot=${shot.shotIndex}`)} className={`${canEdit ? 'bg-tiffany-500' : 'bg-slate-400'} text-white rounded-full w-8 lg:w-1/2 aspect-square hover:opacity-90 flex items-center justify-center`} title={canEdit ? '进入工作流' : '查看工作流'}>
                              <span className="material-symbols-outlined text-base">{canEdit ? 'camera' : 'visibility'}</span>
                            </button>
                            {/* 编辑按钮 - 仅编辑权限可见 */}
                            {canEdit && (
                              <>
                                <button onClick={() => removeShot(act.actIndex, shot.shotIndex)} title="删除分镜" className="bg-red-600 text-white rounded-full w-8 lg:w-1/2 aspect-square hover:opacity-90 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-xl">remove</span>
                                </button>
                                <button onClick={() => addShot(act.actIndex, shot.shotIndex)} title="新增分镜" className="bg-slate-300 dark:bg-white/20 text-slate-800 dark:text-white rounded-full w-8 lg:w-1/2 aspect-square hover:opacity-90 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-xl">add</span>
                                </button>
                              </>
                            )}
                          </div>
                          <div className="flex flex-col gap-4 h-full">
                            <div className="bg-white/90 dark:bg-card-dark border border-slate-200 dark:border-transparent rounded-lg overflow-hidden">
                              <div className="grid grid-cols-[128px,1fr] items-center border-b border-slate-200 dark:border-border-dark">
                                <div className="px-4 py-2 text-slate-600 dark:text-text-dark-secondary whitespace-nowrap flex items-center">画面</div>
                                <div className="px-4 py-2 flex items-center">
                                  <textarea value={(shot as any)['画面']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '画面', e.target.value) : undefined} onInput={canEdit ? (e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' } : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} rows={1} className={`auto-resize w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-text-dark-primary rounded p-2 resize-none overflow-hidden ${!canEdit ? 'cursor-default select-text' : ''}`}></textarea>
                                </div>
                              </div>
                              <div className="grid grid-cols-[128px,1fr] items-center border-b border-slate-200 dark:border-border-dark">
                                <div className="px-4 py-2 text-slate-600 dark:text-text-dark-secondary whitespace-nowrap flex items-center">景别/镜头</div>
                                <div className="px-4 py-2 flex items-center">
                                  <textarea value={(shot as any)['景别/镜头']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '景别/镜头', e.target.value) : undefined} onInput={canEdit ? (e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' } : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} rows={1} className={`auto-resize w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-text-dark-primary rounded p-2 resize-none overflow-hidden ${!canEdit ? 'cursor-default select-text' : ''}`}></textarea>
                                </div>
                              </div>
                              <div className="grid grid-cols-[128px,1fr] items-center border-b border-slate-200 dark:border-border-dark">
                                <div className="px-4 py-2 text-slate-600 dark:text-text-dark-secondary whitespace-nowrap flex items-center">内容/动作</div>
                                <div className="px-4 py-2 flex items-center">
                                  <textarea value={(shot as any)['内容/动作']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '内容/动作', e.target.value) : undefined} onInput={canEdit ? (e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' } : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} rows={1} className={`auto-resize w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-text-dark-primary rounded p-2 resize-none overflow-hidden ${!canEdit ? 'cursor-default select-text' : ''}`}></textarea>
                                </div>
                              </div>
                              <div className="grid grid-cols-[128px,1fr] items-center border-b border-slate-200 dark:border-border-dark">
                                <div className="px-4 py-2 text-slate-600 dark:text-text-dark-secondary whitespace-nowrap flex items-center">声音/对话</div>
                                <div className="px-4 py-2 flex items-center">
                                  <textarea value={(shot as any)['声音/对话']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '声音/对话', e.target.value) : undefined} onInput={canEdit ? (e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' } : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} rows={1} className={`auto-resize w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-text-dark-primary rounded p-2 resize-none overflow-hidden ${!canEdit ? 'cursor-default select-text' : ''}`}></textarea>
                                </div>
                              </div>
                              <div className="grid grid-cols-[128px,1fr] items-center">
                                <div className="px-4 py-2 text-slate-600 dark:text-text-dark-secondary whitespace-nowrap flex items-center">时长</div>
                                <div className="px-4 py-2 flex items-center">
                                  <input value={(shot as any)['时长']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '时长', e.target.value) : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} className={`w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-text-dark-primary rounded p-2 ${!canEdit ? 'cursor-default select-text' : ''}`} />
                                </div>
                              </div>
                            </div>
                            <div className="bg-white/90 dark:bg-card-dark border border-slate-200 dark:border-transparent p-6 rounded-lg">
                              <div className="text-slate-900 dark:text-text-dark-primary font-medium mb-2">提示词：</div>
                              <textarea value={(shot as any)['提示词']} onChange={canEdit ? (e) => updateShotField(act.actIndex, shot.shotIndex, '提示词', e.target.value) : undefined} onInput={canEdit ? (e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' } : undefined} onBlur={canEdit ? handleSaveStoryboard : undefined} readOnly={!canEdit} rows={1} className={`auto-resize w-full bg-slate-50 dark:bg-background-dark text-slate-900 dark:text-text-dark-secondary rounded p-2 resize-none overflow-hidden ${!canEdit ? 'cursor-default select-text' : ''}`}></textarea>
                            </div>
                          </div>
                          {(() => {
                            // 判断单个视频的方向，用于设置容器对齐方式
                            const isSingleVideo = Array.isArray(shot.mediaList) && shot.mediaList.length === 1;
                            const singleVideoIsVertical = isSingleVideo && shot.mediaList && (shot.mediaList[0].orientation === 'vertical' || shot.mediaList[0].aspectRatio === '9:16');
                            const containerAlignClass = isSingleVideo 
                              ? (singleVideoIsVertical ? 'items-center justify-start' : 'items-start justify-center')
                              : 'items-center justify-center';
                            
                            return (
                              <div className={`bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-transparent rounded-lg h-full flex ${containerAlignClass} overflow-hidden`}>
                                {Array.isArray(shot.mediaList) && shot.mediaList.length > 0 ? (
                                  shot.mediaList.length === 1 ? (
                                    // 单个视频：根据比例自适应显示
                                    (() => {
                                      const m = shot.mediaList[0];
                                      const isVertical = m.orientation === 'vertical' || m.aspectRatio === '9:16';
                                      return (
                                        <div key={`vid-${act.actIndex}-${shot.shotIndex}-0`} className={`relative bg-black rounded overflow-hidden group ${isVertical ? 'h-full w-auto' : 'w-full h-auto'}`}>
                                      {m?.type === 'video' && m?.url ? (
                                        <video src={m.url} controls className={`${isVertical ? 'h-full w-auto' : 'w-full h-auto'}`} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <span className="material-symbols-outlined text-[64px] text-white/40">movie</span>
                                        </div>
                                      )}
                                      {/* 下载按钮 */}
                                      {m?.type === 'video' && m?.url && (
                                        <button
                                          onClick={() => downloadVideo(m.url!, act.actIndex, shot.shotIndex, 0)}
                                          className="absolute bottom-2 right-2 w-8 h-8 bg-slate-500 hover:bg-slate-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          title="下载视频"
                                        >
                                          <span className="material-symbols-outlined">download</span>
                                        </button>
                                      )}
                                      {/* 删除按钮 - 仅编辑权限可见 */}
                                      {canEdit && (
                                        <button
                                          onClick={async () => {
                                            if (!window.confirm('确认删除该视频？')) return;
                                            const updatedMediaList: any[] = [];
                                            const nextActs = actsData!.map((a) => {
                                              if (a.actIndex !== act.actIndex) return a;
                                              return {
                                                ...a,
                                                shots: a.shots!.map((s) => {
                                                  if (s.shotIndex !== shot.shotIndex) return s;
                                                  return { ...s, mediaList: updatedMediaList };
                                                })
                                              };
                                            });
                                            setActsData(nextActs);
                                            await saveStoryboard(nextActs);
                                            
                                            // 更新工作流节点状态
                                            try {
                                              const nodeIdToRestore = (m as any).nodeId;
                                              if (nodeIdToRestore) {
                                                const response = await apiClient.workflows.getAll({ projectId, episodeId });
                                                const workflows = response?.data || response || [];
                                                const targetWorkflow = workflows.find((wf: any) => wf.sceneNumber === act.actIndex && wf.shotNumber === shot.shotIndex);
                                                if (targetWorkflow) {
                                                  const workflowData = targetWorkflow.data ? JSON.parse(targetWorkflow.data) : { nodes: [], edges: [] };
                                                  const updatedNodes = workflowData.nodes.map((node: any) => {
                                                    if (node.id === nodeIdToRestore && node.data?.addedToStoryboard) {
                                                      return { ...node, data: { ...node.data, addedToStoryboard: false } };
                                                    }
                                                    return node;
                                                  });
                                                  await apiClient.workflows.update(targetWorkflow.id, {
                                                    data: JSON.stringify({ ...workflowData, nodes: updatedNodes })
                                                  });
                                                }
                                              }
                                            } catch (error) {
                                              console.error('更新工作流节点状态失败:', error);
                                            }
                                          }}
                                          className="absolute top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          title="删除视频"
                                        >
                                          <span className="material-symbols-outlined">close</span>
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : (
                                // 多个视频：2x2网格布局
                                <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-2 p-2">
                                  {shot.mediaList.slice(0, 4).map((m, idx) => (
                                    <div key={`vid-${act.actIndex}-${shot.shotIndex}-${idx}`} className="relative w-full h-full bg-black rounded overflow-hidden group">
                                      {m?.type === 'video' && m?.url ? (
                                        <video src={m.url} controls className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <span className="material-symbols-outlined text-[64px] text-white/40">movie</span>
                                        </div>
                                      )}
                                      {/* 下载按钮 */}
                                      {m?.type === 'video' && m?.url && (
                                        <button
                                          onClick={() => downloadVideo(m.url!, act.actIndex, shot.shotIndex, idx)}
                                          className="absolute bottom-1 right-1 w-6 h-6 bg-slate-500 hover:bg-slate-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          title="下载视频"
                                        >
                                          <span className="material-symbols-outlined text-sm">download</span>
                                        </button>
                                      )}
                                      {/* 删除按钮 - 仅编辑权限可见 */}
                                      {canEdit && (
                                        <button
                                          onClick={async () => {
                                            if (!window.confirm('确认删除该视频？')) return;
                                            const updatedMediaList = (shot.mediaList || []).filter((_, i) => i !== idx);
                                            const nextActs = actsData!.map((a) => {
                                              if (a.actIndex !== act.actIndex) return a;
                                              return {
                                                ...a,
                                                shots: a.shots!.map((s) => {
                                                  if (s.shotIndex !== shot.shotIndex) return s;
                                                  return { ...s, mediaList: updatedMediaList };
                                                })
                                              };
                                            });
                                            setActsData(nextActs);
                                            await saveStoryboard(nextActs);
                                            
                                            // 更新工作流节点状态
                                            try {
                                              const nodeIdToRestore = (m as any).nodeId;
                                              if (nodeIdToRestore) {
                                                const response = await apiClient.workflows.getAll({ projectId, episodeId });
                                                const workflows = response?.data || response || [];
                                                const targetWorkflow = workflows.find((wf: any) => wf.sceneNumber === act.actIndex && wf.shotNumber === shot.shotIndex);
                                                if (targetWorkflow) {
                                                  const workflowData = targetWorkflow.data ? JSON.parse(targetWorkflow.data) : { nodes: [], edges: [] };
                                                  const updatedNodes = workflowData.nodes.map((node: any) => {
                                                    if (node.id === nodeIdToRestore && node.data?.addedToStoryboard) {
                                                      return { ...node, data: { ...node.data, addedToStoryboard: false } };
                                                    }
                                                    return node;
                                                  });
                                                  await apiClient.workflows.update(targetWorkflow.id, {
                                                    data: JSON.stringify({ ...workflowData, nodes: updatedNodes })
                                                  });
                                                }
                                              }
                                            } catch (error) {
                                              console.error('更新工作流节点状态失败:', error);
                                            }
                                          }}
                                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          title="删除视频"
                                        >
                                          <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : shot.media?.type === 'video' && shot.media?.url ? (
                              <div className="relative w-full h-full overflow-hidden group">
                                <video src={shot.media.url} controls className="w-full h-full object-cover" />
                                {/* 下载按钮 */}
                                <button
                                  onClick={() => downloadVideo(shot.media!.url!, act.actIndex, shot.shotIndex)}
                                  className="absolute bottom-2 right-2 w-8 h-8 bg-slate-500 hover:bg-slate-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                  title="下载视频"
                                >
                                  <span className="material-symbols-outlined">download</span>
                                </button>
                                {/* 删除按钮 - 仅编辑权限可见 */}
                                {canEdit && (
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm('确认删除该视频？')) return;
                                      const nextActs = actsData!.map((a) => {
                                        if (a.actIndex !== act.actIndex) return a;
                                        return {
                                          ...a,
                                          shots: a.shots!.map((s) => {
                                            if (s.shotIndex !== shot.shotIndex) return s;
                                            return { ...s, media: undefined };
                                          })
                                        };
                                      });
                                      setActsData(nextActs);
                                      await saveStoryboard(nextActs);
                                      
                                      // 更新工作流节点状态
                                      try {
                                        const nodeIdToRestore = (shot.media as any)?.nodeId;
                                        if (nodeIdToRestore) {
                                          const response = await apiClient.workflows.getAll({ projectId, episodeId });
                                          const workflows = response?.data || response || [];
                                          const targetWorkflow = workflows.find((wf: any) => wf.sceneNumber === act.actIndex && wf.shotNumber === shot.shotIndex);
                                          if (targetWorkflow) {
                                            const workflowData = targetWorkflow.data ? JSON.parse(targetWorkflow.data) : { nodes: [], edges: [] };
                                            const updatedNodes = workflowData.nodes.map((node: any) => {
                                              if (node.id === nodeIdToRestore && node.data?.addedToStoryboard) {
                                                return { ...node, data: { ...node.data, addedToStoryboard: false } };
                                              }
                                              return node;
                                            });
                                            await apiClient.workflows.update(targetWorkflow.id, {
                                              data: JSON.stringify({ ...workflowData, nodes: updatedNodes })
                                            });
                                            
                                            // 节点状态恢复成功，不显示提示
                                          }
                                        }
                                      } catch (error) {
                                        console.error('更新工作流节点状态失败:', error);
                                      }
                                    }}
                                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                    title="删除视频"
                                  >
                                    <span className="material-symbols-outlined">close</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-[144px] text-white/50">movie</span>
                              </div>
                            )}
                          </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-600 dark:text-text-dark-secondary">暂无分镜脚本，请点击左侧按钮创建</div>
              )}
              
            </>
          )}
        </div>
      </main>
    </div>
    {/* 自动创建分镜脚本面板 - 使用 Portal 渲染到 body */}
    {scriptModalOpen && console.log('[EpisodeDetail] 弹窗正在渲染, roles:', roles.length)}
    {scriptModalOpen && createPortal(
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
        <div className="bg-white dark:bg-background-dark w-full max-w-2xl rounded-lg p-6 border border-slate-200 dark:border-border-dark">
          <div className="text-slate-900 dark:text-white text-lg font-bold mb-4">自动创建分镜脚本</div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 dark:text-text-dark-secondary mb-1">智能体：{agentName || '加载中'}</label>
              {roles.length > 1 ? (
                <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className="w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-white rounded p-2">
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-white rounded p-2">
                  {roles[0]?.name || '单角色'}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-text-dark-secondary mb-1">输入文字</label>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} className="w-full bg-slate-50 dark:bg-card-dark text-slate-900 dark:text-white rounded p-3 h-32" placeholder="在此输入剧集梗概、镜头要求等" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-text-dark-secondary mb-1">上传文档（可选）</label>
              <div className="relative">
                <input 
                  type="file" 
                  multiple 
                  onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  id="file-upload"
                />
                <label 
                  htmlFor="file-upload" 
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-all border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-white/5 hover:border-purple-400 dark:hover:border-purple-400/50 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">upload_file</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {uploadFiles.length > 0 ? `已选择 ${uploadFiles.length} 个文件` : '点击选择文件或拖拽到此处'}
                  </span>
                </label>
              </div>
              {uploadFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {uploadFiles.map((file, idx) => (
                    <div key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">description</span>
                      <span>{file.name}</span>
                      <span className="text-slate-400 dark:text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setScriptModalOpen(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-card-dark text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-card-dark-hover transition-colors">取消</button>
            <button onClick={handleRunAgent} className="px-4 py-2 rounded bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600/50 dark:to-pink-600/50 hover:shadow-lg text-white transition-all active:scale-95">执行</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    {generating && createPortal(
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
        <div className="bg-white dark:bg-card-dark rounded-lg p-6 text-center">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
          </div>
          <div className="text-slate-900 dark:text-white mt-2">脚本生成中……</div>
          <div className="text-slate-600 dark:text-text-dark-secondary text-sm mt-1">请耐心等待！</div>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}