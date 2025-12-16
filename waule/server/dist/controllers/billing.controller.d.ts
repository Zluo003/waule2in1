import { Request, Response } from 'express';
export declare class BillingController {
    /**
     * 获取所有计费规则
     */
    getRules(req: Request, res: Response): Promise<void>;
    /**
     * 获取单个计费规则
     */
    getRule(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 创建计费规则
     */
    createRule(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 更新计费规则
     */
    updateRule(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 删除计费规则
     */
    deleteRule(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 切换规则启用状态
     */
    toggleRule(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 预估费用
     */
    estimateCredits(req: Request, res: Response): Promise<void>;
    /**
     * 获取所有 AI 模型（用于选择器）
     */
    getModels(req: Request, res: Response): Promise<void>;
}
export declare const billingController: BillingController;
//# sourceMappingURL=billing.controller.d.ts.map