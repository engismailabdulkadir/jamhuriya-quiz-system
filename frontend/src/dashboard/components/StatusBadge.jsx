const variants = {
  active: 'bg-green-100 text-[#1F8A4C] border-[#1F8A4C]/30',
  inactive: 'bg-slate-100 text-slate-600 border-slate-300',
  pending: 'bg-amber-100 text-amber-700 border-amber-300',
  blocked: 'bg-red-100 text-red-700 border-red-300',
  suspicious: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  completed: 'bg-blue-100 text-[#1E3A8A] border-blue-300',
  submitted: 'bg-green-100 text-[#1F8A4C] border-[#1F8A4C]/30',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
  ongoing: 'bg-amber-100 text-amber-700 border-amber-300',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-300',
  expired: 'bg-slate-100 text-slate-700 border-slate-300'
};

function StatusBadge({ status = 'active', children }) {
  const key = String(status).toLowerCase();
  const className = variants[key] ?? 'bg-slate-100 text-slate-700 border-slate-300';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children ?? status}
    </span>
  );
}

export default StatusBadge;
