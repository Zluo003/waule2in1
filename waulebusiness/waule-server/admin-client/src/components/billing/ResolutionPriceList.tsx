import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  onChange: (prices: BillingPrice[]) => void;
}

const ResolutionPriceList = ({ prices, onChange }: Props) => {
  const resolutions = ['720p', '1080p', '2K', '4K'];

  const getPrice = (resolution: string) => {
    const price = prices.find((p) => p.dimension === 'resolution' && p.value === resolution);
    return price?.creditsPerUnit || 0;
  };

  const setPrice = (resolution: string, credits: number) => {
    const newPrices = prices.filter((p) => !(p.dimension === 'resolution' && p.value === resolution));
    
    if (credits > 0) {
      newPrices.push({
        dimension: 'resolution',
        value: resolution,
        creditsPerUnit: credits,
        unitSize: 1,
      });
    }

    onChange(newPrices);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">分辨率定价（每秒价格）</h4>
      {resolutions.map((resolution) => (
        <div key={resolution} className="flex items-center gap-4 p-3 border border-slate-200 dark:border-border-dark rounded-lg">
          <label className="flex-1 text-sm text-slate-700 dark:text-gray-300">{resolution}</label>
          <input
            type="number"
            min="0"
            value={getPrice(resolution)}
            onChange={(e) => setPrice(resolution, parseInt(e.target.value) || 0)}
            className="w-24 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600 dark:text-gray-400">积分/秒</span>
        </div>
      ))}
      <p className="text-xs text-slate-500 dark:text-gray-400">
        💡 说明：根据用户选择的输出分辨率计费
      </p>
    </div>
  );
};

export default ResolutionPriceList;
