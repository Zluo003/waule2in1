import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { BillingRule, BillingType, BillingTypeLabels } from '../types/billing';
import BillingRuleEditor from '../components/billing/BillingRuleEditor';

const BillingManagementPage = () => {
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<BillingRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      console.log('=== 开始加载计费规则列表 ===');
      setLoading(true);
      const response = await apiClient.get('/admin/billing/rules');
      console.log('API 响应:', response);
      const rulesData = response.data || [];
      console.log('规则数据:', rulesData);
      setRules(rulesData);
      console.log('已设置规则数量:', rulesData.length);
    } catch (error: any) {
      console.error('Failed to load rules:', error);
      alert(error.response?.data?.message || '加载计费规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setSelectedRule({
      name: '',
      billingType: BillingType.PER_REQUEST,
      baseCredits: 0,
      isActive: true,
      prices: [],
    });
  };

  const handleSelectRule = (rule: BillingRule) => {
    setIsCreating(false);
    setSelectedRule(rule);
  };

  const handleSaveRule = async (rule: BillingRule) => {
    try {
      if (isCreating) {
        await apiClient.post('/admin/billing/rules', rule);
      } else if (rule.id) {
        await apiClient.put(`/admin/billing/rules/${rule.id}`, rule);
      }
      await loadRules();
      setIsCreating(false);
      setSelectedRule(null);
    } catch (error: any) {
      console.error('Failed to save rule:', error);
      alert(error.response?.data?.message || '保存失败');
      throw error;
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('确定要删除这条计费规则吗？')) return;

    try {
      await apiClient.delete(`/admin/billing/rules/${ruleId}`);
      await loadRules();
      if (selectedRule?.id === ruleId) {
        setSelectedRule(null);
      }
    } catch (error: any) {
      console.error('Failed to delete rule:', error);
      alert(error.response?.data?.message || '删除失败');
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      await apiClient.post(`/admin/billing/rules/${ruleId}/toggle`);
      await loadRules();
    } catch (error: any) {
      console.error('Failed to toggle rule:', error);
      alert(error.response?.data?.message || '切换状态失败');
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setSelectedRule(null);
  };

  // 过滤规则
  const filteredRules = rules.filter((rule) => {
    console.log('过滤规则:', rule.name, '当前过滤类型:', filterType, '规则类型:', rule.billingType);
    
    // 按类型过滤
    if (filterType !== 'all') {
      if (filterType === 'TEXT_GENERATION' && rule.billingType !== BillingType.PER_REQUEST) {
        console.log('  → 被过滤掉（不是文本生成）');
        return false;
      }
      if (filterType === 'IMAGE_GENERATION' && rule.billingType !== BillingType.PER_IMAGE) {
        console.log('  → 被过滤掉（不是图片生成）');
        return false;
      }
      if (filterType === 'VIDEO_GENERATION' && rule.billingType !== BillingType.DURATION_RESOLUTION) {
        console.log('  → 被过滤掉（不是视频生成）');
        return false;
      }
      if (filterType === 'VIDEO_EDITING' && rule.billingType !== BillingType.DURATION_MODE) {
        console.log('  → 被过滤掉（不是视频编辑）');
        return false;
      }
      if (filterType === 'AUDIO_SYNTHESIS' && rule.billingType !== BillingType.PER_CHARACTER) {
        console.log('  → 被过滤掉（不是音频合成）');
        return false;
      }
      if (filterType === 'FIXED_NODE' && !rule.nodeType) {
        console.log('  → 被过滤掉（不是固定节点）');
        return false;
      }
      if (filterType === 'MIDJOURNEY' && rule.moduleType !== 'midjourney') {
        console.log('  → 被过滤掉（不是Midjourney）');
        return false;
      }
    }

    // 按搜索词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        rule.name.toLowerCase().includes(query) ||
        rule.description?.toLowerCase().includes(query) ||
        rule.aiModel?.name.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // 按类型分组统计
  const getTypeCount = (type: string) => {
    if (type === 'all') return rules.length;
    return rules.filter((rule) => {
      if (type === 'TEXT_GENERATION') return rule.billingType === BillingType.PER_REQUEST;
      if (type === 'IMAGE_GENERATION') return rule.billingType === BillingType.PER_IMAGE;
      if (type === 'VIDEO_GENERATION') return rule.billingType === BillingType.DURATION_RESOLUTION;
      if (type === 'VIDEO_EDITING') return rule.billingType === BillingType.DURATION_MODE;
      if (type === 'AUDIO_SYNTHESIS') return rule.billingType === BillingType.PER_CHARACTER;
      if (type === 'FIXED_NODE') return !!rule.nodeType;
      if (type === 'MIDJOURNEY') return rule.moduleType === 'midjourney';
      return false;
    }).length;
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-background-dark">
      {/* 左侧规则列表 */}
      <aside className="w-80 bg-white dark:bg-card-dark border-r border-slate-200 dark:border-border-dark flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-border-dark">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">计费规则</h2>
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
            >
              + 新建
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索规则..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 pl-9 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-xl">
              search
            </span>
          </div>
        </div>

        {/* 类型筛选标签 */}
        <div className="p-4 border-b border-slate-200 dark:border-border-dark space-y-1">
          {[
            { key: 'all', label: '全部', icon: 'list' },
            { key: 'TEXT_GENERATION', label: '文本模型', icon: 'article' },
            { key: 'IMAGE_GENERATION', label: '图片模型', icon: 'image' },
            { key: 'VIDEO_GENERATION', label: '视频生成', icon: 'videocam' },
            { key: 'VIDEO_EDITING', label: '视频编辑', icon: 'movie_edit' },
            { key: 'AUDIO_SYNTHESIS', label: '音频合成', icon: 'graphic_eq' },
            { key: 'FIXED_NODE', label: '固定节点', icon: 'developer_board' },
            { key: 'MIDJOURNEY', label: 'Midjourney', icon: 'palette' },
          ].map((type) => (
            <button
              key={type.key}
              onClick={() => setFilterType(type.key)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                filterType === type.key
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">{type.icon}</span>
                <span>{type.label}</span>
              </div>
              <span className="text-xs opacity-60">{getTypeCount(type.key)}</span>
            </button>
          ))}
        </div>

        {/* 规则列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-slate-400">加载中...</div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-8 text-slate-400">暂无规则</div>
          ) : (
            filteredRules.map((rule) => (
              <div
                key={rule.id}
                onClick={() => handleSelectRule(rule)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedRule?.id === rule.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-border-dark hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-medium text-slate-900 dark:text-white text-sm">{rule.name}</h3>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      rule.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {rule.isActive ? '启用' : '禁用'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">
                  {BillingTypeLabels[rule.billingType]}
                </p>
                {rule.aiModel && (
                  <p className="text-xs text-slate-600 dark:text-gray-400">
                    模型: {rule.aiModel.name}
                  </p>
                )}
                {rule.moduleType && (
                  <p className="text-xs text-slate-600 dark:text-gray-400">
                    模块: {rule.moduleType}
                  </p>
                )}
                {rule.nodeType && (
                  <p className="text-xs text-slate-600 dark:text-gray-400">
                    节点: {rule.nodeType}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧编辑区域 */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-background-dark">
        {selectedRule ? (
          <BillingRuleEditor
            rule={selectedRule}
            isCreating={isCreating}
            existingRules={rules}
            onSave={handleSaveRule}
            onCancel={handleCancel}
            onDelete={handleDeleteRule}
            onToggle={handleToggleRule}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-gray-500">
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl mb-4 opacity-20">
                receipt_long
              </span>
              <p>选择一条规则或创建新规则</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingManagementPage;
