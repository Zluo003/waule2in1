// AI模型预设配置 - 更新版

export const DEFAULT_API_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  aliyun: 'https://dashscope.aliyuncs.com/api/v1',
  stability: 'https://api.stability.ai/v1',
  runway: 'https://api.runwayml.com/v1',
  midjourney: 'https://api.midjourney.com/v1',
  pika: 'https://api.pika.art/v1',
  sora: 'http://localhost:8000',
  minimaxi: 'https://api.minimaxi.com/v1',
  vidu: 'https://api.vidu.cn/ent/v2',
};

export const AI_MODEL_PRESETS = {
  // 文本生成模型
  textGeneration: [
    {
      name: 'GPT-4 Turbo',
      provider: 'openai',
      modelId: 'gpt-4-turbo-preview',
      type: 'TEXT_GENERATION' as const,
      config: {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 1,
        topK: 40,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://api.openai.com/v1
      isActive: true,
      pricePerUse: '0.01',
    },
    {
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      modelId: 'gpt-3.5-turbo',
      type: 'TEXT_GENERATION' as const,
      config: {
        maxTokens: 4000,
        temperature: 0.7,
        topP: 1,
        topK: 40,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.002',
    },
    {
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      modelId: 'gemini-2.5-pro',
      type: 'TEXT_GENERATION' as const,
      config: {
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://generativelanguage.googleapis.com/v1
      isActive: true,
      pricePerUse: '0.0025',
    },
    {
      name: '豆包大模型',
      provider: 'bytedance',
      modelId: 'doubao-pro',
      type: 'TEXT_GENERATION' as const,
      config: {
        maxTokens: 4000,
        temperature: 0.7,
        topP: 0.9,
        topK: 50,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://ark.cn-beijing.volces.com/api/v3
      isActive: true,
      pricePerUse: '0.003',
    },
  ],

  // 图片生成模型 - 新的简化配置
  imageGeneration: [
    {
      name: 'MiniMax Image-01',
      provider: 'minimaxi',
      modelId: 'image-01',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        supportsImageToImage: true,
        maxReferenceImages: 3,
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.02',
    },
    {
      name: 'MiniMax Hailuo 2.3 Image',
      provider: 'minimaxi',
      modelId: 'MiniMax-Hailuo-2.3',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16'],
        supportsImageToImage: true,
        maxReferenceImages: 3,
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.02',
    },
    {
      name: 'DALL-E 3',
      provider: 'openai',
      modelId: 'dall-e-3',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16'], // 支持的比例
        supportsImageToImage: false, // 不支持图生图
        maxReferenceImages: 0, // 不支持参考图
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.04',
    },
    {
      name: '通义千问 图像编辑 Plus',
      provider: 'aliyun',
      modelId: 'qwen-image-edit-plus',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
        supportsImageToImage: true,
        maxReferenceImages: 3,
        acceptedInputs: ['TEXT', 'IMAGE'],
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.02',
    },
    {
      name: '豆包 SeedDream 4.0',
      provider: 'bytedance',
      modelId: 'doubao-seedream-4-0-250828',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], // 支持所有比例
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 3, // 最多3张参考图
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://visual.volcengineapi.com/v1
      isActive: true,
      pricePerUse: '0.015',
    },
    {
      name: '豆包 SeedDream 4.5',
      provider: 'bytedance',
      modelId: 'doubao-seedream-4-5-251128',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], // 支持所有比例
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 3, // 最多3张参考图
        supportsMultiImage: true, // 支持组图生成
        maxImagesLimit: 15, // 组图最多15张
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://visual.volcengineapi.com/v1
      isActive: true,
      pricePerUse: '0.015',
    },
    {
      name: 'Gemini 2.5 Flash Image',
      provider: 'google',
      modelId: 'gemini-2.5-flash-image',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['21:9', '16:9', '4:3', '3:2', '5:4', '1:1', '4:5', '2:3', '3:4', '9:16'],
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 2, // 最多2张参考图
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.008',
    },
    {
      name: 'Gemini 3 Pro Image',
      provider: 'google',
      modelId: 'gemini-3-pro-image-preview',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['21:9', '16:9', '4:3', '3:2', '5:4', '1:1', '4:5', '2:3', '3:4', '9:16'],
        supportedResolutions: ['2K', '4K'], // 支持原生2K和4K分辨率
        supportsImageToImage: true, // 支持对话式编辑
        maxReferenceImages: 1, // 支持参考图进行编辑
        capabilities: ['google_search', 'reasoning', 'text_rendering'], // 支持Google搜索、推理和文本渲染
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.012', // Gemini 3 Pro 价格略高于 Flash
    },
    {
      name: 'Stable Diffusion XL',
      provider: 'stability',
      modelId: 'stable-diffusion-xl-1024-v1-0',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 1, // 最多1张参考图
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://api.stability.ai/v1
      isActive: true,
      pricePerUse: '0.02',
    },
    {
      name: 'Midjourney V6',
      provider: 'midjourney',
      modelId: 'midjourney-v6',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 5, // 最多5张参考图
        defaultVersion: '6.0', // 完整版本号
        versionParam: '--v 6.0', // Midjourney 参数格式
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.035',
    },
    {
      name: 'Midjourney V7',
      provider: 'midjourney',
      modelId: 'midjourney-v7',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 5, // 最多5张参考图
        defaultVersion: '7.0', // 完整版本号
        versionParam: '--v 7.0', // Midjourney 参数格式
        supportedStyles: ['raw', 'default'], // V7 支持的风格
        maxPromptLength: 2000, // V7 支持更长的提示词
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.04', // V7 价格略高
    },
    {
      name: 'Sora2 Image',
      provider: 'sora',
      modelId: 'sora-image',
      type: 'IMAGE_GENERATION' as const,
      config: {
        supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
        supportsImageToImage: true, // 支持图生图
        maxReferenceImages: 5, // 最多5张参考图
        acceptedInputs: ['TEXT', 'IMAGE'],
      },
      apiKey: null,
      apiUrl: null, // 使用默认: http://localhost:8000
      isActive: true,
      pricePerUse: '0.02',
    },
  ],

  // 视频生成模型
  videoGeneration: [
    {
      name: 'Runway Gen-3',
      provider: 'runway',
      modelId: 'gen-3',
      type: 'VIDEO_GENERATION' as const,
      config: {
        maxDuration: 30, // 最大30秒
        supportedFps: [24, 30], // 支持24和30帧率
        maxResolution: '1920x1080', // 最大Full HD
        supportsImageToVideo: true, // 支持图生视频
      },
      apiKey: null,
      apiUrl: null, // 使用默认: https://api.runwayml.com/v1
      isActive: true,
      pricePerUse: '0.25',
    },
    {
      name: '通义万相 视频换人',
      provider: 'aliyun',
      modelId: 'wan2.2-animate-mix',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
        supportedResolutions: ['1080P'],
        supportedGenerationTypes: ['视频换人'],
        supportedDurations: [5, 10, 15, 30],
        acceptedInputs: ['text', 'image', 'video'],
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.50',
    },
    {
      name: 'Pika 1.5',
      provider: 'pika',
      modelId: 'pika-1.5',
      type: 'VIDEO_GENERATION' as const,
      config: {
        maxDuration: 10,
        supportedFps: [24, 30, 60],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.18',
    },
    {
      name: 'Stable Video Diffusion',
      provider: 'stability',
      modelId: 'stable-video-diffusion',
      type: 'VIDEO_GENERATION' as const,
      config: {
        maxDuration: 4,
        supportedFps: [24],
        maxResolution: '1024x576',
        supportsImageToVideo: true,
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.15',
    },
    {
      name: 'Sora2 Video',
      provider: 'sora',
      modelId: 'sora-video',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        supportedResolutions: ['1080P'],
        supportedGenerationTypes: ['文生视频', '图生视频'],
        supportedDurations: [5],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
        maxReferenceImages: 1, // 图生视频只能接受一张图片
      },
      apiKey: null,
      apiUrl: null, // 使用默认: http://localhost:8000
      isActive: true,
      pricePerUse: '0.30',
    },
    {
      name: 'MiniMax 海螺 视频生成 2.3',
      provider: 'minimaxi',
      modelId: 'MiniMax-Hailuo-2.3',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportedResolutions: ['768P', '1080P'],
        supportedGenerationTypes: ['文生视频', '参考图', '首帧'],
        supportedDurations: [6, 10],
        maxDuration: 30,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.30',
    },
    {
      name: 'MiniMax 海螺 视频生成 2.3 Fast',
      provider: 'minimaxi',
      modelId: 'MiniMax-Hailuo-2.3-Fast',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportedResolutions: ['768P', '1080P'],
        supportedGenerationTypes: ['首帧'],
        supportedDurations: [6, 10],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.25',
    },
    {
      name: 'MiniMax 海螺 视频生成 02',
      provider: 'minimaxi',
      modelId: 'MiniMax-Hailuo-02',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportedResolutions: ['768P', '1080P'],
        supportedGenerationTypes: ['文生视频', '参考图', '主体参考'],
        supportedDurations: [6, 8, 10],
        maxDuration: 30,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.30',
    },
    {
      name: 'Vidu Q2 Pro',
      provider: 'vidu',
      modelId: 'viduq2-pro',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        supportedResolutions: ['540p', '720p', '1080p'],
        supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'],
        supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
        maxReferenceImages: 2, // 首尾帧需要2张图片
        supportsSubjects: true, // 支持 subjects 主体参考
        supportsAudioOutput: true, // 支持音视频直出
        description: 'Vidu Q2 Pro 高质量视频生成模型，支持主体参考、多图生成、首尾帧和音视频直出',
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.35',
    },
    {
      name: 'Vidu Q2 Pro Fast',
      provider: 'vidu',
      modelId: 'viduq2-pro-fast',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        supportedResolutions: ['540p', '720p', '1080p'],
        supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'],
        supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
        maxReferenceImages: 2,
        supportsSubjects: true,
        supportsAudioOutput: true,
        description: 'Vidu Q2 Pro Fast 快速视频生成模型，支持主体参考、多图生成、首尾帧和音视频直出',
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.30',
    },
    {
      name: 'Vidu Q2 Turbo',
      provider: 'vidu',
      modelId: 'viduq2-turbo',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        supportedResolutions: ['540p', '720p', '1080p'],
        supportedGenerationTypes: ['文生视频', '主体参考', '首帧', '尾帧', '首尾帧'],
        supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['TEXT', 'IMAGE'],
        maxReferenceImages: 2, // 首尾帧需要2张图片
        supportsSubjects: true, // 支持 subjects 主体参考
        supportsAudioOutput: true, // 支持音视频直出
        description: 'Vidu Q2 Turbo 快速视频生成模型，支持主体参考、多图生成、首尾帧和音视频直出',
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.25',
    },
    {
      name: 'Vidu Q2',
      provider: 'vidu',
      modelId: 'viduq2',
      type: 'VIDEO_GENERATION' as const,
      config: {
        supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        supportedResolutions: ['540p', '720p', '1080p'],
        supportedGenerationTypes: ['参考图生视频'],
        supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxDuration: 10,
        supportedFps: [24, 30],
        maxResolution: '1920x1080',
        supportsImageToVideo: true,
        acceptedInputs: ['IMAGE'],
        maxReferenceImages: 7, // 支持1-7张参考图
        supportsSubjects: true, // 支持 subjects 主体参考
        supportsAudioOutput: true, // 支持音视频直出
        supportsBgm: true, // 支持背景音乐
        description: 'Vidu Q2 参考图生视频模型，支持1-7张参考图，音视频直出和背景音乐',
      },
      apiKey: null,
      apiUrl: null,
      isActive: true,
      pricePerUse: '0.30',
    },
  ],

  audioSynthesis: [
    {
      name: '海螺 Speech 2.6 HD',
      provider: 'minimaxi',
      modelId: 'speech-2.6-hd',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.02',
    },
    {
      name: '海螺 Speech 2.6 Turbo',
      provider: 'minimaxi',
      modelId: 'speech-2.6-turbo',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.015',
    },
    {
      name: '海螺 Speech 02 HD',
      provider: 'minimaxi',
      modelId: 'speech-02-hd',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.015',
    },
    {
      name: '海螺 Speech 02 Turbo',
      provider: 'minimaxi',
      modelId: 'speech-02-turbo',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.012',
    },
    {
      name: '海螺 Speech 01 HD',
      provider: 'minimaxi',
      modelId: 'speech-01-hd',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.012',
    },
    {
      name: '海螺 Speech 01 Turbo',
      provider: 'minimaxi',
      modelId: 'speech-01-turbo',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
        capabilities: ['音色克隆'],
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.minimaxi,
      isActive: true,
      pricePerUse: '0.010',
    },
    {
      name: 'CosyVoice V2',
      provider: 'aliyun',
      modelId: 'cosyvoice-v2',
      type: 'AUDIO_SYNTHESIS' as const,
      config: {
        supportedFormats: ['mp3', 'wav'],
        sampleRateMin: 16000,
        supportsStereo: true,
      },
      apiKey: null,
      apiUrl: DEFAULT_API_URLS.aliyun,
      isActive: true,
      pricePerUse: '0.015',
    },
  ],
};

// 默认API地址配置


// 获取所有预设模型
export const getAllPresets = () => {
  return [
    ...AI_MODEL_PRESETS.textGeneration,
    ...AI_MODEL_PRESETS.imageGeneration,
    ...AI_MODEL_PRESETS.videoGeneration,
    ...AI_MODEL_PRESETS.audioSynthesis,
  ];
};

// 根据类型获取预设
export const getPresetsByType = (type: 'TEXT_GENERATION' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | 'AUDIO_SYNTHESIS') => {
  switch (type) {
    case 'TEXT_GENERATION':
      return AI_MODEL_PRESETS.textGeneration;
    case 'IMAGE_GENERATION':
      return AI_MODEL_PRESETS.imageGeneration;
    case 'VIDEO_GENERATION':
      return AI_MODEL_PRESETS.videoGeneration;
    case 'AUDIO_SYNTHESIS':
      return AI_MODEL_PRESETS.audioSynthesis;
    default:
      return [];
  }
};

// 获取默认API地址
export const getDefaultApiUrl = (provider: string): string | null => {
  return DEFAULT_API_URLS[provider] || null;
};

// 提供商列表
export const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: DEFAULT_API_URLS.openai },
  { value: 'google', label: 'Google', defaultUrl: DEFAULT_API_URLS.google },
  { value: 'bytedance', label: 'ByteDance (豆包)', defaultUrl: DEFAULT_API_URLS.bytedance },
  { value: 'aliyun', label: '阿里云百炼', defaultUrl: DEFAULT_API_URLS.aliyun },
  { value: 'stability', label: 'Stability AI', defaultUrl: DEFAULT_API_URLS.stability },
  { value: 'runway', label: 'Runway', defaultUrl: DEFAULT_API_URLS.runway },
  { value: 'midjourney', label: 'Midjourney', defaultUrl: DEFAULT_API_URLS.midjourney },
  { value: 'pika', label: 'Pika', defaultUrl: DEFAULT_API_URLS.pika },
  { value: 'sora', label: 'Sora', defaultUrl: DEFAULT_API_URLS.sora },
  { value: 'minimaxi', label: 'MiniMax（海螺）', defaultUrl: DEFAULT_API_URLS.minimaxi },
  { value: 'vidu', label: 'Vidu', defaultUrl: DEFAULT_API_URLS.vidu },
  { value: 'other', label: '其他', defaultUrl: null },
];
