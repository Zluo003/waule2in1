import { useState, useEffect } from 'react';
import { BillingRule, BillingType, BillingTypeLabels, AIModel } from '../../types/billing';
import { apiClient } from '../../lib/api';
import SimplePriceInput from './SimplePriceInput';
import PriceMatrixEditor from './PriceMatrixEditor';
import ModePriceList from './ModePriceList';
import MidjourneyPriceConfig from './MidjourneyPriceConfig';
import CharacterPriceConfig from './CharacterPriceConfig';
import ImageResolutionEditor from './ImageResolutionEditor';
import LiveCalculator from './LiveCalculator';

interface Props {
  rule: BillingRule;
  isCreating: boolean;
  existingRules?: BillingRule[];
  onSave: (rule: BillingRule) => Promise<void>;
  onCancel: () => void;
  onDelete: (ruleId: string) => void;
  onToggle: (ruleId: string) => void;
}

const BillingRuleEditor = ({ rule, isCreating, existingRules = [], onSave, onCancel, onDelete, onToggle }: Props) => {
  const [formData, setFormData] = useState<BillingRule>(rule);
  const [targetType, setTargetType] = useState<'model' | 'node' | 'module'>('model');
  const [models, setModels] = useState<AIModel[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData(rule);
    if (rule.nodeType) {
      setTargetType('node');
    } else if (rule.moduleType) {
      setTargetType('module');
    } else {
      setTargetType('model');
    }
  }, [rule]);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      // 只加载已激活的模型，按照 ModelConfigPage 的方式
      const resGoogle: any = await apiClient.admin.getAIModels({ provider: 'google' });
      const resDoubao: any = await apiClient.admin.getAIModels({ provider: 'bytedance' });
      const resDoubaoAlt: any = await apiClient.admin.getAIModels({ provider: 'doubao' });
      const resAliyun: any = await apiClient.admin.getAIModels({ provider: 'aliyun' });
      const resMiniMax: any = await apiClient.admin.getAIModels({ provider: 'minimaxi' });
      const resSora: any = await apiClient.admin.getAIModels({ provider: 'sora' });
      const resVidu: any = await apiClient.admin.getAIModels({ provider: 'vidu' });

      const listGoogle: AIModel[] = Array.isArray(resGoogle?.data) ? resGoogle.data : Array.isArray(resGoogle) ? resGoogle : [];
      const listDoubao: AIModel[] = Array.isArray(resDoubao?.data) ? resDoubao.data : Array.isArray(resDoubao) ? resDoubao : [];
      const listDoubaoAlt: AIModel[] = Array.isArray(resDoubaoAlt?.data) ? resDoubaoAlt.data : Array.isArray(resDoubaoAlt) ? resDoubaoAlt : [];
      const listAliyun: AIModel[] = Array.isArray(resAliyun?.data) ? resAliyun.data : Array.isArray(resAliyun) ? resAliyun : [];
      const listMiniMax: AIModel[] = Array.isArray(resMiniMax?.data) ? resMiniMax.data : Array.isArray(resMiniMax) ? resMiniMax : [];
      const listSora: AIModel[] = Array.isArray(resSora?.data) ? resSora.data : Array.isArray(resSora) ? resSora : [];
      const listVidu: AIModel[] = Array.isArray(resVidu?.data) ? resVidu.data : Array.isArray(resVidu) ? resVidu : [];

      // 合并所有模型，只保留激活的
      const allModels = [
        ...listGoogle,
        ...listDoubao,
        ...listDoubaoAlt,
        ...listAliyun,
        ...listMiniMax,
        ...listSora,
        ...listVidu,
      ].filter(m => m.isActive);

      setModels(allModels);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  // 自动生成规则名称
  useEffect(() => {
    if (!isCreating) return;
    
    let newName = '';
    if (targetType === 'model' && formData.aiModelId) {
      const model = models.find(m => m.id === formData.aiModelId);
      if (model) newName = `${model.name} 计费规则`;
    } else if (targetType === 'node' && formData.nodeType) {
      const nodeMap: Record<string, string> = {
        'super_resolution': '智能超清',
        'ad_composition': '广告成片',
        'sora_character': 'Sora角色生成'
      };
      if (nodeMap[formData.nodeType]) newName = `${nodeMap[formData.nodeType]} 计费规则`;
    } else if (targetType === 'module' && formData.moduleType) {
       if (formData.moduleType === 'midjourney') newName = 'Midjourney 计费规则';
    }

    // 只有当名称为空，或者看起来是自动生成的名称时才自动更新
    if (newName && (!formData.name || formData.name.includes('计费规则'))) {
      updateField('name', newName);
    }
  }, [formData.aiModelId, formData.nodeType, formData.moduleType, targetType, isCreating, models]);

  // 计算可用的模型列表（过滤掉已配置的模型）
  const availableModels = models.filter(model => {
    // 如果是当前选中的模型，保留
    if (model.id === formData.aiModelId) return true;
    // 如果已经被其他规则使用，过滤掉
    if (existingRules.some(r => r.aiModelId === model.id)) return false;
    return true;
  });

  // 获取当前选中的模型配置
  const selectedModel = models.find(m => m.id === formData.aiModelId);
  const modelConfig = selectedModel?.config || {};

  const handleSave = async () => {
    console.log('=== 开始保存计费规则 ===');
    console.log('表单数据:', formData);
    
    if (!formData.name) {
      alert('请输入规则名称');
      return;
    }

    if (!formData.aiModelId && !formData.nodeType && !formData.moduleType) {
      alert('请选择关联的模型、节点或模块');
      return;
    }

    console.log('验证通过，准备保存...');
    
    try {
      setSaving(true);
      console.log('调用 onSave 函数...');
      await onSave(formData);
      console.log('保存成功！');
      alert('保存成功！');
    } catch (error: any) {
      console.error('保存失败:', error);
      alert('保存失败: ' + (error.response?.data?.message || error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BillingRule, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  const renderPriceConfig = () => {
    switch (formData.billingType) {
      case BillingType.PER_REQUEST:
        return (
          <SimplePriceInput
            value={formData.baseCredits}
            onChange={(value: number) => updateField('baseCredits', value)}
            label="每次调用"
          />
        );

      case BillingType.PER_IMAGE:
        return (
          <div className="space-y-6">
             {/* 模式切换 */}
             <div className="flex items-center gap-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-border-dark">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="radio" 
                   checked={!formData.prices || formData.prices.length === 0}
                   onChange={() => updateField('prices', [])}
                   className="text-blue-500 w-4 h-4"
                 />
                 <span className="text-sm font-medium text-slate-700 dark:text-gray-300">统一一口价</span>
               </label>
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="radio" 
                   checked={!!formData.prices && formData.prices.length > 0}
                   onChange={() => {
                      if (!formData.prices || formData.prices.length === 0) {
                        updateField('prices', [
                          { dimension: 'resolution', value: '1024x1024', creditsPerUnit: 10, unitSize: 1 }
                        ]);
                      }
                   }}
                   className="text-blue-500 w-4 h-4"
                 />
                 <span className="text-sm font-medium text-slate-700 dark:text-gray-300">按分辨率阶梯</span>
               </label>
             </div>

             {/* 根据模式渲染 */}
             {(!formData.prices || formData.prices.length === 0) ? (
                <SimplePriceInput
                  value={formData.baseCredits}
                  onChange={(value: number) => updateField('baseCredits', value)}
                  label="每张图片"
                />
             ) : (
                <ImageResolutionEditor 
                  prices={formData.prices}
                  onChange={(prices) => updateField('prices', prices)}
                  modelConfig={modelConfig}
                />
             )}
          </div>
        );

      case BillingType.DURATION_RESOLUTION:
        return (
          <PriceMatrixEditor
            prices={formData.prices}
            onChange={(prices: any) => updateField('prices', prices)}
            modelConfig={modelConfig}
          />
        );

      case BillingType.DURATION_MODE:
        return (
          <ModePriceList
            prices={formData.prices}
            config={formData.config || {}}
            onChange={(prices: any, config: any) => {
              updateField('prices', prices);
              updateField('config', config);
            }}
          />
        );

      case BillingType.PER_DURATION:
        return (
          <SimplePriceInput
            value={formData.baseCredits}
            onChange={(value: number) => updateField('baseCredits', value)}
            label="每秒费用"
          />
        );

      case BillingType.PER_CHARACTER:
        return (
          <CharacterPriceConfig
            prices={formData.prices}
            onChange={(prices: any) => updateField('prices', prices)}
          />
        );

      case BillingType.OPERATION_MODE:
        return (
          <MidjourneyPriceConfig
            prices={formData.prices}
            onChange={(prices: any) => updateField('prices', prices)}
          />
        );

      default:
        return <div className="text-slate-400">请选择计费类型</div>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-background-dark">
      {/* 头部 */}
      <div className="px-8 py-6 border-b border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isCreating ? '新建计费规则' : '编辑计费规则'}
          </h2>
          <div className="flex items-center gap-2">
            {!isCreating && (
              <>
                <button
                  onClick={() => onToggle(formData.id!)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {formData.isActive ? '已启用' : '已禁用'}
                </button>
                <button
                  onClick={() => onDelete(formData.id!)}
                  className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg hover:bg-red-200 text-sm font-medium transition-colors"
                >
                  删除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 基础信息 */}
          <section className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-border-dark p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">基础信息</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                  规则名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="例如：Gemini 2.0 Flash 文本调用"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="规则说明（可选）"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                  关联对象 *
                </label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={targetType === 'model'}
                      onChange={() => {
                        setTargetType('model');
                        updateField('nodeType', null);
                        updateField('moduleType', null);
                      }}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-gray-300">AI模型</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={targetType === 'node'}
                      onChange={() => {
                        setTargetType('node');
                        updateField('aiModelId', null);
                        updateField('moduleType', null);
                      }}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-gray-300">固定节点</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={targetType === 'module'}
                      onChange={() => {
                        setTargetType('module');
                        updateField('aiModelId', null);
                        updateField('nodeType', null);
                      }}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-gray-300">特殊模块</span>
                  </label>
                </div>

                {targetType === 'model' && (
                  <select
                    value={formData.aiModelId || ''}
                    onChange={(e) => updateField('aiModelId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">选择AI模型</option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.provider})
                      </option>
                    ))}
                  </select>
                )}

                {targetType === 'node' && (
                  <select
                    value={formData.nodeType || ''}
                    onChange={(e) => updateField('nodeType', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">选择节点类型</option>
                    <option value="super_resolution">智能超清</option>
                    <option value="ad_composition">广告成片</option>
                    <option value="sora_character">Sora角色生成</option>
                  </select>
                )}

                {targetType === 'module' && (
                  <select
                    value={formData.moduleType || ''}
                    onChange={(e) => updateField('moduleType', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">选择模块</option>
                    <option value="midjourney">Midjourney</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                  计费类型 *
                </label>
                <select
                  value={formData.billingType}
                  onChange={(e) => updateField('billingType', e.target.value as BillingType)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(BillingTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 价格配置 */}
          <section className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-border-dark p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">价格配置</h3>
            {renderPriceConfig()}
          </section>

          {/* 实时计算器 */}
          <section className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-border-dark p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">预览测试</h3>
            <LiveCalculator rule={formData} />
          </section>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="px-8 py-4 border-t border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-slate-300 dark:border-border-dark text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
        >
          {saving ? '保存中...' : '保存规则'}
        </button>
      </div>
    </div>
  );
};

export default BillingRuleEditor;
