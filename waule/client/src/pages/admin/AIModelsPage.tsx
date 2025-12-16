import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

  interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  type: 'TEXT_GENERATION' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | 'VIDEO_EDITING' | 'AUDIO_SYNTHESIS';
  config: any;
  apiKey?: string;
  apiUrl?: string;
  isActive: boolean;
  pricePerUse?: string;
  createdAt: string;
  updatedAt: string;
}

// 图片比例选项 - Gemini 2.5 Flash Image 支持的 10 种宽高比
const ASPECT_RATIOS = [
  { value: '21:9', label: '21:9 (超宽屏)', width: 2560, height: 1097 },
  { value: '16:9', label: '16:9 (宽屏)', width: 1920, height: 1080 },
  { value: '4:3', label: '4:3 (标准横屏)', width: 1024, height: 768 },
  { value: '3:2', label: '3:2 (横屏)', width: 1024, height: 683 },
  { value: '5:4', label: '5:4 (接近正方形)', width: 1120, height: 896 },
  { value: '1:1', label: '1:1 (正方形)', width: 1024, height: 1024 },
  { value: '4:5', label: '4:5 (接近正方竖屏)', width: 896, height: 1120 },
  { value: '2:3', label: '2:3 (竖屏)', width: 683, height: 1024 },
  { value: '3:4', label: '3:4 (标准竖屏)', width: 768, height: 1024 },
  { value: '9:16', label: '9:16 (竖屏)', width: 1080, height: 1920 },
];

// 视频比例选项
const VIDEO_ASPECT_RATIOS = [
  { value: '21:9', label: '21:9 (超宽屏)' },
  { value: '16:9', label: '16:9 (标准)' },
  { value: '4:3', label: '4:3 (传统)' },
  { value: '1:1', label: '1:1 (方形)' },
  { value: '3:4', label: '3:4 (竖屏)' },
  { value: '9:16', label: '9:16 (手机竖屏)' },
];

// 视频分辨率选项
const VIDEO_RESOLUTIONS = [
  { value: '720P', label: '720P (1280x720)' },
  { value: '1080P', label: '1080P (1920x1080)' },
  { value: '2K', label: '2K (2560x1440)' },
  { value: '4K', label: '4K (3840x2160)' },
];

// 视频生成类型选项
const VIDEO_GENERATION_TYPES = [
  { value: '首帧', label: '首帧生成' },
  { value: '尾帧', label: '尾帧生成' },
  { value: '首尾帧', label: '首尾帧生成' },
  { value: '参考图', label: '参考图生成' },
  { value: '主体参考', label: '主体参考生成' },
  { value: '文生视频', label: '文生视频' },
];

// 视频时长选项 (2-30秒)
const VIDEO_DURATIONS = Array.from({ length: 29 }, (_, i) => i + 2);

const AIModelsPage = () => {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [presetOptions, setPresetOptions] = useState<any[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<any | null>(null);
  const [showApiKey, setShowApiKey] = useState<{ [key: string]: boolean }>({});
  
  // 基础表单数据
  const [formData, setFormData] = useState({
    name: '',
    provider: '',
    modelId: '',
    type: 'IMAGE_GENERATION' as 'TEXT_GENERATION' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | 'VIDEO_EDITING' | 'AUDIO_SYNTHESIS',
    apiKey: '',
    apiUrl: '',
    isActive: true,
    pricePerUse: '',
  });
  const [audioAbilities, setAudioAbilities] = useState<{ synth: boolean; clone: boolean; design: boolean }>({ synth: true, clone: true, design: true });

  // 可接受的输入类型（通用配置）
  const [acceptedInputs, setAcceptedInputs] = useState<string[]>(['TEXT', 'IMAGE']);

  // 文本模型配置
  const [textConfig, setTextConfig] = useState({
    maxTokens: 4000,
    temperature: 0.7,
    topP: 1,
    topK: 40,
    frequencyPenalty: 0,
    presencePenalty: 0,
  });

  // 图片模型配置（简化）
  const [imageConfig, setImageConfig] = useState({
    supportedRatios: ['21:9', '16:9', '4:3', '3:2', '5:4', '1:1', '4:5', '2:3', '3:4', '9:16'] as string[], // 支持的比例（多选）
    supportsImageToImage: true, // 是否支持图生图
    maxReferenceImages: 1, // 最大参考图数量
  });

  // 视频模型配置
  const [videoConfig, setVideoConfig] = useState({
    supportedRatios: ['16:9'] as string[], // 支持的视频比例（多选）
    supportedResolutions: ['1080P'] as string[], // 支持的视频分辨率（多选）
    supportedGenerationTypes: ['文生视频'] as string[], // 支持生成类型（多选）
    supportsVideoEditing: false, // 是否支持视频编辑
    supportedDurations: [5, 10] as number[], // 支持的视频时长（多选，秒）
  });

  const [videoEditingConfig, setVideoEditingConfig] = useState({
    videoLengthMinSec: 2,
    videoLengthMaxSec: 300,
    videoSizeMaxMB: 500,
    videoResolutionMinPx: 360,
    videoResolutionMaxPx: 3840,
    videoAspectRatioVerticalX: 9,
    videoAspectRatioVerticalY: 16,
    videoAspectRatioHorizontalX: 16,
    videoAspectRatioHorizontalY: 9,
    imageSizeMaxMB: 20,
    imagePixelMinPx: 256,
    imagePixelMaxPx: 4096,
    imageAspectRatioVerticalX: 3,
    imageAspectRatioVerticalY: 4,
    imageAspectRatioHorizontalX: 4,
    imageAspectRatioHorizontalY: 3,
    audioSizeMaxMB: 50,
    audioLengthMinSec: 1,
    audioLengthMaxSec: 300,
    supportedEditingCapabilities: ['视频换人'] as string[],
  });

  // 语音合成模型配置（CosyVoice）
  const [audioConfig, setAudioConfig] = useState({
    sampleRateMin: 16000,
    supportsStereo: true,
    inputDurationMinSec: 10,
    inputDurationMaxSec: 20,
    inputSizeMaxMB: 10,
    supportedFormats: ['wav','mp3','m4a'] as string[],
  });

  useEffect(() => {
    loadModels();
    loadPresets();
  }, [filterType, providerFilter]);

  useEffect(() => {
    if (formData.type === 'VIDEO_EDITING') {
      const set = new Set(acceptedInputs);
      set.add('VIDEO');
      setAcceptedInputs(Array.from(set));
    }
    if (formData.type === 'AUDIO_SYNTHESIS') {
      const set = new Set(acceptedInputs);
      set.add('AUDIO');
      set.add('TEXT');
      setAcceptedInputs(Array.from(set));
    }
  }, [formData.type]);

  // 语音合成：不再自动同步目标模型，避免与手动输入重复
  useEffect(() => {
    if (formData.type !== 'AUDIO_SYNTHESIS') {
      return;
    }
  }, [formData.type, formData.modelId]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filterType) params.type = filterType;
      if (providerFilter) params.provider = providerFilter;
      const response = await apiClient.admin.getAIModels(params);
      setModels(response.data);
    } catch (error: any) {
      toast.error('加载模型列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async () => {
    try {
      const params: any = {};
      if (filterType) params.type = filterType;
      if (providerFilter) params.provider = providerFilter;
      const res = await apiClient.get('/admin/ai-models/presets', { params });
      setPresetOptions(res.data?.data || []);
    } catch (error) {
      // 预设加载失败不影响现有功能
    }
  };

  const imageRatioChoices = (() => {
    const vals: string[] | undefined = selectedPreset?.config?.supportedRatios;
    if (vals && Array.isArray(vals) && vals.length > 0) {
      return ASPECT_RATIOS.filter((r) => vals.includes(r.value));
    }
    return ASPECT_RATIOS;
  })();

  const videoRatioChoices = (() => {
    const vals: string[] | undefined = selectedPreset?.config?.supportedRatios;
    if (vals && Array.isArray(vals) && vals.length > 0) {
      return VIDEO_ASPECT_RATIOS.filter((r) => vals.includes(r.value));
    }
    return VIDEO_ASPECT_RATIOS;
  })();

  const videoResolutionChoices = (() => {
    const vals: string[] | undefined = selectedPreset?.config?.supportedResolutions;
    if (vals && Array.isArray(vals) && vals.length > 0) {
      return VIDEO_RESOLUTIONS.filter((r) => vals.includes(r.value));
    }
    return VIDEO_RESOLUTIONS;
  })();

  const videoGenerationTypeChoices = (() => {
    const vals: string[] | undefined = selectedPreset?.config?.supportedGenerationTypes;
    if (vals && Array.isArray(vals) && vals.length > 0) {
      return VIDEO_GENERATION_TYPES.filter((r) => vals.includes(r.value));
    }
    return VIDEO_GENERATION_TYPES;
  })();

  const videoDurationChoices = (() => {
    const vals: number[] | undefined = selectedPreset?.config?.supportedDurations;
    if (vals && Array.isArray(vals) && vals.length > 0) {
      return vals;
    }
    return VIDEO_DURATIONS;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // 根据类型构建配置对象
      let config: any = {};
      switch (formData.type) {
        case 'TEXT_GENERATION':
          config = { ...textConfig };
          break;
        case 'IMAGE_GENERATION':
          config = { ...imageConfig };
          break;
        case 'VIDEO_GENERATION':
          config = { ...videoConfig };
          break;
        case 'VIDEO_EDITING':
          config = { ...videoEditingConfig };
          break;
        case 'AUDIO_SYNTHESIS':
          config = { ...audioConfig };
          break;
      }

      // 添加可接受的输入类型（所有模型类型都需要）
      config.acceptedInputs = acceptedInputs;
      if (formData.type === 'AUDIO_SYNTHESIS') {
        const capsPayload = [
          { capability: '语音合成', supported: !!audioAbilities.synth },
          { capability: '音色克隆', supported: !!audioAbilities.clone },
          { capability: '音色设计', supported: !!audioAbilities.design },
        ];
        const dataForModel = {
          ...formData,
          config,
          pricePerUse: formData.pricePerUse ? parseFloat(formData.pricePerUse) : undefined,
          apiKey: formData.apiKey || undefined,
          apiUrl: formData.apiUrl || undefined,
        } as any;
        try {
          let targetId = editingModel?.id;
          if (editingModel) {
            const updated = await apiClient.admin.updateAIModel(editingModel.id, dataForModel);
            targetId = updated.data?.id || editingModel.id;
            toast.success('模型更新成功');
          } else {
            const created = await apiClient.admin.createAIModel(dataForModel);
            targetId = created.data?.id || created.id;
            toast.success('模型创建成功');
          }
          if (targetId) {
            await apiClient.admin.upsertAIModelCapabilities({ aiModelId: targetId, capabilities: capsPayload });
          }
        } catch (error: any) {
          toast.error(error.response?.data?.message || '操作失败');
          return;
        }
        setShowAddModal(false);
        setEditingModel(null);
        resetForm();
        loadModels();
        return;
      }

      const data = {
        ...formData,
        config,
        pricePerUse: formData.pricePerUse ? parseFloat(formData.pricePerUse) : undefined,
        apiKey: formData.apiKey || undefined,
        apiUrl: formData.apiUrl || undefined,
      };

      if (editingModel) {
        await apiClient.admin.updateAIModel(editingModel.id, data);
        toast.success('模型更新成功');
      } else {
        await apiClient.admin.createAIModel(data);
        toast.success('模型创建成功');
      }

      setShowAddModal(false);
      setEditingModel(null);
      resetForm();
      loadModels();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      provider: model.provider,
      modelId: model.modelId,
      type: model.type,
      apiKey: model.apiKey || '',
      apiUrl: model.apiUrl || '',
      isActive: model.isActive,
      pricePerUse: model.pricePerUse || '',
    });

    // 根据类型设置配置
    const config = model.config || {};
    
    // 设置可接受的输入类型（通用配置）
    setAcceptedInputs(config.acceptedInputs || ['TEXT', 'IMAGE']);
    
    switch (model.type) {
      case 'TEXT_GENERATION':
        setTextConfig({
          maxTokens: config.maxTokens || 4000,
          temperature: config.temperature || 0.7,
          topP: config.topP || 1,
          topK: config.topK || 40,
          frequencyPenalty: config.frequencyPenalty || 0,
          presencePenalty: config.presencePenalty || 0,
        });
        break;
      case 'IMAGE_GENERATION':
        setImageConfig({
          supportedRatios: config.supportedRatios || ['1:1'],
          supportsImageToImage: config.supportsImageToImage !== false,
          maxReferenceImages: config.maxReferenceImages || 1,
        });
        break;
      case 'VIDEO_GENERATION':
        setVideoConfig({
          supportedRatios: config.supportedRatios || ['16:9'],
          supportedResolutions: config.supportedResolutions || ['1080P'],
          supportedGenerationTypes: config.supportedGenerationTypes || ['文生视频'],
          supportsVideoEditing: config.supportsVideoEditing || false,
          supportedDurations: config.supportedDurations || [5, 10],
        });
        break;
      case 'VIDEO_EDITING':
        setVideoEditingConfig({
          videoLengthMinSec: config.videoLengthMinSec ?? 2,
          videoLengthMaxSec: config.videoLengthMaxSec ?? 300,
          videoSizeMaxMB: config.videoSizeMaxMB ?? 500,
          videoResolutionMinPx: config.videoResolutionMinPx ?? 360,
          videoResolutionMaxPx: config.videoResolutionMaxPx ?? 3840,
          videoAspectRatioVerticalX: config.videoAspectRatioVerticalX ?? 9,
          videoAspectRatioVerticalY: config.videoAspectRatioVerticalY ?? 16,
          videoAspectRatioHorizontalX: config.videoAspectRatioHorizontalX ?? 16,
          videoAspectRatioHorizontalY: config.videoAspectRatioHorizontalY ?? 9,
          imageSizeMaxMB: config.imageSizeMaxMB ?? 20,
          imagePixelMinPx: config.imagePixelMinPx ?? 256,
          imagePixelMaxPx: config.imagePixelMaxPx ?? 4096,
          imageAspectRatioVerticalX: config.imageAspectRatioVerticalX ?? 3,
          imageAspectRatioVerticalY: config.imageAspectRatioVerticalY ?? 4,
          imageAspectRatioHorizontalX: config.imageAspectRatioHorizontalX ?? 4,
          imageAspectRatioHorizontalY: config.imageAspectRatioHorizontalY ?? 3,
          audioSizeMaxMB: config.audioSizeMaxMB ?? 50,
          audioLengthMinSec: config.audioLengthMinSec ?? 1,
          audioLengthMaxSec: config.audioLengthMaxSec ?? 300,
          supportedEditingCapabilities: Array.isArray(config.supportedEditingCapabilities) ? config.supportedEditingCapabilities : ['视频换人'],
        });
        break;
      case 'AUDIO_SYNTHESIS':
        setAudioConfig({
          sampleRateMin: model.config?.sampleRateMin ?? 16000,
          supportsStereo: model.config?.supportsStereo !== false,
          inputDurationMinSec: model.config?.inputDurationMinSec ?? 10,
          inputDurationMaxSec: model.config?.inputDurationMaxSec ?? 20,
          inputSizeMaxMB: model.config?.inputSizeMaxMB ?? 10,
          supportedFormats: Array.isArray(model.config?.supportedFormats) ? model.config.supportedFormats : ['wav','mp3','m4a'],
        });
        const caps = Array.isArray((model as any).capabilities) ? (model as any).capabilities : [];
        const synthCap = caps.find((c: any) => c.capability === '语音合成');
        const cloneCap = caps.find((c: any) => c.capability === '音色克隆');
        const designCap = caps.find((c: any) => c.capability === '音色设计');
        setAudioAbilities({
          synth: synthCap ? !!synthCap.supported : true,
          clone: cloneCap ? !!cloneCap.supported : true,
          design: designCap ? !!designCap.supported : true,
        });
        break;
    }

    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个模型配置吗？')) return;

    try {
      await apiClient.admin.deleteAIModel(id);
      toast.success('模型删除成功');
      loadModels();
    } catch (error: any) {
      toast.error('删除失败');
    }
  };

  const handleToggleActive = async (model: AIModel) => {
    try {
      await apiClient.admin.updateAIModel(model.id, {
        isActive: !model.isActive,
      });
      toast.success(model.isActive ? '模型已禁用' : '模型已启用');
      loadModels();
    } catch (error: any) {
      toast.error('操作失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider: '',
      modelId: '',
      type: 'IMAGE_GENERATION',
      apiKey: '',
      apiUrl: '',
      isActive: true,
      pricePerUse: '',
    });
    setAcceptedInputs(['TEXT', 'IMAGE']);
    setTextConfig({
      maxTokens: 4000,
      temperature: 0.7,
      topP: 1,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
    setImageConfig({
      supportedRatios: ['21:9', '16:9', '4:3', '3:2', '5:4', '1:1', '4:5', '2:3', '3:4', '9:16'],
      supportsImageToImage: true,
      maxReferenceImages: 1,
    });
    setVideoConfig({
      supportedRatios: ['16:9'],
      supportedResolutions: ['1080P'],
      supportedGenerationTypes: ['文生视频'],
      supportsVideoEditing: false,
      supportedDurations: [5, 10],
    });
    setVideoEditingConfig({
      videoLengthMinSec: 2,
      videoLengthMaxSec: 300,
      videoSizeMaxMB: 500,
      videoResolutionMinPx: 360,
      videoResolutionMaxPx: 3840,
      videoAspectRatioVerticalX: 9,
      videoAspectRatioVerticalY: 16,
      videoAspectRatioHorizontalX: 16,
      videoAspectRatioHorizontalY: 9,
      imageSizeMaxMB: 20,
      imagePixelMinPx: 256,
      imagePixelMaxPx: 4096,
      imageAspectRatioVerticalX: 3,
      imageAspectRatioVerticalY: 4,
      imageAspectRatioHorizontalX: 4,
      imageAspectRatioHorizontalY: 3,
      audioSizeMaxMB: 50,
      audioLengthMinSec: 1,
      audioLengthMaxSec: 300,
      supportedEditingCapabilities: ['视频换人'],
    });
    setAudioConfig({
      sampleRateMin: 16000,
      supportsStereo: true,
      inputDurationMinSec: 10,
      inputDurationMaxSec: 20,
      inputSizeMaxMB: 10,
      supportedFormats: ['wav','mp3','m4a'],
    });
    setAudioAbilities({ synth: true, clone: true, design: true });
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      TEXT_GENERATION: '文本生成',
      IMAGE_GENERATION: '图片生成',
      VIDEO_GENERATION: '视频生成',
      VIDEO_EDITING: '视频编辑',
      AUDIO_SYNTHESIS: '语音合成',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      TEXT_GENERATION: 'bg-blue-500/20 text-blue-400',
      IMAGE_GENERATION: 'bg-purple-500/20 text-purple-400',
      VIDEO_GENERATION: 'bg-green-500/20 text-green-400',
      VIDEO_EDITING: 'bg-emerald-500/20 text-emerald-400',
      AUDIO_SYNTHESIS: 'bg-pink-500/20 text-pink-400',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  const getConfigSummary = (model: AIModel) => {
    const config = model.config;
    switch (model.type) {
      case 'TEXT_GENERATION':
        return `Token: ${config.maxTokens || 'N/A'} | 温度: ${config.temperature || 'N/A'}`;
      case 'IMAGE_GENERATION':
        return `比例: ${config.supportedRatios?.length || 0}种 | 图生图: ${config.supportsImageToImage ? '✓' : '✗'} | 参考图: ${config.maxReferenceImages || 0}张`;
      case 'VIDEO_GENERATION':
        return `时长: ≤${config.maxDuration}s | 帧率: ${config.supportedFps?.join('/')}fps`;
      case 'VIDEO_EDITING':
        return `视频: ${config.videoLengthMinSec}-${config.videoLengthMaxSec}s ≤${config.videoSizeMaxMB}MB | 分辨率: ${config.videoResolutionMinPx}-${config.videoResolutionMaxPx}px | 能力: ${(config.supportedEditingCapabilities || []).length}项`;
      case 'AUDIO_SYNTHESIS':
        return `输入: ${config.inputDurationMinSec}-${config.inputDurationMaxSec}s ≤${config.inputSizeMaxMB}MB | 采样率≥${config.sampleRateMin}`;
      default:
        return '';
    }
  };

  const toggleRatio = (ratio: string) => {
    setImageConfig((prev) => ({
      ...prev,
      supportedRatios: prev.supportedRatios.includes(ratio)
        ? prev.supportedRatios.filter(r => r !== ratio)
        : [...prev.supportedRatios, ratio],
    }));
  };

  // 视频比例切换
  const toggleVideoRatio = (ratio: string) => {
    setVideoConfig((prev) => ({
      ...prev,
      supportedRatios: prev.supportedRatios.includes(ratio)
        ? prev.supportedRatios.filter(r => r !== ratio)
        : [...prev.supportedRatios, ratio],
    }));
  };

  // 视频分辨率切换
  const toggleVideoResolution = (resolution: string) => {
    setVideoConfig((prev) => ({
      ...prev,
      supportedResolutions: prev.supportedResolutions.includes(resolution)
        ? prev.supportedResolutions.filter(r => r !== resolution)
        : [...prev.supportedResolutions, resolution],
    }));
  };

  // 视频生成类型切换
  const toggleGenerationType = (type: string) => {
    setVideoConfig((prev) => ({
      ...prev,
      supportedGenerationTypes: prev.supportedGenerationTypes.includes(type)
        ? prev.supportedGenerationTypes.filter(t => t !== type)
        : [...prev.supportedGenerationTypes, type],
    }));
  };

  // 视频时长切换
  const toggleVideoDuration = (duration: number) => {
    setVideoConfig((prev) => ({
      ...prev,
      supportedDurations: prev.supportedDurations.includes(duration)
        ? prev.supportedDurations.filter(d => d !== duration)
        : [...prev.supportedDurations, duration],
    }));
  };

  const toggleEditingCapability = (cap: string) => {
    setVideoEditingConfig((prev) => ({
      ...prev,
      supportedEditingCapabilities: prev.supportedEditingCapabilities.includes(cap)
        ? prev.supportedEditingCapabilities.filter(c => c !== cap)
        : [...prev.supportedEditingCapabilities, cap],
    }));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">AI模型配置</h1>
          <p className="text-gray-400">管理和配置AI服务提供商</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingModel(null);
            setShowAddModal(true);
          }}
          className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined">add</span>
          添加模型
        </button>
      </div>

      {/* 筛选 */}
      <div className="flex gap-4 mb-6">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">所有类型</option>
          <option value="TEXT_GENERATION">文本生成</option>
          <option value="IMAGE_GENERATION">图片生成</option>
          <option value="VIDEO_GENERATION">视频生成</option>
          <option value="VIDEO_EDITING">视频编辑</option>
          <option value="AUDIO_SYNTHESIS">语音合成</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">所有提供商</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google</option>
          <option value="bytedance">ByteDance (豆包)</option>
          <option value="aliyun">阿里云 (通义万相)</option>
          <option value="stability">Stability AI</option>
          <option value="runway">Runway</option>
          <option value="midjourney">Midjourney</option>
          <option value="pika">Pika</option>
          <option value="sora">Sora</option>
          <option value="minimaxi">MiniMax（海螺）</option>
          <option value="other">其他</option>
        </select>
      </div>

      {/* 模型列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            加载中...
          </div>
        ) : models.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            暂无模型配置
          </div>
        ) : (
          models.map((model) => (
            <div
              key={model.id}
              className="bg-card-dark border border-border-dark rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-1">{model.name}</h3>
                  <p className="text-sm text-gray-400">{model.provider} / {model.modelId}</p>
                </div>
                <button
                  onClick={() => handleToggleActive(model)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    model.isActive
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                  }`}
                >
                  {model.isActive ? '已启用' : '已禁用'}
                </button>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(model.type)}`}>
                    {getTypeLabel(model.type)}
                  </span>
                </div>
                
                <div className="text-xs text-gray-400 bg-background-dark rounded-lg p-3">
                  {getConfigSummary(model)}
                </div>
                
                {model.apiKey && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
                    <span className="text-gray-400">已配置API密钥</span>
                  </div>
                )}
                
                {model.apiUrl && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-blue-400 text-sm">link</span>
                    <span className="text-gray-400 truncate">自定义地址</span>
                  </div>
                )}
                
                {model.pricePerUse && (
                  <p className="text-sm text-gray-400">
                    价格: <span className="text-primary font-medium">${model.pricePerUse}</span> / 次
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(model)}
                  className="flex-1 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors text-sm font-medium"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(model.id)}
                  className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加/编辑模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card-dark border border-border-dark rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingModel ? '编辑模型' : '添加模型'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingModel(null);
                  resetForm();
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-gray-400">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 基础信息 */}
              <div className="bg-background-dark rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">info</span>
                  基础信息
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      模型名称 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="例如: 豆包 SeedDream 4.0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      提供商 *
                    </label>
                    <select
                      required
                      value={formData.provider}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                      className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">请选择</option>
                      <option value="openai">OpenAI</option>
                      <option value="google">Google</option>
                      <option value="bytedance">ByteDance (豆包)</option>
                      <option value="aliyun">阿里云 (通义万相)</option>
                      <option value="stability">Stability AI</option>
                      <option value="runway">Runway</option>
                      <option value="midjourney">Midjourney</option>
                      <option value="pika">Pika</option>
                      <option value="sora">Sora</option>
                      <option value="minimaxi">MiniMax（海螺）</option>
                      <option value="replicate">Replicate</option>
                      <option value="other">其他</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      模型ID *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.modelId}
                        onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                        className="flex-1 px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="例如: MiniMax-Hailuo-2.3"
                      />
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          const preset = presetOptions.find((p) => p.modelId === val);
                          if (preset) {
                            setSelectedPreset(preset);
                            setFormData({
                              ...formData,
                              provider: preset.provider,
                              type: preset.type,
                              modelId: preset.modelId,
                            });
                            const cfg = preset.config || {};
                            setAcceptedInputs(cfg.acceptedInputs || acceptedInputs);
                            switch (preset.type) {
                              case 'TEXT_GENERATION':
                                setTextConfig({
                                  maxTokens: cfg.maxTokens ?? textConfig.maxTokens,
                                  temperature: cfg.temperature ?? textConfig.temperature,
                                  topP: cfg.topP ?? textConfig.topP,
                                  topK: cfg.topK ?? textConfig.topK,
                                  frequencyPenalty: cfg.frequencyPenalty ?? textConfig.frequencyPenalty,
                                  presencePenalty: cfg.presencePenalty ?? textConfig.presencePenalty,
                                });
                                break;
                              case 'IMAGE_GENERATION':
                                setImageConfig({
                                  supportedRatios: cfg.supportedRatios || imageConfig.supportedRatios,
                                  supportsImageToImage: cfg.supportsImageToImage !== false,
                                  maxReferenceImages: cfg.maxReferenceImages ?? imageConfig.maxReferenceImages,
                                });
                                break;
                              case 'VIDEO_GENERATION':
                                setVideoConfig({
                                  supportedRatios: cfg.supportedRatios || videoConfig.supportedRatios,
                                  supportedResolutions: cfg.supportedResolutions || videoConfig.supportedResolutions,
                                  supportedGenerationTypes: cfg.supportedGenerationTypes || videoConfig.supportedGenerationTypes,
                                  supportsVideoEditing: cfg.supportsVideoEditing || false,
                                  supportedDurations: cfg.supportedDurations || videoConfig.supportedDurations,
                                });
                                break;
                              case 'VIDEO_EDITING':
                                setVideoEditingConfig({
                                  videoLengthMinSec: cfg.videoLengthMinSec ?? videoEditingConfig.videoLengthMinSec,
                                  videoLengthMaxSec: cfg.videoLengthMaxSec ?? videoEditingConfig.videoLengthMaxSec,
                                  videoSizeMaxMB: cfg.videoSizeMaxMB ?? videoEditingConfig.videoSizeMaxMB,
                                  videoResolutionMinPx: cfg.videoResolutionMinPx ?? videoEditingConfig.videoResolutionMinPx,
                                  videoResolutionMaxPx: cfg.videoResolutionMaxPx ?? videoEditingConfig.videoResolutionMaxPx,
                                  videoAspectRatioVerticalX: cfg.videoAspectRatioVerticalX ?? videoEditingConfig.videoAspectRatioVerticalX,
                                  videoAspectRatioVerticalY: cfg.videoAspectRatioVerticalY ?? videoEditingConfig.videoAspectRatioVerticalY,
                                  videoAspectRatioHorizontalX: cfg.videoAspectRatioHorizontalX ?? videoEditingConfig.videoAspectRatioHorizontalX,
                                  videoAspectRatioHorizontalY: cfg.videoAspectRatioHorizontalY ?? videoEditingConfig.videoAspectRatioHorizontalY,
                                  imageSizeMaxMB: cfg.imageSizeMaxMB ?? videoEditingConfig.imageSizeMaxMB,
                                  imagePixelMinPx: cfg.imagePixelMinPx ?? videoEditingConfig.imagePixelMinPx,
                                  imagePixelMaxPx: cfg.imagePixelMaxPx ?? videoEditingConfig.imagePixelMaxPx,
                                  imageAspectRatioVerticalX: cfg.imageAspectRatioVerticalX ?? videoEditingConfig.imageAspectRatioVerticalX,
                                  imageAspectRatioVerticalY: cfg.imageAspectRatioVerticalY ?? videoEditingConfig.imageAspectRatioVerticalY,
                                  imageAspectRatioHorizontalX: cfg.imageAspectRatioHorizontalX ?? videoEditingConfig.imageAspectRatioHorizontalX,
                                  imageAspectRatioHorizontalY: cfg.imageAspectRatioHorizontalY ?? videoEditingConfig.imageAspectRatioHorizontalY,
                                  audioSizeMaxMB: cfg.audioSizeMaxMB ?? videoEditingConfig.audioSizeMaxMB,
                                  audioLengthMinSec: cfg.audioLengthMinSec ?? videoEditingConfig.audioLengthMinSec,
                                  audioLengthMaxSec: cfg.audioLengthMaxSec ?? videoEditingConfig.audioLengthMaxSec,
                                  supportedEditingCapabilities: Array.isArray(cfg.supportedEditingCapabilities) ? cfg.supportedEditingCapabilities : videoEditingConfig.supportedEditingCapabilities,
                                });
                                break;
                              case 'AUDIO_SYNTHESIS':
                                setAudioConfig({
                                  sampleRateMin: cfg.sampleRateMin ?? audioConfig.sampleRateMin,
                                  supportsStereo: cfg.supportsStereo !== false,
                                  inputDurationMinSec: cfg.inputDurationMinSec ?? audioConfig.inputDurationMinSec,
                                  inputDurationMaxSec: cfg.inputDurationMaxSec ?? audioConfig.inputDurationMaxSec,
                                  inputSizeMaxMB: cfg.inputSizeMaxMB ?? audioConfig.inputSizeMaxMB,
                                  supportedFormats: Array.isArray(cfg.supportedFormats) ? cfg.supportedFormats : audioConfig.supportedFormats,
                                });
                                break;
                            }
                          }
                        }}
                        className="px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white"
                      >
                        <option value="">从预设选择</option>
                        {presetOptions
                          .filter((p) => (!formData.provider || p.provider === formData.provider) && (!formData.type || p.type === formData.type))
                          .map((p) => (
                            <option key={`${p.provider}-${p.modelId}`} value={p.modelId}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      模型类型 *
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="TEXT_GENERATION">📝 文本生成</option>
                      <option value="IMAGE_GENERATION">🎨 图片生成</option>
                      <option value="VIDEO_GENERATION">🎬 视频生成</option>
                      <option value="VIDEO_EDITING">✂️ 视频编辑</option>
                      <option value="AUDIO_SYNTHESIS">🔈 语音合成</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      价格（每次调用，美元）
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.pricePerUse}
                      onChange={(e) => setFormData({ ...formData, pricePerUse: e.target.value })}
                      className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="例如: 0.015"
                    />
                    <p className="text-xs text-gray-500 mt-1">留空表示免费或待定价格</p>
                  </div>
                </div>
              </div>

              {formData.type === 'AUDIO_SYNTHESIS' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-pink-400">library_music</span>
                    模型能力（音频）
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">控制此音频模型在工作流中开放的功能与对应节点的模型下拉列表可见性</p>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input type="checkbox" checked={audioAbilities.synth} onChange={(e)=>setAudioAbilities((s)=>({ ...s, synth: e.target.checked }))} /> 语音合成
                    </label>
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input type="checkbox" checked={audioAbilities.clone} onChange={(e)=>setAudioAbilities((s)=>({ ...s, clone: e.target.checked }))} /> 音色克隆
                    </label>
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input type="checkbox" checked={audioAbilities.design} onChange={(e)=>setAudioAbilities((s)=>({ ...s, design: e.target.checked }))} /> 音色设计
                    </label>
                  </div>
                </div>
              )}

              {/* API配置 */}
              <div className="bg-background-dark rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400">key</span>
                  API配置
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      API密钥
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey[editingModel?.id || 'new'] ? 'text' : 'password'}
                        value={formData.apiKey}
                        onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                        className="w-full px-4 py-2 pr-12 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                        placeholder="sk-your-api-key-here"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((prev) => ({
                          ...prev,
                          [editingModel?.id || 'new']: !prev[editingModel?.id || 'new'],
                        }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded transition-colors"
                      >
                        <span className="material-symbols-outlined text-gray-400 text-sm">
                          {showApiKey[editingModel?.id || 'new'] ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      留空表示使用系统全局配置的密钥
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      自定义接口地址（可选）
                    </label>
                    <input
                      type="url"
                      value={formData.apiUrl}
                      onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                      className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      留空则使用系统内置的默认地址
                    </p>
                  </div>
                </div>
              </div>

              {/* 可接受的输入类型配置 */}
              <div className="bg-background-dark rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-tiffany-400">input</span>
                  可接受的输入类型
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  选择此模型可以接受的输入素材类型，不符合的素材将无法连接到该模型节点
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { value: 'TEXT', label: '文本', icon: 'description', color: 'blue' },
                    { value: 'IMAGE', label: '图片', icon: 'image', color: 'tiffany' },
                    { value: 'VIDEO', label: '视频', icon: 'videocam', color: 'purple' },
                    { value: 'AUDIO', label: '音乐', icon: 'audio_file', color: 'pink' },
                    { value: 'DOCUMENT', label: '文档', icon: 'insert_drive_file', color: 'amber' },
                  ].map((inputType) => (
                    <button
                      key={inputType.value}
                      type="button"
                      onClick={() => {
                        if (acceptedInputs.includes(inputType.value)) {
                          setAcceptedInputs(acceptedInputs.filter(t => t !== inputType.value));
                        } else {
                          setAcceptedInputs([...acceptedInputs, inputType.value]);
                        }
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        acceptedInputs.includes(inputType.value)
                          ? `border-${inputType.color}-500 bg-${inputType.color}-500/20`
                          : 'border-border-dark bg-card-dark hover:border-gray-600'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className={`material-symbols-outlined text-2xl ${
                          acceptedInputs.includes(inputType.value) 
                            ? `text-${inputType.color}-400` 
                            : 'text-gray-500'
                        }`}>
                          {inputType.icon}
                        </span>
                        <span className={`text-sm font-medium ${
                          acceptedInputs.includes(inputType.value) 
                            ? 'text-white' 
                            : 'text-gray-400'
                        }`}>
                          {inputType.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {acceptedInputs.length === 0 && (
                  <p className="text-xs text-red-400 mt-2">⚠️ 至少需要选择一种输入类型</p>
                )}
              </div>

              {/* 文本模型配置 */}
              {formData.type === 'TEXT_GENERATION' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400">description</span>
                    文本生成参数
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        最大Token数
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="128000"
                        value={textConfig.maxTokens}
                        onChange={(e) => setTextConfig({ ...textConfig, maxTokens: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="4000"
                      />
                      <p className="text-xs text-gray-500 mt-1">生成文本的最大长度 (100-128000)</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        温度 (Temperature)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={textConfig.temperature}
                        onChange={(e) => setTextConfig({ ...textConfig, temperature: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="0.7"
                      />
                      <p className="text-xs text-gray-500 mt-1">创造性：0=精确 1=平衡 2=发散</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Top P
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={textConfig.topP}
                        onChange={(e) => setTextConfig({ ...textConfig, topP: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="1"
                      />
                      <p className="text-xs text-gray-500 mt-1">核采样 (0-1，推荐0.9-1)</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Top K
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={textConfig.topK}
                        onChange={(e) => setTextConfig({ ...textConfig, topK: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="40"
                      />
                      <p className="text-xs text-gray-500 mt-1">候选token数 (1-100)</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        频率惩罚
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        value={textConfig.frequencyPenalty}
                        onChange={(e) => setTextConfig({ ...textConfig, frequencyPenalty: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">避免重复 (-2到2)</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        存在惩罚
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        value={textConfig.presencePenalty}
                        onChange={(e) => setTextConfig({ ...textConfig, presencePenalty: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">话题多样性 (-2到2)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 图片模型配置 */}
              {formData.type === 'IMAGE_GENERATION' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-400">image</span>
                    图片生成参数
                  </h3>
                  
                  <div className="space-y-6">
                    
                    
                    {/* 图片比例（多选） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        支持的图片比例 * (多选)
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {imageRatioChoices.map((ratio) => (
                          <button
                            key={ratio.value}
                            type="button"
                            onClick={() => toggleRatio(ratio.value)}
                            className={`p-3 rounded-lg border-2 transition-all text-left ${
                              imageConfig.supportedRatios.includes(ratio.value)
                                ? 'border-primary bg-primary/10 text-white'
                                : 'border-border-dark text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            <div className="font-bold text-sm">{ratio.value}</div>
                            <div className="text-xs mt-1">{ratio.label}</div>
                            <div className="text-xs text-gray-500 mt-1">{ratio.width}×{ratio.height}</div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        已选择 {imageConfig.supportedRatios.length} 种比例
                      </p>
                    </div>

                    {/* 是否支持图生图 */}
                    <div className="flex items-start gap-3 p-4 bg-card-dark rounded-lg">
                      <input
                        type="checkbox"
                        id="supportsImageToImage"
                        checked={imageConfig.supportsImageToImage}
                        onChange={(e) => setImageConfig({ ...imageConfig, supportsImageToImage: e.target.checked })}
                        className="w-5 h-5 mt-1 text-primary bg-background-dark border-border-dark rounded focus:ring-primary focus:ring-2"
                      />
                      <div className="flex-1">
                        <label htmlFor="supportsImageToImage" className="text-sm font-medium text-white cursor-pointer block">
                          支持图生图 (Image-to-Image)
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          该模型是否支持通过参考图和提示词生成新图片
                        </p>
                      </div>
                    </div>

                    {/* 最大参考图数量 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        最大参考图数量
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={imageConfig.maxReferenceImages}
                        onChange={(e) => setImageConfig({ ...imageConfig, maxReferenceImages: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="1"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        该模型一次可以接受的参考图片数量 (0-10张)
                      </p>
                      {imageConfig.maxReferenceImages === 0 && (
                        <p className="text-xs text-amber-400 mt-2">
                          ⚠️ 设置为0表示不支持参考图
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 视频模型配置 */}
              {formData.type === 'VIDEO_GENERATION' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-400">movie</span>
                    视频生成参数
                  </h3>
                  
                  <div className="space-y-6">
                    {formData.provider === 'minimaxi' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">生成类型（按模型能力）</label>
                          <div className="flex gap-2 flex-wrap">
                            {((formData.modelId || '').toLowerCase().includes('fast')
                              ? ['首帧','首尾帧']
                              : ['文生视频','参考图','首帧','首尾帧']).map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  setVideoConfig((prev) => ({
                                    ...prev,
                                    supportedGenerationTypes: prev.supportedGenerationTypes.includes(t)
                                      ? prev.supportedGenerationTypes.filter((x) => x !== t)
                                      : [...prev.supportedGenerationTypes, t],
                                  }));
                                }}
                                className={`px-3 py-1 rounded border-2 text-sm ${videoConfig.supportedGenerationTypes.includes(t) ? 'border-primary bg-primary/10 text-white' : 'border-border-dark text-gray-400 hover:border-gray-600'}`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">分辨率（固定）</label>
                          <div className="flex gap-2">
                            {['768P','1080P'].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => {
                                  setVideoConfig((prev) => ({
                                    ...prev,
                                    supportedResolutions: prev.supportedResolutions.includes(r)
                                      ? prev.supportedResolutions.filter((x) => x !== r)
                                      : [...prev.supportedResolutions, r],
                                  }));
                                }}
                                className={`px-3 py-1 rounded border-2 text-sm ${videoConfig.supportedResolutions.includes(r) ? 'border-primary bg-primary/10 text-white' : 'border-border-dark text-gray-400 hover:border-gray-600'}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">时长（秒，固定）</label>
                          <div className="flex gap-2">
                            {[6,10].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  setVideoConfig((prev) => ({
                                    ...prev,
                                    supportedDurations: prev.supportedDurations.includes(d)
                                      ? prev.supportedDurations.filter((x) => x !== d)
                                      : [...prev.supportedDurations, d],
                                  }));
                                }}
                                className={`px-3 py-1 rounded border-2 text-sm ${videoConfig.supportedDurations.includes(d) ? 'border-primary bg-primary/10 text-white' : 'border-border-dark text-gray-400 hover:border-gray-600'}`}
                              >
                                {d}s
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* 1. 支持的视频比例（多选） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        1. 支持的视频比例 (多选)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {videoRatioChoices.map((ratio) => (
                          <button
                            key={ratio.value}
                            type="button"
                            onClick={() => toggleVideoRatio(ratio.value)}
                            className={`px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                              videoConfig.supportedRatios.includes(ratio.value)
                                ? 'border-primary bg-primary/10 text-white'
                                : 'border-border-dark text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        已选择 {videoConfig.supportedRatios.length} 种比例
                      </p>
                    </div>

                    {/* 2. 支持的视频分辨率（多选） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        2. 支持的视频分辨率 (多选)
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {videoResolutionChoices.map((resolution) => (
                          <button
                            key={resolution.value}
                            type="button"
                            onClick={() => toggleVideoResolution(resolution.value)}
                            className={`px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                              videoConfig.supportedResolutions.includes(resolution.value)
                                ? 'border-primary bg-primary/10 text-white'
                                : 'border-border-dark text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            {resolution.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        已选择 {videoConfig.supportedResolutions.length} 种分辨率
                      </p>
                    </div>

                    {/* 3. 支持生成类型（多选） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        3. 支持生成类型 (多选)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {videoGenerationTypeChoices.map((type) => (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => toggleGenerationType(type.value)}
                            className={`px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                              videoConfig.supportedGenerationTypes.includes(type.value)
                                ? 'border-primary bg-primary/10 text-white'
                                : 'border-border-dark text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        已选择 {videoConfig.supportedGenerationTypes.length} 种生成类型
                      </p>
                    </div>

                    {/* 4. 是否支持视频编辑 */}
                    <div className="flex items-start gap-3 p-4 bg-card-dark rounded-lg">
                      <input
                        type="checkbox"
                        id="supportsVideoEditing"
                        checked={videoConfig.supportsVideoEditing}
                        onChange={(e) => setVideoConfig({ ...videoConfig, supportsVideoEditing: e.target.checked })}
                        className="w-5 h-5 mt-1 text-primary bg-background-dark border-border-dark rounded focus:ring-primary focus:ring-2"
                      />
                      <div className="flex-1">
                        <label htmlFor="supportsVideoEditing" className="text-sm font-medium text-white cursor-pointer block">
                          4. 是否支持视频编辑
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          该模型是否支持对已生成的视频进行编辑
                        </p>
                      </div>
                    </div>

                    {/* 5. 视频时长（多选） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">
                        5. 视频时长 (多选，2-30秒)
                      </label>
                      <div className="grid grid-cols-10 gap-1 max-h-64 overflow-y-auto p-2 bg-card-dark rounded-lg">
                        {videoDurationChoices.map((duration) => (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => toggleVideoDuration(duration)}
                            className={`px-2 py-1.5 rounded border-2 transition-all text-xs ${
                              videoConfig.supportedDurations.includes(duration)
                                ? 'border-primary bg-primary/10 text-white font-bold'
                                : 'border-border-dark text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            {duration}s
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        已选择 {videoConfig.supportedDurations.length} 种时长
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 语音合成模型配置 */}
              {formData.type === 'AUDIO_SYNTHESIS' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text白 mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-pink-400">record_voice_over</span>
                    语音合成参数（CosyVoice）
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">目标模型</label>
                      <input
                        type="text"
                        value={formData.modelId}
                        onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                        className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white text-sm"
                        placeholder="例如：cosyvoice-v2"
                      />
                      <p className="text-xs text-gray-500 mt-1">仅保留手动输入的模型ID</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">最小采样率</label>
                      <input type="number" min={8000} value={audioConfig.sampleRateMin} onChange={(e) => setAudioConfig({ ...audioConfig, sampleRateMin: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text白 focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">输入音频格式（多选）</label>
                      <div className="flex gap-2 flex-wrap">
                        {['wav','mp3','m4a'].map(fmt => (
                          <button type="button" key={fmt} onClick={() => setAudioConfig({ ...audioConfig, supportedFormats: audioConfig.supportedFormats.includes(fmt) ? audioConfig.supportedFormats.filter(f => f !== fmt) : [...audioConfig.supportedFormats, fmt] })} className={`px-3 py-1 rounded border-2 text-sm ${audioConfig.supportedFormats.includes(fmt) ? 'border-primary bg-primary/10 text白' : 'border-border-dark text-gray-400 hover:border-gray-600'}`}>{fmt.toUpperCase()}</button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">支持WAV(16bit)、MP3、M4A</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">输入时长最短 (秒)</label>
                      <input type="number" min={1} value={audioConfig.inputDurationMinSec} onChange={(e) => setAudioConfig({ ...audioConfig, inputDurationMinSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text白 focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">输入时长最长 (秒)</label>
                      <input type="number" min={1} value={audioConfig.inputDurationMaxSec} onChange={(e) => setAudioConfig({ ...audioConfig, inputDurationMaxSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text白 focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">输入文件大小上限 (MB)</label>
                      <input type="number" min={1} value={audioConfig.inputSizeMaxMB} onChange={(e) => setAudioConfig({ ...audioConfig, inputSizeMaxMB: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text白 focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>
              )}

              {formData.type === 'VIDEO_EDITING' && (
                <div className="bg-background-dark rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400">cut</span>
                    视频编辑参数
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">1. 模型能力（多选）</label>
                      <div className="grid grid-cols-3 gap-3">
                        {['视频换人','动作克隆','视频换背景','风格转换','对口型'].map((cap) => (
                          <label key={cap} className="flex items-center gap-3 p-3 rounded-lg bg-card-dark border border-border-dark">
                            <input
                              type="checkbox"
                              checked={videoEditingConfig.supportedEditingCapabilities.includes(cap)}
                              onChange={() => toggleEditingCapability(cap)}
                              className="w-5 h-5 text-primary bg-background-dark border-border-dark rounded focus:ring-primary focus:ring-2"
                            />
                            <span className="text-sm text-white">{cap}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">已选择 {videoEditingConfig.supportedEditingCapabilities.length} 项能力</p>
                    </div>
                    {videoEditingConfig.supportedEditingCapabilities.includes('对口型') && (
                      <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">音频输入限制</label>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">最大文件大小 (MB)</label>
                          <input type="number" min={1} value={videoEditingConfig.audioSizeMaxMB} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, audioSizeMaxMB: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">音频时长最短 (秒)</label>
                            <input type="number" min={0} value={videoEditingConfig.audioLengthMinSec} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, audioLengthMinSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">音频时长最长 (秒)</label>
                            <input type="number" min={0} value={videoEditingConfig.audioLengthMaxSec} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, audioLengthMaxSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">1. 输入视频长度下限 (秒)</label>
                        <input type="number" min={0} value={videoEditingConfig.videoLengthMinSec} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoLengthMinSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">1. 输入视频长度上限 (秒)</label>
                        <input type="number" min={0} value={videoEditingConfig.videoLengthMaxSec} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoLengthMaxSec: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">2. 输入视频大小上限 (MB)</label>
                      <input type="number" min={1} value={videoEditingConfig.videoSizeMaxMB} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoSizeMaxMB: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">3. 视频分辨率最低值 (px)</label>
                        <input type="number" min={1} value={videoEditingConfig.videoResolutionMinPx} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoResolutionMinPx: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">3. 视频分辨率最高值 (px)</label>
                        <input type="number" min={1} value={videoEditingConfig.videoResolutionMaxPx} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoResolutionMaxPx: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">4. 竖向比例上限 x:y（允许小数，如 1:3.1）</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={0.1} step="0.1" value={videoEditingConfig.videoAspectRatioVerticalX} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoAspectRatioVerticalX: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          <span className="text-gray-400">:</span>
                          <input type="number" min={0.1} step="0.1" value={videoEditingConfig.videoAspectRatioVerticalY} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoAspectRatioVerticalY: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">4. 横向比例上限 x:y（允许小数，如 3.1:1）</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={0.1} step="0.1" value={videoEditingConfig.videoAspectRatioHorizontalX} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoAspectRatioHorizontalX: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          <span className="text-gray-400">:</span>
                          <input type="number" min={0.1} step="0.1" value={videoEditingConfig.videoAspectRatioHorizontalY} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, videoAspectRatioHorizontalY: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">5. 输入图片大小上限 (MB)</label>
                      <input type="number" min={1} value={videoEditingConfig.imageSizeMaxMB} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imageSizeMaxMB: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">6. 图片像素最低值 (px)</label>
                        <input type="number" min={1} value={videoEditingConfig.imagePixelMinPx} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imagePixelMinPx: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">6. 图片像素最高值 (px)</label>
                        <input type="number" min={1} value={videoEditingConfig.imagePixelMaxPx} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imagePixelMaxPx: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">7. 竖向图片比例 x:y</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} value={videoEditingConfig.imageAspectRatioVerticalX} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imageAspectRatioVerticalX: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          <span className="text-gray-400">:</span>
                          <input type="number" min={1} value={videoEditingConfig.imageAspectRatioVerticalY} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imageAspectRatioVerticalY: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">7. 横向图片比例 x:y</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} value={videoEditingConfig.imageAspectRatioHorizontalX} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imageAspectRatioHorizontalX: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                          <span className="text-gray-400">:</span>
                          <input type="number" min={1} value={videoEditingConfig.imageAspectRatioHorizontalY} onChange={(e) => setVideoEditingConfig({ ...videoEditingConfig, imageAspectRatioHorizontalY: Number(e.target.value) })} className="w-full px-4 py-2 bg-card-dark border border-border-dark rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 启用状态 */}
              <div className="bg-background-dark rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-5 h-5 mt-1 text-primary bg-card-dark border-border-dark rounded focus:ring-primary focus:ring-2"
                  />
                  <div className="flex-1">
                    <label htmlFor="isActive" className="text-sm font-medium text-white cursor-pointer block">
                      启用此模型
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      禁用的模型不会在工作流中显示，但配置仍然保留
                    </p>
                  </div>
                </div>
              </div>

              {/* 提交按钮 */}
              <div className="flex gap-3 pt-4 border-t border-border-dark">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">check</span>
                  {editingModel ? '更新模型' : '创建模型'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingModel(null);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-card-dark border border-border-dark text-gray-300 font-medium rounded-lg hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIModelsPage;
