interface Props {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const SimplePriceInput = ({ value, onChange, label = '费用' }: Props) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700 dark:text-gray-300 w-20">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            className="w-32 px-3 py-2 border border-slate-300 dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600 dark:text-gray-400">积分</span>
        </div>
      </div>
    </div>
  );
};

export default SimplePriceInput;
