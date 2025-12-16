import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

interface RedeemCode {
  id: string;
  code: string;
  credits: number;
  memberLevel: string | null;
  memberDays: number | null;
  isUsed: boolean;
  usedAt: string | null;
  usedBy: { id: string; nickname: string; phone: string } | null;
  expireAt: string | null;
  remark: string | null;
  batchId: string | null;
  createdAt: string;
  createdBy: { id: string; nickname: string } | null;
}

interface Batch {
  batchId: string;
  credits: number;
  memberLevel: string | null;
  memberDays: number | null;
  remark: string | null;
  total: number;
  used: number;
  unused: number;
  createdAt: string;
}

const memberLevelLabels: Record<string, string> = {
  VIP: 'VIP会员',
  SVIP: 'SVIP会员',
};

const RedeemCodePage = () => {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'codes' | 'batches'>('codes');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filter, setFilter] = useState({ status: '', batchId: '' });

  // 生成表单
  const [generateForm, setGenerateForm] = useState({
    count: 10,
    credits: 100,
    memberLevel: '',
    memberDays: 0,
    expireAt: '',
    remark: '',
  });

  // 生成结果
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (activeTab === 'codes') {
      loadCodes();
    } else {
      loadBatches();
    }
  }, [activeTab, pagination.page, filter]);

  const loadCodes = async () => {
    try {
      setLoading(true);
      const response = await apiClient.redeem.admin.getCodes({
        page: pagination.page,
        pageSize: pagination.pageSize,
        status: filter.status || undefined,
        batchId: filter.batchId || undefined,
      });
      setCodes(response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
      }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBatches = async () => {
    try {
      setLoading(true);
      const response = await apiClient.redeem.admin.getBatches();
      setBatches(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (generateForm.credits <= 0) {
      toast.error('积分数量必须大于0');
      return;
    }
    if (generateForm.count < 1 || generateForm.count > 100) {
      toast.error('生成数量必须在1-100之间');
      return;
    }

    try {
      setGenerating(true);
      const response = await apiClient.redeem.admin.generate({
        count: generateForm.count,
        credits: generateForm.credits,
        memberLevel: generateForm.memberLevel || undefined,
        memberDays: generateForm.memberDays || undefined,
        expireAt: generateForm.expireAt || undefined,
        remark: generateForm.remark || undefined,
      });
      
      const codes = response.data?.data?.codes || [];
      
      // 复制到剪贴板
      if (codes.length > 0) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(codes.join('\n'));
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = codes.join('\n');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          }
          toast.success(`生成成功！${codes.length} 个兑换码已复制到剪贴板`);
        } catch (e) {
          toast.success(`生成成功！${codes.length} 个兑换码`);
        }
      } else {
        toast.success(response.data?.message || '生成成功');
      }
      
      // 关闭弹窗并刷新列表
      setShowGenerateModal(false);
      setGeneratedCodes([]);
      loadCodes();
      loadBatches();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteCode = async (id: string) => {
    if (!confirm('确定删除此兑换码？')) return;
    try {
      await apiClient.redeem.admin.deleteCode(id);
      toast.success('删除成功');
      loadCodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('确定删除此批次所有未使用的兑换码？')) return;
    try {
      const response = await apiClient.redeem.admin.deleteBatch(batchId);
      toast.success(response.data?.deletedCount ? `成功删除 ${response.data.deletedCount} 个兑换码` : '删除成功');
      loadBatches();
      loadCodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 兼容非 HTTPS 环境
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success('已复制到剪贴板');
    } catch (e) {
      toast.error('复制失败');
    }
  };

  const copyAllCodes = async () => {
    await copyToClipboard(generatedCodes.join('\n'));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  if (loading && codes.length === 0 && batches.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            兑换码管理
          </h1>
          <p className="text-slate-600 dark:text-gray-400">
            生成和管理积分兑换码
          </p>
        </div>
        <button
          onClick={() => {
            setGeneratedCodes([]);
            setShowGenerateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add</span>
          生成兑换码
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-border-dark">
        <button
          onClick={() => setActiveTab('codes')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'codes'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400'
          }`}
        >
          兑换码列表
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'batches'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400'
          }`}
        >
          批次管理
        </button>
      </div>

      {activeTab === 'codes' && (
        <>
          {/* 筛选 */}
          <div className="flex gap-4 mb-4">
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">全部状态</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
            </select>
          </div>

          {/* 兑换码列表 */}
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">兑换码</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">积分</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">会员等级</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">使用者</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">备注</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">创建时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-border-dark">
                {codes.map((code) => (
                  <tr key={code.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {code.code}
                        </code>
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-base">content_copy</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-medium">
                      +{code.credits}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-400">
                      {code.memberLevel ? memberLevelLabels[code.memberLevel] || code.memberLevel : '-'}
                      {code.memberDays ? ` (${code.memberDays}天)` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          code.isUsed
                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        }`}
                      >
                        {code.isUsed ? '已使用' : '未使用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-400 text-sm">
                      {code.usedBy ? (
                        <span>{code.usedBy.nickname || code.usedBy.phone}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-500 text-sm">
                      {code.remark || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-gray-500 text-sm">
                      {formatDate(code.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {!code.isUsed && (
                        <button
                          onClick={() => handleDeleteCode(code.id)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      暂无兑换码
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination.total > pagination.pageSize && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                上一页
              </button>
              <span className="px-3 py-1">
                {pagination.page} / {Math.ceil(pagination.total / pagination.pageSize)}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'batches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((batch) => (
            <div
              key={batch.batchId}
              className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-slate-400 font-mono">
                  {batch.batchId?.substring(0, 20)}...
                </div>
                {batch.unused > 0 && (
                  <button
                    onClick={() => handleDeleteBatch(batch.batchId)}
                    className="text-red-500 hover:text-red-600"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className="text-2xl font-bold text-amber-500">+{batch.credits}</div>
                {batch.memberLevel && (
                  <span className="px-2 py-1 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                    {memberLevelLabels[batch.memberLevel] || batch.memberLevel}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                  <div className="text-lg font-bold text-slate-900 dark:text-white">{batch.total}</div>
                  <div className="text-xs text-slate-500">总数</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                  <div className="text-lg font-bold text-green-600">{batch.unused}</div>
                  <div className="text-xs text-slate-500">可用</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <div className="text-lg font-bold text-gray-500">{batch.used}</div>
                  <div className="text-xs text-slate-500">已用</div>
                </div>
              </div>

              {batch.remark && (
                <div className="text-sm text-slate-500 mb-2">
                  备注：{batch.remark}
                </div>
              )}

              <div className="text-xs text-slate-400">
                创建于 {formatDate(batch.createdAt)}
              </div>
            </div>
          ))}

          {batches.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">
              暂无批次记录
            </div>
          )}
        </div>
      )}

      {/* 生成兑换码弹窗 */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6 border-b border-slate-200 dark:border-border-dark">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                生成兑换码
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {generatedCodes.length === 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        生成数量 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={generateForm.count}
                        onChange={(e) => setGenerateForm({ ...generateForm, count: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">最多100个</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        积分数量 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={generateForm.credits}
                        onChange={(e) => setGenerateForm({ ...generateForm, credits: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        会员等级（可选）
                      </label>
                      <select
                        value={generateForm.memberLevel}
                        onChange={(e) => setGenerateForm({ ...generateForm, memberLevel: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">不设置</option>
                        <option value="VIP">VIP会员</option>
                        <option value="SVIP">SVIP会员</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">向上原则：不会降低用户等级</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        会员天数（可选）
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={generateForm.memberDays}
                        onChange={(e) => setGenerateForm({ ...generateForm, memberDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                      过期时间（可选）
                    </label>
                    <input
                      type="datetime-local"
                      value={generateForm.expireAt}
                      onChange={(e) => setGenerateForm({ ...generateForm, expireAt: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                      备注（可选）
                    </label>
                    <input
                      type="text"
                      value={generateForm.remark}
                      onChange={(e) => setGenerateForm({ ...generateForm, remark: e.target.value })}
                      placeholder="如：活动名称"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-slate-900 dark:text-white">
                      已生成 {generatedCodes.length} 个兑换码
                    </h3>
                    <button
                      onClick={copyAllCodes}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <span className="material-symbols-outlined text-base">content_copy</span>
                      复制全部
                    </button>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto">
                    {generatedCodes.map((code, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-border-dark last:border-0"
                      >
                        <code className="font-mono text-sm">{code}</code>
                        <button
                          onClick={() => copyToClipboard(code)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-base">content_copy</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-border-dark flex justify-end gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                关闭
              </button>
              {generatedCodes.length === 0 && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {generating ? '生成中...' : '生成'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RedeemCodePage;
