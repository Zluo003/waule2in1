import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';
import { toast } from 'sonner';

interface SystemMessage {
  id: string;
  title: string;
  content: string;
  type: string;
  targetType: string;
  targetRoles: string[];
  recipientCount: number;
  readCount: number;
  createdAt: string;
  sender: { nickname: string | null; username: string | null };
}

const MESSAGE_TYPES = [
  { value: 'NOTIFICATION', label: '通知' },
  { value: 'ANNOUNCEMENT', label: '公告' },
  { value: 'PROMOTION', label: '促销' },
  { value: 'SYSTEM', label: '系统' },
];

const TARGET_TYPES = [
  { value: 'ALL', label: '所有用户' },
  { value: 'ROLE', label: '指定角色' },
];

const ROLES = [
  { value: 'USER', label: '普通用户' },
  { value: 'VIP', label: 'VIP用户' },
  { value: 'SVIP', label: 'SVIP用户' },
];

const MessageManagementPage = () => {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'NOTIFICATION',
    targetType: 'ALL',
    targetRoles: [] as string[],
  });

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/messages/admin/list');
      if (res.success) {
        setMessages(res.data.list || []);
      }
    } catch (error) {
      console.error('加载消息失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('请填写标题和内容');
      return;
    }

    if (form.targetType === 'ROLE' && form.targetRoles.length === 0) {
      toast.error('请选择目标角色');
      return;
    }

    setSending(true);
    try {
      const res = await apiClient.post('/messages/admin/send', {
        title: form.title,
        content: form.content,
        type: form.type,
        targetType: form.targetType,
        targetRoles: form.targetRoles,
      });
      if (res.success) {
        toast.success(res.message);
        setShowComposeModal(false);
        setForm({ title: '', content: '', type: 'NOTIFICATION', targetType: 'ALL', targetRoles: [] });
        loadMessages();
      } else {
        toast.error(res.message);
      }
    } catch (error: any) {
      toast.error(error.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此消息？')) return;

    try {
      const res = await apiClient.delete(`/messages/admin/${id}`);
      if (res.success) {
        toast.success('删除成功');
        loadMessages();
      }
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter(r => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">站内消息管理</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-1">撰写和管理系统消息</p>
        </div>
        <button
          onClick={() => setShowComposeModal(true)}
          className="px-4 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">edit</span>
          撰写消息
        </button>
      </div>

      {/* 消息列表 */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined text-2xl text-neutral-400 animate-spin">progress_activity</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-gray-400">
            <span className="material-symbols-outlined text-4xl mb-2">mail</span>
            <p>暂无消息</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">标题</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">类型</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">目标</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">送达/已读</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">发送时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {messages.map(msg => (
                <tr key={msg.id} className="border-b border-slate-100 dark:border-border-dark/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{msg.title}</div>
                    <div className="text-xs text-slate-500 truncate max-w-xs">{msg.content}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                      {MESSAGE_TYPES.find(t => t.value === msg.type)?.label || msg.type}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600 dark:text-gray-400">
                    {msg.targetType === 'ALL' ? '所有用户' : msg.targetRoles.join(', ')}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className="text-slate-900 dark:text-white">{msg.recipientCount}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-green-500">{msg.readCount}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">
                    {new Date(msg.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 撰写消息弹窗 */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-card-dark rounded-2xl p-6 w-full max-w-lg mx-4 border border-slate-200 dark:border-border-dark">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">撰写消息</h3>

            <div className="space-y-4">
              {/* 标题 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">标题</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="消息标题"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-sm"
                />
              </div>

              {/* 内容 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">内容</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  placeholder="消息内容"
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-sm resize-none"
                />
              </div>

              {/* 类型 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">消息类型</label>
                <div className="flex gap-2">
                  {MESSAGE_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        form.type === t.value
                          ? 'border-neutral-800 dark:border-white bg-neutral-800 dark:bg-white text-white dark:text-black'
                          : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 目标 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">发送目标</label>
                <div className="flex gap-2 mb-2">
                  {TARGET_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm({ ...form, targetType: t.value, targetRoles: [] })}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        form.targetType === t.value
                          ? 'border-neutral-800 dark:border-white bg-neutral-800 dark:bg-white text-white dark:text-black'
                          : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {form.targetType === 'ROLE' && (
                  <div className="flex gap-2 mt-2">
                    {ROLES.map(r => (
                      <button
                        key={r.value}
                        onClick={() => toggleRole(r.value)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          form.targetRoles.includes(r.value)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                            : 'border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowComposeModal(false)}
                className="flex-1 py-2 border border-slate-200 dark:border-border-dark rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {sending ? '发送中...' : '发送消息'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageManagementPage;
