import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

interface Agent {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles?: AgentRole[];
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
}

interface AgentRole {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  aiModelId: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  order?: number;
  aiModel: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
  };
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });
  const [roleForm, setRoleForm] = useState({
    agentId: '',
    name: '',
    description: '',
    systemPrompt: '',
    aiModelId: '',
    temperature: 0.7,
    maxTokens: 2000,
    isActive: true,
  });

  useEffect(() => {
    loadAgents();
    loadAvailableModels();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await apiClient.agents.getAll();
      const withRoles = await Promise.all(
        data.map(async (a: Agent) => {
          try {
            const roles = await apiClient.agents.roles.listByAgent(a.id);
            return { ...a, roles };
          } catch {
            return { ...a, roles: [] };
          }
        })
      );
      setAgents(withRoles);
    } catch (error: any) {
      toast.error('加载智能体失败');
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const data = await apiClient.agents.getAvailableModels();
      setAvailableModels(data);
    } catch (error: any) {
      toast.error('加载可用模型失败');
      console.error('Failed to load available models:', error);
    }
  };

  const handleCreate = () => {
    setEditingAgent(null);
    setFormData({
      name: '',
      description: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      description: agent.description || '',
      isActive: agent.isActive,
    });
    setShowModal(true);
  };

  const handleAddRole = (agent: Agent) => {
    setEditingAgent(agent);
    setEditingRole(null);
    setRoleForm({
      agentId: agent.id,
      name: '',
      description: '',
      systemPrompt: '',
      aiModelId: availableModels.length > 0 ? availableModels[0].id : '',
      temperature: 0.7,
      maxTokens: 2000,
      isActive: true,
    });
    setShowRoleModal(true);
  };

  const handleEditRole = (role: AgentRole) => {
    setEditingRole(role);
    setRoleForm({
      agentId: role.agentId,
      name: role.name,
      description: role.description || '',
      systemPrompt: role.systemPrompt,
      aiModelId: role.aiModelId,
      temperature: role.temperature,
      maxTokens: role.maxTokens,
      isActive: role.isActive,
    });
    setShowRoleModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除智能体 "${name}" 吗？`)) {
      return;
    }

    try {
      await apiClient.agents.delete(id);
      toast.success('删除成功');
      loadAgents();
    } catch (error: any) {
      toast.error('删除失败');
      console.error('Failed to delete agent:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('请填写必填字段');
      return;
    }

    try {
      if (editingAgent) {
        await apiClient.agents.update(editingAgent.id, formData);
        toast.success('更新成功');
      } else {
        await apiClient.agents.create(formData);
        toast.success('创建成功');
      }
      setShowModal(false);
      loadAgents();
    } catch (error: any) {
      toast.error(editingAgent ? '更新失败' : '创建失败');
      console.error('Failed to save agent:', error);
    }
  };

  const handleSubmitRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.agentId || !roleForm.name || !roleForm.systemPrompt || !roleForm.aiModelId) {
      toast.error('请填写角色必填字段');
      return;
    }
    try {
      if (editingRole) {
        await apiClient.agents.roles.update(editingRole.id, roleForm);
        toast.success('角色更新成功');
      } else {
        await apiClient.agents.roles.create(roleForm);
        toast.success('角色创建成功');
      }
      setShowRoleModal(false);
      loadAgents();
    } catch (error: any) {
      toast.error(editingRole ? '角色更新失败' : '角色创建失败');
      console.error('Failed to save agent role:', error);
    }
  };

  const handleDeleteRole = async (role: AgentRole) => {
    if (!window.confirm(`确定要删除角色 "${role.name}" 吗？`)) return;
    try {
      await apiClient.agents.roles.delete(role.id);
      toast.success('角色删除成功');
      loadAgents();
    } catch (error: any) {
      toast.error('角色删除失败');
      console.error('Failed to delete agent role:', error);
    }
  };

  const moveRole = async (agentId: string, fromIndex: number, toIndex: number) => {
    const agent = agents.find((x) => x.id === agentId);
    const roles = [...(agent?.roles || [])];
    if (fromIndex === toIndex || roles.length === 0) return;
    const [moved] = roles.splice(fromIndex, 1);
    roles.splice(toIndex, 0, moved);
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, roles } : a));
    try {
      for (let i = 0; i < roles.length; i++) {
        await apiClient.agents.roles.update(roles[i].id, { order: i });
      }
      const updated = await apiClient.agents.roles.listByAgent(agentId);
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, roles: updated } : a));
      toast.success('角色顺序已更新');
    } catch (error: any) {
      toast.error('更新排序失败');
      console.error('Failed to update role order:', error);
      loadAgents();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-tiffany-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary">
            智能体配置
          </h1>
          <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary mt-1">
            管理AI智能体，配置提示词赋予不同角色和专业能力
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-tiffany-600 dark:bg-tiffany-500 text-white rounded-lg hover:bg-tiffany-700 dark:hover:bg-tiffany-600 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          新建智能体
        </button>
      </div>

      {/* 智能体列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-card-light dark:bg-card-dark rounded-xl border border-border-light dark:border-border-dark p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-1">
                  {agent.name}
                </h3>
                {agent.description && (
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary line-clamp-2">
                    {agent.description}
                  </p>
                )}
              </div>
              <div className={`px-2 py-1 rounded text-xs ${agent.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                {agent.isActive ? '启用' : '禁用'}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-xs text-text-light-tertiary dark:text-text-dark-tertiary">此智能体为空壳，具体能力由下方角色决定</div>
            </div>

            <div className="border-t border-border-light dark:border-border-dark pt-3 flex gap-2">
              <button
                onClick={() => handleEdit(agent)}
                className="flex-1 px-3 py-1.5 bg-background-light dark:bg-background-dark text-text-light-primary dark:text-text-dark-primary rounded hover:bg-background-light-secondary dark:hover:bg-background-dark-secondary transition-colors text-sm flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                编辑
              </button>
              <button
                onClick={() => handleAddRole(agent)}
                className="flex-1 px-3 py-1.5 bg-tiffany-50 dark:bg-tiffany-900/20 text-tiffany-600 dark:text-tiffany-400 rounded hover:bg-tiffany-100 dark:hover:bg-tiffany-900/30 transition-colors text-sm flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                添加角色
              </button>
              <button
                onClick={() => handleDelete(agent.id, agent.name)}
                className="flex-1 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                删除
              </button>
            </div>

            {(agent.roles || []).length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">角色</div>
                <div className="space-y-2">
                  {(agent.roles || []).map((role, idx) => (
                    <div key={role.id} className="group flex items-center justify-between p-2 bg-background-light dark:bg-background-dark rounded border border-border-light dark:border-border-dark">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                          {role.name} {role.isActive ? '' : '(已禁用)'}
                        </div>
                        <div className="text-xs text-text-light-secondary dark:text-text-dark-secondary">
                          模型：{role.aiModel?.name} | 温度：{role.temperature} | Token：{role.maxTokens}
                        </div>
                        {role.description && (
                          <div className="text-xs text-text-light-tertiary dark:text-text-dark-tertiary line-clamp-1">{role.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRole(role)}
                          className="px-2 py-1 text-xs bg-background-light-secondary dark:bg-background-dark-secondary rounded hover:bg-background-light dark:hover:bg-background-dark"
                        >编辑</button>
                        <button
                          onClick={() => handleDeleteRole(role)}
                          className="px-2 py-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                        >删除</button>
                        <button
                          type="button"
                          onClick={() => moveRole(agent.id, idx, Math.max(0, idx - 1))}
                          className="px-1 py-1 text-xs bg-background-light-secondary dark:bg-background-dark-secondary rounded hover:bg-background-light dark:hover:bg-background-dark"
                          title="上移"
                        >↑</button>
                        <button
                          type="button"
                          onClick={() => moveRole(agent.id, idx, Math.min((agent.roles || []).length - 1, idx + 1))}
                          className="px-1 py-1 text-xs bg-background-light-secondary dark:bg-background-dark-secondary rounded hover:bg-background-light dark:hover:bg-background-dark"
                          title="下移"
                        >↓</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {agents.length === 0 && (
          <div className="col-span-full text-center py-12">
            <span className="material-symbols-outlined text-6xl text-text-light-tertiary dark:text-text-dark-tertiary mb-4 block">
              smart_toy
            </span>
            <p className="text-text-light-secondary dark:text-text-dark-secondary">
              还没有智能体，点击右上角创建第一个
            </p>
          </div>
        )}
      </div>

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card-light dark:bg-card-dark rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary">
                {editingAgent ? '编辑智能体' : '新建智能体'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-background-light-secondary dark:hover:bg-background-dark-secondary rounded transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  placeholder="例如：小红书文案大师"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  描述
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  placeholder="简要描述智能体的功能"
                />
              </div>

              {/* 空壳智能体无需提示词与模型，改由角色定义 */}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-tiffany-600 bg-background-light dark:bg-background-dark border-border-light dark:border-border-dark rounded focus:ring-tiffany-500"
                />
                <label htmlFor="isActive" className="text-sm text-text-light-primary dark:text-text-dark-primary">
                  启用智能体
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-background-light-secondary dark:bg-background-dark-secondary text-text-light-primary dark:text-text-dark-primary rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-tiffany-600 dark:bg-tiffany-500 text-white rounded-lg hover:bg-tiffany-700 dark:hover:bg-tiffany-600 transition-colors"
                >
                  {editingAgent ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card-light dark:bg-card-dark rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary">
                {editingRole ? '编辑角色' : '添加角色'}
              </h2>
              <button
                onClick={() => setShowRoleModal(false)}
                className="p-1 hover:bg-background-light-secondary dark:hover:bg-background-dark-secondary rounded transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitRole} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  角色名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  placeholder="例如：导演、编剧、推广运营"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  角色描述
                </label>
                <input
                  type="text"
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  placeholder="简要描述角色的职责"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  角色提示词 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={roleForm.systemPrompt}
                  onChange={(e) => setRoleForm({ ...roleForm, systemPrompt: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500 min-h-32"
                  placeholder="为该角色定义专属提示词"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                  调用模型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={roleForm.aiModelId}
                  onChange={(e) => setRoleForm({ ...roleForm, aiModelId: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  required
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                    温度 (Temperature)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={roleForm.temperature}
                    onChange={(e) => setRoleForm({ ...roleForm, temperature: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-light-primary dark:text-text-dark-primary mb-2">
                    最大Token数
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="100"
                    max="32000"
                    value={roleForm.maxTokens}
                    onChange={(e) => setRoleForm({ ...roleForm, maxTokens: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-tiffany-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="roleActive"
                  checked={roleForm.isActive}
                  onChange={(e) => setRoleForm({ ...roleForm, isActive: e.target.checked })}
                  className="w-4 h-4 text-tiffany-600 bg-background-light dark:bg-background-dark border-border-light dark:border-border-dark rounded focus:ring-tiffany-500"
                />
                <label htmlFor="roleActive" className="text-sm text-text-light-primary dark:text-text-dark-primary">
                  启用角色
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 px-4 py-2 bg-background-light-secondary dark:bg-background-dark-secondary text-text-light-primary dark:text-text-dark-primary rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-tiffany-600 dark:bg-tiffany-500 text-white rounded-lg hover:bg-tiffany-700 dark:hover:bg-tiffany-600 transition-colors"
                >
                  {editingRole ? '更新角色' : '创建角色'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

