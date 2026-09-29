import React, { useState, useMemo } from 'react';
import { FiChevronDown, FiChevronUp, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  isLoading = false,
  emptyMessage = 'No data records found',
  pageSize = 10,
  onRowClick,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (column) => {
    if (!column.sortable || !column.accessor) return;
    setSortConfig((prev) => {
      if (prev.key === column.accessor) {
        return {
          key: column.accessor,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key: column.accessor, direction: 'asc' };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const aVal = typeof sortConfig.key === 'function' ? sortConfig.key(a) : a[sortConfig.key];
      const bVal = typeof sortConfig.key === 'function' ? sortConfig.key(b) : b[sortConfig.key];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(String(bVal))
          : String(bVal).localeCompare(aVal);
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10">
        <LoadingSpinner message="Loading records..." />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(col)}
                  className={`px-4 py-3.5 ${col.headerClass || ''} ${
                    col.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && sortConfig.key === col.accessor && (
                      <span>
                        {sortConfig.direction === 'asc' ? (
                          <FiChevronUp className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <FiChevronDown className="w-3.5 h-3.5 text-primary-600" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.map((row, rowIndex) => {
              const rowKey = typeof keyField === 'function' ? keyField(row) : row[keyField] || rowIndex;
              const isEven = rowIndex % 2 === 1;
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`${isEven ? 'bg-slate-50/60' : 'bg-white'} ${
                    onRowClick ? 'cursor-pointer hover:bg-primary-50/40' : 'hover:bg-slate-50'
                  } transition-colors`}
                >
                  {columns.map((col, colIndex) => {
                    let cellContent;
                    if (col.render) {
                      cellContent = col.render(row, (currentPage - 1) * pageSize + rowIndex);
                    } else if (typeof col.accessor === 'function') {
                      cellContent = col.accessor(row);
                    } else if (col.accessor) {
                      cellContent = row[col.accessor] !== undefined && row[col.accessor] !== null ? String(row[col.accessor]) : '-';
                    } else {
                      cellContent = '-';
                    }

                    return (
                      <td key={colIndex} className={`px-4 py-3 align-middle ${col.cellClass || ''}`}>
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
          <div>
            Showing <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </span>{' '}
            of <span className="font-semibold">{sortedData.length}</span> records
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
