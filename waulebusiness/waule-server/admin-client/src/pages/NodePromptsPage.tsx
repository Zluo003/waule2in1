import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';
import {
  Plus,
  Save,
  Trash2,
  RotateCcw,
  Power,
  PowerOff,
  FileText,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Variable {
  name: string;
  desc: string;
  example?: string;
}

// 智能溶图节点可用变量（按Gemini图片顺序：角色图(多张)→场景图(1张)→风格图(1张)）
const STORYBOARD_VARIABLES = [
  { name: 'userInput', desc: '用户输入的场景描述', example: '吃火锅' },
  { name: 'characterImages', desc: '角色参考图(可多张)', example: '图1-图2' },
  { name: 'sceneImages', desc: '场景图(限1张)', example: '图3' },
  { name: 'styleImage', desc: '风格图(限1张)', example: '图4' },
  { name: 'gridType', desc: '网格类型', example: '2x2' },
  { name: 'totalViews', desc: '总画面数', example: '4' },
  { name: 'aspectRatio', desc: '宽高比', example: '16:9' },
];

// 可用的节点类型列表
const AVAILABLE_NODE_TYPES = [
  { value: 'storyboardMaster', label: '智能溶图', icon: 'auto_awesome' },
  { value: 'smartStoryboard', label: '智能分镜', icon: 'grid_view' },
  { value: 'hdUpscale', label: '高清放大', icon: 'high_quality' },
  { value: 'aiImage', label: '图片生成', icon: 'image' },
  { value: 'aiVideo', label: '视频生成', icon: 'movie' },
  { value: 'aiVideo_t2v', label: '文生视频', icon: 'movie' },
  { value: 'aiVideo_i2v_first', label: '图生视频（首帧）', icon: 'movie' },
  { value: 'aiVideo_i2v_last', label: '图生视频（尾帧）', icon: 'movie' },
  { value: 'aiVideo_first_last', label: '首尾帧生成', icon: 'movie' },
  { value: 'aiVideo_reference', label: '参考图生成', icon: 'movie' },
  { value: 'aiVideo_swap', label: '视频编辑', icon: 'movie' },
  { value: 'aiVideo_lipsync', label: '口型同步', icon: 'movie' },
  { value: 'aiVideo_style', label: '风格迁移', icon: 'movie' },
  { value: 'soraVideo', label: 'Sora视频', icon: 'movie' },
  { value: 'soraCharacter', label: 'Sora角色', icon: 'face' },
  { value: 'midjourney', label: 'Midjourney', icon: 'palette' },
  { value: 'agent', label: '智能体', icon: 'smart_toy' },
  { value: 'audioVoice', label: '语音合成', icon: 'record_voice_over' },
  { value: 'voiceClone', label: '声音克隆', icon: 'mic' },
  { value: 'audioSynthesize', label: '音频合成', icon: 'music_note' },
  { value: 'audioDesign', label: '音效设计', icon: 'graphic_eq' },
  { value: 'superCanvas', label: '超级画布', icon: 'draw' },
  { value: 'videoUpscale', label: '视频超分', icon: 'high_quality' },
  { value: 'commercialVideo', label: '广告成片', icon: 'campaign' },
];

interface NodePromptTemplate {
  id: string;
  nodeType: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  enhancePromptTemplate?: string;
  variables?: Variable[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const NodePromptsPage = () => {
  const [templates, setTemplates] = useState<NodePromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<NodePromptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    system: true,
    user: true,
    enhance: false,
    variables: false,
  });

  // 表单状态
  const [formData, setFormData] = useState({
    nodeType: '',
    name: '',
    description: '',
    systemPrompt: '',
    userPromptTemplate: '',
    enhancePromptTemplate: '',
    variables: [] as Variable[],
    isActive: true,
  });

  // 加载模板列表
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await apiClient.nodePrompts.getAll(true);
      if (res.success) {
        setTemplates(res.data || []);
      }
    } catch (error: any) {
      toast.error('加载失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // 选择模板
  const handleSelectTemplate = (template: NodePromptTemplate) => {
    setSelectedTemplate(template);
    setIsCreating(false);
    setFormData({
      nodeType: template.nodeType,
      name: template.name,
      description: template.description || '',
      systemPrompt: template.systemPrompt || '',
      userPromptTemplate: template.userPromptTemplate,
      enhancePromptTemplate: template.enhancePromptTemplate || '',
      variables: template.variables || [],
      isActive: template.isActive,
    });
  };

  // 新建模板
  const handleCreate = () => {
    setSelectedTemplate(null);
    setIsCreating(true);
    setFormData({
      nodeType: '',
      name: '',
      description: '',
      systemPrompt: '',
      userPromptTemplate: '',
      enhancePromptTemplate: '',
      variables: [],
      isActive: true,
    });
  };

  // 初始化分镜大师默认模板
  const handleInitStoryboardMaster = async () => {
    try {
      const res = await apiClient.nodePrompts.initStoryboardMaster();
      if (res.success) {
        toast.success(res.message || '初始化成功');
        await loadTemplates();
        if (res.data) {
          handleSelectTemplate(res.data);
        }
      }
    } catch (error: any) {
      toast.error('初始化失败: ' + (error.message || '未知错误'));
    }
  };

  // 保存模板
  const handleSave = async () => {
    if (!formData.nodeType.trim()) {
      toast.error('请输入节点类型');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('请输入名称');
      return;
    }
    if (!formData.userPromptTemplate.trim()) {
      toast.error('请输入用户提示词模板');
      return;
    }

    try {
      setSaving(true);
      if (isCreating) {
        const res = await apiClient.nodePrompts.create(formData);
        if (res.success) {
          toast.success('创建成功');
          await loadTemplates();
          handleSelectTemplate(res.data);
        }
      } else if (selectedTemplate) {
        const res = await apiClient.nodePrompts.update(selectedTemplate.id, formData);
        if (res.success) {
          toast.success('保存成功');
          await loadTemplates();
          handleSelectTemplate(res.data);
        }
      }
    } catch (error: any) {
      toast.error('保存失败: ' + (error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  // 删除模板
  const handleDelete = async () => {
    if (!selectedTemplate) return;
    if (!confirm(`确定要删除 "${selectedTemplate.name}" 吗？`)) return;

    try {
      const res = await apiClient.nodePrompts.delete(selectedTemplate.id);
      if (res.success) {
        toast.success('删除成功');
        setSelectedTemplate(null);
        setIsCreating(false);
        await loadTemplates();
      }
    } catch (error: any) {
      toast.error('删除失败: ' + (error.message || '未知错误'));
    }
  };

  // 切换启用状态
  const handleToggle = async () => {
    if (!selectedTemplate) return;
    try {
      const res = await apiClient.nodePrompts.toggle(selectedTemplate.id);
      if (res.success) {
        toast.success(res.data.isActive ? '已启用' : '已禁用');
        await loadTemplates();
        handleSelectTemplate(res.data);
      }
    } catch (error: any) {
      toast.error('操作失败: ' + (error.message || '未知错误'));
    }
  };

  // 切换展开状态
  const toggleSection = (section: string) => {
    setExpandedSections({ ...expandedSections, [section]: !expandedSections[section] });
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">节点提示词管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            配置工作流节点的 AI 提示词模板，支持变量替换
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleInitStoryboardMaster}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            初始化分镜大师模板
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* 左侧：模板列表 */}
        <div className="w-80 flex-shrink-0 bg-card-dark rounded-xl border border-white/10 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-medium text-gray-400">模板列表</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无模板</p>
                <p className="text-xs mt-1">点击"初始化分镜大师模板"开始</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                        selectedTemplate?.id === template.id
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            template.isActive ? 'bg-green-500' : 'bg-gray-500'
                          }`}
                        />
                        <span className="text-sm font-medium truncate">{template.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{template.nodeType}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 右侧：编辑区 */}
        <div className="flex-1 bg-card-dark rounded-xl border border-white/10 overflow-hidden flex flex-col">
          {!selectedTemplate && !isCreating ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>选择一个模板进行编辑</p>
                <p className="text-sm mt-1">或点击"新建模板"创建</p>
              </div>
            </div>
          ) : (
            <>
              {/* 工具栏 */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-lg font-medium text-white">
                  {isCreating ? '新建模板' : `编辑: ${selectedTemplate?.name}`}
                </h2>
                <div className="flex gap-2">
                  {!isCreating && selectedTemplate && (
                    <>
                      <button
                        onClick={handleToggle}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                          formData.isActive
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                      >
                        {formData.isActive ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                        <span className="text-sm">{formData.isActive ? '禁用' : '启用'}</span>
                      </button>
                      <button
                        onClick={handleDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm">删除</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span className="text-sm">保存</span>
                  </button>
                </div>
              </div>

              {/* 表单内容 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      节点类型 <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.nodeType}
                      onChange={(e) => {
                        const selected = AVAILABLE_NODE_TYPES.find(n => n.value === e.target.value);
                        setFormData({ 
                          ...formData, 
                          nodeType: e.target.value,
                          name: selected ? selected.label + '提示词' : formData.name,
                        });
                      }}
                      disabled={!isCreating}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    >
                      <option value="" className="bg-gray-800">请选择节点类型</option>
                      {AVAILABLE_NODE_TYPES.map((node) => (
                        <option key={node.value} value={node.value} className="bg-gray-800">
                          {node.label} ({node.value})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      显示名称 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="如: 智能溶图节点"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">描述</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="节点功能描述"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* 系统提示词 */}
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('system')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-300">系统提示词 (System Prompt)</span>
                    {expandedSections.system ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.system && (
                    <div className="p-3">
                      <textarea
                        value={formData.systemPrompt}
                        onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                        placeholder="设定 AI 的角色和行为..."
                        rows={8}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* 用户提示词模板 */}
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('user')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-300">
                        用户提示词模板 <span className="text-red-400">*</span>
                      </span>
                      <div className="flex items-center gap-1 text-xs text-purple-400">
                        <Info className="w-3 h-3" />
                        支持 {'{{变量}}'} 语法
                      </div>
                    </div>
                    {expandedSections.user ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.user && (
                    <div className="p-3">
                      <textarea
                        value={formData.userPromptTemplate}
                        onChange={(e) =>
                          setFormData({ ...formData, userPromptTemplate: e.target.value })
                        }
                        placeholder="用户提示词模板，使用 {{变量名}} 插入动态内容..."
                        rows={12}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* 提示词增强模板 */}
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('enhance')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-300">提示词增强模板 (可选)</span>
                    {expandedSections.enhance ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.enhance && (
                    <div className="p-3">
                      <textarea
                        value={formData.enhancePromptTemplate}
                        onChange={(e) =>
                          setFormData({ ...formData, enhancePromptTemplate: e.target.value })
                        }
                        placeholder="用于增强/优化用户输入的提示词..."
                        rows={6}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* 使用说明 - 根据节点类型显示不同变量 */}
                {formData.nodeType === 'storyboardMaster' ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm">
                      <p className="font-medium mb-2 text-purple-300">🎨 智能溶图可用变量（点击复制）</p>
                      <div className="grid grid-cols-2 gap-2">
                        {STORYBOARD_VARIABLES.map((v) => (
                          <button
                            key={v.name}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`{{${v.name}}}`);
                              toast.success(`已复制 {{${v.name}}}`);
                            }}
                            className="flex items-center gap-2 p-2 bg-black/20 rounded hover:bg-black/30 transition-colors text-left"
                          >
                            <code className="text-purple-400 text-xs">{`{{${v.name}}}`}</code>
                            <span className="text-gray-400 text-xs truncate">{v.desc}：{v.example}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
                      <p className="font-medium mb-1">💡 提示词示例</p>
                      <p className="text-xs opacity-80">{'{{characterImages}}中的人物在{{sceneImages}}的场景里{{userInput}}，使用{{styleImage}}的艺术风格，生成{{gridType}}网格共{{totalViews}}个画面'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
                    <p className="font-medium mb-1">💡 使用说明</p>
                    <p>在提示词中可使用变量：<code className="bg-black/30 px-1 rounded">{'{{userInput}}'}</code> 会被替换为用户输入</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NodePromptsPage;
