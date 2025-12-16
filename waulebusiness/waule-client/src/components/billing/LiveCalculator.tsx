import { useState, useEffect } from 'react';
import { BillingRule, BillingType } from '../../types/billing';

interface Props {
  rule: BillingRule;
}

const LiveCalculator = ({ rule }: Props) => {
  const [params, setParams] = useState<any>({
    quantity: 1,
    duration: 10,
    resolution: '1080p',
    mode: 'standard',
    operationType: 'imagine',
    characterCount: 100,
  });
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    calculateCredits();
  }, [rule, params]);

  const calculateCredits = () => {
    let result = 0;

    switch (rule.billingType) {
      case BillingType.PER_REQUEST:
        result = rule.baseCredits;
        break;

      case BillingType.PER_IMAGE:
        result = rule.baseCredits * (params.quantity || 1);
        break;

      case BillingType.PER_DURATION:
        result = rule.baseCredits * (params.duration || 1);
        break;

      case BillingType.DURATION_RESOLUTION:
        const resPrice = rule.prices.find(
          (p) => p.dimension === 'resolution' && p.value.startsWith(params.resolution)
        );
        result = (params.duration || 1) * (resPrice?.creditsPerUnit || 0);
        break;

      case BillingType.DURATION_MODE:
        const modePrice = rule.prices.find(
          (p) => p.dimension === 'mode' && p.value === params.mode
        );
        const duration = rule.config?.roundUp ? Math.ceil(params.duration || 1) : (params.duration || 1);
        result = duration * (modePrice?.creditsPerUnit || 0);
        break;

      case BillingType.PER_CHARACTER:
        const charPrice = rule.prices[0];
        if (charPrice) {
          const units = Math.ceil((params.characterCount || 0) / (charPrice.unitSize || 100));
          result = units * charPrice.creditsPerUnit;
        }
        break;

      case BillingType.OPERATION_MODE:
        const opPrice = rule.prices.find(
          (p) => p.dimension === 'operationType' && p.value === params.operationType
        );
        const modeMultiplier = rule.prices.find(
          (p) => p.dimension === 'mode' && p.value === params.mode
        );
        result = (opPrice?.creditsPerUnit || 0) * (modeMultiplier?.creditsPerUnit || 1);
        break;
    }

    setCredits(Math.round(result));
  };

  const renderInputs = () => {
    switch (rule.billingType) {
      case BillingType.PER_REQUEST:
        return (
          <div className="text-sm text-slate-600 dark:text-gray-400">
            每次调用固定费用
          </div>
        );

      case BillingType.PER_IMAGE:
        return (
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 dark:text-gray-300">生成数量:</label>
            <input
              type="number"
              min="1"
              value={params.quantity}
              onChange={(e) => setParams({ ...params, quantity: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 dark:text-gray-400">张</span>
          </div>
        );

      case BillingType.PER_DURATION:
        return (
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 dark:text-gray-300">视频时长:</label>
            <input
              type="number"
              min="1"
              value={params.duration}
              onChange={(e) => setParams({ ...params, duration: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 dark:text-gray-400">秒</span>
          </div>
        );

      case BillingType.DURATION_RESOLUTION:
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">视频时长:</label>
              <input
                type="number"
                min="1"
                value={params.duration}
                onChange={(e) => setParams({ ...params, duration: parseInt(e.target.value) || 1 })}
                className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600 dark:text-gray-400">秒</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">分辨率:</label>
              <select
                value={params.resolution}
                onChange={(e) => setParams({ ...params, resolution: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4K">4K</option>
              </select>
            </div>
          </div>
        );

      case BillingType.DURATION_MODE:
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">视频时长:</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={params.duration}
                onChange={(e) => setParams({ ...params, duration: parseFloat(e.target.value) || 0 })}
                className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600 dark:text-gray-400">秒</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">编辑模式:</label>
              <select
                value={params.mode}
                onChange={(e) => setParams({ ...params, mode: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="standard">标准模式</option>
                <option value="professional">专业模式</option>
              </select>
            </div>
            {rule.config?.roundUp && (
              <p className="text-xs text-slate-500 dark:text-gray-400">
                实际计费: {Math.ceil(params.duration)} 秒（向上取整）
              </p>
            )}
          </div>
        );

      case BillingType.PER_CHARACTER:
        return (
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 dark:text-gray-300">字符数:</label>
            <input
              type="number"
              min="0"
              value={params.characterCount}
              onChange={(e) => setParams({ ...params, characterCount: parseInt(e.target.value) || 0 })}
              className="w-32 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 dark:text-gray-400">字符</span>
          </div>
        );

      case BillingType.OPERATION_MODE:
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">操作类型:</label>
              <select
                value={params.operationType}
                onChange={(e) => setParams({ ...params, operationType: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="imagine">生成图片</option>
                <option value="upscale">升分辨率</option>
                <option value="variation">变换</option>
                <option value="reroll">重新生成</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300 w-20">运行模式:</label>
              <select
                value={params.mode}
                onChange={(e) => setParams({ ...params, mode: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="relax">慢速模式</option>
                <option value="fast">快速模式</option>
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {renderInputs()}
      
      <div className="pt-4 border-t border-slate-200 dark:border-border-dark">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">预估费用:</span>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{credits} 积分</span>
        </div>
      </div>
    </div>
  );
};

export default LiveCalculator;
