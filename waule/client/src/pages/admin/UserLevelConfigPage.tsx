import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

interface LevelConfig {
  id: string | null;
  userRole: 'USER' | 'VIP' | 'SVIP';
  dailyGiftCredits: number;
  giftDays: number;
  giftDescription: string | null;
  maxConcurrency: number;
  storageRetentionDays: number;
  isActive: boolean;
}

interface ModelPermission {
  id: string;
  aiModelId: string | null;
  nodeType: string | null;
  moduleType: string | null;
  userRole: 'USER' | 'VIP' | 'SVIP';
  isAllowed: boolean;
  dailyLimit: number;
  isFreeForMember: boolean;
  freeDailyLimit: number;
  isActive: boolean;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  type: string;
  permissions: ModelPermission[];
}

interface PermissionsSummary {
  models: AIModel[];
  nodeTypes: { nodeType: string; permissions: ModelPermission[] }[];
  moduleTypes: { moduleType: string; permissions: ModelPermission[] }[];
}

const ROLE_LABELS: Record<string, string> = {
  USER: '普通用户',
  VIP: 'VIP会员',
  SVIP: 'SVIP会员',
};

const ROLE_COLORS: Record<string, string> = {
  USER: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
  VIP: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
  SVIP: 'bg-neutral-100 dark:bg-neutral-900/30 text-neutral-800 dark:text-neutral-200',
};

const UserLevelConfigPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'levels' | 'permissions'>('levels');

  // 等级配置
  const [levelConfigs, setLevelConfigs] = useState<LevelConfig[]>([]);

  // 权限配置
  const [permissionsSummary, setPermissionsSummary] = useState<PermissionsSummary | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Record<string, Partial<ModelPermission>>>({});

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configsRes, permissionsRes] = await Promise.all([
        apiClient.admin.userLevels.getConfigs(),
        apiClient.admin.userLevels.getPermissionsSummary(),
      ]);

      if (configsRes.success) {
        setLevelConfigs(configsRes.data);
      }

      if (permissionsRes.success) {
        setPermissionsSummary(permissionsRes.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 保存等级配置
  const saveLevelConfigs = async () => {
    setSaving(true);
    try {
      const res = await apiClient.admin.userLevels.batchUpdateConfigs(
        levelConfigs.map(c => ({
          ...c,
          giftDescription: c.giftDescription ?? undefined,
        }))
      );
      if (res.success) {
        toast.success('等级配置保存成功');
        loadData();
      }
    } catch (error) {
      console.error('Failed to save level configs:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 更新单个等级配置
  const updateLevelConfig = (role: string, field: keyof LevelConfig, value: any) => {
    setLevelConfigs(prev =>
      prev.map(config =>
        config.userRole === role ? { ...config, [field]: value } : config
      )
    );
  };

  // 保存模型权限
  const saveModelPermissions = async (model: AIModel) => {
    setSaving(true);
    try {
      const permissions = (['USER', 'VIP', 'SVIP'] as const).map(role => {
        const existing = model.permissions.find(p => p.userRole === role);
        const editing = editingPermissions[`${model.id}-${role}`] || {};
        return {
          aiModelId: model.id,
          userRole: role,
          isAllowed: editing.isAllowed ?? existing?.isAllowed ?? true,
          dailyLimit: editing.dailyLimit ?? existing?.dailyLimit ?? -1,
          isFreeForMember: editing.isFreeForMember ?? existing?.isFreeForMember ?? false,
          freeDailyLimit: editing.freeDailyLimit ?? existing?.freeDailyLimit ?? 0,
          isActive: true,
        };
      });

      const res = await apiClient.admin.userLevels.batchUpdatePermissions(permissions);
      if (res.success) {
        toast.success('权限配置保存成功');
        setEditingPermissions({});
        loadData();
      }
    } catch (error) {
      console.error('Failed to save permissions:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 更新编辑中的权限
  const updateEditingPermission = (modelId: string, role: string, field: string, value: any) => {
    setEditingPermissions(prev => ({
      ...prev,
      [`${modelId}-${role}`]: {
        ...prev[`${modelId}-${role}`],
        [field]: value,
      },
    }));
  };

  // 获取权限值（优先使用编辑中的值）
  const getPermissionValue = (model: AIModel, role: string, field: keyof ModelPermission) => {
    const editing = editingPermissions[`${model.id}-${role}`];
    if (editing && field in editing) {
      return editing[field];
    }
    const existing = model.permissions.find(p => p.userRole === role);
    if (existing) {
      return existing[field];
    }
    // 默认值
    if (field === 'isAllowed') return true;
    if (field === 'dailyLimit') return -1;
    if (field === 'isFreeForMember') return false;
    if (field === 'freeDailyLimit') return 0;
    return null;
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">用户等级权限配置</h1>
        <p className="text-slate-600 dark:text-gray-400 mt-1">
          配置不同等级用户的积分赠送规则和模型使用权限
        </p>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-border-dark">
        <button
          onClick={() => setActiveTab('levels')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'levels'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
              : 'text-slate-600 dark:text-gray-400 border-transparent hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          等级配置
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'permissions'
              ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
              : 'text-slate-600 dark:text-gray-400 border-transparent hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          模型权限
        </button>
      </div>

      {/* 等级配置标签页 */}
      {activeTab === 'levels' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">积分赠送与并发配置</h2>
              <button
                onClick={saveLevelConfigs}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-border-dark">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">用户等级</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">每日赠送积分</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">赠送天数</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">最大并发数</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">存储保留</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">规则描述</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">启用</th>
                  </tr>
                </thead>
                <tbody>
                  {levelConfigs.map(config => (
                    <tr key={config.userRole} className="border-b border-slate-100 dark:border-border-dark/50">
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${ROLE_COLORS[config.userRole]}`}>
                          {ROLE_LABELS[config.userRole]}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          min="0"
                          value={config.dailyGiftCredits}
                          onChange={e => updateLevelConfig(config.userRole, 'dailyGiftCredits', parseInt(e.target.value) || 0)}
                          className="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={config.giftDays}
                            onChange={e => updateLevelConfig(config.userRole, 'giftDays', parseInt(e.target.value) || 0)}
                            className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white"
                          />
                          <span className="text-sm text-slate-500 dark:text-gray-400">
                            {config.giftDays === 0 ? '(无限期)' : '天'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          min="1"
                          value={config.maxConcurrency}
                          onChange={e => updateLevelConfig(config.userRole, 'maxConcurrency', parseInt(e.target.value) || 1)}
                          className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="-1"
                            value={config.storageRetentionDays}
                            onChange={e => updateLevelConfig(config.userRole, 'storageRetentionDays', parseInt(e.target.value) || -1)}
                            className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white"
                          />
                          <span className="text-sm text-slate-500 dark:text-gray-400">
                            {config.storageRetentionDays === -1 ? '(永久)' : '天'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="text"
                          value={config.giftDescription || ''}
                          onChange={e => updateLevelConfig(config.userRole, 'giftDescription', e.target.value)}
                          placeholder="规则说明..."
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.isActive}
                            onChange={e => updateLevelConfig(config.userRole, 'isActive', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">说明</h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• <strong>每日赠送积分</strong>：用户每天登录时自动赠送的积分数量，赠送积分不累计（次日清零）</li>
                <li>• <strong>赠送天数</strong>：新用户注册后赠送积分的天数，0表示无限期（VIP/SVIP会员有效期内持续赠送）</li>
                <li>• <strong>最大并发数</strong>：用户同时进行的生成任务数量上限</li>
                <li>• <strong>存储保留</strong>：用户生成内容的OSS存储保留天数，-1表示永久保留。保留期限按内容生成时的用户等级计算</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 模型权限标签页 */}
      {activeTab === 'permissions' && permissionsSummary && (
        <div className="space-y-6">
          {/* 模型权限配置 */}
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">模型使用权限配置</h2>

            {/* 模型列表 */}
            <div className="space-y-4">
              {permissionsSummary.models.map(model => (
                <div key={model.id} className="border border-slate-200 dark:border-border-dark rounded-lg overflow-hidden">
                  {/* 模型标题 */}
                  <div
                    className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setSelectedModel(selectedModel?.id === model.id ? null : model)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-slate-400">
                        {selectedModel?.id === model.id ? 'expand_less' : 'expand_more'}
                      </span>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{model.name}</div>
                        <div className="text-sm text-slate-500 dark:text-gray-400">
                          {model.provider} / {model.modelId}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        model.type === 'TEXT_GENERATION' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                        model.type === 'IMAGE_GENERATION' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                        model.type === 'VIDEO_GENERATION' ? 'bg-neutral-100 dark:bg-neutral-900/30 text-neutral-700 dark:text-neutral-300' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {model.type}
                      </span>
                    </div>
                  </div>

                  {/* 权限配置详情 */}
                  {selectedModel?.id === model.id && (
                    <div className="p-4 border-t border-slate-200 dark:border-border-dark">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-border-dark">
                              <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">等级</th>
                              <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">允许使用</th>
                              <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">每日限制</th>
                              <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">会员免费</th>
                              <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">免费次数/日</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(['USER', 'VIP', 'SVIP'] as const).map(role => (
                              <tr key={role} className="border-b border-slate-100 dark:border-border-dark/50">
                                <td className="px-3 py-3">
                                  <span className={`px-2 py-1 rounded text-sm font-medium ${ROLE_COLORS[role]}`}>
                                    {ROLE_LABELS[role]}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={getPermissionValue(model, role, 'isAllowed') as boolean}
                                      onChange={e => updateEditingPermission(model.id, role, 'isAllowed', e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="-1"
                                      value={getPermissionValue(model, role, 'dailyLimit') as number}
                                      onChange={e => updateEditingPermission(model.id, role, 'dailyLimit', parseInt(e.target.value))}
                                      className="w-20 px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded text-slate-900 dark:text-white"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-gray-400">
                                      {(getPermissionValue(model, role, 'dailyLimit') as number) === -1 ? '不限' : '次/日'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  {role !== 'USER' ? (
                                    <label className="relative inline-flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={getPermissionValue(model, role, 'isFreeForMember') as boolean}
                                        onChange={e => updateEditingPermission(model.id, role, 'isFreeForMember', e.target.checked)}
                                        className="sr-only peer"
                                      />
                                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                    </label>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {role !== 'USER' && getPermissionValue(model, role, 'isFreeForMember') ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={getPermissionValue(model, role, 'freeDailyLimit') as number}
                                      onChange={e => updateEditingPermission(model.id, role, 'freeDailyLimit', parseInt(e.target.value) || 0)}
                                      className="w-20 px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded text-slate-900 dark:text-white"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => saveModelPermissions(model)}
                          disabled={saving}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {saving ? '保存中...' : '保存权限'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {permissionsSummary.models.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                暂无活跃的AI模型
              </div>
            )}
          </div>

          {/* 节点类型权限 */}
          {permissionsSummary.nodeTypes.length > 0 && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">节点类型权限配置</h2>
              <div className="text-sm text-slate-500 dark:text-gray-400">
                已配置 {permissionsSummary.nodeTypes.length} 个节点类型
              </div>
            </div>
          )}

          {/* 独立模块权限配置 */}
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">独立模块权限配置</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
              配置 Midjourney、广告成片等独立节点的使用权限
            </p>

            <div className="space-y-4">
              {[
                { moduleType: 'midjourney', name: 'Midjourney', description: '文生图/图生图' },
                { moduleType: 'commercial-video', name: '广告成片', description: 'Vidu 广告视频' },
              ].map(module => {
                const modulePerms = permissionsSummary?.moduleTypes.find(m => m.moduleType === module.moduleType)?.permissions || [];
                
                return (
                  <div key={module.moduleType} className="border border-slate-200 dark:border-border-dark rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                      <div className="font-medium text-slate-900 dark:text-white">{module.name}</div>
                      <div className="text-sm text-slate-500 dark:text-gray-400">{module.description}</div>
                    </div>
                    <div className="p-4">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-border-dark">
                            <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">等级</th>
                            <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">允许使用</th>
                            <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">会员免费</th>
                            <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">免费次数/日</th>
                            <th className="px-3 py-2 text-left text-sm font-medium text-slate-600 dark:text-gray-400">每日限制</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(['USER', 'VIP', 'SVIP'] as const).map(role => {
                            const perm = modulePerms.find(p => p.userRole === role);
                            const editKey = `module-${module.moduleType}-${role}`;
                            const editing = editingPermissions[editKey] || {};
                            const isAllowed = editing.isAllowed ?? perm?.isAllowed ?? true;
                            const dailyLimit = editing.dailyLimit ?? perm?.dailyLimit ?? -1;
                            const isFreeForMember = editing.isFreeForMember ?? perm?.isFreeForMember ?? false;
                            const freeDailyLimit = editing.freeDailyLimit ?? perm?.freeDailyLimit ?? 0;
                            const isVipOrSvip = role === 'VIP' || role === 'SVIP';
                            
                            return (
                              <tr key={role} className="border-b border-slate-100 dark:border-border-dark/50">
                                <td className="px-3 py-3">
                                  <span className={`px-2 py-1 rounded text-sm font-medium ${ROLE_COLORS[role]}`}>
                                    {ROLE_LABELS[role]}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isAllowed}
                                      onChange={e => setEditingPermissions(prev => ({
                                        ...prev,
                                        [editKey]: { ...prev[editKey], isAllowed: e.target.checked }
                                      }))}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                </td>
                                <td className="px-3 py-3">
                                  {isVipOrSvip ? (
                                    <label className="relative inline-flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isFreeForMember}
                                        onChange={e => setEditingPermissions(prev => ({
                                          ...prev,
                                          [editKey]: { ...prev[editKey], isFreeForMember: e.target.checked }
                                        }))}
                                        className="sr-only peer"
                                      />
                                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                    </label>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isVipOrSvip ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={freeDailyLimit}
                                      onChange={e => setEditingPermissions(prev => ({
                                        ...prev,
                                        [editKey]: { ...prev[editKey], freeDailyLimit: parseInt(e.target.value) || 0 }
                                      }))}
                                      className="w-16 px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded text-slate-900 dark:text-white"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="-1"
                                      value={dailyLimit}
                                      onChange={e => setEditingPermissions(prev => ({
                                        ...prev,
                                        [editKey]: { ...prev[editKey], dailyLimit: parseInt(e.target.value) }
                                      }))}
                                      className="w-16 px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded text-slate-900 dark:text-white"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-gray-400">
                                      {dailyLimit === -1 ? '不限' : ''}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const permissions = (['USER', 'VIP', 'SVIP'] as const).map(role => {
                                const editKey = `module-${module.moduleType}-${role}`;
                                const perm = modulePerms.find(p => p.userRole === role);
                                const editing = editingPermissions[editKey] || {};
                                return {
                                  moduleType: module.moduleType,
                                  userRole: role,
                                  isAllowed: editing.isAllowed ?? perm?.isAllowed ?? true,
                                  dailyLimit: editing.dailyLimit ?? perm?.dailyLimit ?? -1,
                                  isFreeForMember: editing.isFreeForMember ?? perm?.isFreeForMember ?? false,
                                  freeDailyLimit: editing.freeDailyLimit ?? perm?.freeDailyLimit ?? 0,
                                  isActive: true,
                                };
                              });
                              await apiClient.admin.userLevels.batchUpdatePermissions(permissions);
                              toast.success(`${module.name} 权限保存成功`);
                              loadData();
                            } catch (error) {
                              toast.error('保存失败');
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 说明 */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">权限配置说明</h3>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <li>• <strong>允许使用</strong>：该等级用户是否可以使用此模型/节点</li>
              <li>• <strong>每日限制</strong>：每日可调用次数，-1表示不限制</li>
              <li>• <strong>会员免费</strong>：VIP/SVIP会员使用时是否免费（0积分）</li>
              <li>• <strong>免费次数/日</strong>：每日免费使用的次数上限</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserLevelConfigPage;
