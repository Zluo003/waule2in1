import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Users,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Building2,
  Copy,
  X,
  UserPlus,
  Key,
  Monitor,
  Unlink,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  apiKey: string;
  credits: number;
  maxClients: number;
  isActive: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  remark: string | null;
  createdAt: string;
  _count: { users: number; activations?: number };
  // 在线状态
  serverActivated: boolean;
  lastHeartbeat: string | null;
  serverVersion: string | null;
  serverIp: string | null;
  // 在线客户端数
  onlineClients: number;
  totalClients: number;
}

interface ClientActivation {
  id: string;
  activationCode: string;
  deviceFingerprint: string | null;
  deviceName: string | null;
  isActivated: boolean;
  activatedAt: string | null;
  createdAt: string;
}

interface TenantUser {
  id: string;
  username: string;
  nickname: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 创建/编辑租户的模态框
const TenantModal = ({
  isOpen,
  onClose,
  tenant,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSuccess: () => void;
}) => {
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    remark: '',
    initialCredits: 0,
    adminUsername: '',
    adminPassword: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        contactName: tenant.contactName || '',
        contactPhone: tenant.contactPhone || '',
        contactEmail: tenant.contactEmail || '',
        remark: tenant.remark || '',
        initialCredits: 0,
        adminUsername: '',
        adminPassword: '',
      });
    } else {
      setFormData({
        name: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        remark: '',
        initialCredits: 0,
        adminUsername: '',
        adminPassword: '',
      });
    }
  }, [tenant, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (tenant) {
        // 更新租户
        await apiClient.tenants.update(tenant.id, {
          name: formData.name,
          contactName: formData.contactName || null,
          contactPhone: formData.contactPhone || null,
          contactEmail: formData.contactEmail || null,
          remark: formData.remark || null,
        });
        toast.success('租户更新成功');
      } else {
        // 创建租户
        if (!formData.adminUsername || !formData.adminPassword) {
          toast.error('请填写管理员用户名和密码');
          setLoading(false);
          return;
        }
        await apiClient.tenants.create({
          name: formData.name,
          contactName: formData.contactName || undefined,
          contactPhone: formData.contactPhone || undefined,
          contactEmail: formData.contactEmail || undefined,
          remark: formData.remark || undefined,
          initialCredits: formData.initialCredits,
          adminUsername: formData.adminUsername,
          adminPassword: formData.adminPassword,
        });
        toast.success('租户创建成功');
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {tenant ? '编辑租户' : '创建租户'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              租户名称 *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="公司/组织名称"
            />
          </div>

          {!tenant && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    管理员用户名 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.adminUsername}
                    onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    管理员密码 *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formData.adminPassword}
                    onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="至少6位"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  初始积分
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.initialCredits}
                  onChange={(e) => setFormData({ ...formData, initialCredits: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                联系人
              </label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                联系电话
              </label>
              <input
                type="text"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              联系邮箱
            </label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              备注
            </label>
            <textarea
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '处理中...' : tenant ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 充值模态框
const RechargeModal = ({
  isOpen,
  onClose,
  tenant,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSuccess: () => void;
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    const amountNum = parseInt(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('请输入有效的充值金额');
      return;
    }

    setLoading(true);
    try {
      await apiClient.tenants.recharge(tenant.id, {
        amount: amountNum,
        description: description || undefined,
      });
      toast.success(`充值成功！当前积分已更新`);
      onSuccess();
      onClose();
      setAmount('');
      setDescription('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '充值失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !tenant) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md mx-4">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">为租户充值</h2>
          <p className="text-sm text-gray-500 mt-1">{tenant.name}</p>
          <p className="text-sm text-gray-500">当前积分: <span className="text-amber-500 font-medium">{tenant.credits.toLocaleString()}</span></p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              充值积分 *
            </label>
            <input
              type="number"
              required
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="输入充值积分数量"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              备注
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="充值说明（可选）"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              取消
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
              {loading ? '处理中...' : '确认充值'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 租户详情模态框（用户+激活码管理）
const TenantDetailModal = ({
  isOpen,
  onClose,
  tenantId,
}: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
}) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [activations, setActivations] = useState<ClientActivation[]>([]);
  const [activationStats, setActivationStats] = useState({ total: 0, activated: 0, available: 0, maxClients: 5 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'activations'>('users');

  // 用户表单
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', nickname: '', isAdmin: false });
  const [userFormLoading, setUserFormLoading] = useState(false);

  // 激活码生成
  const [generateCount, setGenerateCount] = useState(1);
  const [generating, setGenerating] = useState(false);

  const loadTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiClient.tenants.getById(tenantId);
      setTenant(res.data);
      setUsers(res.data.users || []);
    } catch (error: any) {
      toast.error('加载租户信息失败');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadActivations = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await apiClient.tenants.activations.getList(tenantId);
      setActivations(res.data.activations);
      setActivationStats(res.data.stats);
    } catch (error: any) {
      toast.error('加载激活码失败');
    }
  }, [tenantId]);

  useEffect(() => {
    if (isOpen && tenantId) {
      loadTenant();
      loadActivations();
    }
  }, [isOpen, tenantId, loadTenant, loadActivations]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setUserFormLoading(true);
    try {
      await apiClient.tenants.users.create(tenant.id, {
        username: userForm.username,
        password: userForm.password,
        nickname: userForm.nickname || undefined,
        isAdmin: userForm.isAdmin,
      });
      toast.success('用户创建成功');
      setShowUserForm(false);
      setUserForm({ username: '', password: '', nickname: '', isAdmin: false });
      loadTenant();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '创建失败');
    } finally {
      setUserFormLoading(false);
    }
  };

  const handleDeleteUser = async (user: TenantUser) => {
    if (!tenant || !confirm(`确定要删除用户「${user.username}」吗？`)) return;
    try {
      await apiClient.tenants.users.delete(tenant.id, user.id);
      toast.success('用户已删除');
      loadTenant();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleToggleUserActive = async (user: TenantUser) => {
    if (!tenant) return;
    try {
      await apiClient.tenants.users.update(tenant.id, user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? '用户已禁用' : '用户已启用');
      loadTenant();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleGenerateActivations = async () => {
    if (!tenant) return;
    setGenerating(true);
    try {
      await apiClient.tenants.activations.generate(tenant.id, generateCount);
      toast.success(`成功生成 ${generateCount} 个激活码`);
      loadActivations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleUnbindActivation = async (activation: ClientActivation) => {
    if (!tenant || !confirm('确定要解绑该设备吗？')) return;
    try {
      await apiClient.tenants.activations.unbind(tenant.id, activation.id);
      toast.success('设备已解绑');
      loadActivations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '解绑失败');
    }
  };

  const handleDeleteActivation = async (activation: ClientActivation) => {
    if (!tenant || !confirm('确定要删除该激活码吗？')) return;
    try {
      await apiClient.tenants.activations.delete(tenant.id, activation.id);
      toast.success('激活码已删除');
      loadActivations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const copyCode = async (code: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        toast.success('已复制激活码');
      } else {
        // 回退方案：使用临时 textarea
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (success) {
          toast.success('已复制激活码');
        } else {
          toast.error('复制失败，请手动复制');
        }
      }
    } catch (err) {
      // 最终回退
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('已复制激活码');
      } catch {
        toast.error('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {loading ? '加载中...' : tenant?.name}
            </h2>
            {tenant && (
              <p className="text-sm text-gray-500">
                积分: <span className="text-amber-500 font-medium">{tenant.credits.toLocaleString()}</span>
                <span className="mx-2">·</span>
                客户端: <span className="text-purple-500 font-medium">{activationStats.activated}/{activationStats.maxClients}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'users' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            用户管理 ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('activations')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'activations' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Key className="w-4 h-4 inline mr-2" />
            激活码管理 ({activationStats.total})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          ) : tenant ? (
            <>
              {/* 用户管理 Tab */}
              {activeTab === 'users' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">用户列表</h3>
                    <button
                      onClick={() => setShowUserForm(!showUserForm)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                    >
                      <UserPlus className="w-4 h-4" />
                      添加用户
                    </button>
                  </div>

                  {showUserForm && (
                    <form onSubmit={handleCreateUser} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" required placeholder="用户名 *" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm" />
                        <input type="password" required minLength={6} placeholder="密码 *（至少6位）" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm" />
                      </div>
                      <div className="flex gap-3 items-center">
                        <input type="text" placeholder="昵称（可选）" value={userForm.nickname} onChange={(e) => setUserForm({ ...userForm, nickname: e.target.value })} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm" />
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={userForm.isAdmin} onChange={(e) => setUserForm({ ...userForm, isAdmin: e.target.checked })} className="rounded" />管理员</label>
                        <button type="submit" disabled={userFormLoading} className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:opacity-50">{userFormLoading ? '创建中...' : '创建'}</button>
                        <button type="button" onClick={() => setShowUserForm(false)} className="px-4 py-2 text-gray-500 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">取消</button>
                      </div>
                    </form>
                  )}

                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                          <th className="text-left px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">用户名</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">昵称</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">角色</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">状态</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{user.username}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.nickname || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${user.isAdmin ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{user.isAdmin ? '管理员' : '普通用户'}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handleToggleUserActive(user)} className={`text-xs px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{user.isActive ? '启用' : '禁用'}</button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handleDeleteUser(user)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="删除"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无用户</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 激活码管理 Tab */}
              {activeTab === 'activations' && (
                <div className="space-y-4">
                  {/* 统计和生成 */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <div className="text-sm">
                        <span className="text-gray-500">已激活:</span>
                        <span className="ml-1 font-medium text-green-600">{activationStats.activated}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">未使用:</span>
                        <span className="ml-1 font-medium text-gray-600">{activationStats.available}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">配额:</span>
                        <span className="ml-1 font-medium text-purple-600">{activationStats.maxClients}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={activationStats.maxClients - activationStats.total}
                        value={generateCount}
                        onChange={(e) => setGenerateCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center"
                      />
                      <button
                        onClick={handleGenerateActivations}
                        disabled={generating || activationStats.total >= activationStats.maxClients}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        {generating ? '生成中...' : '生成激活码'}
                      </button>
                    </div>
                  </div>

                  {/* 激活码列表 */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                          <th className="text-left px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">激活码</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">设备</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">状态</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">激活时间</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activations.map((act) => (
                          <tr key={act.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono text-gray-900 dark:text-white">{act.activationCode}</code>
                                <button onClick={() => copyCode(act.activationCode)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="复制">
                                  <Copy className="w-3 h-3 text-gray-400" />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {act.isActivated ? (
                                <div className="flex items-center gap-1">
                                  <Monitor className="w-4 h-4" />
                                  {act.deviceName || '未知设备'}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${act.isActivated ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                {act.isActivated ? '已激活' : '未使用'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {act.activatedAt ? new Date(act.activatedAt).toLocaleString('zh-CN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {act.isActivated ? (
                                <button onClick={() => handleUnbindActivation(act)} className="p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded" title="解绑">
                                  <Unlink className="w-4 h-4" />
                                </button>
                              ) : (
                                <button onClick={() => handleDeleteActivation(act)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="删除">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {activations.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无激活码，请点击生成</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-400 py-12">加载失败</div>
          )}
        </div>
      </div>
    </div>
  );
};

// 主页面
const TenantsPage = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 模态框状态
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeTenant, setRechargeTenant] = useState<Tenant | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.tenants.getList({
        page: pagination.page,
        limit: pagination.limit,
        search: search || undefined,
      });
      setTenants(res.data);
      setPagination(res.pagination);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取租户列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`确定要删除租户「${tenant.name}」吗？该操作将删除所有相关数据！`)) return;
    try {
      await apiClient.tenants.delete(tenant.id);
      toast.success('租户已删除');
      fetchTenants();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  const handleToggleActive = async (tenant: Tenant) => {
    try {
      await apiClient.tenants.update(tenant.id, { isActive: !tenant.isActive });
      toast.success(tenant.isActive ? '租户已禁用' : '租户已启用');
      fetchTenants();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleResetApiKey = async (tenant: Tenant) => {
    if (!confirm(`确定要重设租户「${tenant.name}」的 API Key 吗？\n\n⚠️ 重设后：\n• 旧的 API Key 立即失效\n• 租户服务端需要重新配置\n• 设备绑定将被解除`)) {
      return;
    }
    try {
      const res = await apiClient.post(`/client/reset-api-key/${tenant.id}`);
      const newApiKey = res.data?.data?.apiKey;
      toast.success(`API Key 已重设！\n\n新的 Key: ${newApiKey}\n\n请复制并发送给租户`, { duration: 10000 });
      fetchTenants();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '重设失败');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">租户管理</h1>
          <p className="text-gray-500 mt-1">管理所有租户及其用户</p>
        </div>
        <button
          onClick={() => { setEditingTenant(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建租户
        </button>
      </div>

      {/* 搜索 */}
      <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索租户名称、联系人、电话..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all"
          >
            搜索
          </button>
        </form>
      </div>

      {/* 租户列表 */}
      <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无租户数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">租户</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">联系人</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">积分</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">客户端</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">服务端</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">状态</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">创建时间</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                          {tenant.name[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{tenant.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <code className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                              {tenant.apiKey}
                            </code>
                            <button
                              onClick={async () => {
                                try {
                                  if (navigator.clipboard && window.isSecureContext) {
                                    await navigator.clipboard.writeText(tenant.apiKey);
                                    toast.success('API Key 已复制');
                                  } else {
                                    const textArea = document.createElement('textarea');
                                    textArea.value = tenant.apiKey;
                                    textArea.style.position = 'fixed';
                                    textArea.style.left = '-9999px';
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(textArea);
                                    toast.success('API Key 已复制');
                                  }
                                } catch {
                                  const textArea = document.createElement('textarea');
                                  textArea.value = tenant.apiKey;
                                  textArea.style.position = 'fixed';
                                  textArea.style.left = '-9999px';
                                  document.body.appendChild(textArea);
                                  textArea.select();
                                  document.execCommand('copy');
                                  document.body.removeChild(textArea);
                                  toast.success('API Key 已复制');
                                }
                              }}
                              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title="复制 API Key"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">{tenant.contactName || '-'}</div>
                      <div className="text-xs text-gray-400">{tenant.contactPhone || '-'}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-lg font-bold text-amber-500">{tenant.credits.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-medium">
                        <span className={tenant.onlineClients > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>{tenant.onlineClients || 0}</span>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-gray-600 dark:text-gray-400">{tenant.totalClients || 0}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {tenant.serverActivated ? (
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            tenant.lastHeartbeat && (Date.now() - new Date(tenant.lastHeartbeat).getTime()) < 60000
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              tenant.lastHeartbeat && (Date.now() - new Date(tenant.lastHeartbeat).getTime()) < 60000
                                ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                            }`} />
                            {tenant.lastHeartbeat && (Date.now() - new Date(tenant.lastHeartbeat).getTime()) < 60000 ? '在线' : '离线'}
                          </span>
                          {tenant.serverIp && <span className="text-[10px] text-gray-400 mt-0.5">{tenant.serverIp}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">未激活</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleToggleActive(tenant)}
                        className={`text-xs px-2 py-1 rounded-full ${
                          tenant.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {tenant.isActive ? '启用' : '禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {new Date(tenant.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setDetailTenantId(tenant.id); setShowDetailModal(true); }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-blue-500"
                          title="查看详情"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setRechargeTenant(tenant); setShowRechargeModal(true); }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-green-500"
                          title="充值"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setEditingTenant(tenant); setShowModal(true); }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-amber-500"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetApiKey(tenant)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-purple-500"
                          title="重设 API Key"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(tenant)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-red-500"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 模态框 */}
      <TenantModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        tenant={editingTenant}
        onSuccess={fetchTenants}
      />
      <RechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        tenant={rechargeTenant}
        onSuccess={fetchTenants}
      />
      <TenantDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        tenantId={detailTenantId}
      />
    </div>
  );
};

export default TenantsPage;

