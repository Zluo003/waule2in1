import { Request, Response } from 'express';
export declare const getEpisodes: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getEpisode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createEpisode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateEpisode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteEpisode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getEpisodeCollaborators: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateEpisodePermission: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=episode.controller.d.ts.map