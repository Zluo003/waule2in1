import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  onChange: (prices: BillingPrice[]) => void;
}

const CharacterPriceConfig = ({ prices, onChange }: Props) => {
  const getPrice = () => prices[0] || { creditsPerUnit: 5, unitSize: 100 };

  const updatePrice = (field: 'creditsPerUnit' | 'unitSize', value: number) => {
    const current = getPrice();
    onChange([
      {
        dimension: 'character',
        value: 'default',
        creditsPerUnit: field === 'creditsPerUnit' ? value : current.creditsPerUnit,
        unitSize: field === 'unitSize' ? value : current.unitSize || 100,
      },
    ]);
  };

  const price = getPrice();

  return (
    <div className="space-y-4">
      <div className="p-4 border border-slate-200 dark:border-border-dark rounded-lg space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-700 dark:text-gray-300">每</label>
          <input
            type="number"
            min="1"
            value={price.unitSize || 100}
            onChange={(e) => updatePrice('unitSize', parseInt(e.target.value) || 100)}
            className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="text-sm text-slate-700 dark:text-gray-300">字符收费</label>
          <input
            type="number"
            min="0"
            value={price.creditsPerUnit}
            onChange={(e) => updatePrice('creditsPerUnit', parseInt(e.target.value) || 0)}
            className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600 dark:text-gray-400">积分</span>
        </div>

        <div className="text-xs text-slate-500 dark:text-gray-400 space-y-1">
          <p>💡 计费规则：不足{price.unitSize || 100}字符按{price.unitSize || 100}字符计算</p>
          <p className="mt-2">示例：</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>50个字符 → {price.unitSize || 100}字符 → {price.creditsPerUnit}积分</li>
            <li>150个字符 → {(price.unitSize || 100) * 2}字符 → {price.creditsPerUnit * 2}积分</li>
            <li>1000个字符 → 1000字符 → {price.creditsPerUnit * Math.ceil(1000 / (price.unitSize || 100))}积分</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CharacterPriceConfig;
