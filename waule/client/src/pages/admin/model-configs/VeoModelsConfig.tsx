/**
 * Veo 3.1 系列视频生成模型配置
 * 通过 waule-api 中转调用 Google Veo 3.1 系列模型
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '../../../lib/api'

interface AIModel {
  id: string
  name: string
  provider: string
  modelId: string
  type: string
  config: any
  apiUrl?: string
  isActive: boolean
  pricePerUse?: string
}

// 能力定义
const CAPABILITIES = [
  { id: 'text2video', name: '文生视频', desc: '纯文字描述生成视频' },
  { id: 'image2video_first', name: '图生视频（首帧）', desc: '使用1张图片作为视频首帧' },
  { id: 'image2video_frames', name: '图生视频（首尾帧）', desc: '使用2张图片作为首尾帧' },
  { id: 'image2video_reference', name: '参考图生视频', desc: '使用1-3张参考图生成视频' },
]

// 模型定义
const VEO_MODELS = [
  { 
    id: 'veo3.1', 
    name: 'Veo 3.1', 
    desc: '文生视频、图生视频（1张首帧）', 
    maxImages: 1, 
    fixedDuration: 8,
    defaultCapabilities: ['text2video', 'image2video_first'],
  },
  { 
    id: 'veo3.1-pro', 
    name: 'Veo 3.1 Pro', 
    desc: '高质量文生视频、图生视频（首尾帧）', 
    maxImages: 2, 
    fixedDuration: 8,
    defaultCapabilities: ['text2video', 'image2video_first', 'image2video_frames'],
  },
  { 
    id: 'veo3.1-components', 
    name: 'Veo 3.1 Components', 
    desc: '参考图生视频（1-3张参考图）', 
    maxImages: 3, 
    fixedDuration: 8,
    defaultCapabilities: ['text2video', 'image2video_reference'],
  },
]

const defaultApiUrl = 'http://localhost:9000'

interface VeoModelsConfigProps {
  selectedModel: string | null
  existingModels: AIModel[]
  onRefresh: () => void
}

export const VeoModelsConfig = ({ selectedModel, existingModels, onRefresh }: VeoModelsConfigProps) => {
  const model = VEO_MODELS.find(m => m.id === selectedModel)
  if (!model) return null

  const existing = existingModels.find(m => m.modelId === model.id)

  const [dbId, setDbId] = useState<string | null>(null)
  const [name, setName] = useState(model.name)
  const [apiUrl, setApiUrl] = useState(defaultApiUrl)
  const [isActive, setIsActive] = useState(true)
  const [price, setPrice] = useState('')
  const [config, setConfig] = useState({
    supportedRatios: ['16:9', '9:16'],
    capabilities: model.defaultCapabilities,
    supportedDurations: [8],
    maxReferenceImages: model.maxImages,
  })

  // 将 supportedGenerationTypes 转换为 capabilities
  const genTypeToCap: Record<string, string> = {
    '文生视频': 'text2video',
    '首帧': 'image2video_first',
    '首尾帧': 'image2video_frames',
    '参考图': 'image2video_reference',
  };

  useEffect(() => {
    if (existing) {
      setDbId(existing.id)
      setName(existing.name)
      setApiUrl(existing.apiUrl || defaultApiUrl)
      setIsActive(existing.isActive)
      setPrice(existing.pricePerUse || '')
      
      // 从 supportedGenerationTypes 或 capabilities 加载
      let caps = existing.config?.capabilities;
      if (!caps && existing.config?.supportedGenerationTypes) {
        caps = existing.config.supportedGenerationTypes
          .map((t: string) => genTypeToCap[t])
          .filter(Boolean);
      }
      
      setConfig({
        supportedRatios: existing.config?.supportedRatios || ['16:9', '9:16'],
        capabilities: caps || model.defaultCapabilities,
        supportedDurations: existing.config?.supportedDurations || [8],
        maxReferenceImages: existing.config?.maxReferenceImages ?? model.maxImages,
      })
    } else {
      setDbId(null)
      setName(model.name)
      setApiUrl(defaultApiUrl)
      setIsActive(true)
      setPrice('')
      setConfig({
        supportedRatios: ['16:9', '9:16'],
        capabilities: model.defaultCapabilities,
        supportedDurations: [8],
        maxReferenceImages: model.maxImages,
      })
    }
  }, [selectedModel, existing])

  const save = async () => {
    try {
      // 将 capabilities 转换为 supportedGenerationTypes（工作流节点使用的格式）
      const capToGenType: Record<string, string> = {
        'text2video': '文生视频',
        'image2video_first': '首帧',
        'image2video_frames': '首尾帧',
        'image2video_reference': '参考图',
      };
      const supportedGenerationTypes = config.capabilities
        .map(cap => capToGenType[cap])
        .filter(Boolean);

      const payload = {
        name,
        provider: 'google',
        modelId: model.id,
        type: 'VIDEO_GENERATION',
        apiUrl: apiUrl || undefined,
        isActive,
        pricePerUse: price || undefined,
        config: {
          ...config,
          supportedGenerationTypes, // 工作流节点使用这个字段
          acceptedInputs: ['TEXT', 'IMAGE'],
        },
      }
      if (dbId) {
        await apiClient.admin.updateAIModel(dbId, payload)
      } else {
        await apiClient.admin.createAIModel(payload)
      }
      toast.success('保存成功')
      onRefresh()
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    }
  }

  const toggleRatio = (ratio: string) => {
    setConfig(c => ({
      ...c,
      supportedRatios: c.supportedRatios.includes(ratio)
        ? c.supportedRatios.filter(r => r !== ratio)
        : [...c.supportedRatios, ratio]
    }))
  }

  const toggleCapability = (capId: string) => {
    setConfig(c => ({
      ...c,
      capabilities: c.capabilities.includes(capId)
        ? c.capabilities.filter(id => id !== capId)
        : [...c.capabilities, capId]
    }))
  }

  return (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{model.name}</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">VIDEO_GENERATION</span>
      </div>

      <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">{model.desc}</p>

      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-600 dark:text-gray-400 mb-1">显示名称</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-input-dark text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-gray-400 mb-1">单次价格</label>
            <input type="text" value={price} onChange={e => setPrice(e.target.value)} placeholder="如: 0.5" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-input-dark text-slate-900 dark:text-white" />
          </div>
        </div>

        {/* API 地址 */}
        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-400 mb-1">waule-api 服务地址</label>
          <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:9000" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-input-dark text-slate-900 dark:text-white font-mono text-sm" />
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">配置使用哪台 waule-api 服务器处理 Veo 视频生成请求</p>
        </div>

        {/* 启用状态 */}
        <div className="flex items-center gap-3">
          <input type="checkbox" id={`active-${model.id}`} checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4" />
          <label htmlFor={`active-${model.id}`} className="text-sm text-slate-700 dark:text-gray-300">启用此模型</label>
        </div>

        {/* 能力配置 */}
        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-400 mb-2">能力配置</label>
          <p className="text-xs text-slate-500 dark:text-gray-500 mb-3">选中的能力将使该模型出现在对应的工作流节点中</p>
          <div className="space-y-2">
            {CAPABILITIES.map(cap => (
              <label key={cap.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-border-dark hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.capabilities.includes(cap.id)} 
                  onChange={() => toggleCapability(cap.id)} 
                  className="w-4 h-4 mt-0.5" 
                />
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-gray-300">{cap.name}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500">{cap.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 支持的比例 */}
        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-400 mb-2">支持的画面比例</label>
          <div className="flex flex-wrap gap-2">
            {['16:9', '9:16'].map(ratio => (
              <button key={ratio} type="button" onClick={() => toggleRatio(ratio)} className={`px-3 py-1 rounded-lg text-sm ${config.supportedRatios.includes(ratio) ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300'}`}>
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* 最大参考图数量 */}
        {config.capabilities.includes('image2video_reference') && (
          <div>
            <label className="block text-sm text-slate-600 dark:text-gray-400 mb-1">最大参考图数量</label>
            <input type="number" value={config.maxReferenceImages} onChange={e => setConfig(c => ({ ...c, maxReferenceImages: parseInt(e.target.value) || 1 }))} min={1} max={model.maxImages} className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-input-dark text-slate-900 dark:text-white" />
          </div>
        )}

        {/* 视频时长 */}
        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-400 mb-2">视频时长</label>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary font-medium">8秒</span>
            <span className="text-xs text-slate-500 dark:text-gray-500">（Veo 3.1 系列固定时长）</span>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <button onClick={save} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
        </div>
      </div>
    </div>
  )
}

// 导出模型列表和能力定义供其他组件使用
export { VEO_MODELS, CAPABILITIES }
