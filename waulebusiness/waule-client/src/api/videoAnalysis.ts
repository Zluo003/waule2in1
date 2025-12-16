import { api } from '../lib/api';

export interface VideoAnalysis {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  summary: string;
  videoFile: string;
  fileName: string;
  fileSize: string; // BigInt 序列化为字符串
  duration: number;
  width: number;
  height: number;
  frameCount: number;
  status: string;
  progress: number;
  errorMsg?: string;
  createdAt: string;
  updatedAt: string;
  shots?: VideoShot[];
  scripts?: VideoScript[];
  posters?: VideoPoster[];
  _count?: {
    shots: number;
  };
}

export interface VideoShot {
  id: string;
  analysisId: string;
  shotNumber: number;
  startTime: string;
  endTime: string;
  duration: number;
  size: string;
  movement: string;
  description: string;
  audio: string;
  sfx: string;
  thumbnailIndex: number;
  thumbnailUrl?: string;
}

export interface VideoScript {
  id: string;
  analysisId: string;
  content: string;
  version: number;
  createdAt: string;
}

export interface VideoPoster {
  id: string;
  analysisId: string;
  imageUrl: string;
  style: string;
  variation: number;
}

export const videoAnalysisApi = {
  // 上传视频
  upload: async (file: File, projectId?: string) => {
    const formData = new FormData();
    formData.append('video', file);
    if (projectId) formData.append('projectId', projectId);

    const { data } = await api.post('/video-analysis/upload', formData);
    return data.data as VideoAnalysis;
  },

  // 获取所有分析
  getAll: async () => {
    const { data } = await api.get('/video-analysis');
    return data.data as VideoAnalysis[];
  },

  // 获取单个分析
  getById: async (id: string) => {
    const { data } = await api.get(`/video-analysis/${id}`);
    return data.data as VideoAnalysis;
  },

  // 获取分析状态（轮询用）
  getStatus: async (id: string) => {
    const { data } = await api.get(`/video-analysis/${id}/status`);
    return data.data as { status: string; progress: number; errorMsg?: string };
  },

  // 更新镜头
  updateShot: async (
    analysisId: string,
    shotId: string,
    updates: Partial<VideoShot>
  ) => {
    const { data } = await api.put(
      `/video-analysis/${analysisId}/shots/${shotId}`,
      updates
    );
    return data.data as VideoShot;
  },

  // 生成剧本
  generateScript: async (analysisId: string) => {
    const { data } = await api.post(`/video-analysis/${analysisId}/script`);
    return data.data as VideoScript;
  },

  // 生成海报
  generatePosters: async (analysisId: string) => {
    const { data } = await api.post(`/video-analysis/${analysisId}/posters`);
    return data.data as VideoPoster[];
  },

  // 导出CSV
  exportCSV: async (analysisId: string) => {
    const response = await api.get(
      `/video-analysis/${analysisId}/export-csv`,
      { responseType: 'blob' }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `shots_${analysisId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // 删除分析
  delete: async (analysisId: string) => {
    const { data } = await api.delete(`/video-analysis/${analysisId}`);
    return data;
  },
};
