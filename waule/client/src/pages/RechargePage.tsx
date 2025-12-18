import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

type TabType = 'packages' | 'credits' | 'orders' | 'transactions';
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
  isRecommend: boolean;
}

interface OrderInfo {
  orderId: string;
  orderNo: string;
  qrCodeUrl: string;
  amount: number;
  credits: number;
  expireAt: string;
  package: {
    name: string;
    credits: number;
    bonusCredits: number;
  };
}

interface PaymentOrder {
  id: string;
  orderNo: string;
  amount: number;
  credits: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  paidAt: string | null;
  package: { name: string; coverImage: string | null } | null;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance: number;
  description: string;
  createdAt: string;
}

const orderStatusLabels: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待支付', color: 'text-amber-500' },
  PAID: { text: '已支付', color: 'text-green-500' },
  FAILED: { text: '支付失败', color: 'text-red-500' },
  EXPIRED: { text: '已过期', color: 'text-gray-500' },
  REFUNDED: { text: '已退款', color: 'text-neutral-500' },
  CANCELLED: { text: '已取消', color: 'text-gray-500' },
};

const transactionTypeLabels: Record<string, { text: string; icon: string; color: string }> = {
  RECHARGE: { text: '充值', icon: 'add_circle', color: 'text-green-500' },
  CONSUME: { text: '消费', icon: 'remove_circle', color: 'text-red-500' },
  REFUND: { text: '退还', icon: 'replay', color: 'text-blue-500' },
  GIFT: { text: '赠送', icon: 'card_giftcard', color: 'text-neutral-500' },
  ADMIN: { text: '调整', icon: 'admin_panel_settings', color: 'text-amber-500' },
  EXPIRE: { text: '过期', icon: 'schedule', color: 'text-gray-500' },
  REDEEM: { text: '兑换', icon: 'confirmation_number', color: 'text-orange-500' },
};

const RechargePage = () => {
  const { user, refreshUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('packages');
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // 兑换码相关
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  // 根据 Tab 加载对应类型的套餐
  useEffect(() => {
    if (activeTab === 'packages') {
      loadPackages('RECHARGE');
    } else if (activeTab === 'credits') {
      loadPackages('CREDITS');
    } else if (activeTab === 'orders' && orders.length === 0) {
      loadOrders();
    } else if (activeTab === 'transactions' && transactions.length === 0) {
      loadTransactions();
    }
  }, [activeTab]);

  const loadPackages = async (type: PackageType) => {
    try {
      setLoading(true);
      setSelectedPackage(null);
      const response = await apiClient.payment.getPackages(type);
      setPackages(response.data || []);
    } catch (error: any) {
      toast.error('加载套餐失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      setOrdersLoading(true);
      const response = await apiClient.payment.getOrders({ limit: 50 });
      setOrders(response.orders || []);
    } catch (error: any) {
      toast.error('加载订单失败');
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setTransactionsLoading(true);
      const response = await apiClient.payment.getTransactions({ limit: 50 });
      setTransactions(response.transactions || []);
    } catch (error: any) {
      toast.error('加载积分流水失败');
    } finally {
      setTransactionsLoading(false);
    }
  };

  // 轮询订单状态
  const pollOrderStatus = useCallback(async (orderNo: string) => {
    try {
      const response = await apiClient.payment.getOrderStatus(orderNo);
      const data = response.data;

      if (data.status === 'PAID') {
        setPolling(false);
        setPaymentSuccess(true);
        await refreshUser();
        toast.success('充值成功！');
        return true;
      } else if (data.status === 'EXPIRED' || data.status === 'CANCELLED') {
        setPolling(false);
        toast.error('订单已过期或取消');
        setOrderInfo(null);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }, [refreshUser]);

  // 轮询效果
  useEffect(() => {
    if (!orderInfo || !polling) return;

    const interval = setInterval(async () => {
      const finished = await pollOrderStatus(orderInfo.orderNo);
      if (finished) {
        clearInterval(interval);
      }
    }, 2000);

    // 5分钟后停止轮询
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [orderInfo, polling, pollOrderStatus]);

  const handleSelectPackage = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
    setOrderInfo(null);
    setPaymentSuccess(false);
  };

  const handleCreateOrder = async () => {
    if (!selectedPackage) return;

    try {
      setCreating(true);
      const response = await apiClient.payment.createOrder({
        packageId: selectedPackage.id,
        paymentMethod: 'ALIPAY',
      });
      setOrderInfo(response.data);
      setPolling(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '创建订单失败');
    } finally {
      setCreating(false);
    }
  };

  const handleClosePayment = () => {
    setOrderInfo(null);
    setPolling(false);
    setPaymentSuccess(false);
    setSelectedPackage(null);
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      toast.error('请输入兑换码');
      return;
    }

    try {
      setRedeeming(true);
      const response = await apiClient.redeem.redeem(redeemCode.trim());
      
      const { credits, memberLevel } = response.data;
      let message = `兑换成功！获得 ${credits} 积分`;
      if (memberLevel) {
        message += `，会员等级升级为 ${memberLevel}`;
      }
      toast.success(message);
      
      setRedeemCode('');
      refreshUser();
      loadTransactions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '兑换失败');
    } finally {
      setRedeeming(false);
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-neutral-600 via-neutral-500 to-blue-500 dark:from-neutral-400 dark:via-neutral-400 dark:to-neutral-400 bg-clip-text text-transparent mb-3">
            会员订阅
          </h1>
          <p className="text-slate-600 dark:text-gray-400 max-w-2xl mx-auto">
            订阅会员享受更多权益，购买积分解锁无限创作
          </p>
        </div>

        {/* 当前积分 */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full text-sm">
            <span className="material-symbols-outlined text-amber-500">diamond</span>
            <span className="text-slate-600 dark:text-gray-300">当前积分：</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">{user?.credits || 0}</span>
          </div>
        </div>

        {/* 兑换码输入区域 */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl p-2 shadow-sm">
            <div className="flex items-center gap-2 px-3">
              <span className="material-symbols-outlined text-amber-500">confirmation_number</span>
              <span className="text-slate-600 dark:text-gray-400 text-sm">兑换码：</span>
            </div>
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              placeholder="请输入16位兑换码"
              maxLength={20}
              className="w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-border-dark rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !redeemCode.trim()}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redeeming ? '兑换中...' : '立即兑换'}
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
            {[
              { key: 'packages', label: '会员订阅', icon: 'workspace_premium' },
              { key: 'credits', label: '购买积分', icon: 'diamond' },
              { key: 'orders', label: '订单记录', icon: 'receipt_long' },
              { key: 'transactions', label: '积分明细', icon: 'account_balance' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabType)}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        
        {/* 套餐列表 */}
        {(activeTab === 'packages' || activeTab === 'credits') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 max-w-5xl mx-auto">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              onClick={() => handleSelectPackage(pkg)}
              className={`relative group cursor-pointer transition-all duration-300 ${
                pkg.isRecommend 
                  ? 'scale-105 z-10 -translate-y-1' 
                  : ''
              } ${
                selectedPackage?.id === pkg.id
                  ? 'scale-105 z-20'
                  : 'hover:scale-102 hover:-translate-y-1'
              }`}
            >
              {/* 角标 */}
              {pkg.badge && (
                <div
                  className="absolute -top-2 -right-2 z-20 px-3 py-1 text-xs font-bold text-white rounded-full shadow-lg"
                  style={{ backgroundColor: pkg.badgeColor || '#ef4444' }}
                >
                  {pkg.badge}
                </div>
              )}

              <div
                className={`relative overflow-hidden rounded-2xl bg-white dark:bg-card-dark border transition-all duration-300 ${
                  pkg.isRecommend
                    ? 'ring-2 ring-amber-400 border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-500/10'
                    : 'border-slate-200 dark:border-border-dark'
                } ${
                  selectedPackage?.id === pkg.id
                    ? 'ring-2 ring-blue-500 border-blue-400 dark:border-blue-500 shadow-lg shadow-blue-500/10'
                    : 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="p-4">
                  {/* 套餐名称 */}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{pkg.name}</h3>
                  
                  {/* 封面图片 */}
                  {pkg.coverImage && (
                    <div className="mb-3 -mx-1 rounded-lg overflow-hidden">
                      <img
                        src={pkg.coverImage}
                        alt={pkg.name}
                        className="w-full h-28 object-cover"
                      />
                    </div>
                  )}
                  
                  {pkg.description && (
                    <p className="text-slate-500 dark:text-gray-400 text-xs mb-3 whitespace-pre-line leading-relaxed">
                      {pkg.description}
                    </p>
                  )}

                  {/* 价格 */}
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-slate-400 dark:text-gray-500 text-base">¥</span>
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">
                      {formatPrice(pkg.price)}
                    </span>
                  </div>

                  {/* 积分信息 */}
                  <div className="space-y-1.5 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-amber-500 text-base">diamond</span>
                      <span>{pkg.credits} 积分</span>
                    </div>
                    
                    {pkg.bonusCredits > 0 && (
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <span className="material-symbols-outlined text-base">add_circle</span>
                        <span>赠送 {pkg.bonusCredits} 积分</span>
                      </div>
                    )}

                    {pkg.memberLevel && (
                      <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                        <span className="material-symbols-outlined text-base">workspace_premium</span>
                        <span>
                          {pkg.memberLevel === 'VIP' ? 'VIP' : 'SVIP'}
                          {pkg.memberDays && ` ${pkg.memberDays}天`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 选择按钮 */}
                  <button
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      selectedPackage?.id === pkg.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {selectedPackage?.id === pkg.id ? '已选择' : '选择套餐'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* 订单记录 */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-2xl overflow-hidden">
            {ordersLoading ? (
              <div className="p-12 text-center text-slate-500 dark:text-gray-400">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center">
                <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700 mb-4">receipt_long</span>
                <p className="text-slate-500 dark:text-gray-400">暂无订单记录</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-border-dark">
                {orders.map((order) => {
                  const status = orderStatusLabels[order.status] || { text: order.status, color: 'text-gray-500' };
                  return (
                    <div key={order.id} className="p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-500">diamond</span>
                          </div>
                          <div>
                            <p className="text-slate-900 dark:text-white font-medium">{order.package?.name || '积分充值'}</p>
                            <p className="text-slate-500 dark:text-gray-400 text-sm">
                              {new Date(order.createdAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-900 dark:text-white font-bold">¥{(order.amount / 100).toFixed(2)}</p>
                          <p className={`text-sm ${status.color}`}>{status.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 积分明细 */}
        {activeTab === 'transactions' && (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-2xl overflow-hidden">
            {transactionsLoading ? (
              <div className="p-12 text-center text-slate-500 dark:text-gray-400">加载中...</div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center">
                <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700 mb-4">account_balance</span>
                <p className="text-slate-500 dark:text-gray-400">暂无积分记录</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-border-dark">
                {transactions.map((tx) => {
                  const typeInfo = transactionTypeLabels[tx.type] || { text: tx.type, icon: 'help', color: 'text-gray-500' };
                  const isPositive = tx.amount > 0;
                  return (
                    <div key={tx.id} className="p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            isPositive ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                          }`}>
                            <span className={`material-symbols-outlined ${typeInfo.color}`}>
                              {typeInfo.icon}
                            </span>
                          </div>
                          <div>
                            <p className="text-slate-900 dark:text-white font-medium">{tx.description}</p>
                            <p className="text-slate-500 dark:text-gray-400 text-sm">
                              {new Date(tx.createdAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isPositive ? '+' : ''}{tx.amount}
                          </p>
                          <p className="text-slate-500 dark:text-gray-400 text-sm">余额: {tx.balance}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 底部操作区 */}
        {(activeTab === 'packages' || activeTab === 'credits') && selectedPackage && !orderInfo && (
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-card-dark border-t border-slate-200 dark:border-border-dark p-4 z-50 shadow-lg">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-slate-500 dark:text-gray-400 text-sm">已选择</p>
                  <p className="text-slate-900 dark:text-white font-bold">{selectedPackage.name}</p>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div>
                  <p className="text-slate-500 dark:text-gray-400 text-sm">获得积分</p>
                  <p className="text-amber-600 dark:text-amber-400 font-bold">
                    {selectedPackage.credits + selectedPackage.bonusCredits}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-slate-500 dark:text-gray-400 text-sm">应付金额</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ¥{formatPrice(selectedPackage.price)}
                  </p>
                </div>
                <button
                  onClick={handleCreateOrder}
                  disabled={creating}
                  className="px-8 py-3 bg-gradient-to-r from-neutral-700 to-neutral-600 hover:from-neutral-700 hover:to-neutral-600 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-lg shadow-neutral-500/25"
                >
                  {creating ? '创建订单中...' : '立即支付'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 支付弹窗 */}
        {orderInfo && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-card-dark rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
              {paymentSuccess ? (
                // 支付成功
                <div className="p-8 text-center">
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-5xl text-green-500">
                      check_circle
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    充值成功
                  </h2>
                  <p className="text-slate-500 dark:text-gray-400 mb-6">
                    已成功充值 {orderInfo.credits} 积分
                  </p>
                  <button
                    onClick={handleClosePayment}
                    className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-colors"
                  >
                    完成
                  </button>
                </div>
              ) : (
                // 支付中
                <>
                  <div className="bg-gradient-to-r from-neutral-700 to-neutral-600 p-6 text-center text-white">
                    <h2 className="text-xl font-bold mb-1">扫码支付</h2>
                    <p className="text-white/80 text-sm">
                      请使用支付宝扫描下方二维码
                    </p>
                  </div>

                  <div className="p-8 bg-slate-50 dark:bg-card-dark">
                    {/* 二维码 */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 mx-auto w-fit border border-slate-200">
                      <QRCodeSVG
                        value={orderInfo.qrCodeUrl}
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    </div>

                    {/* 订单信息 */}
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 dark:text-gray-400">套餐</span>
                        <span className="text-slate-900 dark:text-white font-medium">
                          {orderInfo.package.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 dark:text-gray-400">积分</span>
                        <span className="text-amber-500 font-medium">
                          {orderInfo.credits}
                          {orderInfo.package.bonusCredits > 0 && (
                            <span className="text-green-500 ml-1">
                              (+{orderInfo.package.bonusCredits})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-gray-400">金额</span>
                        <span className="text-2xl font-bold text-slate-900 dark:text-white">
                          ¥{formatPrice(orderInfo.amount)}
                        </span>
                      </div>
                    </div>

                    {/* 状态提示 */}
                    <div className="flex items-center justify-center gap-2 text-blue-500 mb-6">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm">等待支付中...</span>
                    </div>

                    <button
                      onClick={handleClosePayment}
                      className="w-full py-3 border border-slate-200 dark:border-border-dark text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors"
                    >
                      取消支付
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RechargePage;
