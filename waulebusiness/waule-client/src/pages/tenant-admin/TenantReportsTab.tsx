import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

interface StaffReportItem {
  userId: string;
  username: string;
  nickname: string;
  isAdmin: boolean;
  creditsUsed: number;
  totalTasks: number;
  successTasks: number;
  failedTasks: number;
  successRate: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  efficiency: number;
}

interface ReportSummary {
  totalCreditsUsed: number;
  totalTasks: number;
  totalSuccessTasks: number;
  totalImages: number;
  totalVideos: number;
  avgSuccessRate: number;
}

interface ReportData {
  report: StaffReportItem[];
  summary: ReportSummary;
  dateRange: {
    start: string;
    end: string;
  };
}

const TenantReportsTab = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  
  // 日期范围（默认最近30天）
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/reports/staff', {
        params: { startDate, endDate },
      });
      setData(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取报表失败');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // 快捷日期选择
  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* 日期筛选 */}
      <div className="bg-white/5 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">日期范围:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-gray-400">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setQuickRange(7)}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
            >
              近7天
            </button>
            <button
              onClick={() => setQuickRange(30)}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
            >
              近30天
            </button>
            <button
              onClick={() => setQuickRange(90)}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
            >
              近90天
            </button>
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            刷新
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-amber-500">toll</span>
              <span className="text-xs text-gray-400">总积分消耗</span>
            </div>
            <p className="text-2xl font-bold text-amber-500">{data.summary.totalCreditsUsed.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-blue-500">task</span>
              <span className="text-xs text-gray-400">总任务数</span>
            </div>
            <p className="text-2xl font-bold text-blue-500">{data.summary.totalTasks.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
              <span className="text-xs text-gray-400">成功任务</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{data.summary.totalSuccessTasks.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-purple-500">image</span>
              <span className="text-xs text-gray-400">图片产出</span>
            </div>
            <p className="text-2xl font-bold text-purple-500">{data.summary.totalImages.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-pink-500">movie</span>
              <span className="text-xs text-gray-400">视频产出</span>
            </div>
            <p className="text-2xl font-bold text-pink-500">{data.summary.totalVideos.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-cyan-500">percent</span>
              <span className="text-xs text-gray-400">平均成功率</span>
            </div>
            <p className="text-2xl font-bold text-cyan-500">{data.summary.avgSuccessRate}%</p>
          </div>
        </div>
      )}

      {/* 员工报表 */}
      <div className="bg-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <span className="material-symbols-outlined">group</span>
            员工效率排行
          </h3>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined animate-spin text-4xl text-purple-500">progress_activity</span>
          </div>
        ) : data?.report.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
            <p>暂无数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-white/10">
                  <th className="px-4 py-3 font-medium">排名</th>
                  <th className="px-4 py-3 font-medium">员工</th>
                  <th className="px-4 py-3 font-medium text-right">积分消耗</th>
                  <th className="px-4 py-3 font-medium text-right">任务数</th>
                  <th className="px-4 py-3 font-medium text-right">成功率</th>
                  <th className="px-4 py-3 font-medium text-right">图片</th>
                  <th className="px-4 py-3 font-medium text-right">视频</th>
                  <th className="px-4 py-3 font-medium text-right">效率</th>
                </tr>
              </thead>
              <tbody>
                {data?.report.map((item, index) => (
                  <tr key={item.userId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        index === 0 ? 'bg-amber-500 text-white' :
                        index === 1 ? 'bg-gray-400 text-white' :
                        index === 2 ? 'bg-amber-700 text-white' :
                        'bg-white/10 text-gray-400'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {(item.nickname || item.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{item.nickname || item.username}</p>
                          {item.isAdmin && (
                            <span className="text-xs text-purple-400">管理员</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-amber-500 font-medium">{item.creditsUsed.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      {item.totalTasks}
                      {item.failedTasks > 0 && (
                        <span className="text-red-400 text-xs ml-1">({item.failedTasks}失败)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${
                        item.successRate >= 90 ? 'text-green-500' :
                        item.successRate >= 70 ? 'text-yellow-500' :
                        'text-red-500'
                      }`}>
                        {item.successRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-purple-400">{item.imageCount}</td>
                    <td className="px-4 py-3 text-right text-pink-400">{item.videoCount}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-cyan-400" title="每消耗1积分的成功任务数">
                        {item.efficiency.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantReportsTab;
