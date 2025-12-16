import { Request, Response } from 'express';
export declare const getAssetLibraries: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getLibraryAssets: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const addAssetFromUrl: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getRoles: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSharedAssetLibraries: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const shareAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const unshareAssetLibrary: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getCollaborators: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const searchUsers: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=asset-library.controller.d.ts.map