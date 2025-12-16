import { Request, Response } from 'express';
import { BillingType } from '@prisma/client';
import { billingService } from '../services/billing.service';
import { prisma } from '../index';
import { userLevelService } from '../services/user-level.service';

export class BillingController {
  /**
   * 获取所有计费规则
   */
  async getRules(req: Request, res: Response) {
    try {
      const { type, isActive } = req.query;

      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // 根据 type 筛选
      if (type) {
        where.billingType = type as BillingType;
      }

      const rules = await prisma.billingRule.findMany({
        where,
        include: {
          aiModel: {
            select: {
              id: true,
              name: true,
              provider: true,
              type: true,
            },
          },
          prices: {
            where: { isActive: true },
            orderBy: { dimension: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: rules,
      });
    } catch (error: any) {
      console.error('Failed to get billing rules:', error);
      res.status(500).json({
        success: false,
        message: '获取计费规则失败',
        error: error.message,
      });
    }
  }

  /**
   * 获取单个计费规则
   */
  async getRule(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const rule = await prisma.billingRule.findUnique({
        where: { id },
        include: {
          aiModel: true,
          prices: {
            where: { isActive: true },
            orderBy: [
              { dimension: 'asc' },
              { value: 'asc' },
            ],
          },
        },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: '计费规则不存在',
        });
      }

      res.json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error('Failed to get billing rule:', error);
      res.status(500).json({
        success: false,
        message: '获取计费规则失败',
        error: error.message,
      });
    }
  }

  /**
   * 创建计费规则
   */
  async createRule(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        aiModelId,
        nodeType,
        moduleType,
        billingType,
        baseCredits,
        config,
        prices,
      } = req.body;

      // 验证必填字段
      if (!name || !billingType) {
        return res.status(400).json({
          success: false,
          message: '缺少必填字段',
        });
      }

      // 验证至少有一个关联对象
      if (!aiModelId && !nodeType && !moduleType) {
        return res.status(400).json({
          success: false,
          message: '必须指定 aiModelId、nodeType 或 moduleType',
        });
      }

      // 使用事务创建规则和价格
      const rule = await prisma.$transaction(async (tx) => {
        // 创建规则
        const newRule = await tx.billingRule.create({
          data: {
            name,
            description,
            aiModelId,
            nodeType,
            moduleType,
            billingType: billingType as BillingType,
            baseCredits: baseCredits || 0,
            config: config || {},
          },
        });

        // 创建价格（如果有）
        if (prices && prices.length > 0) {
          await tx.billingPrice.createMany({
            data: prices.map((price: any) => ({
              billingRuleId: newRule.id,
              dimension: price.dimension,
              value: price.value,
              creditsPerUnit: price.creditsPerUnit,
              unitSize: price.unitSize || 1,
            })),
          });
        }

        return newRule;
      });

      // 获取完整的规则（包含价格）
      const fullRule = await prisma.billingRule.findUnique({
        where: { id: rule.id },
        include: {
          aiModel: true,
          prices: true,
        },
      });

      res.json({
        success: true,
        data: fullRule,
      });
    } catch (error: any) {
      console.error('Failed to create billing rule:', error);
      res.status(500).json({
        success: false,
        message: '创建计费规则失败',
        error: error.message,
      });
    }
  }

  /**
   * 更新计费规则
   */
  async updateRule(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        aiModelId,
        nodeType,
        moduleType,
        billingType,
        baseCredits,
        config,
        isActive,
        prices,
      } = req.body;

      // 检查规则是否存在
      const existingRule = await prisma.billingRule.findUnique({
        where: { id },
      });

      if (!existingRule) {
        return res.status(404).json({
          success: false,
          message: '计费规则不存在',
        });
      }

      // 使用事务更新规则和价格
      const rule = await prisma.$transaction(async (tx) => {
        // 更新规则
        const updatedRule = await tx.billingRule.update({
          where: { id },
          data: {
            name,
            description,
            aiModelId,
            nodeType,
            moduleType,
            billingType: billingType as BillingType,
            baseCredits,
            config,
            isActive,
          },
        });

        // 如果提供了价格，更新价格
        if (prices !== undefined) {
          // 删除旧价格
          await tx.billingPrice.deleteMany({
            where: { billingRuleId: id },
          });

          // 创建新价格
          if (prices.length > 0) {
            await tx.billingPrice.createMany({
              data: prices.map((price: any) => ({
                billingRuleId: id,
                dimension: price.dimension,
                value: price.value,
                creditsPerUnit: price.creditsPerUnit,
                unitSize: price.unitSize || 1,
              })),
            });
          }
        }

        return updatedRule;
      });

      // 获取完整的规则（包含价格）
      const fullRule = await prisma.billingRule.findUnique({
        where: { id },
        include: {
          aiModel: true,
          prices: true,
        },
      });

      res.json({
        success: true,
        data: fullRule,
      });
    } catch (error: any) {
      console.error('Failed to update billing rule:', error);
      res.status(500).json({
        success: false,
        message: '更新计费规则失败',
        error: error.message,
      });
    }
  }

  /**
   * 删除计费规则
   */
  async deleteRule(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const rule = await prisma.billingRule.findUnique({
        where: { id },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: '计费规则不存在',
        });
      }

      // 删除规则（级联删除价格）
      await prisma.billingRule.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: '删除成功',
      });
    } catch (error: any) {
      console.error('Failed to delete billing rule:', error);
      res.status(500).json({
        success: false,
        message: '删除计费规则失败',
        error: error.message,
      });
    }
  }

  /**
   * 切换规则启用状态
   */
  async toggleRule(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const rule = await prisma.billingRule.findUnique({
        where: { id },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: '计费规则不存在',
        });
      }

      const updatedRule = await prisma.billingRule.update({
        where: { id },
        data: { isActive: !rule.isActive },
        include: {
          aiModel: true,
          prices: true,
        },
      });

      res.json({
        success: true,
        data: updatedRule,
      });
    } catch (error: any) {
      console.error('Failed to toggle billing rule:', error);
      res.status(500).json({
        success: false,
        message: '切换规则状态失败',
        error: error.message,
      });
    }
  }

  /**
   * 预估费用
   */
  async estimateCredits(req: Request, res: Response) {
    try {
      const params = req.body;
      const userId = (req as any).user?.id;
      
      console.log('[estimateCredits] 请求参数:', JSON.stringify({
        moduleType: params.moduleType,
        operationType: params.operationType,
        mode: params.mode,
      }));

      const credits = await billingService.estimateCredits(params);
      console.log('[estimateCredits] 计算结果:', credits);

      // 检查是否有免费使用权限
      let isFreeUsage = false;
      let freeUsageRemaining = 0;

      if (userId) {
        const permissionResult = await userLevelService.checkPermission({
          userId,
          aiModelId: params.aiModelId,
          nodeType: params.nodeType,
          moduleType: params.moduleType,
        });

        isFreeUsage = permissionResult.isFree || false;

        // 如果是免费，获取剩余次数
        if (isFreeUsage) {
          const userRole = await userLevelService.getEffectiveUserRole(userId);
          const permission = await userLevelService.getModelPermission({
            aiModelId: params.aiModelId,
            nodeType: params.nodeType,
            moduleType: params.moduleType,
            userRole,
          });

          if (permission?.freeDailyLimit) {
            const freeCheck = await userLevelService.checkFreeUsageLimit({
              userId,
              aiModelId: params.aiModelId,
              nodeType: params.nodeType,
              moduleType: params.moduleType,
              freeDailyLimit: permission.freeDailyLimit,
            });
            freeUsageRemaining = freeCheck.freeUsageRemaining;
          }
        }
      }

      res.json({
        success: true,
        data: {
          credits: isFreeUsage ? 0 : credits,
          isFreeUsage,
          freeUsageRemaining,
          originalCredits: credits,
          params,
        },
      });
    } catch (error: any) {
      console.error('Failed to estimate credits:', error);
      res.status(500).json({
        success: false,
        message: '预估费用失败',
        error: error.message,
      });
    }
  }

  /**
   * 获取所有 AI 模型（用于选择器）
   */
  async getModels(req: Request, res: Response) {
    try {
      const { type } = req.query;

      const where: any = { isActive: true };
      
      if (type) {
        where.type = type;
      }

      const models = await prisma.aIModel.findMany({
        where,
        select: {
          id: true,
          name: true,
          provider: true,
          type: true,
        },
        orderBy: [
          { type: 'asc' },
          { name: 'asc' },
        ],
      });

      res.json({
        success: true,
        data: models,
      });
    } catch (error: any) {
      console.error('Failed to get models:', error);
      res.status(500).json({
        success: false,
        message: '获取模型列表失败',
        error: error.message,
      });
    }
  }
}

export const billingController = new BillingController();
