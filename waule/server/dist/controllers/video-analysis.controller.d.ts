import { Request, Response } from 'express';
export declare class VideoAnalysisController {
    private service;
    uploadAndAnalyze: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getAnalyses: (req: Request, res: Response) => Promise<void>;
    getAnalysis: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getAnalysisStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    updateShot: (req: Request, res: Response) => Promise<void>;
    generateScript: (req: Request, res: Response) => Promise<void>;
    generatePosters: (req: Request, res: Response) => Promise<void>;
    exportCSV: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    deleteAnalysis: (req: Request, res: Response) => Promise<void>;
    getConfig: (req: Request, res: Response) => Promise<void>;
    updateConfig: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=video-analysis.controller.d.ts.map