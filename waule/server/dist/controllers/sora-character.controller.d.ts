import { Request, Response } from 'express';
/**
 * Sora角色控制器
 * 处理Sora2生成的角色CRUD操作
 */
export declare class SoraCharacterController {
    /**
     * 获取当前用户的所有角色（包括共享给我的）
     */
    list(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 搜索角色（用于@提及自动完成，包括共享的角色）
     */
    search(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 获取单个角色
     */
    getById(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 创建角色
     */
    create(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 更新角色
     */
    update(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 删除角色（软删除）
     */
    delete(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 通过自定义名称获取角色名称
     */
    getByCustomName(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 搜索用户（用于添加协作者）
     */
    searchUsers(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 获取协作者列表
     */
    getCollaborators(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 添加协作者
     */
    addCollaborator(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 移除协作者
     */
    removeCollaborator(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 获取协作者数量（用于显示共享状态）
     */
    getShareInfo(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
declare const _default: SoraCharacterController;
export default _default;
//# sourceMappingURL=sora-character.controller.d.ts.map