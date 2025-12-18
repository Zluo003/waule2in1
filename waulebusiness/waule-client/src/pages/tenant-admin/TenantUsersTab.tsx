import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';

interface TenantUser {
  id: string;
  username: string;
  nickname: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserWorkflow {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TenantUsersTab = () => {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showWorkflowsModal, setShowWorkflowsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [userWorkflows, setUserWorkflows] = useState<UserWorkflow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);

  // 表单状态
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    nickname: '',
    isAdmin: false,
  });
  const [newPassword, setNewPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenant-auth/admin/users', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: search || undefined,
        },
      });
      setUsers(res.data);
      setPagination(res.pagination);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username || !createForm.password) {
      toast.error('请填写用户名和密码');
      return;
    }
    if (createForm.password.length < 6) {
      toast.error('密码至少6位');
      return;
    }

    setFormLoading(true);
    try {
      await apiClient.post('/tenant-auth/admin/users', createForm);
      toast.success('用户创建成功');
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', nickname: '', isAdmin: false });
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '创建失败');
    } finally {
      setFormLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('密码至少6位');
      return;
    }

    setFormLoading(true);
    try {
      await apiClient.post(`/tenant-auth/admin/users/${selectedUser.id}/reset-password`, {
        password: newPassword,
      });
      toast.success('密码已重置');
      setShowResetPasswordModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || '重置失败');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (user: TenantUser) => {
    try {
      await apiClient.put(`/tenant-auth/admin/users/${user.id}`, {
        isActive: !user.isActive,
      });
      toast.success(user.isActive ? '用户已禁用' : '用户已启用');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '操作失败');
    }
  };

  const handleViewWorkflows = async (user: TenantUser) => {
    setSelectedUser(user);
    setShowWorkflowsModal(true);
    setWorkflowsLoading(true);
    try {
      const res = await apiClient.get(`/tenant-auth/admin/users/${user.id}/workflows`);
      setUserWorkflows(res.data.workflows);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取工作流失败');
    } finally {
      setWorkflowsLoading(false);
    }
  };

  const handleDeleteUser = async (user: TenantUser) => {
    if (!confirm(`确定要删除用户「${user.username}」吗？`)) return;
    try {
      await apiClient.delete(`/tenant-auth/admin/users/${user.id}`);
      toast.success('用户已删除');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '删除失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 搜索和操作栏 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400">
              search
            </span>
            <input
              type="text"
              placeholder="搜索用户名、昵称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-neutral-800/20"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
          >
            搜索
          </button>
        </form>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-xl hover:shadow-lg hover:shadow-neutral-800/25 transition-all"
        >
          <span className="material-symbols-outlined text-xl">person_add</span>
          新建用户
        </button>
      </div>

      {/* 用户列表 */}
      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-neutral-800/20 border-t-neutral-800" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
              group_off
            </span>
            <p className="text-gray-500">暂无用户</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    用户
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    角色
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    状态
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    最后登录
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-800 flex items-center justify-center text-white font-medium">
                          {(user.nickname || user.username)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {user.nickname || user.username}
                          </p>
                          <p className="text-sm text-gray-500">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          user.isAdmin
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-neutral-600'
                            : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {user.isAdmin ? 'shield_person' : 'person'}
                        </span>
                        {user.isAdmin ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          user.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {user.isActive ? '正常' : '已禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString('zh-CN')
                        : '从未登录'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewWorkflows(user)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-blue-500 transition-colors"
                          title="查看工作流"
                        >
                          <span className="material-symbols-outlined text-xl">account_tree</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowResetPasswordModal(true);
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-amber-500 transition-colors"
                          title="重置密码"
                        >
                          <span className="material-symbols-outlined text-xl">key</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-red-500 transition-colors"
                          title="删除"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/10">
            <p className="text-sm text-gray-500">
              第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 创建用户模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] no-drag">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-md mx-4 shadow-xl">
            <div className="p-6 border-b border-gray-100 dark:border-white/10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">新建用户</h3>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  用户名 *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-800/20 text-gray-900 dark:text-white"
                  placeholder="请输入用户名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  密码 *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-800/20 text-gray-900 dark:text-white"
                  placeholder="至少6位"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  昵称
                </label>
                <input
                  type="text"
                  value={createForm.nickname}
                  onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-800/20 text-gray-900 dark:text-white"
                  placeholder="显示名称（可选）"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.isAdmin}
                    onChange={(e) => setCreateForm({ ...createForm, isAdmin: e.target.checked })}
                    className="w-4 h-4 rounded text-neutral-800 focus:ring-neutral-800"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">设为管理员</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  {formLoading ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 重置密码模态框 */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] no-drag">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-md mx-4 shadow-xl">
            <div className="p-6 border-b border-gray-100 dark:border-white/10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">重置密码</h3>
              <p className="text-sm text-gray-500 mt-1">
                为用户「{selectedUser.nickname || selectedUser.username}」设置新密码
              </p>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  新密码 *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-800/20 text-gray-900 dark:text-white"
                  placeholder="至少6位"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setSelectedUser(null);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {formLoading ? '重置中...' : '确认重置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 用户工作流模态框 */}
      {showWorkflowsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] no-drag">
          <div className="bg-white dark:bg-card-dark rounded-2xl w-full max-w-3xl mx-4 shadow-xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedUser.nickname || selectedUser.username} 的工作流
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  点击工作流可以只读方式查看
                </p>
              </div>
              <button
                onClick={() => {
                  setShowWorkflowsModal(false);
                  setSelectedUser(null);
                  setUserWorkflows([]);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {workflowsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="material-symbols-outlined animate-spin text-4xl text-neutral-800">progress_activity</span>
                </div>
              ) : userWorkflows.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                  <p>该用户暂无工作流</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userWorkflows.map((wf) => (
                    <div
                      key={wf.id}
                      onClick={() => {
                        window.open(`/workflow/${wf.id}?readonly=true`, '_blank');
                      }}
                      className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-white">account_tree</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{wf.name}</p>
                            <p className="text-sm text-gray-500">{wf.projectName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">{wf.nodeCount} 个节点</p>
                          <p className="text-xs text-gray-400">
                            {new Date(wf.updatedAt).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantUsersTab;




