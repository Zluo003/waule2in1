import { Request, Response } from 'express';
import multer from 'multer';
export declare const upload: multer.Multer;
export declare const uploadAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAssets: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const listRecycleBin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const restoreAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const permanentDeleteAsset: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const recordRecycleItem: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPresignedUrl: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const confirmDirectUpload: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=asset.controller.d.ts.map