interface CalculateCreditsParams {
    aiModelId?: string;
    nodeType?: string;
    moduleType?: string;
    quantity?: number;
    duration?: number;
    resolution?: string;
    mode?: string;
    operationType?: string;
    characterCount?: number;
}
interface ChargeUserParams extends CalculateCreditsParams {
    userId: string;
    operation: string;
}
interface ChargeWithPermissionResult {
    success: boolean;
    usageRecord?: any;
    creditsCharged: number;
    isFreeUsage: boolean;
    error?: string;
}
export declare class BillingService {
    /**
     * 计算应扣除的积分
     */
    calculateCredits(params: CalculateCreditsParams): Promise<number>;
    /**
     * 🚀 优化：计算积分并返回规则（避免重复查询）
     */
    private calculateCreditsWithRule;
    /**
     * 执行扣费并记录
     */
    chargeUser(params: ChargeUserParams): Promise<any>;
    /**
     * 预估费用（不实际扣费）
     */
    estimateCredits(params: CalculateCreditsParams): Promise<number>;
    /**
     * 退还积分（任务失败时）
     */
    refundCredits(usageRecordId: string, reason?: string): Promise<{
        id: string;
        createdAt: Date;
        nodeType: string | null;
        moduleType: string | null;
        userId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        modelId: string | null;
        duration: number | null;
        mode: string | null;
        resolution: string | null;
        operation: string;
        tokens: number | null;
        cost: import("@prisma/client/runtime/library").Decimal;
        creditsCharged: number;
        operationType: string | null;
        quantity: number | null;
        billingRuleId: string | null;
    } | null>;
    /**
     * 带权限检查的扣费（推荐使用）
     * 整合了权限检查、免费使用、使用次数记录等功能
     */
    chargeUserWithPermission(params: ChargeUserParams): Promise<ChargeWithPermissionResult>;
    /**
     * 仅检查权限（不扣费）
     * 用于任务创建前的预检查
     */
    checkPermissionOnly(params: {
        userId: string;
        aiModelId?: string;
        nodeType?: string;
        moduleType?: string;
    }): Promise<{
        allowed: boolean;
        reason?: string;
        isFree?: boolean;
    }>;
    /**
     * 🚀 获取计费规则（带 Redis 缓存）
     */
    private getBillingRule;
    /**
     * 按次计费（文本模型）
     */
    private calculatePerRequest;
    /**
     * 按图片数量计费
     */
    private calculatePerImage;
    /**
     * 按时长计费（广告成片）
     */
    private calculatePerDuration;
    /**
     * 按时长+分辨率计费（视频生成、智能超清）
     */
    private calculateDurationResolution;
    /**
     * 按字符数计费（音频合成）
     */
    private calculatePerCharacter;
    /**
     * 按时长+模式计费（视频编辑、Wan Animate）
     */
    private calculateDurationMode;
    /**
     * 按操作类型+模式计费（Midjourney）
     */
    private calculateOperationMode;
    /**
     * 生成消费描述
     */
    private generateConsumeDescription;
}
export declare const billingService: BillingService;
export {};
//# sourceMappingURL=billing.service.d.ts.map