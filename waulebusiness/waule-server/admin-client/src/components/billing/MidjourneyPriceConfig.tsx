import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  onChange: (prices: BillingPrice[]) => void;
}

const MidjourneyPriceConfig = ({ prices, onChange }: Props) => {
  const operations = [
    { value: 'imagine', label: '生成图片 (Imagine)' },
    { value: 'upscale', label: '升分辨率 (Upscale)' },
    { value: 'variation', label: '变换 (Variation)' },
    { value: 'reroll', label: '重新生成 (Reroll)' },
  ];

  const modes = [
    { value: 'relax', label: '慢速模式 (Relax)' },
    { value: 'fast', label: '快速模式 (Fast)' },
  ];

  const getOperationPrice = (operation: string) => {
    const price = prices.find((p) => p.dimension === 'operationType' && p.value === operation);
    return price?.creditsPerUnit || 0;
  };

  const getModeMultiplier = (mode: string) => {
    const price = prices.find((p) => p.dimension === 'mode' && p.value === mode);
    return price?.creditsPerUnit || 1;
  };

  const setOperationPrice = (operation: string, credits: number) => {
    const newPrices = prices.filter((p) => !(p.dimension === 'operationType' && p.value === operation));
    
    if (credits > 0) {
      newPrices.push({
        dimension: 'operationType',
        value: operation,
        creditsPerUnit: credits,
        unitSize: 1,
      });
    }

    onChange(newPrices);
  };

  const setModeMultiplier = (mode: string, multiplier: number) => {
    const newPrices = prices.filter((p) => !(p.dimension === 'mode' && p.value === mode));
    
    if (multiplier > 0) {
      newPrices.push({
        dimension: 'mode',
        value: mode,
        creditsPerUnit: multiplier,
        unitSize: 1,
      });
    }

    onChange(newPrices);
  };

  return (
    <div className="space-y-6">
      {/* 操作类型定价 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">操作类型定价（基础价格）</h4>
        {operations.map((op) => (
          <div key={op.value} className="flex items-center gap-4 p-3 border border-slate-200 dark:border-border-dark rounded-lg">
            <label className="flex-1 text-sm text-slate-700 dark:text-gray-300">{op.label}</label>
            <input
              type="number"
              min="0"
              value={getOperationPrice(op.value)}
              onChange={(e) => setOperationPrice(op.value, parseInt(e.target.value) || 0)}
              className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 dark:text-gray-400">积分</span>
          </div>
        ))}
      </div>

      {/* 模式倍率 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">模式倍率</h4>
        <p className="text-xs text-slate-500 dark:text-gray-400">
          最终费用 = 操作类型基础价格 × 模式倍率
        </p>
        {modes.map((mode) => (
          <div key={mode.value} className="flex items-center gap-4 p-3 border border-slate-200 dark:border-border-dark rounded-lg">
            <label className="flex-1 text-sm text-slate-700 dark:text-gray-300">{mode.label}</label>
            <span className="text-sm text-slate-600 dark:text-gray-400">×</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={getModeMultiplier(mode.value)}
              onChange={(e) => setModeMultiplier(mode.value, parseFloat(e.target.value) || 1)}
              className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      {/* 示例 */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">💡 计费示例</p>
        <ul className="text-xs text-blue-800 dark:text-blue-400 space-y-1">
          <li>• 生成图片（快速模式）= {getOperationPrice('imagine')} × {getModeMultiplier('fast')} = {getOperationPrice('imagine') * getModeMultiplier('fast')} 积分</li>
          <li>• 升分辨率（慢速模式）= {getOperationPrice('upscale')} × {getModeMultiplier('relax')} = {getOperationPrice('upscale') * getModeMultiplier('relax')} 积分</li>
        </ul>
      </div>
    </div>
  );
};

export default MidjourneyPriceConfig;
