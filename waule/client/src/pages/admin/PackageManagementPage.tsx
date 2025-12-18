import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

type PackageType = 'RECHARGE' | 'CREDITS';

interface CreditPackage {
  id: string;
  type: PackageType;
  name: string;
  description: string | null;
  price: number;
  credits: number;
  bonusCredits: number;
  memberLevel: string | null;
  memberDays: number | null;
  coverImage: string | null;
  badge: string | null;
  badgeColor: string | null;
  sortOrder: number;
  isActive: boolean;
  isRecommend: boolean;
  createdAt: string;
  updatedAt: string;
}

const packageTypeLabels: Record<PackageType, { label: string; icon: string }> = {
  RECHARGE: { label: '会员充值', icon: 'workspace_premium' },
  CREDITS: { label: '积分购买', icon: 'diamond' },
};

const memberLevelLabels: Record<string, string> = {
  USER: '普通用户',
  VIP: 'VIP会员',
  SVIP: 'SVIP会员',
};

const badgeColors = [
  { value: '#ef4444', label: '红色' },
  { value: '#f97316', label: '橙色' },
  { value: '#eab308', label: '黄色' },
  { value: '#22c55e', label: '绿色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#8b5cf6', label: '紫色' },
  { value: '#404040', label: '粉色' },
];

const PackageManagementPage = () => {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<PackageType | ''>('');
  const [editingPackage, setEditingPackage] = useState<Partial<CreditPackage> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.payment.admin.getPackages();
      setPackages(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '加载套餐失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredPackages = filterType 
    ? packages.filter(p => p.type === filterType)
    : packages;

  const handleCreate = (type: PackageType = 'RECHARGE') => {
    setEditingPackage({
      type,
      name: '',
      description: '',
      price: 0,
      credits: 0,
      bonusCredits: 0,
      memberLevel: null,
      memberDays: null,
      coverImage: null,
      badge: null,
      badgeColor: null,
      sortOrder: packages.length,
      isActive: true,
      isRecommend: false,
    });
  };

  const handleEdit = (pkg: CreditPackage) => {
    setEditingPackage({ ...pkg });
  };

  const handleSave = async () => {
    if (!editingPackage) return;

    if (!editingPackage.name || !editingPackage.price || !editingPackage.credits) {
      toast.error('请填写套餐名称、价格和积分');
      return;
    }

    try {
      setSaving(true);
      if (editingPackage.id) {
        await apiClient.payment.admin.updatePackage(editingPackage.id, editingPackage);
      } else {
        await apiClient.payment.admin.createPackage({
          type: editingPackage.type || 'RECHARGE',
          name: editingPackage.name,
          description: editingPackage.description || undefined,
          price: editingPackage.price,
          credits: editingPackage.credits,
          bonusCredits: editingPackage.bonusCredits,
          memberLevel: editingPackage.type === 'CREDITS' ? undefined : (editingPackage.memberLevel || undefined),
          memberDays: editingPackage.type === 'CREDITS' ? undefined : (editingPackage.memberDays || undefined),
          coverImage: editingPackage.coverImage || undefined,
          badge: editingPackage.badge || undefined,
          badgeColor: editingPackage.badgeColor || undefined,
          sortOrder: editingPackage.sortOrder,
          isActive: editingPackage.isActive,
          isRecommend: editingPackage.isRecommend,
        });
      }
      toast.success('保存成功');
      setEditingPackage(null);
      loadPackages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此套餐吗？')) return;

    try {
      await apiClient.payment.admin.deletePackage(id);
      toast.success('删除成功');
      loadPackages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleToggle = async (pkg: CreditPackage) => {
    try {
      await apiClient.payment.admin.updatePackage(pkg.id, {
        isActive: !pkg.isActive,
      });
      loadPackages();
    } catch (error: any) {
      toast.error('切换状态失败');
    }
  };

  const formatPrice = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
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
            套餐管理
          </h1>
          <p className="text-slate-600 dark:text-gray-400">
            管理会员充值和积分购买套餐
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleCreate('RECHARGE')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-xl">workspace_premium</span>
            新建会员套餐
          </button>
          <button
            onClick={() => handleCreate('CREDITS')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-xl">diamond</span>
            新建积分套餐
          </button>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-slate-600 dark:text-gray-400">筛选:</span>
        {[
          { value: '', label: '全部' },
          { value: 'RECHARGE', label: '会员充值' },
          { value: 'CREDITS', label: '积分购买' },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setFilterType(item.value as PackageType | '')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filterType === item.value
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 套餐列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPackages.map((pkg) => (
          <div
            key={pkg.id}
            className={`relative bg-white dark:bg-card-dark border rounded-2xl overflow-hidden transition-all ${
              pkg.isActive
                ? 'border-slate-200 dark:border-border-dark'
                : 'border-slate-200 dark:border-border-dark opacity-60'
            } ${pkg.isRecommend ? 'ring-2 ring-blue-500' : ''}`}
          >
            {/* 类型标签 */}
            <div className={`absolute top-3 left-3 px-2 py-1 text-xs font-medium text-white rounded flex items-center gap-1 ${
              pkg.type === 'CREDITS' ? 'bg-amber-500' : 'bg-blue-500'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {packageTypeLabels[pkg.type]?.icon || 'redeem'}
              </span>
              {packageTypeLabels[pkg.type]?.label || '套餐'}
            </div>

            {/* 角标 */}
            {pkg.badge && (
              <div
                className="absolute top-3 right-3 px-2 py-1 text-xs font-medium text-white rounded"
                style={{ backgroundColor: pkg.badgeColor || '#3b82f6' }}
              >
                {pkg.badge}
              </div>
            )}

            {/* 封面 */}
            <div className="h-32 bg-gradient-to-br from-blue-500 to-neutral-600 flex items-center justify-center">
              {pkg.coverImage ? (
                <img
                  src={pkg.coverImage}
                  alt={pkg.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-6xl text-white/30">
                  diamond
                </span>
              )}
            </div>

            {/* 内容 */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {pkg.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    pkg.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {pkg.isActive ? '上架中' : '已下架'}
                </span>
              </div>

              {pkg.description && (
                <p className="text-sm text-slate-500 dark:text-gray-400 mb-3 line-clamp-2">
                  {pkg.description}
                </p>
              )}

              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatPrice(pkg.price)}
                </span>
                <span className="text-slate-500 dark:text-gray-400">
                  / {pkg.credits + pkg.bonusCredits} 积分
                </span>
              </div>

              {pkg.bonusCredits > 0 && (
                <div className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                  赠送 {pkg.bonusCredits} 积分
                </div>
              )}

              {pkg.memberLevel && (
                <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                  升级为 {memberLevelLabels[pkg.memberLevel]}
                  {pkg.memberDays && ` (${pkg.memberDays}天)`}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-border-dark">
                <button
                  onClick={() => handleEdit(pkg)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">edit</span>
                  编辑
                </button>
                <button
                  onClick={() => handleToggle(pkg)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">
                    {pkg.isActive ? 'visibility_off' : 'visibility'}
                  </span>
                  {pkg.isActive ? '下架' : '上架'}
                </button>
                <button
                  onClick={() => handleDelete(pkg.id)}
                  className="flex items-center justify-center p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {packages.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            暂无套餐，点击上方按钮创建
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editingPackage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6 border-b border-slate-200 dark:border-border-dark">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-sm font-medium text-white flex items-center gap-1 ${
                  editingPackage.type === 'CREDITS' ? 'bg-amber-500' : 'bg-blue-500'
                }`}>
                  <span className="material-symbols-outlined text-sm">
                    {editingPackage.type === 'CREDITS' ? 'diamond' : 'workspace_premium'}
                  </span>
                  {editingPackage.type === 'CREDITS' ? '积分购买' : '会员充值'}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {editingPackage.id ? '编辑套餐' : '新建套餐'}
                </h2>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    套餐名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingPackage.name || ''}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, name: e.target.value })
                    }
                    placeholder="如：入门包、超值包"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    排序
                  </label>
                  <input
                    type="number"
                    value={editingPackage.sortOrder || 0}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, sortOrder: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  套餐简介
                </label>
                <textarea
                  value={editingPackage.description || ''}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, description: e.target.value })
                  }
                  placeholder="套餐描述..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* 价格与积分 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    价格（分） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={editingPackage.price || 0}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, price: Number(e.target.value) })
                    }
                    placeholder="1000 = ¥10"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    = ¥{((editingPackage.price || 0) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    积分数量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={editingPackage.credits || 0}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, credits: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    赠送积分
                  </label>
                  <input
                    type="number"
                    value={editingPackage.bonusCredits || 0}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, bonusCredits: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 会员相关（仅会员充值类型显示） */}
              {editingPackage.type !== 'CREDITS' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    升级会员等级
                  </label>
                  <select
                    value={editingPackage.memberLevel || ''}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, memberLevel: e.target.value || null })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">不升级</option>
                    <option value="VIP">VIP会员</option>
                    <option value="SVIP">SVIP会员</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    会员天数
                  </label>
                  <input
                    type="number"
                    value={editingPackage.memberDays || ''}
                    onChange={(e) =>
                      setEditingPackage({
                        ...editingPackage,
                        memberDays: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="留空为永久"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              )}

              {/* 展示相关 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  封面图片
                </label>
                <div className="flex gap-4">
                  {/* 预览区域 */}
                  <div
                    onClick={() => coverInputRef.current?.click()}
                    className={`relative w-40 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                      editingPackage.coverImage
                        ? 'border-blue-400'
                        : 'border-slate-300 dark:border-border-dark hover:border-blue-400'
                    }`}
                  >
                    {editingPackage.coverImage ? (
                      <img
                        src={editingPackage.coverImage}
                        alt="封面预览"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                        <span className="text-xs mt-1">上传封面</span>
                      </div>
                    )}
                    {uploadingCover && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="material-symbols-outlined text-white animate-spin">progress_activity</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // 验证文件类型
                      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                        toast.error('仅支持 JPG、PNG、WebP 格式');
                        return;
                      }
                      
                      // 验证文件大小 (2MB)
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error('图片大小不能超过 2MB');
                        return;
                      }
                      
                      try {
                        setUploadingCover(true);
                        const result = await apiClient.assets.upload(file, { type: 'package-cover' });
                        setEditingPackage({ ...editingPackage, coverImage: result.data?.url || result.url });
                        toast.success('封面上传成功');
                      } catch (error: any) {
                        toast.error(error.response?.data?.message || '上传失败');
                      } finally {
                        setUploadingCover(false);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">
                      <span className="font-medium">最佳尺寸：</span>800 × 480 像素（5:3 比例）
                    </p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">
                      <span className="font-medium">格式：</span>JPG、PNG、WebP
                    </p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      <span className="font-medium">大小：</span>不超过 2MB
                    </p>
                    {editingPackage.coverImage && (
                      <button
                        onClick={() => setEditingPackage({ ...editingPackage, coverImage: null })}
                        className="mt-2 text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        移除封面
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    角标文字
                  </label>
                  <input
                    type="text"
                    value={editingPackage.badge || ''}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, badge: e.target.value || null })
                    }
                    placeholder="如：热销、超值、限时"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    角标颜色
                  </label>
                  <div className="flex items-center gap-2">
                    {badgeColors.map((color) => (
                      <button
                        key={color.value}
                        onClick={() =>
                          setEditingPackage({ ...editingPackage, badgeColor: color.value })
                        }
                        className={`w-6 h-6 rounded-full transition-transform ${
                          editingPackage.badgeColor === color.value
                            ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                            : ''
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 状态 */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPackage.isActive ?? true}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, isActive: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-gray-300">上架</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPackage.isRecommend ?? false}
                    onChange={(e) =>
                      setEditingPackage({ ...editingPackage, isRecommend: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-gray-300">推荐（高亮显示）</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-border-dark flex justify-end gap-3">
              <button
                onClick={() => setEditingPackage(null)}
                className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackageManagementPage;
