import { useState, useEffect } from 'react';
import { BillingPrice } from '../../types/billing';

interface Props {
  prices: BillingPrice[];
  onChange: (prices: BillingPrice[]) => void;
  modelConfig?: any;
}

const PriceMatrixEditor = ({ prices, onChange, modelConfig }: Props) => {
  const [resolutions, setResolutions] = useState<string[]>(['720p', '1080p', '4K']);
  // 从现有价格中提取时长，或者使用默认值
  const [durations, setDurations] = useState<number[]>(() => {
    const existingDurations = new Set<number>();
    prices.forEach(p => {
      if (p.dimension === 'resolution' && p.value.includes('_')) {
        const d = parseInt(p.value.split('_')[1]);
        if (!isNaN(d)) existingDurations.add(d);
      }
    });
    
    const defaultDurations = [3, 5, 6, 8, 10];
    if (existingDurations.size > 0) {
      return Array.from(existingDurations).sort((a, b) => a - b);
    }
    return defaultDurations;
  });

  // 监听模型配置变化，自动应用模型支持的分辨率和时长
  useEffect(() => {
    if (modelConfig) {
      let hasAutoConfig = false;

      if (modelConfig.supportedResolutions?.length > 0) {
        setResolutions(modelConfig.supportedResolutions);
        hasAutoConfig = true;
      }

      if (modelConfig.supportedDurations?.length > 0) {
        setDurations(modelConfig.supportedDurations.sort((a: number, b: number) => a - b));
        hasAutoConfig = true;
      }
      
      if (hasAutoConfig) {
        console.log('已自动应用模型配置:', modelConfig);
      }
    }
  }, [modelConfig]);
  
  const [newDuration, setNewDuration] = useState<string>('');

  const getPrice = (resolution: string, duration: number) => {
    const price = prices.find(
      (p) =>
        p.dimension === 'resolution' &&
        p.value === `${resolution}_${duration}`
    );
    return price?.creditsPerUnit || 0;
  };

  const setPrice = (resolution: string, duration: number, credits: number) => {
    const newPrices = prices.filter(
      (p) => !(p.dimension === 'resolution' && p.value === `${resolution}_${duration}`)
    );

    if (credits > 0) {
      newPrices.push({
        dimension: 'resolution',
        value: `${resolution}_${duration}`,
        creditsPerUnit: credits, // 这里存的是总价
        unitSize: 1,
      });
    }

    onChange(newPrices);
  };

  const addDuration = () => {
    const d = parseInt(newDuration);
    if (d > 0 && !durations.includes(d)) {
      const newDurations = [...durations, d].sort((a, b) => a - b);
      setDurations(newDurations);
      setNewDuration('');
    }
  };

  const removeDuration = (duration: number) => {
    setDurations(durations.filter(d => d !== duration));
    // 清理该时长的所有价格配置
    const newPrices = prices.filter(p => {
      if (p.dimension === 'resolution' && p.value.includes('_')) {
        const d = parseInt(p.value.split('_')[1]);
        return d !== duration;
      }
      return true;
    });
    onChange(newPrices);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 <strong>阶梯计费模式</strong>：配置特定时长的固定价格（总价）。
          <br />
          • 系统会自动匹配最接近的时长档位（向上取整）。
          <br />
          • 例如：配置了5秒和10秒，请求6秒时会自动匹配到10秒的价格。
        </p>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          min="1"
          value={newDuration}
          onChange={(e) => setNewDuration(e.target.value)}
          placeholder="新增时长(秒)"
          className="px-3 py-1.5 text-sm border border-slate-300 dark:border-border-dark rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
        />
        <button
          onClick={addDuration}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          添加时长列
        </button>
      </div>

      <div className="border border-slate-200 dark:border-border-dark rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-gray-400 font-medium">
            <tr>
              <th className="px-4 py-3 border-b border-r border-slate-200 dark:border-border-dark bg-slate-100 dark:bg-slate-800/50">
                分辨率 \ 时长
              </th>
              {durations.map((duration) => (
                <th
                  key={duration}
                  className="px-4 py-3 text-center border-b border-slate-200 dark:border-border-dark min-w-[100px] relative group"
                >
                  {duration}秒
                  <button
                    onClick={() => removeDuration(duration)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="删除此时长列"
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-border-dark bg-white dark:bg-slate-900">
            {resolutions.map((res) => (
              <tr key={res} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white border-r border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-800/30">
                  {res}
                </td>
                {durations.map((duration) => (
                  <td key={`${res}_${duration}`} className="px-2 py-2 text-center border-r border-slate-200 dark:border-border-dark last:border-r-0">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={getPrice(res, duration)}
                        onChange={(e) => setPrice(res, duration, parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-center border border-slate-300 dark:border-border-dark rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="text-xs text-slate-400 dark:text-gray-500">
        * 支持阶梯定价：请在对应的时长/分辨率单元格中填入该档位的<strong>总积分</strong>。
      </div>
    </div>
  );
};

export default PriceMatrixEditor;
