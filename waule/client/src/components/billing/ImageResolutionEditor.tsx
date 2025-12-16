import { useState } from 'react';
import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  onChange: (prices: BillingPrice[]) => void;
  modelConfig?: any;
}

const ImageResolutionEditor = ({ prices, onChange, modelConfig }: Props) => {
  const [newRes, setNewRes] = useState('2K');
  const [newPrice, setNewPrice] = useState(10);

  // 过滤出分辨率价格
  const resolutionPrices = prices.filter(p => p.dimension === 'resolution');

  const handleAdd = () => {
    if (!newRes || newPrice < 0) return;
    
    // 检查是否已存在
    if (resolutionPrices.some(p => p.value === newRes)) {
      alert('该分辨率已存在');
      return;
    }

    const updated = [...prices, {
      dimension: 'resolution',
      value: newRes,
      creditsPerUnit: newPrice,
      unitSize: 1
    }];
    onChange(updated);
    // 重置为常用值建议
    setNewRes('4K');
  };

  const loadFromModel = () => {
    if (!modelConfig?.supportedResolutions?.length) return;
    
    const updated = [...prices];
    let addedCount = 0;
    
    modelConfig.supportedResolutions.forEach((res: string) => {
      // 检查是否已存在
      if (!updated.some(p => p.dimension === 'resolution' && p.value === res)) {
        updated.push({
          dimension: 'resolution',
          value: res,
          creditsPerUnit: 10, // 默认价格，用户后续修改
          unitSize: 1
        });
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      onChange(updated);
      alert(`已导入 ${addedCount} 个分辨率配置`);
    } else {
      alert('所有支持的分辨率已存在');
    }
  };

  const handleRemove = (value: string) => {
    onChange(prices.filter(p => !(p.dimension === 'resolution' && p.value === value)));
  };

  const handleUpdatePrice = (value: string, price: number) => {
    const updated = prices.map(p => {
      if (p.dimension === 'resolution' && p.value === value) {
        return { ...p, creditsPerUnit: price };
      }
      return p;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
          💡 分辨率阶梯计费：
        </h4>
        <ul className="text-sm text-blue-600 dark:text-blue-200 space-y-1">
          <li>• 支持格式：像素格式 (如 1024x1024) 或标签 (如 2K, 4K)。</li>
          <li>• 智能匹配：系统会优先精确匹配标签，否则按像素总数匹配最近的档位。</li>
        </ul>
      </div>

      {/* 添加新分辨率 */}
      <div className="flex items-end gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-border-dark">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
            分辨率标识
          </label>
          <input
            type="text"
            value={newRes}
            onChange={(e) => setNewRes(e.target.value)}
            placeholder="2K / 1024x1024"
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-border-dark rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
            单价 (积分)
          </label>
          <input
            type="number"
            min="0"
            value={newPrice}
            onChange={(e) => setNewPrice(parseInt(e.target.value) || 0)}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-border-dark rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
          />
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors h-[34px]"
        >
          添加
        </button>
        
        {modelConfig?.supportedResolutions?.length > 0 && (
          <button
            onClick={loadFromModel}
            className="px-4 py-1.5 text-sm bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors h-[34px] ml-auto"
            title="自动加载模型支持的所有分辨率"
          >
            从模型导入
          </button>
        )}
      </div>

      {/* 价格列表 */}
      <div className="border border-slate-200 dark:border-border-dark rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-gray-400 font-medium">
            <tr>
              <th className="px-4 py-3">分辨率</th>
              <th className="px-4 py-3">像素总数 (预估)</th>
              <th className="px-4 py-3">单价 (积分/张)</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-border-dark bg-white dark:bg-slate-900">
            {resolutionPrices.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  暂无配置，请添加分辨率
                </td>
              </tr>
            ) : (
              resolutionPrices.map((p) => {
                const [w, h] = p.value.split(/[x*]/).map(Number);
                const pixels = (w && h) ? (w * h / 10000).toFixed(1) + '万' : '-';
                
                return (
                  <tr key={p.value} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {p.value}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-400">
                      {pixels}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={p.creditsPerUnit}
                          onChange={(e) => handleUpdatePrice(p.value, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-slate-300 dark:border-border-dark rounded bg-white dark:bg-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(p.value)}
                        className="text-red-500 hover:text-red-600 transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ImageResolutionEditor;
