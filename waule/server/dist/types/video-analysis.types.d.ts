export interface ProcessedFrame {
    timestamp: number;
    data: string;
}
export interface VideoMetadata {
    width: number;
    height: number;
    duration: number;
}
export interface ShotData {
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
}
export interface AnalysisResult {
    shots: ShotData[];
    summary: string;
    title: string;
}
export interface CreateAnalysisData {
    userId: string;
    projectId?: string;
    videoUrl: string;
    fileName: string;
    fileSize: number;
}
export interface UpdateShotData {
    size?: string;
    movement?: string;
    description?: string;
    audio?: string;
    sfx?: string;
}
export interface GenerateScriptParams {
    analysisId: string;
}
export interface GeneratePostersParams {
    analysisId: string;
}
//# sourceMappingURL=video-analysis.types.d.ts.map