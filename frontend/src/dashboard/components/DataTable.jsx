import StatusBadge from './StatusBadge.jsx';
import { iconMap } from './iconMap.js';

const { Eye, Pencil, Trash2 } = iconMap;

function DataTable({
  columns = [],
  rows = [],
  renderActions = null,
  hideActions = false,
  emptyText = "No rows found.",
  onRowClick = null
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">
                {column.label}
              </th>
            ))}
            {!hideActions ? <th className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={columns.length + (hideActions ? 0 : 1)}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-slate-50/60 ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={`${row.id}-${column.key}`} className="px-4 py-3 text-slate-700">
                    {typeof column.render === "function" ? (
                      column.render(row)
                    ) : column.type === 'status' ? (
                      <StatusBadge status={row[column.key]}>{row[column.key]}</StatusBadge>
                    ) : (
                      row[column.key]
                    )}
                  </td>
                ))}
                {!hideActions ? (
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    {renderActions ? (
                      renderActions(row)
                    ) : (
                      <div className="flex items-center gap-2 text-slate-500">
                        <button className="rounded-lg border border-slate-200 p-1.5 hover:border-[#1E3A8A] hover:text-[#1E3A8A]" type="button">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg border border-slate-200 p-1.5 hover:border-[#1E3A8A] hover:text-[#1E3A8A]" type="button">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg border border-slate-200 p-1.5 hover:border-red-500 hover:text-red-600" type="button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
