import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  config: any;
  onChange: (prices: BillingPrice[], config: any) => void;
}

const ModePriceList = ({ prices, config, onChange }: Props) => {
  const defaultModes = [
    { value: 'std', label: '标准版 (Std)' },
    { value: 'pro', label: '专业版 (Pro)' },
  ];

  // 检查是否使用了旧的模式键值
  const hasLegacyStandard = prices.some(p => p.dimension === 'mode' && p.value === 'standard');
  const hasLegacyProfessional = prices.some(p => p.dimension === 'mode' && p.value === 'professional');

  const modes = [...defaultModes];
  if (hasLegacyStandard) modes.push({ value: 'standard', label: '标准模式 (旧)' });
  if (hasLegacyProfessional) modes.push({ value: 'professional', label: '专业模式 (旧)' });

  // 计费单位配置
  const pricingUnit = config?.pricingUnit || 'per_second'; // 'per_second' | 'per_request'

  const getPrice = (mode: string) => {
    const price = prices.find((p) => p.dimension === 'mode' && p.value === mode);
    return price?.creditsPerUnit || 0;
  };

  const setPrice = (mode: string, credits: number) => {
    const newPrices = prices.filter((p) => !(p.dimension === 'mode' && p.value === mode));
    
    if (credits > 0) {
      newPrices.push({
        dimension: 'mode',
        value: mode,
        creditsPerUnit: credits,
        unitSize: 1,
      });
    }

    onChange(newPrices, config);
  };

  const updateConfig = (field: string, value: any) => {
    onChange(prices, { ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* 计费方式设置 */}
      <div className="flex items-center gap-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-border-dark">
        <label className="flex items-center gap-2 cursor-pointer">
          <input 
            type="radio" 
            checked={pricingUnit === 'per_second'}
            onChange={() => updateConfig('pricingUnit', 'per_second')}
            className="text-blue-500 w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">按时长计费 (积分/秒)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input 
            type="radio" 
            checked={pricingUnit === 'per_request'}
            onChange={() => updateConfig('pricingUnit', 'per_request')}
            className="text-blue-500 w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">按次计费 (积分/次)</span>
        </label>
      </div>

      {/* 模式价格 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">
          {pricingUnit === 'per_second' ? '模式定价（每秒）' : '模式定价（每次）'}
        </h4>
        {modes.map((mode) => (
          <div key={mode.value} className="flex items-center gap-4 p-3 border border-slate-200 dark:border-border-dark rounded-lg">
            <label className="flex-1 text-sm text-slate-700 dark:text-gray-300">{mode.label}</label>
            <input
              type="number"
              min="0"
              value={getPrice(mode.value)}
              onChange={(e) => setPrice(mode.value, parseInt(e.target.value) || 0)}
              className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 dark:text-gray-400">
              {pricingUnit === 'per_second' ? '积分/秒' : '积分/次'}
            </span>
          </div>
        ))}
      </div>

      {/* 计费规则 (仅按时长时显示) */}
      {pricingUnit === 'per_second' && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">时长计费规则</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config?.roundUp !== false}
                onChange={(e) => updateConfig('roundUp', e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-gray-300">向上取整到整秒</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700 dark:text-gray-300">最小计费时长:</label>
              <input
                type="number"
                min="1"
                value={config?.minDuration || 1}
                onChange={(e) => updateConfig('minDuration', parseInt(e.target.value) || 1)}
                className="w-20 px-2 py-1 border border-slate-300 dark:border-border-dark rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600 dark:text-gray-400">秒</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModePriceList;
