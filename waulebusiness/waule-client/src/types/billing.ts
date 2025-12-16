export enum BillingType {
  PER_REQUEST = 'PER_REQUEST',          // 按次计费（文本模型）
  PER_IMAGE = 'PER_IMAGE',              // 按图片数量计费（图片模型）
  PER_DURATION = 'PER_DURATION',        // 按时长计费（广告成片）
  DURATION_RESOLUTION = 'DURATION_RESOLUTION', // 按时长+分辨率计费（视频生成、智能超清）
  PER_CHARACTER = 'PER_CHARACTER',      // 按字符数计费（音频合成）
  DURATION_MODE = 'DURATION_MODE',      // 按时长+模式计费（视频编辑）
  OPERATION_MODE = 'OPERATION_MODE',    // 按操作类型+模式计费（Midjourney）
}

export interface BillingPrice {
  id?: string;
  billingRuleId?: string;
  dimension: string;
  value: string;
  creditsPerUnit: number;
  unitSize?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingRule {
  id?: string;
  name: string;
  description?: string;
  aiModelId?: string;
  nodeType?: string;
  moduleType?: string;
  billingType: BillingType;
  baseCredits: number;
  config?: any;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  aiModel?: {
    id: string;
    name: string;
    provider: string;
    type: string;
  };
  prices: BillingPrice[];
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  type: string;
  isActive?: boolean;
  modelId?: string;
  config?: {
    supportedResolutions?: string[];
    supportedDurations?: number[];
    [key: string]: any;
  };
}

export const BillingTypeLabels: Record<BillingType, string> = {
  [BillingType.PER_REQUEST]: '按次计费',
  [BillingType.PER_IMAGE]: '按图片数量',
  [BillingType.PER_DURATION]: '按时长计费',
  [BillingType.DURATION_RESOLUTION]: '按时长+分辨率',
  [BillingType.PER_CHARACTER]: '按字符数计费',
  [BillingType.DURATION_MODE]: '按模式计费 (支持时长/次数)',
  [BillingType.OPERATION_MODE]: '按操作+模式',
};

export const ModelTypeLabels: Record<string, string> = {
  TEXT_GENERATION: '文本模型',
  IMAGE_GENERATION: '图片模型',
  VIDEO_GENERATION: '视频生成',
  VIDEO_EDITING: '视频编辑',
  AUDIO_SYNTHESIS: '音频合成',
};
