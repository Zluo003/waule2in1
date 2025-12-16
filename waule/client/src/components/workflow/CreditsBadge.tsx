interface Props {
  credits: number | null;
  loading?: boolean;
  className?: string;
}

const CreditsBadge = ({ credits, loading, className = '' }: Props) => {
  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs ${className}`}>
        <span className="material-symbols-outlined text-xs animate-spin">refresh</span>
        <span className="text-slate-600 dark:text-gray-400">计算中...</span>
      </div>
    );
  }

  if (credits === null || credits === 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 rounded text-xs ${className}`}>
      <span className="material-symbols-outlined text-xs text-amber-600 dark:text-amber-400">
        bolt
      </span>
      <span className="font-medium text-amber-700 dark:text-amber-400">
        {credits} 积分
      </span>
    </div>
  );
};

export default CreditsBadge;
