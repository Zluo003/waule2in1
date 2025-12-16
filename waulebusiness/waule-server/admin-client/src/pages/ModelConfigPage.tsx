import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '../lib/api'

type ModelType = 'TEXT_GENERATION' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | 'VIDEO_EDITING' | 'AUDIO_SYNTHESIS'

interface AIModel {
  id: string
  name: string
  provider: string
  modelId: string
  type: ModelType
  config: any
  apiKey?: string
  apiUrl?: string
  isActive: boolean
  pricePerUse?: string
  capabilities?: Array<{ capability: string; supported: boolean }>
}

const ASPECT_RATIOS = [
  { value: '21:9', label: '21:9' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '5:4', label: '5:4' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
]

const GOOGLE_PRO_ID = 'gemini-2.5-pro'
const GOOGLE_FLASH_TEXT_ID = 'gemini-2.5-flash'
const GOOGLE_FLASH_IMAGE_ID = 'gemini-2.5-flash-image'
const GOOGLE_GEMINI_3_ID = 'gemini-3-pro-preview'
const GOOGLE_GEMINI_3_IMAGE_ID = 'gemini-3-pro-image-preview'
const DOUBAO_SEEDANCE_PRO_ID = 'doubao-seedance-1-0-pro-250528'
const DOUBAO_SEEDANCE_FAST_ID = 'doubao-seedance-1-0-pro-fast-251015'
const DOUBAO_SEEDREAM_ID = 'doubao-seedream-4-0-250828'
const DOUBAO_SEEDREAM_45_ID = 'doubao-seedream-4-5-251128'
const ALI_QWEN_IMAGE_EDIT_ID = 'qwen-image-edit-plus'
const ALI_WAN_ANIMATE_MOVE_ID = 'wan2.2-animate-move'
const ALI_WAN_ANIMATE_MIX_ID = 'wan2.2-animate-mix'
const ALI_VIDEO_STYLE_ID = 'video-style-transform'
const ALI_VIDEOTALK_ID = 'videoretalk'
const MINIMAX_HAILUO_23_ID = 'MiniMax-Hailuo-2.3'
const MINIMAX_HAILUO_23_FAST_ID = 'MiniMax-Hailuo-2.3-Fast'
const MINIMAX_HAILUO_02_ID = 'MiniMax-Hailuo-02'
const MINIMAX_SPEECH_26_HD_ID = 'speech-2.6-hd'
const SORA_IMAGE_ID = 'sora-image'
const SORA_VIDEO_ID = 'sora-video'
const VIDU_Q2_PRO_ID = 'viduq2-pro'
const VIDU_Q2_TURBO_ID = 'viduq2-turbo'
const VIDU_Q2_ID = 'viduq2'

const defaultGoogleApiUrl = (modelId: string) => `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
const defaultDoubaoApiUrl = 'https://ark.cn-beijing.volces.com/api/v3'
const defaultAliyunBase = 'https://dashscope.aliyuncs.com'
const defaultAliyunImage2Video = `${defaultAliyunBase}/api/v1/services/aigc/image2video/video-synthesis`
const defaultAliyunVideoGeneration = `${defaultAliyunBase}/api/v1/services/aigc/video-generation/video-synthesis`
const defaultSoraApiUrl = 'http://localhost:8000'
const defaultViduApiUrl = 'https://api.vidu.cn/ent/v2'

const ModelConfigPage = () => {
  const [loading, setLoading] = useState(false)
  const [existingModels, setExistingModels] = useState<AIModel[]>([])
  const [selectedKey, setSelectedKey] = useState<'google_pro' | 'google_flash_text' | 'google_flash' | 'google_gemini3' | 'google_gemini3_image' | 'doubao_seedance_pro' | 'doubao_seedance_fast' | 'doubao_seedream' | 'doubao_seedream_45' | 'aliyun_qwen_image_edit' | 'aliyun_animate_move' | 'aliyun_animate_mix' | 'aliyun_video_style' | 'aliyun_videoretalk' | 'minimaxi_hailuo_23' | 'minimaxi_hailuo_23_fast' | 'minimaxi_hailuo_02' | 'minimaxi_speech_26_hd' | 'sora_image' | 'sora_video' | 'vidu_q2_pro' | 'vidu_q2_turbo' | 'vidu_q2'>('google_pro')
  
  // Midjourney 设置
  const [mjFastEnabled, setMjFastEnabled] = useState(true)
  const [mjSettingsLoading, setMjSettingsLoading] = useState(false)

  const [proId, setProId] = useState<string | null>(null)
  const [proName, setProName] = useState('Gemini 2.5 Pro')
  const [proIsActive, setProIsActive] = useState(true)
  const [proPrice, setProPrice] = useState('')
  const [proApiKey, setProApiKey] = useState('')
  const [proApiUrl, setProApiUrl] = useState('')
  const [proAccepted, setProAccepted] = useState<string[]>(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  const [proTextConfig, setProTextConfig] = useState({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40, frequencyPenalty: 0, presencePenalty: 0 })

  const [flashTextId, setFlashTextId] = useState<string | null>(null)
  const [flashTextName, setFlashTextName] = useState('Gemini 2.5 Flash (视频分析)')
  const [flashTextIsActive, setFlashTextIsActive] = useState(true)
  const [flashTextPrice, setFlashTextPrice] = useState('')
  const [flashTextApiKey, setFlashTextApiKey] = useState('')
  const [flashTextApiUrl, setFlashTextApiUrl] = useState('')
  const [flashTextAccepted, setFlashTextAccepted] = useState<string[]>(['TEXT', 'IMAGE', 'VIDEO'])
  const [flashTextConfig, setFlashTextConfig] = useState({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40 })

  const [flashId, setFlashId] = useState<string | null>(null)
  const [flashName, setFlashName] = useState('Gemini 2.5 Flash Image')
  const [flashIsActive, setFlashIsActive] = useState(true)
  const [flashPrice, setFlashPrice] = useState('')
  const [flashApiKey, setFlashApiKey] = useState('')
  const [flashApiUrl, setFlashApiUrl] = useState('')
  const [flashAccepted, setFlashAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [flashImageConfig, setFlashImageConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 2 })

  const [gemini3Id, setGemini3Id] = useState<string | null>(null)
  const [gemini3Name, setGemini3Name] = useState('Gemini 3.0 Pro')
  const [gemini3IsActive, setGemini3IsActive] = useState(true)
  const [gemini3Price, setGemini3Price] = useState('')
  const [gemini3ApiKey, setGemini3ApiKey] = useState('')
  const [gemini3ApiUrl, setGemini3ApiUrl] = useState('')
  const [gemini3Accepted, setGemini3Accepted] = useState<string[]>(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  const [gemini3TextConfig, setGemini3TextConfig] = useState({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40, frequencyPenalty: 0, presencePenalty: 0 })
  const [gemini3ThinkingConfig, setGemini3ThinkingConfig] = useState({ enableThinkingMode: true, thinkingLevel: 'medium' })
  const [gemini3MediaConfig, setGemini3MediaConfig] = useState({ imageResolution: 'media_resolution_high', pdfResolution: 'media_resolution_medium', videoResolution: 'media_resolution_low' })

  const [gemini3ImageId, setGemini3ImageId] = useState<string | null>(null)
  const [gemini3ImageName, setGemini3ImageName] = useState('Gemini 3 Pro Image')
  const [gemini3ImageIsActive, setGemini3ImageIsActive] = useState(true)
  const [gemini3ImagePrice, setGemini3ImagePrice] = useState('')
  const [gemini3ImageApiKey, setGemini3ImageApiKey] = useState('')
  const [gemini3ImageApiUrl, setGemini3ImageApiUrl] = useState('')
  const [gemini3ImageAccepted, setGemini3ImageAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [gemini3ImageConfig, setGemini3ImageConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportedResolutions: ['2K', '4K'], supportsImageToImage: true, maxReferenceImages: 1, capabilities: ['google_search', 'reasoning', 'text_rendering'] })

  const [sdProId, setSdProId] = useState<string | null>(null)
  const [sdProName, setSdProName] = useState('Doubao SeeDance 1.0 Pro')
  const [sdProIsActive, setSdProIsActive] = useState(true)
  const [sdProPrice, setSdProPrice] = useState('')
  const [sdProApiKey, setSdProApiKey] = useState('')
  const [sdProApiUrl, setSdProApiUrl] = useState('')
  const [sdProAccepted, setSdProAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [sdProVideoConfig, setSdProVideoConfig] = useState({ supportedRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], supportedResolutions: ['720P', '1080P', '2K', '4K'], supportedGenerationTypes: ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [5, 6, 8, 10, 15, 30] })

  const [sdFastId, setSdFastId] = useState<string | null>(null)
  const [sdFastName, setSdFastName] = useState('Doubao SeeDance 1.0 Pro Fast')
  const [sdFastIsActive, setSdFastIsActive] = useState(true)
  const [sdFastPrice, setSdFastPrice] = useState('')
  const [sdFastApiKey, setSdFastApiKey] = useState('')
  const [sdFastApiUrl, setSdFastApiUrl] = useState('')
  const [sdFastAccepted, setSdFastAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [sdFastVideoConfig, setSdFastVideoConfig] = useState({ supportedRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], supportedResolutions: ['720P', '1080P'], supportedGenerationTypes: ['文生视频', '首帧'], supportedDurations: [5, 6, 8, 10] })

  const [sdreamId, setSdreamId] = useState<string | null>(null)
  const [sdreamName, setSdreamName] = useState('Doubao SeeDream 4.0')
  const [sdreamIsActive, setSdreamIsActive] = useState(true)
  const [sdreamPrice, setSdreamPrice] = useState('')
  const [sdreamApiKey, setSdreamApiKey] = useState('')
  const [sdreamApiUrl, setSdreamApiUrl] = useState('')
  const [sdreamAccepted, setSdreamAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [sdreamImageConfig, setSdreamImageConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })

  const [sdream45Id, setSdream45Id] = useState<string | null>(null)
  const [sdream45Name, setSdream45Name] = useState('Doubao SeeDream 4.5')
  const [sdream45IsActive, setSdream45IsActive] = useState(true)
  const [sdream45Price, setSdream45Price] = useState('')
  const [sdream45ApiKey, setSdream45ApiKey] = useState('')
  const [sdream45ApiUrl, setSdream45ApiUrl] = useState('')
  const [sdream45Accepted, setSdream45Accepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [sdream45ImageConfig, setSdream45ImageConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })

  const [aliQwenImageEditId, setAliQwenImageEditId] = useState<string | null>(null)
  const [aliQwenImageEditName, setAliQwenImageEditName] = useState('Qwen Image Edit Plus')
  const [aliQwenImageEditIsActive, setAliQwenImageEditIsActive] = useState(true)
  const [aliQwenImageEditPrice, setAliQwenImageEditPrice] = useState('')
  const [aliQwenImageEditApiKey, setAliQwenImageEditApiKey] = useState('')
  const [aliQwenImageEditApiUrl, setAliQwenImageEditApiUrl] = useState('')
  const [aliQwenImageEditAccepted, setAliQwenImageEditAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [aliQwenImageEditConfig, setAliQwenImageEditConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })

  const [aliMoveId, setAliMoveId] = useState<string | null>(null)
  const [aliMoveName, setAliMoveName] = useState('Aliyun Wan Animate Move')
  const [aliMoveIsActive, setAliMoveIsActive] = useState(true)
  const [aliMovePrice, setAliMovePrice] = useState('')
  const [aliMoveApiKey, setAliMoveApiKey] = useState('')
  const [aliMoveApiUrl, setAliMoveApiUrl] = useState('')
  const [aliMoveAccepted] = useState<string[]>(['IMAGE', 'VIDEO'])
  const [aliMoveModes, setAliMoveModes] = useState<string[]>(['wan-std', 'wan-pro'])

  const [aliMixId, setAliMixId] = useState<string | null>(null)
  const [aliMixName, setAliMixName] = useState('Aliyun Wan Animate Mix')
  const [aliMixIsActive, setAliMixIsActive] = useState(true)
  const [aliMixPrice, setAliMixPrice] = useState('')
  const [aliMixApiKey, setAliMixApiKey] = useState('')
  const [aliMixApiUrl, setAliMixApiUrl] = useState('')
  const [aliMixAccepted] = useState<string[]>(['IMAGE', 'VIDEO'])
  const [aliMixModes, setAliMixModes] = useState<string[]>(['wan-std', 'wan-pro'])

  const [aliStyleId, setAliStyleId] = useState<string | null>(null)
  const [aliStyleName, setAliStyleName] = useState('Aliyun Video Style Transform')
  const [aliStyleIsActive, setAliStyleIsActive] = useState(true)
  const [aliStylePrice, setAliStylePrice] = useState('')
  const [aliStyleApiKey, setAliStyleApiKey] = useState('')
  const [aliStyleApiUrl, setAliStyleApiUrl] = useState('')
  const [aliStyleAccepted] = useState<string[]>(['VIDEO'])
  const [aliStyleFps, setAliStyleFps] = useState(15)
  const [aliStyleSupportedStyles, setAliStyleSupportedStyles] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7])

  const [aliRetalkId, setAliRetalkId] = useState<string | null>(null)
  const [aliRetalkName, setAliRetalkName] = useState('Aliyun VideoRetalk')
  const [aliRetalkIsActive, setAliRetalkIsActive] = useState(true)
  const [aliRetalkPrice, setAliRetalkPrice] = useState('')
  const [aliRetalkApiKey, setAliRetalkApiKey] = useState('')
  const [aliRetalkApiUrl, setAliRetalkApiUrl] = useState('')
  const [aliRetalkAccepted, setAliRetalkAccepted] = useState<string[]>(['VIDEO', 'AUDIO', 'IMAGE'])
  const [aliRetalkParams, setAliRetalkParams] = useState({ video_extension: false })

  const [mm23Id, setMm23Id] = useState<string | null>(null)
  const [mm23Name, setMm23Name] = useState('MiniMax Hailuo 2.3')
  const [mm23IsActive, setMm23IsActive] = useState(true)
  const [mm23Price, setMm23Price] = useState('')
  const [mm23ApiKey, setMm23ApiKey] = useState('')
  const [mm23ApiUrl, setMm23ApiUrl] = useState('')
  const [mm23Accepted, setMm23Accepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [mm23VideoConfig, setMm23VideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['文生视频', '参考图', '首帧'], supportedDurations: [6, 10] })

  const [mm23FastId, setMm23FastId] = useState<string | null>(null)
  const [mm23FastName, setMm23FastName] = useState('MiniMax Hailuo 2.3 Fast')
  const [mm23FastIsActive, setMm23FastIsActive] = useState(true)
  const [mm23FastPrice, setMm23FastPrice] = useState('')
  const [mm23FastApiKey, setMm23FastApiKey] = useState('')
  const [mm23FastApiUrl, setMm23FastApiUrl] = useState('')
  const [mm23FastAccepted, setMm23FastAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [mm23FastVideoConfig, setMm23FastVideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['首帧'], supportedDurations: [6, 10] })

  const [mm02Id, setMm02Id] = useState<string | null>(null)
  const [mm02Name, setMm02Name] = useState('MiniMax Hailuo 02')
  const [mm02IsActive, setMm02IsActive] = useState(true)
  const [mm02Price, setMm02Price] = useState('')
  const [mm02ApiKey, setMm02ApiKey] = useState('')
  const [mm02ApiUrl, setMm02ApiUrl] = useState('')
  const [mm02Accepted, setMm02Accepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [mm02VideoConfig, setMm02VideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [6, 8, 10] })

  const [mmSpeechId, setMmSpeechId] = useState<string | null>(null)
  const [mmSpeechName, setMmSpeechName] = useState('MiniMax Speech 2.6 HD')
  const [mmSpeechIsActive, setMmSpeechIsActive] = useState(true)
  const [mmSpeechPrice, setMmSpeechPrice] = useState('')
  const [mmSpeechApiKey, setMmSpeechApiKey] = useState('')
  const [mmSpeechApiUrl, setMmSpeechApiUrl] = useState('')
  const [mmSpeechAccepted, setMmSpeechAccepted] = useState<string[]>(['TEXT', 'AUDIO'])
  const [mmSpeechConfig, setMmSpeechConfig] = useState({ supportedFormats: ['mp3', 'wav'], sampleRateMin: 16000, supportsStereo: true })
  const [mmSpeechAbilities, setMmSpeechAbilities] = useState<{ synth: boolean; clone: boolean; design: boolean }>({ synth: true, clone: true, design: true })

  const [soraImageId, setSoraImageId] = useState<string | null>(null)
  const [soraImageName, setSoraImageName] = useState('Sora2 Image')
  const [soraImageIsActive, setSoraImageIsActive] = useState(true)
  const [soraImagePrice, setSoraImagePrice] = useState('')
  const [soraImageApiKey, setSoraImageApiKey] = useState('')
  const [soraImageApiUrl, setSoraImageApiUrl] = useState('')
  const [soraImageAccepted, setSoraImageAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [soraImageConfig, setSoraImageConfig] = useState({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 5 })

  const [soraVideoId, setSoraVideoId] = useState<string | null>(null)
  const [soraVideoName, setSoraVideoName] = useState('Sora2 Video')
  const [soraVideoIsActive, setSoraVideoIsActive] = useState(true)
  const [soraVideoPrice, setSoraVideoPrice] = useState('')
  const [soraVideoApiKey, setSoraVideoApiKey] = useState('')
  const [soraVideoApiUrl, setSoraVideoApiUrl] = useState('')
  const [soraVideoAccepted, setSoraVideoAccepted] = useState<string[]>(['TEXT', 'IMAGE', 'VIDEO'])
  const [soraVideoConfig, setSoraVideoConfig] = useState({ supportedRatios: ['landscape', 'portrait'], supportsImageToVideo: true, maxReferenceImages: 1, supportedGenerationTypes: ['文生视频', '图生视频', '视频生视频'], supportedDurations: [10, 15, 25] })

  const [viduQ2ProId, setViduQ2ProId] = useState<string | null>(null)
  const [viduQ2ProName, setViduQ2ProName] = useState('Vidu Q2 Pro')
  const [viduQ2ProIsActive, setViduQ2ProIsActive] = useState(true)
  const [viduQ2ProPrice, setViduQ2ProPrice] = useState('')
  const [viduQ2ProApiKey, setViduQ2ProApiKey] = useState('')
  const [viduQ2ProApiUrl, setViduQ2ProApiUrl] = useState('')
  const [viduQ2ProAccepted, setViduQ2ProAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [viduQ2ProVideoConfig, setViduQ2ProVideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 2, supportsSubjects: true, supportsAudioOutput: true })

  const [viduQ2TurboId, setViduQ2TurboId] = useState<string | null>(null)
  const [viduQ2TurboName, setViduQ2TurboName] = useState('Vidu Q2 Turbo')
  const [viduQ2TurboIsActive, setViduQ2TurboIsActive] = useState(true)
  const [viduQ2TurboPrice, setViduQ2TurboPrice] = useState('')
  const [viduQ2TurboApiKey, setViduQ2TurboApiKey] = useState('')
  const [viduQ2TurboApiUrl, setViduQ2TurboApiUrl] = useState('')
  const [viduQ2TurboAccepted, setViduQ2TurboAccepted] = useState<string[]>(['TEXT', 'IMAGE'])
  const [viduQ2TurboVideoConfig, setViduQ2TurboVideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 2, supportsSubjects: true, supportsAudioOutput: true })

  const [viduQ2Id, setViduQ2Id] = useState<string | null>(null)
  const [viduQ2Name, setViduQ2Name] = useState('Vidu Q2')
  const [viduQ2IsActive, setViduQ2IsActive] = useState(true)
  const [viduQ2Price, setViduQ2Price] = useState('')
  const [viduQ2ApiKey, setViduQ2ApiKey] = useState('')
  const [viduQ2ApiUrl, setViduQ2ApiUrl] = useState('')
  const [viduQ2Accepted, setViduQ2Accepted] = useState<string[]>(['IMAGE'])
  const [viduQ2VideoConfig, setViduQ2VideoConfig] = useState({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['参考图生视频'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 7, supportsSubjects: true, supportsAudioOutput: true, supportsBgm: true })

  // 获取 Midjourney 设置
  useEffect(() => {
    const fetchMjSettings = async () => {
      try {
        const res = await apiClient.get('/admin/settings/midjourney')
        setMjFastEnabled(res.settings?.fastEnabled ?? true)
      } catch (error) {
        console.error('获取 Midjourney 设置失败:', error)
      }
    }
    fetchMjSettings()
  }, [])

  // 更新 Midjourney Fast 模式设置
  const updateMjFastEnabled = async (enabled: boolean) => {
    try {
      setMjSettingsLoading(true)
      await apiClient.put('/admin/settings/midjourney', { fastEnabled: enabled })
      setMjFastEnabled(enabled)
      toast.success(enabled ? 'Fast 模式已启用' : 'Fast 模式已禁用')
    } catch (error) {
      console.error('更新 Midjourney 设置失败:', error)
      toast.error('更新设置失败')
    } finally {
      setMjSettingsLoading(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const resGoogle: any = await apiClient.admin.getAIModels({ provider: 'google' })
        const resDoubao: any = await apiClient.admin.getAIModels({ provider: 'bytedance' })
        const resDoubaoAlt: any = await apiClient.admin.getAIModels({ provider: 'doubao' })
        const resAliyun: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
        const resMiniMax: any = await apiClient.admin.getAIModels({ provider: 'minimaxi' })
        const resSora: any = await apiClient.admin.getAIModels({ provider: 'sora' })
        const resVidu: any = await apiClient.admin.getAIModels({ provider: 'vidu' })
        const listGoogle: AIModel[] = Array.isArray(resGoogle?.data) ? resGoogle.data : Array.isArray(resGoogle) ? resGoogle : []
        const listDoubao: AIModel[] = Array.isArray(resDoubao?.data) ? resDoubao.data : Array.isArray(resDoubao) ? resDoubao : []
        const listDoubaoAlt: AIModel[] = Array.isArray(resDoubaoAlt?.data) ? resDoubaoAlt.data : Array.isArray(resDoubaoAlt) ? resDoubaoAlt : []
        const listAli: AIModel[] = Array.isArray(resAliyun?.data) ? resAliyun.data : Array.isArray(resAliyun) ? resAliyun : []
        const listMiniMax: AIModel[] = Array.isArray(resMiniMax?.data) ? resMiniMax.data : Array.isArray(resMiniMax) ? resMiniMax : []
        const listSora: AIModel[] = Array.isArray(resSora?.data) ? resSora.data : Array.isArray(resSora) ? resSora : []
        const listVidu: AIModel[] = Array.isArray(resVidu?.data) ? resVidu.data : Array.isArray(resVidu) ? resVidu : []
        const list = [...listGoogle, ...listDoubao, ...listDoubaoAlt, ...listAli, ...listMiniMax, ...listSora, ...listVidu]
        setExistingModels(list)
        if (!migratedRef.current) {
          const fixMap: Record<string, string> = {
            'doubao-seedream-4-0': DOUBAO_SEEDREAM_ID,
            'doubao-seedance-1-0-pro-fast': DOUBAO_SEEDANCE_FAST_ID,
            'doubao-seedance-1-0-pro': DOUBAO_SEEDANCE_PRO_ID,
          }
          const targets = list.filter(m => fixMap[m.modelId])
          if (targets.length) {
            for (const m of targets) {
              try {
                await apiClient.admin.updateAIModel(m.id, { modelId: fixMap[m.modelId] })
              } catch { }
            }
            await refreshModels()
          }
          migratedRef.current = true
        }

        const gPro = list.find(m => m.modelId === GOOGLE_PRO_ID)
        if (gPro) {
          setProId(gPro.id)
          setProName(gPro.name)
          setProIsActive(gPro.isActive)
          setProPrice(gPro.pricePerUse || '')
          setProApiKey(gPro.apiKey || '')
          setProApiUrl(gPro.apiUrl || defaultGoogleApiUrl(GOOGLE_PRO_ID))
          setProAccepted(Array.isArray(gPro.config?.acceptedInputs) ? gPro.config.acceptedInputs : ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
          setProTextConfig({
            maxTokens: gPro.config?.maxTokens ?? 8192,
            temperature: gPro.config?.temperature ?? 0.7,
            topP: gPro.config?.topP ?? 0.95,
            topK: gPro.config?.topK ?? 40,
            frequencyPenalty: gPro.config?.frequencyPenalty ?? 0,
            presencePenalty: gPro.config?.presencePenalty ?? 0,
          })
        } else {
          setProId(null)
          setProName('Gemini 2.5 Pro')
          setProIsActive(true)
          setProPrice('')
          setProApiKey('')
          setProApiUrl(defaultGoogleApiUrl(GOOGLE_PRO_ID))
          setProAccepted(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
          setProTextConfig({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40, frequencyPenalty: 0, presencePenalty: 0 })
        }

        const gFlashText = list.find(m => m.modelId === GOOGLE_FLASH_TEXT_ID)
        if (gFlashText) {
          setFlashTextId(gFlashText.id)
          setFlashTextName(gFlashText.name)
          setFlashTextIsActive(gFlashText.isActive)
          setFlashTextPrice(gFlashText.pricePerUse || '')
          setFlashTextApiKey(gFlashText.apiKey || '')
          setFlashTextApiUrl(gFlashText.apiUrl || defaultGoogleApiUrl(GOOGLE_FLASH_TEXT_ID))
          setFlashTextAccepted(Array.isArray(gFlashText.config?.acceptedInputs) ? gFlashText.config.acceptedInputs : ['TEXT', 'IMAGE', 'VIDEO'])
          setFlashTextConfig({
            maxTokens: gFlashText.config?.maxTokens ?? 8192,
            temperature: gFlashText.config?.temperature ?? 0.7,
            topP: gFlashText.config?.topP ?? 0.95,
            topK: gFlashText.config?.topK ?? 40,
          })
        } else {
          setFlashTextId(null)
          setFlashTextName('Gemini 2.5 Flash (视频分析)')
          setFlashTextIsActive(true)
          setFlashTextPrice('')
          setFlashTextApiKey('')
          setFlashTextApiUrl(defaultGoogleApiUrl(GOOGLE_FLASH_TEXT_ID))
          setFlashTextAccepted(['TEXT', 'IMAGE', 'VIDEO'])
          setFlashTextConfig({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40 })
        }

        const gFlash = list.find(m => m.modelId === GOOGLE_FLASH_IMAGE_ID)
        if (gFlash) {
          setFlashId(gFlash.id)
          setFlashName(gFlash.name)
          setFlashIsActive(gFlash.isActive)
          setFlashPrice(gFlash.pricePerUse || '')
          setFlashApiKey(gFlash.apiKey || '')
          setFlashApiUrl(gFlash.apiUrl || defaultGoogleApiUrl(GOOGLE_FLASH_IMAGE_ID))
          setFlashAccepted(Array.isArray(gFlash.config?.acceptedInputs) ? gFlash.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setFlashImageConfig({
            supportedRatios: gFlash.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportsImageToImage: gFlash.config?.supportsImageToImage !== false,
            maxReferenceImages: gFlash.config?.maxReferenceImages ?? 2,
          })
        } else {
          setFlashId(null)
          setFlashName('Gemini 2.5 Flash Image')
          setFlashIsActive(true)
          setFlashPrice('')
          setFlashApiKey('')
          setFlashApiUrl(defaultGoogleApiUrl(GOOGLE_FLASH_IMAGE_ID))
          setFlashAccepted(['TEXT', 'IMAGE'])
          setFlashImageConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 2 })
        }

        const gGemini3 = list.find(m => m.modelId === GOOGLE_GEMINI_3_ID)
        if (gGemini3) {
          setGemini3Id(gGemini3.id)
          setGemini3Name(gGemini3.name)
          setGemini3IsActive(gGemini3.isActive)
          setGemini3Price(gGemini3.pricePerUse || '')
          setGemini3ApiKey(gGemini3.apiKey || '')
          setGemini3ApiUrl(gGemini3.apiUrl || defaultGoogleApiUrl(GOOGLE_GEMINI_3_ID))
          setGemini3Accepted(Array.isArray(gGemini3.config?.acceptedInputs) ? gGemini3.config.acceptedInputs : ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
          setGemini3TextConfig({
            maxTokens: gGemini3.config?.maxTokens ?? 8192,
            temperature: gGemini3.config?.temperature ?? 0.7,
            topP: gGemini3.config?.topP ?? 0.95,
            topK: gGemini3.config?.topK ?? 40,
            frequencyPenalty: gGemini3.config?.frequencyPenalty ?? 0,
            presencePenalty: gGemini3.config?.presencePenalty ?? 0,
          })
          setGemini3ThinkingConfig({
            enableThinkingMode: gGemini3.config?.enableThinkingMode ?? true,
            thinkingLevel: gGemini3.config?.thinkingLevel || 'medium',
          })
          setGemini3MediaConfig({
            imageResolution: gGemini3.config?.imageResolution || 'media_resolution_high',
            pdfResolution: gGemini3.config?.pdfResolution || 'media_resolution_medium',
            videoResolution: gGemini3.config?.videoResolution || 'media_resolution_low',
          })
        } else {
          setGemini3Id(null)
          setGemini3Name('Gemini 3.0 Pro')
          setGemini3IsActive(true)
          setGemini3Price('')
          setGemini3ApiKey('')
          setGemini3ApiUrl(defaultGoogleApiUrl(GOOGLE_GEMINI_3_ID))
          setGemini3Accepted(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
          setGemini3TextConfig({ maxTokens: 8192, temperature: 0.7, topP: 0.95, topK: 40, frequencyPenalty: 0, presencePenalty: 0 })
          setGemini3ThinkingConfig({ enableThinkingMode: true, thinkingLevel: 'medium' })
          setGemini3MediaConfig({ imageResolution: 'media_resolution_high', pdfResolution: 'media_resolution_medium', videoResolution: 'media_resolution_low' })
        }

        const gGemini3Image = list.find(m => m.modelId === GOOGLE_GEMINI_3_IMAGE_ID)
        if (gGemini3Image) {
          setGemini3ImageId(gGemini3Image.id)
          setGemini3ImageName(gGemini3Image.name)
          setGemini3ImageIsActive(gGemini3Image.isActive)
          setGemini3ImagePrice(gGemini3Image.pricePerUse || '')
          setGemini3ImageApiKey(gGemini3Image.apiKey || '')
          setGemini3ImageApiUrl(gGemini3Image.apiUrl || defaultGoogleApiUrl(GOOGLE_GEMINI_3_IMAGE_ID))
          setGemini3ImageAccepted(Array.isArray(gGemini3Image.config?.acceptedInputs) ? gGemini3Image.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setGemini3ImageConfig({
            supportedRatios: gGemini3Image.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportedResolutions: gGemini3Image.config?.supportedResolutions || ['2K', '4K'],
            supportsImageToImage: gGemini3Image.config?.supportsImageToImage !== false,
            maxReferenceImages: gGemini3Image.config?.maxReferenceImages ?? 1,
            capabilities: gGemini3Image.config?.capabilities || ['google_search', 'reasoning', 'text_rendering'],
          })
        } else {
          setGemini3ImageId(null)
          setGemini3ImageName('Gemini 3 Pro Image')
          setGemini3ImageIsActive(true)
          setGemini3ImagePrice('')
          setGemini3ImageApiKey('')
          setGemini3ImageApiUrl(defaultGoogleApiUrl(GOOGLE_GEMINI_3_IMAGE_ID))
          setGemini3ImageAccepted(['TEXT', 'IMAGE'])
          setGemini3ImageConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportedResolutions: ['2K', '4K'], supportsImageToImage: true, maxReferenceImages: 1, capabilities: ['google_search', 'reasoning', 'text_rendering'] })
        }

        const sdPro = list.find(m => m.modelId === DOUBAO_SEEDANCE_PRO_ID)
        if (sdPro) {
          setSdProId(sdPro.id)
          setSdProName(sdPro.name)
          setSdProIsActive(sdPro.isActive)
          setSdProPrice(sdPro.pricePerUse || '')
          setSdProApiKey(sdPro.apiKey || '')
          setSdProApiUrl(sdPro.apiUrl || defaultDoubaoApiUrl)
          setSdProAccepted(Array.isArray(sdPro.config?.acceptedInputs) ? sdPro.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSdProVideoConfig({
            supportedRatios: sdPro.config?.supportedRatios || ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
            supportedResolutions: sdPro.config?.supportedResolutions || ['720P', '1080P', '2K', '4K'],
            supportedGenerationTypes: sdPro.config?.supportedGenerationTypes || ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'],
            supportedDurations: sdPro.config?.supportedDurations || [5, 6, 8, 10, 15, 30],
          })
        } else {
          setSdProId(null)
          setSdProName('Doubao SeeDance 1.0 Pro')
          setSdProIsActive(true)
          setSdProPrice('')
          setSdProApiKey('')
          setSdProApiUrl(defaultDoubaoApiUrl)
          setSdProAccepted(['TEXT', 'IMAGE'])
          setSdProVideoConfig({ supportedRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], supportedResolutions: ['720P', '1080P', '2K', '4K'], supportedGenerationTypes: ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [5, 6, 8, 10, 15, 30] })
        }

        const sdFast = list.find(m => m.modelId === DOUBAO_SEEDANCE_FAST_ID)
        if (sdFast) {
          setSdFastId(sdFast.id)
          setSdFastName(sdFast.name)
          setSdFastIsActive(sdFast.isActive)
          setSdFastPrice(sdFast.pricePerUse || '')
          setSdFastApiKey(sdFast.apiKey || '')
          setSdFastApiUrl(sdFast.apiUrl || defaultDoubaoApiUrl)
          setSdFastAccepted(Array.isArray(sdFast.config?.acceptedInputs) ? sdFast.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSdFastVideoConfig({
            supportedRatios: sdFast.config?.supportedRatios || ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
            supportedResolutions: sdFast.config?.supportedResolutions || ['720P', '1080P'],
            supportedGenerationTypes: sdFast.config?.supportedGenerationTypes || ['文生视频', '首帧'],
            supportedDurations: sdFast.config?.supportedDurations || [5, 6, 8, 10],
          })
        } else {
          setSdFastId(null)
          setSdFastName('Doubao SeeDance 1.0 Pro Fast')
          setSdFastIsActive(true)
          setSdFastPrice('')
          setSdFastApiKey('')
          setSdFastApiUrl(defaultDoubaoApiUrl)
          setSdFastAccepted(['TEXT', 'IMAGE'])
          setSdFastVideoConfig({ supportedRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], supportedResolutions: ['720P', '1080P'], supportedGenerationTypes: ['文生视频', '首帧'], supportedDurations: [5, 6, 8, 10] })
        }

        const sdream = list.find(m => m.modelId === DOUBAO_SEEDREAM_ID)
        if (sdream) {
          setSdreamId(sdream.id)
          setSdreamName(sdream.name)
          setSdreamIsActive(sdream.isActive)
          setSdreamPrice(sdream.pricePerUse || '')
          setSdreamApiKey(sdream.apiKey || '')
          setSdreamApiUrl(sdream.apiUrl || defaultDoubaoApiUrl)
          setSdreamAccepted(Array.isArray(sdream.config?.acceptedInputs) ? sdream.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSdreamImageConfig({
            supportedRatios: sdream.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportsImageToImage: sdream.config?.supportsImageToImage !== false,
            maxReferenceImages: sdream.config?.maxReferenceImages ?? 10,
          })
        } else {
          setSdreamId(null)
          setSdreamName('Doubao SeeDream 4.0')
          setSdreamIsActive(true)
          setSdreamPrice('')
          setSdreamApiKey('')
          setSdreamApiUrl(defaultDoubaoApiUrl)
          setSdreamAccepted(['TEXT', 'IMAGE'])
          setSdreamImageConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })
        }

        const sdream45 = list.find(m => m.modelId === DOUBAO_SEEDREAM_45_ID)
        if (sdream45) {
          setSdream45Id(sdream45.id)
          setSdream45Name(sdream45.name)
          setSdream45IsActive(sdream45.isActive)
          setSdream45Price(sdream45.pricePerUse || '')
          setSdream45ApiKey(sdream45.apiKey || '')
          setSdream45ApiUrl(sdream45.apiUrl || defaultDoubaoApiUrl)
          setSdream45Accepted(Array.isArray(sdream45.config?.acceptedInputs) ? sdream45.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSdream45ImageConfig({
            supportedRatios: sdream45.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportsImageToImage: sdream45.config?.supportsImageToImage !== false,
            maxReferenceImages: sdream45.config?.maxReferenceImages ?? 10,
          })
        } else {
          setSdream45Id(null)
          setSdream45Name('Doubao SeeDream 4.5')
          setSdream45IsActive(true)
          setSdream45Price('')
          setSdream45ApiKey('')
          setSdream45ApiUrl(defaultDoubaoApiUrl)
          setSdream45Accepted(['TEXT', 'IMAGE'])
          setSdream45ImageConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })
        }

        const aliQwen = list.find(m => m.modelId === ALI_QWEN_IMAGE_EDIT_ID)
        if (aliQwen) {
          setAliQwenImageEditId(aliQwen.id)
          setAliQwenImageEditName(aliQwen.name)
          setAliQwenImageEditIsActive(aliQwen.isActive)
          setAliQwenImageEditPrice(aliQwen.pricePerUse || '')
          setAliQwenImageEditApiKey(aliQwen.apiKey || '')
          setAliQwenImageEditApiUrl(aliQwen.apiUrl || `${defaultAliyunBase}/api/v1/services/aigc/multimodal-generation/generation`)
          setAliQwenImageEditAccepted(Array.isArray(aliQwen.config?.acceptedInputs) ? aliQwen.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setAliQwenImageEditConfig({
            supportedRatios: aliQwen.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportsImageToImage: aliQwen.config?.supportsImageToImage !== false,
            maxReferenceImages: aliQwen.config?.maxReferenceImages ?? 10,
          })
        } else {
          setAliQwenImageEditId(null)
          setAliQwenImageEditName('Qwen Image Edit Plus')
          setAliQwenImageEditIsActive(true)
          setAliQwenImageEditPrice('')
          setAliQwenImageEditApiKey('')
          setAliQwenImageEditApiUrl(`${defaultAliyunBase}/api/v1/services/aigc/multimodal-generation/generation`)
          setAliQwenImageEditAccepted(['TEXT', 'IMAGE'])
          setAliQwenImageEditConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 10 })
        }

        const aliMove = list.find(m => m.modelId === ALI_WAN_ANIMATE_MOVE_ID)
        if (aliMove) {
          setAliMoveId(aliMove.id)
          setAliMoveName(aliMove.name)
          setAliMoveIsActive(aliMove.isActive)
          setAliMovePrice(aliMove.pricePerUse || '')
          setAliMoveApiKey(aliMove.apiKey || '')
          setAliMoveApiUrl(aliMove.apiUrl || defaultAliyunImage2Video)
          setAliMoveModes(Array.isArray(aliMove.config?.serviceModes) ? aliMove.config.serviceModes : ['wan-std', 'wan-pro'])
        } else {
          setAliMoveId(null)
          setAliMoveName('Aliyun Wan Animate Move')
          setAliMoveIsActive(true)
          setAliMovePrice('')
          setAliMoveApiKey('')
          setAliMoveApiUrl(defaultAliyunImage2Video)
          setAliMoveModes(['wan-std', 'wan-pro'])
        }

        const aliMix = list.find(m => m.modelId === ALI_WAN_ANIMATE_MIX_ID)
        if (aliMix) {
          setAliMixId(aliMix.id)
          setAliMixName(aliMix.name)
          setAliMixIsActive(aliMix.isActive)
          setAliMixPrice(aliMix.pricePerUse || '')
          setAliMixApiKey(aliMix.apiKey || '')
          setAliMixApiUrl(aliMix.apiUrl || defaultAliyunImage2Video)
          setAliMixModes(Array.isArray(aliMix.config?.serviceModes) ? aliMix.config.serviceModes : ['wan-std', 'wan-pro'])
        } else {
          setAliMixId(null)
          setAliMixName('Aliyun Wan Animate Mix')
          setAliMixIsActive(true)
          setAliMixPrice('')
          setAliMixApiKey('')
          setAliMixApiUrl(defaultAliyunImage2Video)
          setAliMixModes(['wan-std', 'wan-pro'])
        }

        const aliStyle = list.find(m => m.modelId === ALI_VIDEO_STYLE_ID)
        if (aliStyle) {
          setAliStyleId(aliStyle.id)
          setAliStyleName(aliStyle.name)
          setAliStyleIsActive(aliStyle.isActive)
          setAliStylePrice(aliStyle.pricePerUse || '')
          setAliStyleApiKey(aliStyle.apiKey || '')
          setAliStyleApiUrl(aliStyle.apiUrl || defaultAliyunVideoGeneration)
          setAliStyleSupportedStyles(Array.isArray(aliStyle.config?.supportedStyles) ? aliStyle.config.supportedStyles : [0, 1, 2, 3, 4, 5, 6, 7])
          setAliStyleFps(aliStyle.config?.video_fps ?? 15)
        } else {
          setAliStyleId(null)
          setAliStyleName('Aliyun Video Style Transform')
          setAliStyleIsActive(true)
          setAliStylePrice('')
          setAliStyleApiKey('')
          setAliStyleApiUrl(defaultAliyunVideoGeneration)
          setAliStyleSupportedStyles([0, 1, 2, 3, 4, 5, 6, 7])
          setAliStyleFps(15)
        }

        const aliRetalk = list.find(m => m.modelId === ALI_VIDEOTALK_ID)
        if (aliRetalk) {
          setAliRetalkId(aliRetalk.id)
          setAliRetalkName(aliRetalk.name)
          setAliRetalkIsActive(aliRetalk.isActive)
          setAliRetalkPrice(aliRetalk.pricePerUse || '')
          setAliRetalkApiKey(aliRetalk.apiKey || '')
          setAliRetalkApiUrl(aliRetalk.apiUrl || `${defaultAliyunImage2Video}/`)
          setAliRetalkAccepted(Array.isArray(aliRetalk.config?.acceptedInputs) ? aliRetalk.config.acceptedInputs : ['VIDEO', 'AUDIO', 'IMAGE'])
          setAliRetalkParams({ video_extension: !!aliRetalk.config?.video_extension })
        } else {
          setAliRetalkId(null)
          setAliRetalkName('Aliyun VideoRetalk')
          setAliRetalkIsActive(true)
          setAliRetalkPrice('')
          setAliRetalkApiKey('')
          setAliRetalkApiUrl(`${defaultAliyunImage2Video}/`)
          setAliRetalkAccepted(['VIDEO', 'AUDIO', 'IMAGE'])
          setAliRetalkParams({ video_extension: false })
        }

        const mm23 = list.find(m => m.modelId === MINIMAX_HAILUO_23_ID)
        if (mm23) {
          setMm23Id(mm23.id)
          setMm23Name(mm23.name)
          setMm23IsActive(mm23.isActive)
          setMm23Price(mm23.pricePerUse || '')
          setMm23ApiKey(mm23.apiKey || '')
          setMm23ApiUrl(mm23.apiUrl || 'https://api.minimaxi.com/v1')
          setMm23Accepted(Array.isArray(mm23.config?.acceptedInputs) ? mm23.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setMm23VideoConfig({
            supportedRatios: mm23.config?.supportedRatios || ['16:9', '9:16', '1:1'],
            supportedResolutions: mm23.config?.supportedResolutions || ['768P', '1080P'],
            supportedGenerationTypes: mm23.config?.supportedGenerationTypes || ['文生视频', '参考图', '首帧'],
            supportedDurations: mm23.config?.supportedDurations || [6, 10],
          })
        } else {
          setMm23Id(null)
          setMm23Name('MiniMax Hailuo 2.3')
          setMm23IsActive(true)
          setMm23Price('')
          setMm23ApiKey('')
          setMm23ApiUrl('https://api.minimaxi.com/v1')
          setMm23Accepted(['TEXT', 'IMAGE'])
          setMm23VideoConfig({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['文生视频', '参考图', '首帧'], supportedDurations: [6, 10] })
        }

        const mm23Fast = list.find(m => m.modelId === MINIMAX_HAILUO_23_FAST_ID)
        if (mm23Fast) {
          setMm23FastId(mm23Fast.id)
          setMm23FastName(mm23Fast.name)
          setMm23FastIsActive(mm23Fast.isActive)
          setMm23FastPrice(mm23Fast.pricePerUse || '')
          setMm23FastApiKey(mm23Fast.apiKey || '')
          setMm23FastApiUrl(mm23Fast.apiUrl || 'https://api.minimaxi.com/v1')
          setMm23FastAccepted(Array.isArray(mm23Fast.config?.acceptedInputs) ? mm23Fast.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setMm23FastVideoConfig({
            supportedRatios: mm23Fast.config?.supportedRatios || ['16:9', '9:16', '1:1'],
            supportedResolutions: mm23Fast.config?.supportedResolutions || ['768P', '1080P'],
            supportedGenerationTypes: mm23Fast.config?.supportedGenerationTypes || ['首帧'],
            supportedDurations: mm23Fast.config?.supportedDurations || [6, 10],
          })
        } else {
          setMm23FastId(null)
          setMm23FastName('MiniMax Hailuo 2.3 Fast')
          setMm23FastIsActive(true)
          setMm23FastPrice('')
          setMm23FastApiKey('')
          setMm23FastApiUrl('https://api.minimaxi.com/v1')
          setMm23FastAccepted(['TEXT', 'IMAGE'])
          setMm23FastVideoConfig({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['首帧'], supportedDurations: [6, 10] })
        }

        const mm02 = list.find(m => m.modelId === MINIMAX_HAILUO_02_ID)
        if (mm02) {
          setMm02Id(mm02.id)
          setMm02Name(mm02.name)
          setMm02IsActive(mm02.isActive)
          setMm02Price(mm02.pricePerUse || '')
          setMm02ApiKey(mm02.apiKey || '')
          setMm02ApiUrl(mm02.apiUrl || 'https://api.minimaxi.com/v1')
          setMm02Accepted(Array.isArray(mm02.config?.acceptedInputs) ? mm02.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setMm02VideoConfig({
            supportedRatios: mm02.config?.supportedRatios || ['16:9', '9:16', '1:1'],
            supportedResolutions: mm02.config?.supportedResolutions || ['768P', '1080P'],
            supportedGenerationTypes: mm02.config?.supportedGenerationTypes || ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'],
            supportedDurations: mm02.config?.supportedDurations || [6, 8, 10],
          })
        } else {
          setMm02Id(null)
          setMm02Name('MiniMax Hailuo 02')
          setMm02IsActive(true)
          setMm02Price('')
          setMm02ApiKey('')
          setMm02ApiUrl('https://api.minimaxi.com/v1')
          setMm02Accepted(['TEXT', 'IMAGE'])
          setMm02VideoConfig({ supportedRatios: ['16:9', '9:16', '1:1'], supportedResolutions: ['768P', '1080P'], supportedGenerationTypes: ['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [6, 8, 10] })
        }

        const mmSpeech = list.find(m => m.modelId === MINIMAX_SPEECH_26_HD_ID)
        if (mmSpeech) {
          setMmSpeechId(mmSpeech.id)
          setMmSpeechName(mmSpeech.name)
          setMmSpeechIsActive(mmSpeech.isActive)
          setMmSpeechPrice(mmSpeech.pricePerUse || '')
          setMmSpeechApiKey(mmSpeech.apiKey || '')
          setMmSpeechApiUrl(mmSpeech.apiUrl || 'https://api.minimaxi.com/v1')
          setMmSpeechAccepted(Array.isArray(mmSpeech.config?.acceptedInputs) ? mmSpeech.config.acceptedInputs : ['TEXT', 'AUDIO'])
          setMmSpeechConfig({
            supportedFormats: mmSpeech.config?.supportedFormats || ['mp3', 'wav'],
            sampleRateMin: mmSpeech.config?.sampleRateMin ?? 16000,
            supportsStereo: mmSpeech.config?.supportsStereo !== false,
          })
          const caps = Array.isArray((mmSpeech as any).capabilities) ? (mmSpeech as any).capabilities : []
          const synthCap = caps.find((c: any) => c.capability === '语音合成')
          const cloneCap = caps.find((c: any) => c.capability === '音色克隆')
          const designCap = caps.find((c: any) => c.capability === '音色设计')
          setMmSpeechAbilities({
            synth: synthCap ? !!synthCap.supported : true,
            clone: cloneCap ? !!cloneCap.supported : true,
            design: designCap ? !!designCap.supported : true,
          })
        } else {
          setMmSpeechId(null)
          setMmSpeechName('MiniMax Speech 2.6 HD')
          setMmSpeechIsActive(true)
          setMmSpeechPrice('')
          setMmSpeechApiKey('')
          setMmSpeechApiUrl('https://api.minimaxi.com/v1')
          setMmSpeechAccepted(['TEXT', 'AUDIO'])
          setMmSpeechConfig({ supportedFormats: ['mp3', 'wav'], sampleRateMin: 16000, supportsStereo: true })
          setMmSpeechAbilities({ synth: true, clone: true, design: true })
        }

        const soraImage = list.find(m => m.modelId === SORA_IMAGE_ID)
        if (soraImage) {
          setSoraImageId(soraImage.id)
          setSoraImageName(soraImage.name)
          setSoraImageIsActive(soraImage.isActive)
          setSoraImagePrice(soraImage.pricePerUse || '')
          setSoraImageApiKey(soraImage.apiKey || '')
          setSoraImageApiUrl(soraImage.apiUrl || defaultSoraApiUrl)
          setSoraImageAccepted(Array.isArray(soraImage.config?.acceptedInputs) ? soraImage.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSoraImageConfig({
            supportedRatios: soraImage.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
            supportsImageToImage: soraImage.config?.supportsImageToImage !== false,
            maxReferenceImages: soraImage.config?.maxReferenceImages ?? 5,
          })
        } else {
          setSoraImageId(null)
          setSoraImageName('Sora2 Image')
          setSoraImageIsActive(true)
          setSoraImagePrice('')
          setSoraImageApiKey('')
          setSoraImageApiUrl(defaultSoraApiUrl)
          setSoraImageAccepted(['TEXT', 'IMAGE'])
          setSoraImageConfig({ supportedRatios: ASPECT_RATIOS.map(r => r.value), supportsImageToImage: true, maxReferenceImages: 5 })
        }

        const soraVideo = list.find(m => m.modelId === SORA_VIDEO_ID)
        if (soraVideo) {
          setSoraVideoId(soraVideo.id)
          setSoraVideoName(soraVideo.name)
          setSoraVideoIsActive(soraVideo.isActive)
          setSoraVideoPrice(soraVideo.pricePerUse || '')
          setSoraVideoApiKey(soraVideo.apiKey || '')
          setSoraVideoApiUrl(soraVideo.apiUrl || defaultSoraApiUrl)
          setSoraVideoAccepted(Array.isArray(soraVideo.config?.acceptedInputs) ? soraVideo.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setSoraVideoConfig({
            supportedRatios: soraVideo.config?.supportedRatios || ['landscape', 'portrait'],
            supportsImageToVideo: soraVideo.config?.supportsImageToVideo !== false,
            maxReferenceImages: soraVideo.config?.maxReferenceImages ?? 1,
            supportedGenerationTypes: soraVideo.config?.supportedGenerationTypes || ['文生视频', '图生视频', '视频生视频'],
            supportedDurations: soraVideo.config?.supportedDurations || [10, 15, 25],
          })
        } else {
          setSoraVideoId(null)
          setSoraVideoName('Sora2 Video')
          setSoraVideoIsActive(true)
          setSoraVideoPrice('')
          setSoraVideoApiKey('')
          setSoraVideoApiUrl(defaultSoraApiUrl)
          setSoraVideoAccepted(['TEXT', 'IMAGE', 'VIDEO'])
          setSoraVideoConfig({ supportedRatios: ['landscape', 'portrait'], supportsImageToVideo: true, maxReferenceImages: 1, supportedGenerationTypes: ['文生视频', '图生视频', '视频生视频'], supportedDurations: [10, 15, 25] })
        }

        const viduQ2Pro = list.find(m => m.modelId === VIDU_Q2_PRO_ID)
        if (viduQ2Pro) {
          setViduQ2ProId(viduQ2Pro.id)
          setViduQ2ProName(viduQ2Pro.name)
          setViduQ2ProIsActive(viduQ2Pro.isActive)
          setViduQ2ProPrice(viduQ2Pro.pricePerUse || '')
          setViduQ2ProApiKey(viduQ2Pro.apiKey || '')
          setViduQ2ProApiUrl(viduQ2Pro.apiUrl || defaultViduApiUrl)
          setViduQ2ProAccepted(Array.isArray(viduQ2Pro.config?.acceptedInputs) ? viduQ2Pro.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setViduQ2ProVideoConfig({
            supportedRatios: viduQ2Pro.config?.supportedRatios || ['16:9', '9:16', '1:1', '4:3', '3:4'],
            supportedResolutions: viduQ2Pro.config?.supportedResolutions || ['540p', '720p', '1080p'],
            supportedGenerationTypes: viduQ2Pro.config?.supportedGenerationTypes || ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'],
            supportedDurations: viduQ2Pro.config?.supportedDurations || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            maxDuration: viduQ2Pro.config?.maxDuration ?? 10,
            supportedFps: viduQ2Pro.config?.supportedFps || [24, 30],
            maxResolution: viduQ2Pro.config?.maxResolution || '1920x1080',
            supportsImageToVideo: viduQ2Pro.config?.supportsImageToVideo !== false,
            maxReferenceImages: viduQ2Pro.config?.maxReferenceImages ?? 2,
            supportsSubjects: viduQ2Pro.config?.supportsSubjects !== false,
            supportsAudioOutput: viduQ2Pro.config?.supportsAudioOutput !== false,
          })
        } else {
          setViduQ2ProId(null)
          setViduQ2ProName('Vidu Q2 Pro')
          setViduQ2ProIsActive(true)
          setViduQ2ProPrice('')
          setViduQ2ProApiKey('')
          setViduQ2ProApiUrl(defaultViduApiUrl)
          setViduQ2ProAccepted(['TEXT', 'IMAGE'])
          setViduQ2ProVideoConfig({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 2, supportsSubjects: true, supportsAudioOutput: true })
        }

        const viduQ2Turbo = list.find(m => m.modelId === VIDU_Q2_TURBO_ID)
        if (viduQ2Turbo) {
          setViduQ2TurboId(viduQ2Turbo.id)
          setViduQ2TurboName(viduQ2Turbo.name)
          setViduQ2TurboIsActive(viduQ2Turbo.isActive)
          setViduQ2TurboPrice(viduQ2Turbo.pricePerUse || '')
          setViduQ2TurboApiKey(viduQ2Turbo.apiKey || '')
          setViduQ2TurboApiUrl(viduQ2Turbo.apiUrl || defaultViduApiUrl)
          setViduQ2TurboAccepted(Array.isArray(viduQ2Turbo.config?.acceptedInputs) ? viduQ2Turbo.config.acceptedInputs : ['TEXT', 'IMAGE'])
          setViduQ2TurboVideoConfig({
            supportedRatios: viduQ2Turbo.config?.supportedRatios || ['16:9', '9:16', '1:1', '4:3', '3:4'],
            supportedResolutions: viduQ2Turbo.config?.supportedResolutions || ['540p', '720p', '1080p'],
            supportedGenerationTypes: viduQ2Turbo.config?.supportedGenerationTypes || ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'],
            supportedDurations: viduQ2Turbo.config?.supportedDurations || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            maxDuration: viduQ2Turbo.config?.maxDuration ?? 10,
            supportedFps: viduQ2Turbo.config?.supportedFps || [24, 30],
            maxResolution: viduQ2Turbo.config?.maxResolution || '1920x1080',
            supportsImageToVideo: viduQ2Turbo.config?.supportsImageToVideo !== false,
            maxReferenceImages: viduQ2Turbo.config?.maxReferenceImages ?? 2,
            supportsSubjects: viduQ2Turbo.config?.supportsSubjects !== false,
            supportsAudioOutput: viduQ2Turbo.config?.supportsAudioOutput !== false,
          })
        } else {
          setViduQ2TurboId(null)
          setViduQ2TurboName('Vidu Q2 Turbo')
          setViduQ2TurboIsActive(true)
          setViduQ2TurboPrice('')
          setViduQ2TurboApiKey('')
          setViduQ2TurboApiUrl(defaultViduApiUrl)
          setViduQ2TurboAccepted(['TEXT', 'IMAGE'])
          setViduQ2TurboVideoConfig({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 2, supportsSubjects: true, supportsAudioOutput: true })
        }

        const viduQ2 = list.find(m => m.modelId === VIDU_Q2_ID)
        if (viduQ2) {
          setViduQ2Id(viduQ2.id)
          setViduQ2Name(viduQ2.name)
          setViduQ2IsActive(viduQ2.isActive)
          setViduQ2Price(viduQ2.pricePerUse || '')
          setViduQ2ApiKey(viduQ2.apiKey || '')
          setViduQ2ApiUrl(viduQ2.apiUrl || defaultViduApiUrl)
          setViduQ2Accepted(Array.isArray(viduQ2.config?.acceptedInputs) ? viduQ2.config.acceptedInputs : ['IMAGE'])
          setViduQ2VideoConfig({
            supportedRatios: viduQ2.config?.supportedRatios || ['16:9', '9:16', '1:1', '4:3', '3:4'],
            supportedResolutions: viduQ2.config?.supportedResolutions || ['540p', '720p', '1080p'],
            supportedGenerationTypes: viduQ2.config?.supportedGenerationTypes || ['参考图生视频'],
            supportedDurations: viduQ2.config?.supportedDurations || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            maxDuration: viduQ2.config?.maxDuration ?? 10,
            supportedFps: viduQ2.config?.supportedFps || [24, 30],
            maxResolution: viduQ2.config?.maxResolution || '1920x1080',
            supportsImageToVideo: viduQ2.config?.supportsImageToVideo !== false,
            maxReferenceImages: viduQ2.config?.maxReferenceImages ?? 7,
            supportsSubjects: viduQ2.config?.supportsSubjects !== false,
            supportsAudioOutput: viduQ2.config?.supportsAudioOutput !== false,
            supportsBgm: viduQ2.config?.supportsBgm !== false,
          })
        } else {
          setViduQ2Id(null)
          setViduQ2Name('Vidu Q2')
          setViduQ2IsActive(true)
          setViduQ2Price('')
          setViduQ2ApiKey('')
          setViduQ2ApiUrl(defaultViduApiUrl)
          setViduQ2Accepted(['IMAGE'])
          setViduQ2VideoConfig({ supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], supportedResolutions: ['540p', '720p', '1080p'], supportedGenerationTypes: ['参考图生视频'], supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], maxDuration: 10, supportedFps: [24, 30], maxResolution: '1920x1080', supportsImageToVideo: true, maxReferenceImages: 7, supportsSubjects: true, supportsAudioOutput: true, supportsBgm: true })
        }
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const migratedRef = useRef(false)

  const toggleList = (list: string[], value: string, setter: (v: string[]) => void) => {
    const exists = list.includes(value)
    setter(exists ? list.filter(x => x !== value) : [...list, value])
  }

  const refreshModels = async () => {
    const resGoogle: any = await apiClient.admin.getAIModels({ provider: 'google' })
    const resDoubao: any = await apiClient.admin.getAIModels({ provider: 'bytedance' })
    const resDoubaoAlt: any = await apiClient.admin.getAIModels({ provider: 'doubao' })
    const resAliyun: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
    const resMiniMax: any = await apiClient.admin.getAIModels({ provider: 'minimaxi' })
    const resSora: any = await apiClient.admin.getAIModels({ provider: 'sora' })
    const resVidu: any = await apiClient.admin.getAIModels({ provider: 'vidu' })
    const listGoogle: AIModel[] = Array.isArray(resGoogle?.data) ? resGoogle.data : Array.isArray(resGoogle) ? resGoogle : []
    const listDoubao: AIModel[] = Array.isArray(resDoubao?.data) ? resDoubao.data : Array.isArray(resDoubao) ? resDoubao : []
    const listDoubaoAlt: AIModel[] = Array.isArray(resDoubaoAlt?.data) ? resDoubaoAlt.data : Array.isArray(resDoubaoAlt) ? resDoubaoAlt : []
    const listAli: AIModel[] = Array.isArray(resAliyun?.data) ? resAliyun.data : Array.isArray(resAliyun) ? resAliyun : []
    const listMiniMax: AIModel[] = Array.isArray(resMiniMax?.data) ? resMiniMax.data : Array.isArray(resMiniMax) ? resMiniMax : []
    const listSora: AIModel[] = Array.isArray(resSora?.data) ? resSora.data : Array.isArray(resSora) ? resSora : []
    const listVidu: AIModel[] = Array.isArray(resVidu?.data) ? resVidu.data : Array.isArray(resVidu) ? resVidu : []
    setExistingModels([...listGoogle, ...listDoubao, ...listDoubaoAlt, ...listAli, ...listMiniMax, ...listSora, ...listVidu])
  }

  const saveGooglePro = async () => {
    try {
      const payload = {
        name: proName,
        provider: 'google',
        modelId: GOOGLE_PRO_ID,
        type: 'TEXT_GENERATION' as ModelType,
        apiKey: proApiKey,
        apiUrl: proApiUrl,
        isActive: proIsActive,
        pricePerUse: proPrice ? parseFloat(proPrice) : undefined,
        config: { ...proTextConfig, acceptedInputs: proAccepted },
      }
      const existing = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_PRO_ID)
      const targetId = proId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = resp?.data || resp
        setProId(saved?.id || targetId)
        toast.success('已保存 Gemini 2.5 Pro 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = resp?.data || resp
          setProId(saved?.id || null)
          toast.success('已创建 Gemini 2.5 Pro 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_PRO_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = resp2?.data || resp2
            setProId(saved2?.id || dup.id)
            toast.success('已保存 Gemini 2.5 Pro 配置')
          } else {
            throw e
          }
        }
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveGoogleFlashText = async () => {
    try {
      const payload = {
        name: flashTextName,
        provider: 'google',
        modelId: GOOGLE_FLASH_TEXT_ID,
        type: 'TEXT_GENERATION' as ModelType,
        apiKey: flashTextApiKey,
        apiUrl: flashTextApiUrl,
        isActive: flashTextIsActive,
        pricePerUse: flashTextPrice ? parseFloat(flashTextPrice) : undefined,
        config: { ...flashTextConfig, acceptedInputs: flashTextAccepted },
      }
      const existing = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_FLASH_TEXT_ID)
      const targetId = flashTextId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = resp?.data || resp
        setFlashTextId(saved?.id || targetId)
        toast.success('已保存 Gemini 2.5 Flash 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = resp?.data || resp
          setFlashTextId(saved?.id || null)
          toast.success('已创建 Gemini 2.5 Flash 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_FLASH_TEXT_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = resp2?.data || resp2
            setFlashTextId(saved2?.id || dup.id)
            toast.success('已保存 Gemini 2.5 Flash 配置')
          } else {
            throw e
          }
        }
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveGoogleFlash = async () => {
    try {
      const payload = {
        name: flashName,
        provider: 'google',
        modelId: GOOGLE_FLASH_IMAGE_ID,
        type: 'IMAGE_GENERATION' as ModelType,
        apiKey: flashApiKey,
        apiUrl: flashApiUrl,
        isActive: flashIsActive,
        pricePerUse: flashPrice ? parseFloat(flashPrice) : undefined,
        config: { ...flashImageConfig, acceptedInputs: flashAccepted },
      }
      const existing = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_FLASH_IMAGE_ID)
      const targetId = flashId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = resp?.data || resp
        setFlashId(saved?.id || targetId)
        toast.success('已保存 Gemini 2.5 Flash Image 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = resp?.data || resp
          setFlashId(saved?.id || null)
          toast.success('已创建 Gemini 2.5 Flash Image 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_FLASH_IMAGE_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = resp2?.data || resp2
            setFlashId(saved2?.id || dup.id)
            toast.success('已保存 Gemini 2.5 Flash Image 配置')
          } else {
            throw e
          }
        }
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveGoogleGemini3 = async () => {
    try {
      const payload = {
        name: gemini3Name,
        provider: 'google',
        modelId: GOOGLE_GEMINI_3_ID,
        type: 'TEXT_GENERATION' as ModelType,
        apiKey: gemini3ApiKey,
        apiUrl: gemini3ApiUrl,
        isActive: gemini3IsActive,
        pricePerUse: gemini3Price ? parseFloat(gemini3Price) : undefined,
        config: { ...gemini3TextConfig, ...gemini3ThinkingConfig, ...gemini3MediaConfig, acceptedInputs: gemini3Accepted },
      }
      const existing = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_GEMINI_3_ID)
      const targetId = gemini3Id || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = resp?.data || resp
        setGemini3Id(saved?.id || targetId)
        toast.success('已保存 Gemini 3.0 Pro 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = resp?.data || resp
          setGemini3Id(saved?.id || null)
          toast.success('已创建 Gemini 3.0 Pro 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_GEMINI_3_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = resp2?.data || resp2
            setGemini3Id(saved2?.id || dup.id)
            toast.success('已保存 Gemini 3.0 Pro 配置')
          } else {
            throw e
          }
        }
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveGemini3Image = async () => {
    try {
      const payload = {
        name: gemini3ImageName,
        provider: 'google',
        modelId: GOOGLE_GEMINI_3_IMAGE_ID,
        type: 'IMAGE_GENERATION' as ModelType,
        apiKey: gemini3ImageApiKey,
        apiUrl: gemini3ImageApiUrl,
        isActive: gemini3ImageIsActive,
        pricePerUse: gemini3ImagePrice ? parseFloat(gemini3ImagePrice) : undefined,
        config: { ...gemini3ImageConfig, acceptedInputs: gemini3ImageAccepted },
      }
      const existing = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_GEMINI_3_IMAGE_ID)
      const targetId = gemini3ImageId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = resp?.data || resp
        setGemini3ImageId(saved?.id || targetId)
        toast.success('已保存 Gemini 3 Pro Image 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = resp?.data || resp
          setGemini3ImageId(saved?.id || null)
          toast.success('已创建 Gemini 3 Pro Image 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'google' && m.modelId === GOOGLE_GEMINI_3_IMAGE_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = resp2?.data || resp2
            setGemini3ImageId(saved2?.id || dup.id)
            toast.success('已保存 Gemini 3 Pro Image 配置')
          } else {
            throw e
          }
        }
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveAliQwenImageEdit = async () => {
    try {
      const payload = {
        name: aliQwenImageEditName,
        provider: 'aliyun',
        modelId: ALI_QWEN_IMAGE_EDIT_ID,
        type: 'IMAGE_GENERATION' as ModelType,
        apiKey: aliQwenImageEditApiKey,
        apiUrl: aliQwenImageEditApiUrl,
        isActive: aliQwenImageEditIsActive,
        pricePerUse: aliQwenImageEditPrice ? parseFloat(aliQwenImageEditPrice) : undefined,
        config: { ...aliQwenImageEditConfig, acceptedInputs: aliQwenImageEditAccepted },
      }
      const existing = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_QWEN_IMAGE_EDIT_ID)
      const targetId = aliQwenImageEditId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
        setAliQwenImageEditId(saved?.id || targetId)
        setAliQwenImageEditApiKey(saved?.apiKey || aliQwenImageEditApiKey)
        setAliQwenImageEditApiUrl(saved?.apiUrl || aliQwenImageEditApiUrl)
        toast.success('已保存 Qwen Image Edit Plus 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
          setAliQwenImageEditId(saved?.id || null)
          setAliQwenImageEditApiKey(saved?.apiKey || aliQwenImageEditApiKey)
          setAliQwenImageEditApiUrl(saved?.apiUrl || aliQwenImageEditApiUrl)
          toast.success('已创建 Qwen Image Edit Plus 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_QWEN_IMAGE_EDIT_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = (resp2 as any)?.data?.data || (resp2 as any)?.data || resp2
            setAliQwenImageEditId(saved2?.id || dup.id)
            setAliQwenImageEditApiKey(saved2?.apiKey || aliQwenImageEditApiKey)
            setAliQwenImageEditApiUrl(saved2?.apiUrl || aliQwenImageEditApiUrl)
            toast.success('已保存 Qwen Image Edit Plus 配置')
          } else {
            throw e
          }
        }
      }
      const resAli: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
      const listAli: AIModel[] = Array.isArray(resAli?.data) ? resAli.data : Array.isArray(resAli) ? resAli : []
      const updated = listAli.find(m => m.modelId === ALI_QWEN_IMAGE_EDIT_ID)
      if (updated) {
        setAliQwenImageEditName(updated.name)
        setAliQwenImageEditIsActive(updated.isActive)
        setAliQwenImageEditPrice(updated.pricePerUse || '')
        setAliQwenImageEditApiKey(updated.apiKey || '')
        setAliQwenImageEditApiUrl(updated.apiUrl || `${defaultAliyunBase}/api/v1/services/aigc/multimodal-generation/generation`)
        setAliQwenImageEditAccepted(Array.isArray(updated.config?.acceptedInputs) ? updated.config.acceptedInputs : ['TEXT', 'IMAGE'])
        setAliQwenImageEditConfig({
          supportedRatios: updated.config?.supportedRatios || ASPECT_RATIOS.map(r => r.value),
          supportsImageToImage: updated.config?.supportsImageToImage !== false,
          maxReferenceImages: updated.config?.maxReferenceImages ?? 10,
        })
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveAliAnimateMove = async () => {
    try {
      const payload = {
        name: aliMoveName,
        provider: 'aliyun',
        modelId: ALI_WAN_ANIMATE_MOVE_ID,
        type: 'VIDEO_EDITING' as ModelType,
        apiKey: aliMoveApiKey,
        apiUrl: aliMoveApiUrl,
        isActive: aliMoveIsActive,
        pricePerUse: aliMovePrice ? parseFloat(aliMovePrice) : undefined,
        config: { serviceModes: aliMoveModes, acceptedInputs: aliMoveAccepted, supportedEditingCapabilities: ['动作克隆'] },
      }
      const existing = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_WAN_ANIMATE_MOVE_ID)
      const targetId = aliMoveId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
        setAliMoveId(saved?.id || targetId)
        setAliMoveApiKey(saved?.apiKey || aliMoveApiKey)
        setAliMoveApiUrl(saved?.apiUrl || aliMoveApiUrl)
        toast.success('已保存 Wan Animate Move 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
          setAliMoveId(saved?.id || null)
          setAliMoveApiKey(saved?.apiKey || aliMoveApiKey)
          setAliMoveApiUrl(saved?.apiUrl || aliMoveApiUrl)
          toast.success('已创建 Wan Animate Move 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_WAN_ANIMATE_MOVE_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = (resp2 as any)?.data?.data || (resp2 as any)?.data || resp2
            setAliMoveId(saved2?.id || dup.id)
            setAliMoveApiKey(saved2?.apiKey || aliMoveApiKey)
            setAliMoveApiUrl(saved2?.apiUrl || aliMoveApiUrl)
            toast.success('已保存 Wan Animate Move 配置')
          } else {
            throw e
          }
        }
      }
      const resAli: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
      const listAli: AIModel[] = Array.isArray(resAli?.data) ? resAli.data : Array.isArray(resAli) ? resAli : []
      const updated = listAli.find(m => m.modelId === ALI_WAN_ANIMATE_MOVE_ID)
      if (updated) {
        setAliMoveName(updated.name)
        setAliMoveIsActive(updated.isActive)
        setAliMovePrice(updated.pricePerUse || '')
        setAliMoveApiKey(updated.apiKey || '')
        setAliMoveApiUrl(updated.apiUrl || defaultAliyunImage2Video)
        setAliMoveModes(Array.isArray(updated.config?.serviceModes) ? updated.config.serviceModes : ['wan-std', 'wan-pro'])
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveAliAnimateMix = async () => {
    try {
      const payload = {
        name: aliMixName,
        provider: 'aliyun',
        modelId: ALI_WAN_ANIMATE_MIX_ID,
        type: 'VIDEO_EDITING' as ModelType,
        apiKey: aliMixApiKey,
        apiUrl: aliMixApiUrl,
        isActive: aliMixIsActive,
        pricePerUse: aliMixPrice ? parseFloat(aliMixPrice) : undefined,
        config: { serviceModes: aliMixModes, acceptedInputs: aliMixAccepted, supportedEditingCapabilities: ['视频换人'] },
      }
      const existing = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_WAN_ANIMATE_MIX_ID)
      const targetId = aliMixId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
        setAliMixId(saved?.id || targetId)
        setAliMixApiKey(saved?.apiKey || aliMixApiKey)
        setAliMixApiUrl(saved?.apiUrl || aliMixApiUrl)
        toast.success('已保存 Wan Animate Mix 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
          setAliMixId(saved?.id || null)
          setAliMixApiKey(saved?.apiKey || aliMixApiKey)
          setAliMixApiUrl(saved?.apiUrl || aliMixApiUrl)
          toast.success('已创建 Wan Animate Mix 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_WAN_ANIMATE_MIX_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = (resp2 as any)?.data?.data || (resp2 as any)?.data || resp2
            setAliMixId(saved2?.id || dup.id)
            setAliMixApiKey(saved2?.apiKey || aliMixApiKey)
            setAliMixApiUrl(saved2?.apiUrl || aliMixApiUrl)
            toast.success('已保存 Wan Animate Mix 配置')
          } else {
            throw e
          }
        }
      }
      const resAli: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
      const listAli: AIModel[] = Array.isArray(resAli?.data) ? resAli.data : Array.isArray(resAli) ? resAli : []
      const updated = listAli.find(m => m.modelId === ALI_WAN_ANIMATE_MIX_ID)
      if (updated) {
        setAliMixName(updated.name)
        setAliMixIsActive(updated.isActive)
        setAliMixPrice(updated.pricePerUse || '')
        setAliMixApiKey(updated.apiKey || '')
        setAliMixApiUrl(updated.apiUrl || defaultAliyunImage2Video)
        setAliMixModes(Array.isArray(updated.config?.serviceModes) ? updated.config.serviceModes : ['wan-std', 'wan-pro'])
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveAliVideoStyle = async () => {
    try {
      const payload = {
        name: aliStyleName,
        provider: 'aliyun',
        modelId: ALI_VIDEO_STYLE_ID,
        type: 'VIDEO_EDITING' as ModelType,
        apiKey: aliStyleApiKey,
        apiUrl: aliStyleApiUrl,
        isActive: aliStyleIsActive,
        pricePerUse: aliStylePrice ? parseFloat(aliStylePrice) : undefined,
        config: { supportedStyles: aliStyleSupportedStyles, video_fps: aliStyleFps, acceptedInputs: aliStyleAccepted, supportedEditingCapabilities: ['风格转换'] },
      }
      const existing = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_VIDEO_STYLE_ID)
      const targetId = aliStyleId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
        setAliStyleId(saved?.id || targetId)
        setAliStyleApiKey(saved?.apiKey || aliStyleApiKey)
        setAliStyleApiUrl(saved?.apiUrl || aliStyleApiUrl)
        toast.success('已保存 Video Style Transform 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
          setAliStyleId(saved?.id || null)
          setAliStyleApiKey(saved?.apiKey || aliStyleApiKey)
          setAliStyleApiUrl(saved?.apiUrl || aliStyleApiUrl)
          toast.success('已创建 Video Style Transform 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_VIDEO_STYLE_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = (resp2 as any)?.data?.data || (resp2 as any)?.data || resp2
            setAliStyleId(saved2?.id || dup.id)
            setAliStyleApiKey(saved2?.apiKey || aliStyleApiKey)
            setAliStyleApiUrl(saved2?.apiUrl || aliStyleApiUrl)
            toast.success('已保存 Video Style Transform 配置')
          } else {
            throw e
          }
        }
      }
      const resAli: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
      const listAli: AIModel[] = Array.isArray(resAli?.data) ? resAli.data : Array.isArray(resAli) ? resAli : []
      const updated = listAli.find(m => m.modelId === ALI_VIDEO_STYLE_ID)
      if (updated) {
        setAliStyleName(updated.name)
        setAliStyleIsActive(updated.isActive)
        setAliStylePrice(updated.pricePerUse || '')
        setAliStyleApiKey(updated.apiKey || '')
        setAliStyleApiUrl(updated.apiUrl || defaultAliyunVideoGeneration)
        setAliStyleSupportedStyles(Array.isArray(updated.config?.supportedStyles) ? updated.config.supportedStyles : [0, 1, 2, 3, 4, 5, 6, 7])
        setAliStyleFps(updated.config?.video_fps ?? 15)
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveAliVideoretalk = async () => {
    try {
      const payload = {
        name: aliRetalkName,
        provider: 'aliyun',
        modelId: ALI_VIDEOTALK_ID,
        type: 'VIDEO_EDITING' as ModelType,
        apiKey: aliRetalkApiKey,
        apiUrl: aliRetalkApiUrl,
        isActive: aliRetalkIsActive,
        pricePerUse: aliRetalkPrice ? parseFloat(aliRetalkPrice) : undefined,
        config: { ...aliRetalkParams, acceptedInputs: aliRetalkAccepted, supportedEditingCapabilities: ['对口型'] },
      }
      const existing = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_VIDEOTALK_ID)
      const targetId = aliRetalkId || existing?.id
      if (targetId) {
        const resp = await apiClient.admin.updateAIModel(targetId, payload)
        const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
        setAliRetalkId(saved?.id || targetId)
        setAliRetalkApiKey(saved?.apiKey || aliRetalkApiKey)
        setAliRetalkApiUrl(saved?.apiUrl || aliRetalkApiUrl)
        toast.success('已保存 VideoRetalk 配置')
      } else {
        try {
          const resp = await apiClient.admin.createAIModel(payload)
          const saved = (resp as any)?.data?.data || (resp as any)?.data || resp
          setAliRetalkId(saved?.id || null)
          setAliRetalkApiKey(saved?.apiKey || aliRetalkApiKey)
          setAliRetalkApiUrl(saved?.apiUrl || aliRetalkApiUrl)
          toast.success('已创建 VideoRetalk 配置')
        } catch (e) {
          const dup = existingModels.find(m => m.provider === 'aliyun' && m.modelId === ALI_VIDEOTALK_ID)
          if (dup) {
            const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
            const saved2 = (resp2 as any)?.data?.data || (resp2 as any)?.data || resp2
            setAliRetalkId(saved2?.id || dup.id)
            setAliRetalkApiKey(saved2?.apiKey || aliRetalkApiKey)
            setAliRetalkApiUrl(saved2?.apiUrl || aliRetalkApiUrl)
            toast.success('已保存 VideoRetalk 配置')
          } else {
            throw e
          }
        }
      }
      const resAli: any = await apiClient.admin.getAIModels({ provider: 'aliyun' })
      const listAli: AIModel[] = Array.isArray(resAli?.data) ? resAli.data : Array.isArray(resAli) ? resAli : []
      const updated = listAli.find(m => m.modelId === ALI_VIDEOTALK_ID)
      if (updated) {
        setAliRetalkName(updated.name)
        setAliRetalkIsActive(updated.isActive)
        setAliRetalkPrice(updated.pricePerUse || '')
        setAliRetalkApiKey(updated.apiKey || '')
        setAliRetalkApiUrl(updated.apiUrl || `${defaultAliyunImage2Video}/`)
        setAliRetalkAccepted(Array.isArray(updated.config?.acceptedInputs) ? updated.config.acceptedInputs : ['VIDEO', 'AUDIO', 'IMAGE'])
        setAliRetalkParams({ video_extension: !!updated.config?.video_extension })
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveSeedancePro = async () => {
    try {
      const payload = {
        name: sdProName,
        provider: 'bytedance',
        modelId: DOUBAO_SEEDANCE_PRO_ID,
        type: 'VIDEO_GENERATION' as ModelType,
        apiKey: sdProApiKey,
        apiUrl: sdProApiUrl,
        isActive: sdProIsActive,
        pricePerUse: sdProPrice ? parseFloat(sdProPrice) : undefined,
        config: { ...sdProVideoConfig, acceptedInputs: sdProAccepted },
      }
      if (sdProId) {
        const resp = await apiClient.admin.updateAIModel(sdProId, payload)
        const saved = resp?.data || resp
        setSdProId(saved?.id || sdProId)
        toast.success('已保存 Doubao SeeDance 1.0 Pro 配置')
      } else {
        const resp = await apiClient.admin.createAIModel(payload)
        const saved = resp?.data || resp
        setSdProId(saved?.id || null)
        toast.success('已创建 Doubao SeeDance 1.0 Pro 配置')
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveSeedanceFast = async () => {
    try {
      const payload = {
        name: sdFastName,
        provider: 'bytedance',
        modelId: DOUBAO_SEEDANCE_FAST_ID,
        type: 'VIDEO_GENERATION' as ModelType,
        apiKey: sdFastApiKey,
        apiUrl: sdFastApiUrl,
        isActive: sdFastIsActive,
        pricePerUse: sdFastPrice ? parseFloat(sdFastPrice) : undefined,
        config: { ...sdFastVideoConfig, acceptedInputs: sdFastAccepted },
      }
      if (sdFastId) {
        const resp = await apiClient.admin.updateAIModel(sdFastId, payload)
        const saved = resp?.data || resp
        setSdFastId(saved?.id || sdFastId)
        toast.success('已保存 Doubao SeeDance 1.0 Pro Fast 配置')
      } else {
        const resp = await apiClient.admin.createAIModel(payload)
        const saved = resp?.data || resp
        setSdFastId(saved?.id || null)
        toast.success('已创建 Doubao SeeDance 1.0 Pro Fast 配置')
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveSeedream = async () => {
    try {
      const payload = {
        name: sdreamName,
        provider: 'bytedance',
        modelId: DOUBAO_SEEDREAM_ID,
        type: 'IMAGE_GENERATION' as ModelType,
        apiKey: sdreamApiKey,
        apiUrl: sdreamApiUrl,
        isActive: sdreamIsActive,
        pricePerUse: sdreamPrice ? parseFloat(sdreamPrice) : undefined,
        config: { ...sdreamImageConfig, acceptedInputs: sdreamAccepted },
      }
      if (sdreamId) {
        const resp = await apiClient.admin.updateAIModel(sdreamId, payload)
        const saved = resp?.data || resp
        setSdreamId(saved?.id || sdreamId)
        toast.success('已保存 Doubao SeeDream 4.0 配置')
      } else {
        const resp = await apiClient.admin.createAIModel(payload)
        const saved = resp?.data || resp
        setSdreamId(saved?.id || null)
        toast.success('已创建 Doubao SeeDream 4.0 配置')
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  const saveSeedream45 = async () => {
    try {
      const payload = {
        name: sdream45Name,
        provider: 'bytedance',
        modelId: DOUBAO_SEEDREAM_45_ID,
        type: 'IMAGE_GENERATION' as ModelType,
        apiKey: sdream45ApiKey,
        apiUrl: sdream45ApiUrl,
        isActive: sdream45IsActive,
        pricePerUse: sdream45Price ? parseFloat(sdream45Price) : undefined,
        config: { ...sdream45ImageConfig, acceptedInputs: sdream45Accepted },
      }
      if (sdream45Id) {
        const resp = await apiClient.admin.updateAIModel(sdream45Id, payload)
        const saved = resp?.data || resp
        setSdream45Id(saved?.id || sdream45Id)
        toast.success('已保存 Doubao SeeDream 4.5 配置')
      } else {
        const resp = await apiClient.admin.createAIModel(payload)
        const saved = resp?.data || resp
        setSdream45Id(saved?.id || null)
        toast.success('已创建 Doubao SeeDream 4.5 配置')
      }
      await refreshModels()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '保存失败')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">模型配置</h1>
        <p className="text-slate-600 dark:text-gray-400">左侧模型列表，右侧对应配置</p>
      </div>

      {/* Midjourney 设置 */}
      <div className="mb-6 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Midjourney Fast 模式</div>
            <div className="text-xs text-slate-500 dark:text-gray-500 mt-1">
              当 Fast 模式额度用完时，可以在此禁用。禁用后用户只能使用 Relax 模式。
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateMjFastEnabled(!mjFastEnabled)}
            disabled={mjSettingsLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              mjFastEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
            } ${mjSettingsLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                mjFastEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Google / Gemini</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('google_pro')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'google_pro' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Gemini 2.5 Pro</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{GOOGLE_PRO_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === GOOGLE_PRO_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('google_flash_text')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'google_flash_text' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Gemini 2.5 Flash <span className="text-xs text-purple-400">(视频分析)</span></div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{GOOGLE_FLASH_TEXT_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === GOOGLE_FLASH_TEXT_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('google_flash')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'google_flash' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Gemini 2.5 Flash Image</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{GOOGLE_FLASH_IMAGE_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === GOOGLE_FLASH_IMAGE_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('google_gemini3')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'google_gemini3' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Gemini 3.0 Pro</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{GOOGLE_GEMINI_3_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === GOOGLE_GEMINI_3_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('google_gemini3_image')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'google_gemini3_image' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Gemini 3 Pro Image</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{GOOGLE_GEMINI_3_IMAGE_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === GOOGLE_GEMINI_3_IMAGE_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Bytedance / Doubao</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('doubao_seedance_pro')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'doubao_seedance_pro' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Doubao SeeDance 1.0 Pro</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{DOUBAO_SEEDANCE_PRO_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === DOUBAO_SEEDANCE_PRO_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('doubao_seedance_fast')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'doubao_seedance_fast' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Doubao SeeDance 1.0 Pro Fast</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{DOUBAO_SEEDANCE_FAST_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === DOUBAO_SEEDANCE_FAST_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('doubao_seedream')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'doubao_seedream' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Doubao SeeDream 4.0</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{DOUBAO_SEEDREAM_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === DOUBAO_SEEDREAM_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('doubao_seedream_45')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'doubao_seedream_45' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Doubao SeeDream 4.5</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{DOUBAO_SEEDREAM_45_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === DOUBAO_SEEDREAM_45_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Aliyun / Qwen & Wanx</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('aliyun_qwen_image_edit')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'aliyun_qwen_image_edit' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Qwen Image Edit Plus</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{ALI_QWEN_IMAGE_EDIT_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === ALI_QWEN_IMAGE_EDIT_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('aliyun_animate_move')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'aliyun_animate_move' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Wan Animate Move</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{ALI_WAN_ANIMATE_MOVE_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === ALI_WAN_ANIMATE_MOVE_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('aliyun_animate_mix')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'aliyun_animate_mix' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Wan Animate Mix</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{ALI_WAN_ANIMATE_MIX_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === ALI_WAN_ANIMATE_MIX_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('aliyun_video_style')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'aliyun_video_style' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Video Style Transform</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{ALI_VIDEO_STYLE_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === ALI_VIDEO_STYLE_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('aliyun_videoretalk')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'aliyun_videoretalk' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">VideoRetalk</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{ALI_VIDEOTALK_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === ALI_VIDEOTALK_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">MiniMax / Hailuo</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('minimaxi_hailuo_23')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'minimaxi_hailuo_23' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">MiniMax Hailuo 2.3</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{MINIMAX_HAILUO_23_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === MINIMAX_HAILUO_23_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('minimaxi_hailuo_23_fast')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'minimaxi_hailuo_23_fast' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">MiniMax Hailuo 2.3 Fast</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{MINIMAX_HAILUO_23_FAST_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === MINIMAX_HAILUO_23_FAST_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('minimaxi_hailuo_02')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'minimaxi_hailuo_02' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">MiniMax Hailuo 02</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{MINIMAX_HAILUO_02_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === MINIMAX_HAILUO_02_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('minimaxi_speech_26_hd')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'minimaxi_speech_26_hd' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">MiniMax Speech 2.6 HD</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{MINIMAX_SPEECH_26_HD_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === MINIMAX_SPEECH_26_HD_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Sora / OpenAI</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('sora_image')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'sora_image' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Sora2 Image</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{SORA_IMAGE_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === SORA_IMAGE_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('sora_video')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'sora_video' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Sora2 Video</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{SORA_VIDEO_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === SORA_VIDEO_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4">
            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Vidu</div>
            <div className="space-y-2">
              <button type="button" onClick={() => setSelectedKey('vidu_q2_pro')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'vidu_q2_pro' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Vidu Q2 Pro</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{VIDU_Q2_PRO_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === VIDU_Q2_PRO_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('vidu_q2_turbo')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'vidu_q2_turbo' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Vidu Q2 Turbo</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{VIDU_Q2_TURBO_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === VIDU_Q2_TURBO_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
              <button type="button" onClick={() => setSelectedKey('vidu_q2')} className={`w-full text-left p-3 rounded-lg border ${selectedKey === 'vidu_q2' ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-border-dark'} flex items-center justify-between`}>
                <div>
                  <div className="text-slate-900 dark:text-white">Vidu Q2（参考图生视频）</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">{VIDU_Q2_ID}</div>
                </div>
                {existingModels.find(m => m.modelId === VIDU_Q2_ID) && (<span className="text-xs text-green-400">已配置</span>)}
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          {selectedKey === 'google_pro' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gemini 2.5 Pro</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">TEXT_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={proName} onChange={e => setProName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={GOOGLE_PRO_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(proAccepted, t, setProAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${proAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大Token数</label>
                  <input type="number" min={100} max={128000} value={proTextConfig.maxTokens} onChange={e => setProTextConfig({ ...proTextConfig, maxTokens: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">温度</label>
                  <input type="number" step={0.1} min={0} max={2} value={proTextConfig.temperature} onChange={e => setProTextConfig({ ...proTextConfig, temperature: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top P</label>
                  <input type="number" step={0.05} min={0} max={1} value={proTextConfig.topP} onChange={e => setProTextConfig({ ...proTextConfig, topP: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top K</label>
                  <input type="number" min={1} max={100} value={proTextConfig.topK} onChange={e => setProTextConfig({ ...proTextConfig, topK: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">频率惩罚</label>
                  <input type="number" step={0.1} min={-2} max={2} value={proTextConfig.frequencyPenalty} onChange={e => setProTextConfig({ ...proTextConfig, frequencyPenalty: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">存在惩罚</label>
                  <input type="number" step={0.1} min={-2} max={2} value={proTextConfig.presencePenalty} onChange={e => setProTextConfig({ ...proTextConfig, presencePenalty: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={proIsActive} onChange={e => setProIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveGooglePro} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'google_flash_text' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gemini 2.5 Flash <span className="text-purple-500">(视频分析)</span></h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">TEXT_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={flashTextName} onChange={e => setFlashTextName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={GOOGLE_FLASH_TEXT_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE', 'VIDEO'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(flashTextAccepted, t, setFlashTextAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${flashTextAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大Token数</label>
                  <input type="number" min={100} max={128000} value={flashTextConfig.maxTokens} onChange={e => setFlashTextConfig({ ...flashTextConfig, maxTokens: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">温度</label>
                  <input type="number" step={0.1} min={0} max={2} value={flashTextConfig.temperature} onChange={e => setFlashTextConfig({ ...flashTextConfig, temperature: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top P</label>
                  <input type="number" step={0.05} min={0} max={1} value={flashTextConfig.topP} onChange={e => setFlashTextConfig({ ...flashTextConfig, topP: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top K</label>
                  <input type="number" min={1} max={100} value={flashTextConfig.topK} onChange={e => setFlashTextConfig({ ...flashTextConfig, topK: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="text-sm font-medium text-purple-900 dark:text-purple-300 mb-2">💡 专用于视频分析</div>
                <div className="text-xs text-purple-700 dark:text-purple-400">此模型用于"灵感/创意"页面的视频分镜分析功能，支持多模态输入（文本、图片、视频）</div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={flashTextIsActive} onChange={e => setFlashTextIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveGoogleFlashText} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'google_flash' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gemini 2.5 Flash Image</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={flashName} onChange={e => setFlashName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={GOOGLE_FLASH_IMAGE_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(flashAccepted, t, setFlashAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${flashAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setFlashImageConfig({ ...flashImageConfig, supportedRatios: flashImageConfig.supportedRatios.includes(r.value) ? flashImageConfig.supportedRatios.filter(x => x !== r.value) : [...flashImageConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${flashImageConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={flashImageConfig.supportsImageToImage} onChange={e => setFlashImageConfig({ ...flashImageConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行生成</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={flashImageConfig.maxReferenceImages} onChange={e => setFlashImageConfig({ ...flashImageConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={flashIsActive} onChange={e => setFlashIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveGoogleFlash} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'google_gemini3' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gemini 3.0 Pro</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">TEXT_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={gemini3Name} onChange={e => setGemini3Name(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={GOOGLE_GEMINI_3_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(gemini3Accepted, t, setGemini3Accepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${gemini3Accepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">思维模式配置</div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                    <input type="checkbox" checked={gemini3ThinkingConfig.enableThinkingMode} onChange={e => setGemini3ThinkingConfig({ ...gemini3ThinkingConfig, enableThinkingMode: e.target.checked })} className="w-5 h-5" />
                    <div className="flex-1">
                      <div className="text-sm text-slate-900 dark:text-white">启用思维模式</div>
                      <div className="text-xs text-slate-500 dark:text-gray-500">允许模型展示推理过程</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">思维水平</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['low', 'medium', 'high'].map(level => (
                        <button key={level} type="button" onClick={() => setGemini3ThinkingConfig({ ...gemini3ThinkingConfig, thinkingLevel: level })} className={`px-4 py-2 rounded-lg border-2 text-sm ${gemini3ThinkingConfig.thinkingLevel === level ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>
                          {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      低：快速响应，简化推理；中：平衡速度与质量；高：深度思考，详细推理
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">媒体分辨率配置</div>
                <div className="text-xs text-gray-400 mb-4">分辨率越高，模型读取细小文本或识别细微细节的能力就越强，但会增加令牌用量和延迟时间</div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">图片分辨率（推荐：High）</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['media_resolution_low', 'media_resolution_medium', 'media_resolution_high'].map(res => (
                        <button key={res} type="button" onClick={() => setGemini3MediaConfig({ ...gemini3MediaConfig, imageResolution: res })} className={`px-4 py-2 rounded-lg border-2 text-sm ${gemini3MediaConfig.imageResolution === res ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>
                          {res.includes('low') ? 'Low (280)' : res.includes('medium') ? 'Medium (560)' : 'High (1120)'}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">建议用于大多数图片分析任务，以确保获得最佳质量</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">PDF分辨率（推荐：Medium）</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['media_resolution_low', 'media_resolution_medium', 'media_resolution_high'].map(res => (
                        <button key={res} type="button" onClick={() => setGemini3MediaConfig({ ...gemini3MediaConfig, pdfResolution: res })} className={`px-4 py-2 rounded-lg border-2 text-sm ${gemini3MediaConfig.pdfResolution === res ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>
                          {res.includes('low') ? 'Low (280)' : res.includes('medium') ? 'Medium (560)' : 'High (1120)'}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">非常适合文档理解；质量通常在 Medium 时达到饱和</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频分辨率（推荐：Low）</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['media_resolution_low', 'media_resolution_medium', 'media_resolution_high'].map(res => (
                        <button key={res} type="button" onClick={() => setGemini3MediaConfig({ ...gemini3MediaConfig, videoResolution: res })} className={`px-4 py-2 rounded-lg border-2 text-sm ${gemini3MediaConfig.videoResolution === res ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>
                          {res.includes('low') ? 'Low (70/帧)' : res.includes('medium') ? 'Medium (70/帧)' : 'High (280/帧)'}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Low/Medium 对于大多数动作识别和描述任务已足够；High 仅用于读取密集文本或视频帧中的微小细节</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大Token数</label>
                  <input type="number" min={100} max={128000} value={gemini3TextConfig.maxTokens} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, maxTokens: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">温度</label>
                  <input type="number" step={0.1} min={0} max={2} value={gemini3TextConfig.temperature} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, temperature: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top P</label>
                  <input type="number" step={0.05} min={0} max={1} value={gemini3TextConfig.topP} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, topP: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Top K</label>
                  <input type="number" min={1} max={100} value={gemini3TextConfig.topK} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, topK: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">频率惩罚</label>
                  <input type="number" step={0.1} min={-2} max={2} value={gemini3TextConfig.frequencyPenalty} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, frequencyPenalty: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">存在惩罚</label>
                  <input type="number" step={0.1} min={-2} max={2} value={gemini3TextConfig.presencePenalty} onChange={e => setGemini3TextConfig({ ...gemini3TextConfig, presencePenalty: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={gemini3IsActive} onChange={e => setGemini3IsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveGoogleGemini3} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'google_gemini3_image' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gemini 3 Pro Image</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={gemini3ImageName} onChange={e => setGemini3ImageName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={GOOGLE_GEMINI_3_IMAGE_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(gemini3ImageAccepted, t, setGemini3ImageAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${gemini3ImageAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setGemini3ImageConfig({ ...gemini3ImageConfig, supportedRatios: gemini3ImageConfig.supportedRatios.includes(r.value) ? gemini3ImageConfig.supportedRatios.filter(x => x !== r.value) : [...gemini3ImageConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${gemini3ImageConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的分辨率</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['2K', '4K'].map(res => (
                      <button key={res} type="button" onClick={() => setGemini3ImageConfig({ ...gemini3ImageConfig, supportedResolutions: gemini3ImageConfig.supportedResolutions.includes(res) ? gemini3ImageConfig.supportedResolutions.filter(x => x !== res) : [...gemini3ImageConfig.supportedResolutions, res] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${gemini3ImageConfig.supportedResolutions.includes(res) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{res}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={gemini3ImageConfig.supportsImageToImage} onChange={e => setGemini3ImageConfig({ ...gemini3ImageConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图（对话式编辑）</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行对话式编辑</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={gemini3ImageConfig.maxReferenceImages} onChange={e => setGemini3ImageConfig({ ...gemini3ImageConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">特殊能力</label>
                  <div className="space-y-2">
                    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-sm text-blue-900 dark:text-blue-300 font-medium">✓ Google 搜索集成</div>
                      <div className="text-xs text-blue-700 dark:text-blue-400">支持实时检索和事实依据核查</div>
                    </div>
                    <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="text-sm text-purple-900 dark:text-purple-300 font-medium">✓ 推理能力</div>
                      <div className="text-xs text-purple-700 dark:text-purple-400">支持思维过程推理生成</div>
                    </div>
                    <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="text-sm text-green-900 dark:text-green-300 font-medium">✓ 文本渲染</div>
                      <div className="text-xs text-green-700 dark:text-green-400">支持清晰易读的文本和图表渲染</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={gemini3ImageIsActive} onChange={e => setGemini3ImageIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveGemini3Image} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'doubao_seedance_pro' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Doubao SeeDance 1.0 Pro</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={sdProName} onChange={e => setSdProName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={DOUBAO_SEEDANCE_PRO_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(sdProAccepted, t, setSdProAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${sdProAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的视频比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].map(r => (
                      <button key={r} type="button" onClick={() => setSdProVideoConfig({ ...sdProVideoConfig, supportedRatios: sdProVideoConfig.supportedRatios.includes(r) ? sdProVideoConfig.supportedRatios.filter(x => x !== r) : [...sdProVideoConfig.supportedRatios, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdProVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">分辨率（多选）</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['720P', '1080P', '2K', '4K'].map(r => (
                      <button key={r} type="button" onClick={() => setSdProVideoConfig({ ...sdProVideoConfig, supportedResolutions: sdProVideoConfig.supportedResolutions.includes(r) ? sdProVideoConfig.supportedResolutions.filter(x => x !== r) : [...sdProVideoConfig.supportedResolutions, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdProVideoConfig.supportedResolutions.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'].map(t => (
                      <button key={t} type="button" onClick={() => setSdProVideoConfig({ ...sdProVideoConfig, supportedGenerationTypes: sdProVideoConfig.supportedGenerationTypes.includes(t) ? sdProVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...sdProVideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdProVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-8 gap-2">
                    {[5, 6, 8, 10, 15, 30].map(d => (
                      <button key={d} type="button" onClick={() => setSdProVideoConfig({ ...sdProVideoConfig, supportedDurations: sdProVideoConfig.supportedDurations.includes(d) ? sdProVideoConfig.supportedDurations.filter(x => x !== d) : [...sdProVideoConfig.supportedDurations, d] })} className={`px-3 py-1.5 rounded-lg border-2 text-sm ${sdProVideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={sdProIsActive} onChange={e => setSdProIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveSeedancePro} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'doubao_seedance_fast' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Doubao SeeDance 1.0 Pro Fast</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={sdFastName} onChange={e => setSdFastName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={DOUBAO_SEEDANCE_FAST_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(sdFastAccepted, t, setSdFastAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${sdFastAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的视频比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].map(r => (
                      <button key={r} type="button" onClick={() => setSdFastVideoConfig({ ...sdFastVideoConfig, supportedRatios: sdFastVideoConfig.supportedRatios.includes(r) ? sdFastVideoConfig.supportedRatios.filter(x => x !== r) : [...sdFastVideoConfig.supportedRatios, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdFastVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">分辨率（多选）</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['720P', '1080P'].map(r => (
                      <button key={r} type="button" onClick={() => setSdFastVideoConfig({ ...sdFastVideoConfig, supportedResolutions: sdFastVideoConfig.supportedResolutions.includes(r) ? sdFastVideoConfig.supportedResolutions.filter(x => x !== r) : [...sdFastVideoConfig.supportedResolutions, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdFastVideoConfig.supportedResolutions.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['文生视频', '首帧'].map(t => (
                      <button key={t} type="button" onClick={() => setSdFastVideoConfig({ ...sdFastVideoConfig, supportedGenerationTypes: sdFastVideoConfig.supportedGenerationTypes.includes(t) ? sdFastVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...sdFastVideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdFastVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-8 gap-2">
                    {[5, 6, 8, 10].map(d => (
                      <button key={d} type="button" onClick={() => setSdFastVideoConfig({ ...sdFastVideoConfig, supportedDurations: sdFastVideoConfig.supportedDurations.includes(d) ? sdFastVideoConfig.supportedDurations.filter(x => x !== d) : [...sdFastVideoConfig.supportedDurations, d] })} className={`px-3 py-1.5 rounded-lg border-2 text-sm ${sdFastVideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={sdFastIsActive} onChange={e => setSdFastIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveSeedanceFast} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'doubao_seedream' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Doubao SeeDream 4.0</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={sdreamName} onChange={e => setSdreamName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={DOUBAO_SEEDREAM_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(sdreamAccepted, t, setSdreamAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${sdreamAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setSdreamImageConfig({ ...sdreamImageConfig, supportedRatios: sdreamImageConfig.supportedRatios.includes(r.value) ? sdreamImageConfig.supportedRatios.filter(x => x !== r.value) : [...sdreamImageConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdreamImageConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={sdreamImageConfig.supportsImageToImage} onChange={e => setSdreamImageConfig({ ...sdreamImageConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行生成</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={sdreamImageConfig.maxReferenceImages} onChange={e => setSdreamImageConfig({ ...sdreamImageConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={sdreamIsActive} onChange={e => setSdreamIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveSeedream} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'doubao_seedream_45' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Doubao SeeDream 4.5</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={sdream45Name} onChange={e => setSdream45Name(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={DOUBAO_SEEDREAM_45_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(sdream45Accepted, t, setSdream45Accepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${sdream45Accepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setSdream45ImageConfig({ ...sdream45ImageConfig, supportedRatios: sdream45ImageConfig.supportedRatios.includes(r.value) ? sdream45ImageConfig.supportedRatios.filter(x => x !== r.value) : [...sdream45ImageConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${sdream45ImageConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={sdream45ImageConfig.supportsImageToImage} onChange={e => setSdream45ImageConfig({ ...sdream45ImageConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行生成</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={sdream45ImageConfig.maxReferenceImages} onChange={e => setSdream45ImageConfig({ ...sdream45ImageConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={sdream45IsActive} onChange={e => setSdream45IsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveSeedream45} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'aliyun_qwen_image_edit' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Qwen Image Edit Plus</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={aliQwenImageEditName} onChange={e => setAliQwenImageEditName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={ALI_QWEN_IMAGE_EDIT_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(aliQwenImageEditAccepted, t, setAliQwenImageEditAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${aliQwenImageEditAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setAliQwenImageEditConfig({ ...aliQwenImageEditConfig, supportedRatios: aliQwenImageEditConfig.supportedRatios.includes(r.value) ? aliQwenImageEditConfig.supportedRatios.filter(x => x !== r.value) : [...aliQwenImageEditConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${aliQwenImageEditConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={aliQwenImageEditConfig.supportsImageToImage} onChange={e => setAliQwenImageEditConfig({ ...aliQwenImageEditConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">图片分辨率 200-4096px，比例 1:3 至 3:1，大小 ≤5MB</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={aliQwenImageEditConfig.maxReferenceImages} onChange={e => setAliQwenImageEditConfig({ ...aliQwenImageEditConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={aliQwenImageEditIsActive} onChange={e => setAliQwenImageEditIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveAliQwenImageEdit} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'aliyun_animate_move' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Wan Animate Move</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_EDITING</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={aliMoveName} onChange={e => setAliMoveName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={ALI_WAN_ANIMATE_MOVE_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">服务模式（可多选）</div>
                <div className="flex gap-2 flex-wrap">
                  {['wan-std', 'wan-pro'].map(m => (
                    <button key={m} type="button" onClick={() => {
                      const exists = aliMoveModes.includes(m)
                      setAliMoveModes(exists ? aliMoveModes.filter(x => x !== m) : [...aliMoveModes, m])
                    }} className={`px-3 py-1.5 rounded border-2 text-sm ${aliMoveModes.includes(m) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-3 text-xs text-gray-400">
                <div>图片：尺寸 200-4096px，比例 1:3~3:1，≤5MB，建议仅一人正面</div>
                <div>视频：格式 MP4/AVI/MOV，时长 2~30s，尺寸 200~2048px，比例 1:3~3:1，≤200MB</div>
                <div>必须使用异步调用，提交后轮询 task_id 获取结果</div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={aliMoveIsActive} onChange={e => setAliMoveIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveAliAnimateMove} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'aliyun_animate_mix' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Wan Animate Mix</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_EDITING</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={aliMixName} onChange={e => setAliMixName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={ALI_WAN_ANIMATE_MIX_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">服务模式（可多选）</div>
                <div className="flex gap-2 flex-wrap">
                  {['wan-std', 'wan-pro'].map(m => (
                    <button key={m} type="button" onClick={() => {
                      const exists = aliMixModes.includes(m)
                      setAliMixModes(exists ? aliMixModes.filter(x => x !== m) : [...aliMixModes, m])
                    }} className={`px-3 py-1.5 rounded border-2 text-sm ${aliMixModes.includes(m) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-3 text-xs text-gray-400">
                <div>图片：尺寸 200-4096px，比例 1:3~3:1，≤5MB</div>
                <div>视频：格式 MP4/AVI/MOV，时长 2~30s，尺寸 200~2048px，比例 1:3~3:1，≤200MB</div>
                <div>必须使用异步调用，提交后轮询 task_id 获取结果</div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={aliMixIsActive} onChange={e => setAliMixIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveAliAnimateMix} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'aliyun_video_style' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Video Style Transform</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_EDITING</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={aliStyleName} onChange={e => setAliStyleName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={ALI_VIDEO_STYLE_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可用风格（0-7，可多选）</div>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(s => (
                    <button key={s} type="button" onClick={() => {
                      const exists = aliStyleSupportedStyles.includes(s)
                      setAliStyleSupportedStyles(exists ? aliStyleSupportedStyles.filter(x => x !== s) : [...aliStyleSupportedStyles, s])
                    }} className={`px-3 py-1.5 rounded border-2 text-sm ${aliStyleSupportedStyles.includes(s) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频帧率</label>
                  <input type="number" min={1} max={60} value={aliStyleFps} onChange={e => setAliStyleFps(Number(e.target.value))} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 space-y-3 text-xs text-gray-400">
                <div>视频：时长 ≤30s，格式 MP4/AVI/MOV 等</div>
                <div>异步调用，提交后轮询 task_id 获取结果</div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={aliStyleIsActive} onChange={e => setAliStyleIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveAliVideoStyle} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'aliyun_videoretalk' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">VideoRetalk</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_EDITING</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={aliRetalkName} onChange={e => setAliRetalkName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={ALI_VIDEOTALK_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['VIDEO', 'AUDIO', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(aliRetalkAccepted, t, setAliRetalkAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${aliRetalkAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                <input type="checkbox" checked={aliRetalkParams.video_extension} onChange={e => setAliRetalkParams({ ...aliRetalkParams, video_extension: e.target.checked })} className="w-5 h-5" />
                <div className="flex-1">
                  <div className="text-sm text-slate-900 dark:text-white">音频时长超出时扩展视频长度</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500">视频 2~120s、15~60fps、640~2048 边长；音频 2~120s、≤30MB</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400">异步调用：提交任务后以 task_id 轮询结果</div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={aliRetalkIsActive} onChange={e => setAliRetalkIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={saveAliVideoretalk} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'minimaxi_hailuo_23' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">MiniMax Hailuo 2.3</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={mm23Name} onChange={e => setMm23Name(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={MINIMAX_HAILUO_23_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(mm23Accepted, t, setMm23Accepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23Accepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['16:9', '9:16', '1:1'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm23VideoConfig.supportedRatios.includes(r)
                        setMm23VideoConfig({ ...mm23VideoConfig, supportedRatios: exists ? mm23VideoConfig.supportedRatios.filter(x => x !== r) : [...mm23VideoConfig.supportedRatios, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23VideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">分辨率（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['768P', '1080P'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm23VideoConfig.supportedResolutions.includes(r)
                        setMm23VideoConfig({ ...mm23VideoConfig, supportedResolutions: exists ? mm23VideoConfig.supportedResolutions.filter(x => x !== r) : [...mm23VideoConfig.supportedResolutions, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23VideoConfig.supportedResolutions.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['文生视频', '参考图', '首帧'].map(t => (
                      <button key={t} type="button" onClick={() => {
                        const exists = mm23VideoConfig.supportedGenerationTypes.includes(t)
                        setMm23VideoConfig({ ...mm23VideoConfig, supportedGenerationTypes: exists ? mm23VideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...mm23VideoConfig.supportedGenerationTypes, t] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23VideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="flex gap-2 flex-wrap">
                    {[6, 10].map(d => (
                      <button key={d} type="button" onClick={() => {
                        const exists = mm23VideoConfig.supportedDurations.includes(d)
                        setMm23VideoConfig({ ...mm23VideoConfig, supportedDurations: exists ? mm23VideoConfig.supportedDurations.filter(x => x !== d) : [...mm23VideoConfig.supportedDurations, d] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23VideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={mm23IsActive} onChange={e => setMm23IsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: mm23Name, provider: 'minimaxi', modelId: MINIMAX_HAILUO_23_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: mm23ApiKey, apiUrl: mm23ApiUrl, isActive: mm23IsActive, pricePerUse: mm23Price ? parseFloat(mm23Price) : undefined, config: { ...mm23VideoConfig, acceptedInputs: mm23Accepted } }
                    const existing = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_23_ID)
                    const targetId = mm23Id || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setMm23Id(saved?.id || targetId)
                      toast.success('已保存 MiniMax Hailuo 2.3 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setMm23Id(saved?.id || null)
                        toast.success('已创建 MiniMax Hailuo 2.3 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_23_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setMm23Id(saved2?.id || dup.id)
                          toast.success('已保存 MiniMax Hailuo 2.3 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    try {
                      const idForCaps = (mmSpeechId || existing?.id) || (existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_SPEECH_26_HD_ID)?.id)
                      if (idForCaps) {
                        await apiClient.admin.upsertAIModelCapabilities({
                          aiModelId: idForCaps, capabilities: [
                            { capability: '语音合成', supported: !!mmSpeechAbilities.synth },
                            { capability: '音色克隆', supported: !!mmSpeechAbilities.clone },
                            { capability: '音色设计', supported: !!mmSpeechAbilities.design },
                          ]
                        })
                      }
                    } catch { }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'minimaxi_hailuo_23_fast' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">MiniMax Hailuo 2.3 Fast</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={mm23FastName} onChange={e => setMm23FastName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={MINIMAX_HAILUO_23_FAST_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(mm23FastAccepted, t, setMm23FastAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23FastAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['16:9', '9:16', '1:1'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm23FastVideoConfig.supportedRatios.includes(r)
                        setMm23FastVideoConfig({ ...mm23FastVideoConfig, supportedRatios: exists ? mm23FastVideoConfig.supportedRatios.filter(x => x !== r) : [...mm23FastVideoConfig.supportedRatios, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23FastVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">分辨率（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['768P', '1080P'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm23FastVideoConfig.supportedResolutions.includes(r)
                        setMm23FastVideoConfig({ ...mm23FastVideoConfig, supportedResolutions: exists ? mm23FastVideoConfig.supportedResolutions.filter(x => x !== r) : [...mm23FastVideoConfig.supportedResolutions, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23FastVideoConfig.supportedResolutions.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['首帧'].map(t => (
                      <button key={t} type="button" onClick={() => {
                        const exists = mm23FastVideoConfig.supportedGenerationTypes.includes(t)
                        setMm23FastVideoConfig({ ...mm23FastVideoConfig, supportedGenerationTypes: exists ? mm23FastVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...mm23FastVideoConfig.supportedGenerationTypes, t] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23FastVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="flex gap-2 flex-wrap">
                    {[6, 10].map(d => (
                      <button key={d} type="button" onClick={() => {
                        const exists = mm23FastVideoConfig.supportedDurations.includes(d)
                        setMm23FastVideoConfig({ ...mm23FastVideoConfig, supportedDurations: exists ? mm23FastVideoConfig.supportedDurations.filter(x => x !== d) : [...mm23FastVideoConfig.supportedDurations, d] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm23FastVideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={mm23FastIsActive} onChange={e => setMm23FastIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: mm23FastName, provider: 'minimaxi', modelId: MINIMAX_HAILUO_23_FAST_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: mm23FastApiKey, apiUrl: mm23FastApiUrl, isActive: mm23FastIsActive, pricePerUse: mm23FastPrice ? parseFloat(mm23FastPrice) : undefined, config: { ...mm23FastVideoConfig, acceptedInputs: mm23FastAccepted } }
                    const existing = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_23_FAST_ID)
                    const targetId = mm23FastId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setMm23FastId(saved?.id || targetId)
                      toast.success('已保存 MiniMax Hailuo 2.3 Fast 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setMm23FastId(saved?.id || null)
                        toast.success('已创建 MiniMax Hailuo 2.3 Fast 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_23_FAST_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setMm23FastId(saved2?.id || dup.id)
                          toast.success('已保存 MiniMax Hailuo 2.3 Fast 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'minimaxi_hailuo_02' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">MiniMax Hailuo 02</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={mm02Name} onChange={e => setMm02Name(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={MINIMAX_HAILUO_02_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(mm02Accepted, t, setMm02Accepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${mm02Accepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['16:9', '9:16', '1:1'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm02VideoConfig.supportedRatios.includes(r)
                        setMm02VideoConfig({ ...mm02VideoConfig, supportedRatios: exists ? mm02VideoConfig.supportedRatios.filter(x => x !== r) : [...mm02VideoConfig.supportedRatios, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm02VideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">分辨率（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['768P', '1080P'].map(r => (
                      <button key={r} type="button" onClick={() => {
                        const exists = mm02VideoConfig.supportedResolutions.includes(r)
                        setMm02VideoConfig({ ...mm02VideoConfig, supportedResolutions: exists ? mm02VideoConfig.supportedResolutions.filter(x => x !== r) : [...mm02VideoConfig.supportedResolutions, r] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm02VideoConfig.supportedResolutions.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['文生视频', '参考图', '主体参考', '首帧', '尾帧', '首尾帧'].map(t => (
                      <button key={t} type="button" onClick={() => {
                        const exists = mm02VideoConfig.supportedGenerationTypes.includes(t)
                        setMm02VideoConfig({ ...mm02VideoConfig, supportedGenerationTypes: exists ? mm02VideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...mm02VideoConfig.supportedGenerationTypes, t] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm02VideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="flex gap-2 flex-wrap">
                    {[6, 8, 10].map(d => (
                      <button key={d} type="button" onClick={() => {
                        const exists = mm02VideoConfig.supportedDurations.includes(d)
                        setMm02VideoConfig({ ...mm02VideoConfig, supportedDurations: exists ? mm02VideoConfig.supportedDurations.filter(x => x !== d) : [...mm02VideoConfig.supportedDurations, d] })
                      }} className={`px-3 py-1.5 rounded border-2 text-sm ${mm02VideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={mm02IsActive} onChange={e => setMm02IsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: mm02Name, provider: 'minimaxi', modelId: MINIMAX_HAILUO_02_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: mm02ApiKey, apiUrl: mm02ApiUrl, isActive: mm02IsActive, pricePerUse: mm02Price ? parseFloat(mm02Price) : undefined, config: { ...mm02VideoConfig, acceptedInputs: mm02Accepted } }
                    const existing = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_02_ID)
                    const targetId = mm02Id || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setMm02Id(saved?.id || targetId)
                      toast.success('已保存 MiniMax Hailuo 02 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setMm02Id(saved?.id || null)
                        toast.success('已创建 MiniMax Hailuo 02 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_HAILUO_02_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setMm02Id(saved2?.id || dup.id)
                          toast.success('已保存 MiniMax Hailuo 02 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'minimaxi_speech_26_hd' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">MiniMax Speech 2.6 HD</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">AUDIO_SYNTHESIS</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={mmSpeechName} onChange={e => setMmSpeechName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={MINIMAX_SPEECH_26_HD_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'AUDIO'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(mmSpeechAccepted, t, setMmSpeechAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${mmSpeechAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的输出格式（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['mp3', 'wav'].map(fmt => (
                      <button key={fmt} type="button" onClick={() => setMmSpeechConfig({ ...mmSpeechConfig, supportedFormats: mmSpeechConfig.supportedFormats.includes(fmt) ? mmSpeechConfig.supportedFormats.filter(x => x !== fmt) : [...mmSpeechConfig.supportedFormats, fmt] })} className={`px-3 py-1.5 rounded border-2 text-sm ${mmSpeechConfig.supportedFormats.includes(fmt) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{fmt.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最小采样率</label>
                    <input type="number" min={8000} value={mmSpeechConfig.sampleRateMin} onChange={e => setMmSpeechConfig({ ...mmSpeechConfig, sampleRateMin: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                    <input type="checkbox" checked={mmSpeechConfig.supportsStereo} onChange={e => setMmSpeechConfig({ ...mmSpeechConfig, supportsStereo: e.target.checked })} className="w-5 h-5" />
                    <div className="flex-1">
                      <div className="text-sm text-slate-900 dark:text-white">支持立体声</div>
                      <div className="text-xs text-slate-500 dark:text-gray-500">输出双声道（channel=2），默认兼容</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">模型能力（音频）</div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 text-slate-900 dark:text-white text-sm">
                    <input type="checkbox" checked={mmSpeechAbilities.synth} onChange={e => setMmSpeechAbilities({ ...mmSpeechAbilities, synth: e.target.checked })} /> 语音合成
                  </label>
                  <label className="flex items-center gap-2 text-slate-900 dark:text-white text-sm">
                    <input type="checkbox" checked={mmSpeechAbilities.clone} onChange={e => setMmSpeechAbilities({ ...mmSpeechAbilities, clone: e.target.checked })} /> 音色克隆
                  </label>
                  <label className="flex items-center gap-2 text-slate-900 dark:text-white text-sm">
                    <input type="checkbox" checked={mmSpeechAbilities.design} onChange={e => setMmSpeechAbilities({ ...mmSpeechAbilities, design: e.target.checked })} /> 音色设计
                  </label>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={mmSpeechIsActive} onChange={e => setMmSpeechIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: mmSpeechName, provider: 'minimaxi', modelId: MINIMAX_SPEECH_26_HD_ID, type: 'AUDIO_SYNTHESIS' as ModelType, apiKey: mmSpeechApiKey, apiUrl: mmSpeechApiUrl, isActive: mmSpeechIsActive, pricePerUse: mmSpeechPrice ? parseFloat(mmSpeechPrice) : undefined, config: { ...mmSpeechConfig, acceptedInputs: mmSpeechAccepted } }
                    const existing = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_SPEECH_26_HD_ID)
                    const targetId = mmSpeechId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setMmSpeechId(saved?.id || targetId)
                      toast.success('已保存 MiniMax Speech 2.6 HD 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setMmSpeechId(saved?.id || null)
                        toast.success('已创建 MiniMax Speech 2.6 HD 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_SPEECH_26_HD_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setMmSpeechId(saved2?.id || dup.id)
                          toast.success('已保存 MiniMax Speech 2.6 HD 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    const finalId = mmSpeechId || existing?.id
                    const capsPayload = [
                      { capability: '语音合成', supported: !!mmSpeechAbilities.synth },
                      { capability: '音色克隆', supported: !!mmSpeechAbilities.clone },
                      { capability: '音色设计', supported: !!mmSpeechAbilities.design },
                    ]
                    const idForCaps = finalId || (existingModels.find(m => m.provider === 'minimaxi' && m.modelId === MINIMAX_SPEECH_26_HD_ID)?.id) || mmSpeechId
                    if (idForCaps) {
                      await apiClient.admin.upsertAIModelCapabilities({ aiModelId: idForCaps, capabilities: capsPayload })
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'sora_image' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sora2 Image</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">IMAGE_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={soraImageName} onChange={e => setSoraImageName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={SORA_IMAGE_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(soraImageAccepted, t, setSoraImageAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${soraImageAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.value} type="button" onClick={() => setSoraImageConfig({ ...soraImageConfig, supportedRatios: soraImageConfig.supportedRatios.includes(r.value) ? soraImageConfig.supportedRatios.filter(x => x !== r.value) : [...soraImageConfig.supportedRatios, r.value] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${soraImageConfig.supportedRatios.includes(r.value) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={soraImageConfig.supportsImageToImage} onChange={e => setSoraImageConfig({ ...soraImageConfig, supportsImageToImage: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生图</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行生成</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={soraImageConfig.maxReferenceImages} onChange={e => setSoraImageConfig({ ...soraImageConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={soraImageIsActive} onChange={e => setSoraImageIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: soraImageName, provider: 'sora', modelId: SORA_IMAGE_ID, type: 'IMAGE_GENERATION' as ModelType, apiKey: soraImageApiKey, apiUrl: soraImageApiUrl, isActive: soraImageIsActive, pricePerUse: soraImagePrice ? parseFloat(soraImagePrice) : undefined, config: { ...soraImageConfig, acceptedInputs: soraImageAccepted } }
                    const existing = existingModels.find(m => m.provider === 'sora' && m.modelId === SORA_IMAGE_ID)
                    const targetId = soraImageId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setSoraImageId(saved?.id || targetId)
                      toast.success('已保存 Sora2 Image 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setSoraImageId(saved?.id || null)
                        toast.success('已创建 Sora2 Image 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'sora' && m.modelId === SORA_IMAGE_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setSoraImageId(saved2?.id || dup.id)
                          toast.success('已保存 Sora2 Image 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'sora_video' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sora2 Video</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={soraVideoName} onChange={e => setSoraVideoName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={SORA_VIDEO_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE', 'VIDEO'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(soraVideoAccepted, t, setSoraVideoAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${soraVideoAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['landscape', 'portrait'].map(r => (
                      <button key={r} type="button" onClick={() => setSoraVideoConfig({ ...soraVideoConfig, supportedRatios: soraVideoConfig.supportedRatios.includes(r) ? soraVideoConfig.supportedRatios.filter(x => x !== r) : [...soraVideoConfig.supportedRatios, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${soraVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r === 'landscape' ? '横屏 (landscape)' : '竖屏 (portrait)'}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={soraVideoConfig.supportsImageToVideo} onChange={e => setSoraVideoConfig({ ...soraVideoConfig, supportsImageToVideo: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持图生视频</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">允许提供参考图进行生成</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={soraVideoConfig.maxReferenceImages} onChange={e => setSoraVideoConfig({ ...soraVideoConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['文生视频', '图生视频', '视频生视频'].map(t => (
                      <button key={t} type="button" onClick={() => setSoraVideoConfig({ ...soraVideoConfig, supportedGenerationTypes: soraVideoConfig.supportedGenerationTypes.includes(t) ? soraVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...soraVideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${soraVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10, 15, 25].map(d => (
                      <button key={d} type="button" onClick={() => setSoraVideoConfig({ ...soraVideoConfig, supportedDurations: (soraVideoConfig.supportedDurations || []).includes(d) ? (soraVideoConfig.supportedDurations || []).filter(x => x !== d) : [...(soraVideoConfig.supportedDurations || []), d] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${(soraVideoConfig.supportedDurations || []).includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}秒</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={soraVideoIsActive} onChange={e => setSoraVideoIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: soraVideoName, provider: 'sora', modelId: SORA_VIDEO_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: soraVideoApiKey, apiUrl: soraVideoApiUrl, isActive: soraVideoIsActive, pricePerUse: soraVideoPrice ? parseFloat(soraVideoPrice) : undefined, config: { ...soraVideoConfig, acceptedInputs: soraVideoAccepted } }
                    const existing = existingModels.find(m => m.provider === 'sora' && m.modelId === SORA_VIDEO_ID)
                    const targetId = soraVideoId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setSoraVideoId(saved?.id || targetId)
                      toast.success('已保存 Sora2 Video 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setSoraVideoId(saved?.id || null)
                        toast.success('已创建 Sora2 Video 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'sora' && m.modelId === SORA_VIDEO_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setSoraVideoId(saved2?.id || dup.id)
                          toast.success('已保存 Sora2 Video 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'vidu_q2_pro' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Vidu Q2 Pro</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={viduQ2ProName} onChange={e => setViduQ2ProName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={VIDU_Q2_PRO_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(viduQ2ProAccepted, t, setViduQ2ProAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${viduQ2ProAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['16:9', '9:16', '1:1', '4:3', '3:4'].map(r => (
                      <button key={r} type="button" onClick={() => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, supportedRatios: viduQ2ProVideoConfig.supportedRatios.includes(r) ? viduQ2ProVideoConfig.supportedRatios.filter(x => x !== r) : [...viduQ2ProVideoConfig.supportedRatios, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2ProVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的分辨率（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['540p', '720p', '1080p'].map(res => (
                      <button key={res} type="button" onClick={() => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, supportedResolutions: viduQ2ProVideoConfig.supportedResolutions.includes(res) ? viduQ2ProVideoConfig.supportedResolutions.filter(x => x !== res) : [...viduQ2ProVideoConfig.supportedResolutions, res] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2ProVideoConfig.supportedResolutions.includes(res) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{res}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={viduQ2ProVideoConfig.supportsSubjects} onChange={e => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, supportsSubjects: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持主体参考 (Subjects)</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">支持从角色库选择角色组</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={viduQ2ProVideoConfig.maxReferenceImages} onChange={e => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'].map(t => (
                      <button key={t} type="button" onClick={() => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, supportedGenerationTypes: viduQ2ProVideoConfig.supportedGenerationTypes.includes(t) ? viduQ2ProVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...viduQ2ProVideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2ProVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
                      <button key={d} type="button" onClick={() => setViduQ2ProVideoConfig({ ...viduQ2ProVideoConfig, supportedDurations: viduQ2ProVideoConfig.supportedDurations.includes(d) ? viduQ2ProVideoConfig.supportedDurations.filter(x => x !== d) : [...viduQ2ProVideoConfig.supportedDurations, d].sort((a, b) => a - b) })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2ProVideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={viduQ2ProIsActive} onChange={e => setViduQ2ProIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: viduQ2ProName, provider: 'vidu', modelId: VIDU_Q2_PRO_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: viduQ2ProApiKey, apiUrl: viduQ2ProApiUrl, isActive: viduQ2ProIsActive, pricePerUse: viduQ2ProPrice ? parseFloat(viduQ2ProPrice) : undefined, config: { ...viduQ2ProVideoConfig, acceptedInputs: viduQ2ProAccepted } }
                    const existing = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_PRO_ID)
                    const targetId = viduQ2ProId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setViduQ2ProId(saved?.id || targetId)
                      toast.success('已保存 Vidu Q2 Pro 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setViduQ2ProId(saved?.id || null)
                        toast.success('已创建 Vidu Q2 Pro 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_PRO_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setViduQ2ProId(saved2?.id || dup.id)
                          toast.success('已保存 Vidu Q2 Pro 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'vidu_q2_turbo' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Vidu Q2 Turbo</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={viduQ2TurboName} onChange={e => setViduQ2TurboName(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={VIDU_Q2_TURBO_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['TEXT', 'IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(viduQ2TurboAccepted, t, setViduQ2TurboAccepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${viduQ2TurboAccepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的比例（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['16:9', '9:16', '1:1', '4:3', '3:4'].map(r => (
                      <button key={r} type="button" onClick={() => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, supportedRatios: viduQ2TurboVideoConfig.supportedRatios.includes(r) ? viduQ2TurboVideoConfig.supportedRatios.filter(x => x !== r) : [...viduQ2TurboVideoConfig.supportedRatios, r] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2TurboVideoConfig.supportedRatios.includes(r) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的分辨率（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['540p', '720p', '1080p'].map(res => (
                      <button key={res} type="button" onClick={() => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, supportedResolutions: viduQ2TurboVideoConfig.supportedResolutions.includes(res) ? viduQ2TurboVideoConfig.supportedResolutions.filter(x => x !== res) : [...viduQ2TurboVideoConfig.supportedResolutions, res] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2TurboVideoConfig.supportedResolutions.includes(res) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{res}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-background-dark rounded-lg">
                  <input type="checkbox" checked={viduQ2TurboVideoConfig.supportsSubjects} onChange={e => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, supportsSubjects: e.target.checked })} className="w-5 h-5" />
                  <div className="flex-1">
                    <div className="text-sm text-slate-900 dark:text-white">支持主体参考 (Subjects)</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500">支持从角色库选择角色组</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">最大参考图数量</label>
                  <input type="number" min={0} max={10} value={viduQ2TurboVideoConfig.maxReferenceImages} onChange={e => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, maxReferenceImages: Number(e.target.value) })} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'].map(t => (
                      <button key={t} type="button" onClick={() => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, supportedGenerationTypes: viduQ2TurboVideoConfig.supportedGenerationTypes.includes(t) ? viduQ2TurboVideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...viduQ2TurboVideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2TurboVideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
                      <button key={d} type="button" onClick={() => setViduQ2TurboVideoConfig({ ...viduQ2TurboVideoConfig, supportedDurations: viduQ2TurboVideoConfig.supportedDurations.includes(d) ? viduQ2TurboVideoConfig.supportedDurations.filter(x => x !== d) : [...viduQ2TurboVideoConfig.supportedDurations, d].sort((a, b) => a - b) })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2TurboVideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={viduQ2TurboIsActive} onChange={e => setViduQ2TurboIsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: viduQ2TurboName, provider: 'vidu', modelId: VIDU_Q2_TURBO_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: viduQ2TurboApiKey, apiUrl: viduQ2TurboApiUrl, isActive: viduQ2TurboIsActive, pricePerUse: viduQ2TurboPrice ? parseFloat(viduQ2TurboPrice) : undefined, config: { ...viduQ2TurboVideoConfig, acceptedInputs: viduQ2TurboAccepted } }
                    const existing = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_TURBO_ID)
                    const targetId = viduQ2TurboId || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setViduQ2TurboId(saved?.id || targetId)
                      toast.success('已保存 Vidu Q2 Turbo 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setViduQ2TurboId(saved?.id || null)
                        toast.success('已创建 Vidu Q2 Turbo 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_TURBO_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setViduQ2TurboId(saved2?.id || dup.id)
                          toast.success('已保存 Vidu Q2 Turbo 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {selectedKey === 'vidu_q2' && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Vidu Q2（参考图生视频）</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300">VIDEO_GENERATION</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型名称 *</label>
                  <input value={viduQ2Name} onChange={e => setViduQ2Name(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">模型ID（只读）</label>
                  <input value={VIDU_Q2_ID} disabled readOnly className="w-full px-4 py-2 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white font-mono text-sm" />
                </div>
                </div>
              <div className="mt-6">
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">可接受的输入</div>
                <div className="flex gap-2 flex-wrap">
                  {['IMAGE'].map(t => (
                    <button key={t} type="button" onClick={() => toggleList(viduQ2Accepted, t, setViduQ2Accepted)} className={`px-3 py-1.5 rounded border-2 text-sm ${viduQ2Accepted.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的视频宽高比（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['16:9', '9:16', '1:1', '4:3', '3:4'].map(t => (
                      <button key={t} type="button" onClick={() => setViduQ2VideoConfig({ ...viduQ2VideoConfig, supportedRatios: viduQ2VideoConfig.supportedRatios.includes(t) ? viduQ2VideoConfig.supportedRatios.filter(x => x !== t) : [...viduQ2VideoConfig.supportedRatios, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2VideoConfig.supportedRatios.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">支持的分辨率（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['540p', '720p', '1080p'].map(t => (
                      <button key={t} type="button" onClick={() => setViduQ2VideoConfig({ ...viduQ2VideoConfig, supportedResolutions: viduQ2VideoConfig.supportedResolutions.includes(t) ? viduQ2VideoConfig.supportedResolutions.filter(x => x !== t) : [...viduQ2VideoConfig.supportedResolutions, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2VideoConfig.supportedResolutions.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">生成类型（多选）</label>
                  <div className="flex gap-2 flex-wrap">
                    {['参考图生视频'].map(t => (
                      <button key={t} type="button" onClick={() => setViduQ2VideoConfig({ ...viduQ2VideoConfig, supportedGenerationTypes: viduQ2VideoConfig.supportedGenerationTypes.includes(t) ? viduQ2VideoConfig.supportedGenerationTypes.filter(x => x !== t) : [...viduQ2VideoConfig.supportedGenerationTypes, t] })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2VideoConfig.supportedGenerationTypes.includes(t) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">视频时长（多选，秒）</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
                      <button key={d} type="button" onClick={() => setViduQ2VideoConfig({ ...viduQ2VideoConfig, supportedDurations: viduQ2VideoConfig.supportedDurations.includes(d) ? viduQ2VideoConfig.supportedDurations.filter(x => x !== d) : [...viduQ2VideoConfig.supportedDurations, d].sort((a, b) => a - b) })} className={`px-3 py-2 rounded-lg border-2 text-sm ${viduQ2VideoConfig.supportedDurations.includes(d) ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold' : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:border-slate-400 dark:hover:border-gray-600'}`}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={viduQ2IsActive} onChange={e => setViduQ2IsActive(e.target.checked)} className="w-5 h-5" />
                  <span className="text-sm text-slate-900 dark:text-white">启用此模型</span>
                </div>
                <button onClick={async () => {
                  try {
                    const payload = { name: viduQ2Name, provider: 'vidu', modelId: VIDU_Q2_ID, type: 'VIDEO_GENERATION' as ModelType, apiKey: viduQ2ApiKey, apiUrl: viduQ2ApiUrl, isActive: viduQ2IsActive, pricePerUse: viduQ2Price ? parseFloat(viduQ2Price) : undefined, config: { ...viduQ2VideoConfig, acceptedInputs: viduQ2Accepted } }
                    const existing = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_ID)
                    const targetId = viduQ2Id || existing?.id
                    if (targetId) {
                      const resp = await apiClient.admin.updateAIModel(targetId, payload)
                      const saved = resp?.data || resp
                      setViduQ2Id(saved?.id || targetId)
                      toast.success('已保存 Vidu Q2 配置')
                    } else {
                      try {
                        const resp = await apiClient.admin.createAIModel(payload)
                        const saved = resp?.data || resp
                        setViduQ2Id(saved?.id || null)
                        toast.success('已创建 Vidu Q2 配置')
                      } catch (e) {
                        const dup = existingModels.find(m => m.provider === 'vidu' && m.modelId === VIDU_Q2_ID)
                        if (dup) {
                          const resp2 = await apiClient.admin.updateAIModel(dup.id, payload)
                          const saved2 = resp2?.data || resp2
                          setViduQ2Id(saved2?.id || dup.id)
                          toast.success('已保存 Vidu Q2 配置')
                        } else {
                          throw e
                        }
                      }
                    }
                    await refreshModels()
                  } catch (e: any) {
                    toast.error(e?.response?.data?.message || '保存失败')
                  }
                }} className="px-6 py-2 bg-primary text-white rounded-lg">保存配置</button>
              </div>
            </div>
          )}

          {loading && (<div className="text-gray-400">加载中...</div>)}
        </div>
      </div>
    </div>
  )
}

export default ModelConfigPage