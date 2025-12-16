import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, Users, Crown, Sparkles, Shield, Eye, FolderOpen, Image, Video, X } from 'lucide-react';

interface User {
  id: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  nickname: string | null;
  avatar: string | null;
  role: 'USER' | 'VIP' | 'SVIP' | 'ADMIN' | 'INTERNAL';
  credits: number;
  membershipExpireAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  _count: {
    projects: number;
    assets: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  
  // 巡查功能状态
  const [inspectingUser, setInspectingUser] = useState<User | null>(null);
  const [inspectType, setInspectType] = useState<'workflows' | 'assets' | null>(null);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<any>(null);
  const [libraryAssets, setLibraryAssets] = useState<any>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;

      const res = await apiClient.admin.getUsers(params);
      if (res.success) {
        setUsers(res.data);
        setPagination(res.pagination);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleToggleActive = async (user: User) => {
    // 管理员不能被禁用
    if (user.role === 'ADMIN') {
      toast.error('管理员账户不能被禁用');
      return;
    }
    
    const newStatus = !user.isActive;
    const action = newStatus ? '启用' : '禁用';
    
    if (!confirm(`确定要${action}用户「${user.nickname || user.phone || user.id}」吗？`)) {
      return;
    }
    
    try {
      await apiClient.admin.updateUser(user.id, { isActive: newStatus });
      toast.success(`用户已${action}`);
      // 更新本地状态
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: newStatus } : u))
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || `${action}失败`);
    }
  };

  const handleChangeRole = async (user: User, newRole: string) => {
    if (user.role === newRole) return;
    
    // 不能修改管理员的角色
    if (user.role === 'ADMIN') {
      toast.error('不能修改管理员的角色');
      return;
    }
    
    const roleNames: Record<string, string> = {
      USER: '普通用户',
      VIP: 'VIP',
      SVIP: 'SVIP',
      INTERNAL: '内部用户',
    };
    
    if (!confirm(`确定要将用户「${user.nickname || user.phone || user.id}」的类型改为「${roleNames[newRole] || newRole}」吗？`)) {
      return;
    }
    
    try {
      await apiClient.admin.updateUser(user.id, { role: newRole });
      toast.success(`用户类型已更新为 ${roleNames[newRole] || newRole}`);
      // 更新本地状态
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole as User['role'] } : u))
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
            <Shield className="w-3 h-3" />
            管理员
          </span>
        );
      case 'SVIP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400">
            <Sparkles className="w-3 h-3" />
            SVIP
          </span>
        );
      case 'VIP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
            <Crown className="w-3 h-3" />
            VIP
          </span>
        );
      case 'INTERNAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            内部用户
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
            <Users className="w-3 h-3" />
            普通用户
          </span>
        );
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatExpireDate = (dateStr: string | null, role: string) => {
    if (role === 'USER' || role === 'ADMIN' || role === 'INTERNAL') return '-';
    if (!dateStr) return '永久';
    const expireDate = new Date(dateStr);
    const now = new Date();
    const isExpired = expireDate < now;
    const formatted = expireDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return isExpired ? (
      <span className="text-red-400">{formatted} (已过期)</span>
    ) : (
      <span className="text-green-400">{formatted}</span>
    );
  };

  const maskPhone = (phone: string | null) => {
    if (!phone) return '-';
    if (phone.length === 11) {
      return phone.slice(0, 3) + '****' + phone.slice(7);
    }
    return phone;
  };

  // 修改会员到期日期
  const handleChangeMembershipExpire = async (user: User) => {
    // 仅VIP/SVIP可修改
    if (user.role !== 'VIP' && user.role !== 'SVIP') {
      toast.error('只能修改VIP或SVIP用户的会员到期时间');
      return;
    }
    
    const currentDate = user.membershipExpireAt 
      ? new Date(user.membershipExpireAt).toISOString().split('T')[0] 
      : '';
    
    const newDate = prompt(
      `请输入新的会员到期日期 (格式: YYYY-MM-DD)\n留空表示永久会员\n当前: ${currentDate || '永久'}`,
      currentDate
    );
    
    if (newDate === null) return; // 取消
    
    try {
      await apiClient.admin.updateUser(user.id, { 
        membershipExpireAt: newDate === '' ? null : newDate 
      });
      toast.success('会员到期日期已更新');
      // 更新本地状态
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { 
          ...u, 
          membershipExpireAt: newDate === '' ? null : new Date(newDate).toISOString() 
        } : u))
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || '更新失败');
    }
  };

  // 巡查：查看用户工作流
  const handleInspectWorkflows = async (user: User) => {
    setInspectingUser(user);
    setInspectType('workflows');
    setInspectLoading(true);
    setInspectData(null);
    try {
      const res = await apiClient.admin.inspection.getUserWorkflows(user.id);
      if (res.success) {
        setInspectData(res.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取工作流失败');
      setInspectingUser(null);
      setInspectType(null);
    } finally {
      setInspectLoading(false);
    }
  };

  // 巡查：查看用户资产库
  const handleInspectAssets = async (user: User) => {
    setInspectingUser(user);
    setInspectType('assets');
    setInspectLoading(true);
    setInspectData(null);
    setSelectedLibrary(null);
    setLibraryAssets(null);
    try {
      const res = await apiClient.admin.inspection.getUserAssetLibraries(user.id);
      if (res.success) {
        setInspectData(res.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取资产库失败');
      setInspectingUser(null);
      setInspectType(null);
    } finally {
      setInspectLoading(false);
    }
  };

  // 巡查：查看资产库内容
  const handleViewLibraryAssets = async (library: any) => {
    setSelectedLibrary(library);
    setInspectLoading(true);
    try {
      const res = await apiClient.admin.inspection.getAssetLibraryAssets(library.id);
      if (res.success) {
        setLibraryAssets(res.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || '获取资产列表失败');
    } finally {
      setInspectLoading(false);
    }
  };

  // 关闭巡查弹窗
  const closeInspectModal = () => {
    setInspectingUser(null);
    setInspectType(null);
    setInspectData(null);
    setSelectedLibrary(null);
    setLibraryAssets(null);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-text-light-primary dark:text-text-dark-primary">用户管理</h1>
        <div className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
          共 {pagination.total} 位用户
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl p-4 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索手机号、昵称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500"
          >
            <option value="">全部类型</option>
            <option value="USER">普通用户</option>
            <option value="VIP">VIP</option>
            <option value="SVIP">SVIP</option>
            <option value="ADMIN">管理员</option>
          </select>
          <button
            type="submit"
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all"
          >
            搜索
          </button>
        </form>
      </div>

      {/* 用户列表 */}
      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-2 border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无用户数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">用户</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">手机号</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">类型</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">积分</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">会员到期</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">项目数</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">注册时间</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">最后登录</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">状态</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">巡查</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-medium overflow-hidden">
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (user.nickname || user.phone || '?')[0].toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-text-light-primary dark:text-text-dark-primary">
                            {user.nickname || '未设置昵称'}
                          </div>
                          <div className="text-xs text-gray-400">ID: {user.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-light-primary dark:text-text-dark-primary">
                      {maskPhone(user.phone)}
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'ADMIN' ? (
                        getRoleBadge(user.role)
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeRole(user, e.target.value)}
                          className="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-text-light-primary dark:text-text-dark-primary focus:outline-none focus:border-purple-500 cursor-pointer"
                        >
                          <option value="USER">普通用户</option>
                          <option value="VIP">VIP</option>
                          <option value="SVIP">SVIP</option>
                          <option value="INTERNAL">内部用户</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-amber-500">{user.credits.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(user.role === 'VIP' || user.role === 'SVIP') ? (
                        <button
                          onClick={() => handleChangeMembershipExpire(user)}
                          className="hover:underline cursor-pointer"
                          title="点击修改到期日期"
                        >
                          {formatExpireDate(user.membershipExpireAt, user.role)}
                        </button>
                      ) : (
                        formatExpireDate(user.membershipExpireAt, user.role)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text-light-primary dark:text-text-dark-primary">
                      {user._count.projects}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-center">
                      {user.role === 'ADMIN' ? (
                        <span className="inline-block px-2 py-1 text-xs rounded bg-green-500/20 text-green-400">启用</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(user);
                          }}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            user.isActive
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          }`}
                        >
                          {user.isActive ? '启用' : '禁用'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleInspectWorkflows(user)}
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                          title="查看工作流"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleInspectAssets(user)}
                          className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                          title="查看资产库"
                        >
                          <FolderOpen className="w-4 h-4" />
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
            <div className="text-sm text-gray-400">
              第 {pagination.page} / {pagination.totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-text-light-primary dark:text-text-dark-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 巡查弹窗 */}
      {inspectingUser && inspectType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
              <div>
                <h2 className="text-xl font-bold text-text-light-primary dark:text-text-dark-primary">
                  {inspectType === 'workflows' ? '工作流巡查' : '资产库巡查'}
                </h2>
                <p className="text-sm text-gray-400">
                  用户：{inspectingUser.nickname || inspectingUser.phone || inspectingUser.id}
                </p>
              </div>
              <button
                onClick={closeInspectModal}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-6">
              {inspectLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
                </div>
              ) : inspectType === 'workflows' ? (
                /* 工作流列表 */
                <div className="space-y-4">
                  {inspectData?.workflows?.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">该用户暂无工作流</div>
                  ) : (
                    inspectData?.workflows?.map((wf: any) => (
                      <div
                        key={wf.id}
                        className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-medium text-text-light-primary dark:text-text-dark-primary">
                              {wf.name}
                            </h3>
                            {wf.description && (
                              <p className="text-sm text-gray-400 mt-1">{wf.description}</p>
                            )}
                          </div>
                          <div className="text-right text-xs text-gray-400">
                            <div>节点: {wf.nodeCount}</div>
                            <div>连线: {wf.edgeCount}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(wf.nodeTypes || {}).map(([type, count]) => (
                            <span
                              key={type}
                              className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-400"
                            >
                              {type}: {count as number}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 text-xs text-gray-400">
                          更新于 {new Date(wf.updatedAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* 资产库列表 */
                <div className="space-y-4">
                  {selectedLibrary ? (
                    /* 资产库内容 */
                    <div>
                      <button
                        onClick={() => {
                          setSelectedLibrary(null);
                          setLibraryAssets(null);
                        }}
                        className="mb-4 text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        ← 返回资产库列表
                      </button>
                      <h3 className="text-lg font-medium text-text-light-primary dark:text-text-dark-primary mb-4">
                        {selectedLibrary.name}
                      </h3>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                        {libraryAssets?.assets?.map((asset: any) => (
                          <div
                            key={asset.id}
                            className="aspect-square rounded-lg overflow-hidden bg-slate-200 dark:bg-white/10 relative group"
                          >
                            {asset.type === 'IMAGE' ? (
                              <img
                                src={asset.thumbnail || asset.url}
                                alt={asset.name}
                                className="w-full h-full object-cover"
                              />
                            ) : asset.type === 'VIDEO' ? (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="w-8 h-8 text-gray-400" />
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                              <span className="text-[10px] text-white truncate w-full">
                                {asset.name}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {libraryAssets?.assets?.length === 0 && (
                        <div className="text-center py-12 text-gray-400">该资产库暂无资产</div>
                      )}
                    </div>
                  ) : (
                    /* 资产库列表 */
                    <>
                      {inspectData?.libraries?.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">该用户暂无资产库</div>
                      ) : (
                        inspectData?.libraries?.map((lib: any) => (
                          <div
                            key={lib.id}
                            onClick={() => handleViewLibraryAssets(lib)}
                            className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer hover:border-purple-400 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-white/10 overflow-hidden flex-shrink-0">
                                {lib.thumbnail ? (
                                  <img
                                    src={lib.thumbnail}
                                    alt={lib.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FolderOpen className="w-6 h-6 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-medium text-text-light-primary dark:text-text-dark-primary">
                                  {lib.name}
                                </h3>
                                {lib.description && (
                                  <p className="text-sm text-gray-400 mt-1">{lib.description}</p>
                                )}
                                <div className="text-xs text-gray-400 mt-2">
                                  {lib.assetCount} 个资产 · 更新于 {new Date(lib.updatedAt).toLocaleString('zh-CN')}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;

