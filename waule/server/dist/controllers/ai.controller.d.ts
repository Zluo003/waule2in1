import { Request, Response } from 'express';
/**
 * 生成图片
 */
export declare const generateImage: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 生成文本
 */
export declare const generateText: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 生成视频
 */
export declare const generateVideo: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const createVoiceEnrollment: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const queryVoiceStatus: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const synthesizeAudio: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const listUserVoices: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const addUserVoice: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const updateUserVoice: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const deleteUserVoice: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const listVoicePresets: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const diagnoseMinimaxVoice: (req: Request, res: Response, next: import("express").NextFunction) => void;
export declare const designVoice: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 智能超清 (视频放大)
 */
export declare const upscaleVideo: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 广告成片
 */
export declare const createCommercial: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 获取支持图片编辑的模型列表
 */
export declare const getImageEditingModels: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 图片编辑（固定使用 Gemini 3.0 Pro Image，4K 分辨率）
 */
export declare const imageEdit: (req: Request, res: Response, next: import("express").NextFunction) => void;
/**
 * 识别图片标记点的物体（使用 Gemini 2.5 Flash，通过代理服务）
 */
export declare const identifyImagePoints: (req: Request, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=ai.controller.d.ts.map