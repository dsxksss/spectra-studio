import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search,
    Database,
    RefreshCw,
    ChevronRight,
    ChevronLeft,
    X,
    LogOut,
    Table as TableIcon,
    AlertCircle,
    Eye,
    Pencil,
    Save,
    RotateCcw,
    AlertTriangle
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Toast, ToastType } from './Toast';

// Internal Confirm Dialog Component
const ConfirmDialog = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = false
}: {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}) => {
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-white/10 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDestructive ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                        {isDestructive ? <AlertTriangle size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                </div>

                <div className="text-gray-400 text-sm mb-6 whitespace-pre-wrap leading-relaxed">
                    {message}
                </div>

                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg transition-all ${isDestructive
                            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                            : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function PostgresManager({ onClose, onDisconnect, onDragStart, serviceType }: { onClose?: () => void, onDisconnect?: () => void, onDragStart?: (e: React.PointerEvent) => void, serviceType: string }) {
    const [keys, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState<string>("");
    const [filter, setFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize] = useState(100);
    const [totalRows, setTotalRows] = useState(0);
    const [pageInput, setPageInput] = useState("1");

    // Editing
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [primaryKey, setPrimaryKey] = useState<string | null>(null);
    // Batch Editing
    const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, string>>>({});
    // History
    const [editHistory, setEditHistory] = useState<Record<number, Record<string, string>>[]>([]);

    // Saving State
    const [isSaving] = useState(false);



    // Column Resizing
    const [colWidths, setColWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

    // Toast
    const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
        message: '',
        type: 'info',
        isVisible: false
    });

    const showToast = (message: string, type: ToastType = 'info') => {
        setToast({ message, type, isVisible: true });
    };

    // Confirm Dialog State
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: React.ReactNode;
        onConfirm: () => void;
        isDestructive?: boolean;
        confirmText?: string;
    } | null>(null);

    const closeConfirm = () => setConfirmState(null);

    // Resize Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const { col, startX, startWidth } = resizingRef.current;
            const diff = e.clientX - startX;
            const newWidth = Math.max(50, startWidth + diff); // Min width 50px
            setColWidths(prev => ({ ...prev, [col]: newWidth }));
        };

        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = null;
                document.body.style.cursor = '';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const startResize = (e: React.MouseEvent, col: string) => {
        e.preventDefault();
        e.stopPropagation();
        const currentWidth = colWidths[col] || 150;
        resizingRef.current = { col, startX: e.clientX, startWidth: currentWidth };
        document.body.style.cursor = 'col-resize';
    };


    const fetchKeys = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let res: string[] = [];
            if (serviceType === 'PostgreSQL') {
                res = await invoke<string[]>('postgres_get_tables');
            } else {
                res = [];
            }
            setKeys(res.sort());
        } catch (err: any) {
            console.error("Failed to fetch tables", err);
            setError(typeof err === 'string' ? err : "Failed to fetch tables.");
            showToast("Failed to fetch tables", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTableData = async (table: string, p: number) => {
        setIsLoading(true);
        try {
            if (serviceType === 'PostgreSQL') {
                const offset = (p - 1) * pageSize;
                // Backend expects i64, JS number is fine (tauri converts)
                const res = await invoke<string[]>('postgres_get_rows', { tableName: table, limit: pageSize, offset });
                setKeyValue(`[${res.join(',')}]`);
            } else {
                setKeyValue("[]");
            }
        } catch (err) {
            console.error(err);
            setKeyValue("Error loading data");
            showToast("Error loading data", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCount = async (table: string) => {
        try {
            if (serviceType === 'PostgreSQL') {
                const count = await invoke<number>('postgres_get_count', { tableName: table });
                setTotalRows(count);
            }
        } catch (e) {
            console.error("Failed to fetch count", e);
        }
    };

    const fetchPrimaryKey = async (table: string) => {
        try {
            if (serviceType === 'PostgreSQL') {
                const pk = await invoke<string | null>('postgres_get_primary_key', { tableName: table });
                setPrimaryKey(pk);
            }
        } catch (e) {
            console.error("Failed to fetch PK", e);
            setPrimaryKey(null);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    useEffect(() => {
        if (selectedKey) {
            setPage(1);
            setPageInput("1");
            fetchTableData(selectedKey, 1);
            fetchCount(selectedKey);
            fetchPrimaryKey(selectedKey);
            setMode('view');
            setPendingChanges({});
        } else {
            setKeyValue("");
            setTotalRows(0);
            setPrimaryKey(null);
        }
    }, [selectedKey]);

    useEffect(() => {
        setPageInput(page.toString());
        // Note: Changing page shouldn't clear changes automatically if we want to confirm first.
        // But here we rely on handlePageChange to catch it.
        // If external force changes page, we lose changes. Accepted for now.
        setPendingChanges({});
    }, [page]);

    const handlePageChange = (newPage: number) => {
        if (Object.keys(pendingChanges).length > 0) {
            setConfirmState({
                isOpen: true,
                title: "Unsaved Changes",
                message: "You have unsaved changes. Discard them and switch pages?",
                isDestructive: true,
                confirmText: "Discard & Switch",
                onConfirm: () => {
                    closeConfirm();
                    // Proceed with page change
                    performPageChange(newPage);
                }
            });
            return;
        }
        performPageChange(newPage);
    };

    const performPageChange = (newPage: number) => {
        if (newPage < 1 || !selectedKey) return;
        const maxPage = Math.ceil(totalRows / pageSize) || 1;
        if (newPage > maxPage) newPage = maxPage;

        setPage(newPage);
        fetchTableData(selectedKey, newPage);
    };

    const handlePageInputSubmit = () => {
        const val = parseInt(pageInput);
        if (!isNaN(val)) {
            handlePageChange(val);
        } else {
            setPageInput(page.toString());
        }
    };

    const handleUndo = () => {
        if (editHistory.length === 0) return;
        const previousState = editHistory[editHistory.length - 1];
        setPendingChanges(previousState);
        setEditHistory(prev => prev.slice(0, -1));
    };

    const handleInputChange = (rowIndex: number, col: string, newValue: string) => {
        setEditHistory(h => [...h, pendingChanges]);

        setPendingChanges(prev => {
            const rowChanges = prev[rowIndex] || {};
            return {
                ...prev,
                [rowIndex]: {
                    ...rowChanges,
                    [col]: newValue
                }
            };
        });
    };

    const requestOutMode = () => {
        if (mode === 'edit' && Object.keys(pendingChanges).length > 0) {
            setConfirmState({
                isOpen: true,
                title: "Unsaved Changes",
                message: "You have unsaved changes. Discard them and switch to view mode?",
                isDestructive: true,
                confirmText: "Discard & Switch",
                onConfirm: () => {
                    setPendingChanges({});
                    setMode('view');
                    closeConfirm();
                }
            });
        } else {
            setMode('view');
        }
    };

    const requestReload = () => {
        if (Object.keys(pendingChanges).length > 0) {
            setConfirmState({
                isOpen: true,
                title: "Unsaved Changes",
                message: "You have unsaved changes. Reloading will discard them.",
                isDestructive: true,
                confirmText: "Discard & Reload",
                onConfirm: () => {
                    closeConfirm();
                    if (selectedKey) {
                        fetchTableData(selectedKey, page);
                        setPendingChanges({});
                        setEditHistory([]); // Clear history
                    }
                }
            });
        } else {
            if (selectedKey) fetchTableData(selectedKey, page);
        }
    };

    const requestSave = () => {
        if (!selectedKey || !primaryKey) return;

        const tableData = JSON.parse(keyValue);
        const updates: any[] = [];

        // Build list of updates
        for (const [rowIndexStr, cols] of Object.entries(pendingChanges)) {
            const rowIndex = parseInt(rowIndexStr);
            const row = tableData[rowIndex];
            const pkVal = row[primaryKey];

            if (pkVal === undefined || pkVal === null) {
                console.warn(`Row ${rowIndex} missing PK`);
                continue;
            }

            for (const [colName, newVal] of Object.entries(cols)) {
                // Determine if changed? (Assume yes if in pendingChanges)
                if (String(row[colName]) !== newVal) {
                    updates.push({
                        tableName: selectedKey,
                        pkCol: primaryKey,
                        pkVal: String(pkVal),
                        colName,
                        newVal
                    });
                }
            }
        }

        if (updates.length === 0) {
            showToast("No actual changes to save.", 'info');
            setPendingChanges({});
            setEditHistory([]); // Clear history
            return;
        }

        const message = (
            <div>
                <p className="mb-2">You are about to update <span className="text-white font-bold">{updates.length}</span> cell(s).</p>
                <div className="bg-black/30 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                    {updates.map((u, i) => (
                        <div key={i} className="mb-0.5 truncate">
                            <span className="text-blue-400">{u.colName}</span>: <span className="text-gray-500">{String(tableData[parseInt(Object.keys(pendingChanges).find(k => pendingChanges[parseInt(k)] && pendingChanges[parseInt(k)][u.colName] === u.newVal) || "0")][u.colName]).substring(0, 20)}...</span> <span className="text-gray-600">→</span> <span className="text-green-400">{u.newVal}</span>
                        </div>
                    ))}
                </div>
            </div>
        );

        setConfirmState({
            isOpen: true,
            title: "Confirm Updates",
            message: message,
            confirmText: "Apply Changes",
            onConfirm: () => {
                closeConfirm();
                executeBatchUpdate(updates);
            }
        });
    };

    const executeBatchUpdate = async (updates: any[]) => {
        setIsLoading(true);
        try {
            const results = await Promise.all(updates.map(u => invoke<number>('postgres_update_cell', u)));
            const totalRowsAffected = results.reduce((sum, current) => sum + current, 0);

            if (totalRowsAffected > 0) {
                showToast(`Successfully saved ${totalRowsAffected} changes.`, 'success');

                // Optimistic Local Update to avoid full refresh
                const newData = [...tableData];
                Object.entries(pendingChanges).forEach(([idxStr, colChanges]) => {
                    const idx = parseInt(idxStr);
                    if (newData[idx]) {
                        newData[idx] = { ...newData[idx], ...colChanges };
                    }
                });
                setKeyValue(JSON.stringify(newData));
            } else {
                showToast("No rows were affected by the update.", 'info');
            }

            setPendingChanges({});
            setEditHistory([]); // Clear history
            // Do NOT fetchTableData here to avoid refreshing the UI
        } catch (err: any) {
            console.error("Batch update failed", err);
            showToast("Some updates failed. Check console.", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const requestDiscard = () => {
        setConfirmState({
            isOpen: true,
            title: "Discard Changes",
            message: "Are you sure you want to discard all unsaved changes?",
            isDestructive: true,
            confirmText: "Discard All",
            onConfirm: () => {
                setPendingChanges({});
                setEditHistory([]); // Clear history
                closeConfirm();
            }
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchKeys();
        }
    };

    const changeCount = Object.values(pendingChanges).reduce((acc, row) => acc + Object.keys(row).length, 0);

    // Memoize table data parsing
    const tableData = useMemo(() => {
        try { return JSON.parse(keyValue); } catch { return []; }
    }, [keyValue]);

    // ValueViewer Logic (Inlined)
    const renderTable = () => {
        if (!Array.isArray(tableData) || tableData.length === 0) {
            return <div className="text-gray-500 p-6 italic">Table is empty or invalid data</div>;
        }

        const columns = Array.from(new Set(tableData.flatMap(x => x ? Object.keys(x) : [])));

        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3 px-1 text-xs text-gray-500 justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <TableIcon size={12} />
                        <span>{tableData.length} rows on this page</span>
                    </div>
                    {primaryKey && mode === 'edit' && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-bold tracking-wide">BATCH EDIT MODE • PK: {primaryKey}</span>}
                    {primaryKey && mode === 'view' && <span className="text-[10px] text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Read Only • PK: {primaryKey}</span>}
                </div>
                <div className="flex-1 overflow-auto border border-white/5 rounded-xl bg-[#121214] shadow-inner custom-scrollbar relative mx-0.5">
                    <table className="w-full text-left text-sm text-gray-400 border-collapse table-fixed">
                        <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 border-b border-white/10 w-12 text-center bg-[#18181b] z-20">#</th>
                                {columns.map(col => {
                                    const width = colWidths[col] || 150;
                                    return (
                                        <th
                                            key={col}
                                            className={`px-4 py-3 border-b border-white/10 whitespace-nowrap bg-[#18181b] relative group ${col === primaryKey ? 'text-blue-400' : ''}`}
                                            style={{ width, minWidth: width, maxWidth: width }}
                                        >
                                            <div className="flex items-center justify-between overflow-hidden">
                                                <span className="truncate" title={col}>{col} {col === primaryKey && '🔑'}</span>
                                            </div>
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 z-30 transition-colors"
                                                onMouseDown={(e) => startResize(e, col)}
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((row, i) => (
                                <tr key={i} className={`border-b border-white/5 transition-colors ${mode === 'edit' ? 'hover:bg-amber-500/5' : 'hover:bg-white/5'}`}>
                                    <td className="px-4 py-2 font-mono text-xs opacity-50 text-center border-r border-white/5">{((page - 1) * pageSize) + i + 1}</td>
                                    {columns.map(col => {
                                        const width = colWidths[col] || 150;
                                        const val = row[col];
                                        const editedVal = pendingChanges[i]?.[col];
                                        const isDirty = editedVal !== undefined && editedVal !== String(val ?? '');
                                        const displayVal = editedVal !== undefined ? editedVal : String(val ?? '');

                                        // Edit Mode Logic
                                        if (mode === 'edit' && primaryKey) {
                                            const isPK = col === primaryKey;
                                            return (
                                                <td
                                                    key={col}
                                                    className={`p-0 border-r border-white/5 last:border-0 relative ${isDirty ? 'bg-amber-900/20' : ''}`}
                                                    style={{ width, minWidth: width, maxWidth: width }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={displayVal}
                                                        disabled={isPK}
                                                        onChange={(e) => handleInputChange(i, col, e.target.value)}
                                                        className={`w-full h-full px-4 py-2 bg-transparent outline-none text-sm transition-colors truncate
                                                            ${isPK ? 'text-gray-600 cursor-not-allowed select-none bg-black/20 italic' : 'text-gray-300 focus:text-white focus:bg-white/5'}
                                                            ${isDirty ? 'text-amber-200 font-medium' : ''}
                                                        `}
                                                        title={isPK ? "Primary Key (Cannot Edit)" : String(val)}
                                                    />
                                                    {isDirty && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-full m-1" />}
                                                </td>
                                            );
                                        }

                                        // View Mode
                                        return (
                                            <td
                                                key={col}
                                                className="px-4 py-2 truncate border-r border-white/5 last:border-0 relative"
                                                style={{ width, minWidth: width, maxWidth: width }}
                                                title={String(val)}
                                            >
                                                <span>{String(val ?? '')}</span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };


    return (
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-blue-500/30 relative">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e]/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                {/* Fixed Header */}
                <div className="p-4 border-b border-white/5 cursor-move" onPointerDown={onDragStart}>
                    <div className="flex items-center justify-between mb-4 px-2">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                <Database size={18} />
                            </div>
                            <span className="font-bold text-white tracking-wide">Database Explorer</span>
                        </div>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search tables..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-[#18181b] border border-white/5 rounded-xl py-2.5 pl-10 pr-10 text-sm text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                        <button onClick={fetchKeys} disabled={isLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors disabled:opacity-50">
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                        <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300 leading-tight break-all">{error}</p>
                    </div>
                )}

                {/* Table List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {keys.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 opacity-60">
                            <span className="text-sm text-gray-500 mb-3">No tables found</span>
                        </div>
                    ) : (
                        keys.filter(k => k.toLowerCase().includes(filter.toLowerCase())).map(key => (
                            <button
                                key={key}
                                onClick={() => setSelectedKey(key)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-left transition-all ${selectedKey === key
                                    ? 'bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
                                    }`}
                            >
                                <TableIcon size={14} className="opacity-70 shrink-0" />
                                <span className="truncate">{key}</span>
                                {selectedKey === key && <ChevronRight size={14} className="ml-auto opacity-50" />}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 bg-[#0c0c0e]/50">
                    <span>{keys.length} Tables</span>
                    <button onClick={onDisconnect} className="flex items-center gap-2 text-gray-500 hover:text-red-400 transition-colors p-1" title="Disconnect">
                        <LogOut size={14} /> <span className="font-medium">Disconnect</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col bg-[#09090b]/60 relative overflow-hidden">
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#09090b]/50 backdrop-blur-md cursor-move z-10 sticky top-0" onPointerDown={onDragStart}>
                    <div className="flex items-center gap-4 overflow-hidden">
                        {selectedKey ? (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current Table</span>
                                <span className="text-white font-medium truncate text-lg">{selectedKey}</span>
                            </div>
                        ) : (
                            <span className="text-gray-500 text-sm">Select a table to view data</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View/Edit Toggle */}
                        {selectedKey && (
                            <div className="flex items-center gap-2 bg-[#18181b] rounded-lg p-1 border border-white/10 mr-2">
                                <button
                                    onClick={requestOutMode}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${mode === 'view' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Eye size={12} /> View
                                </button>
                                <button
                                    onClick={() => setMode('edit')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${mode === 'edit' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Pencil size={12} /> Edit
                                </button>
                            </div>
                        )}

                        {/* Batch Actions */}
                        {mode === 'edit' && changeCount > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                {editHistory.length > 0 && (
                                    <button
                                        onClick={handleUndo}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-md text-xs font-medium flex items-center gap-1.5 border border-white/5 transition-all mr-1"
                                        title="Undo last change"
                                    >
                                        <RotateCcw size={12} className="scale-x-[-1]" /> Undo
                                    </button>
                                )}
                                <button
                                    onClick={requestSave}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-green-500/20 transition-all"
                                >
                                    {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                    Save ({changeCount})
                                </button>
                                <button
                                    onClick={requestDiscard}
                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs font-medium flex items-center gap-1.5 border border-red-500/10 transition-all"
                                >
                                    <RotateCcw size={12} /> Discard
                                </button>
                            </div>
                        )}

                        {selectedKey && (
                            <button onClick={requestReload} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Reload Data">
                                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Close Window">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 relative flex flex-col">
                    <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />

                    {selectedKey ? (
                        <div className="flex-1 flex flex-col min-h-0 bg-[#121214] border border-white/5 rounded-xl shadow-inner overflow-hidden p-1">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-blue-400 gap-2">
                                    <RefreshCw className="animate-spin" /> Loading data...
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1 min-h-0 overflow-hidden p-3">
                                        {renderTable()}
                                    </div>

                                    {/* Pagination Footer */}
                                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-[#18181b] shrink-0">
                                        <div className="text-xs text-gray-500">
                                            Showing <span className="text-gray-300 font-mono">{((page - 1) * pageSize) + 1}</span> - <span className="text-gray-300 font-mono">{Math.min(page * pageSize, totalRows)}</span> of <span className="text-gray-300 font-mono">{totalRows}</span> rows
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handlePageChange(page - 1)}
                                                disabled={page <= 1}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                title="Previous Page"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>

                                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                <span>Page</span>
                                                <input
                                                    type="text"
                                                    value={pageInput}
                                                    onChange={e => setPageInput(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handlePageInputSubmit()}
                                                    onBlur={handlePageInputSubmit}
                                                    className="w-10 bg-[#27272a] border border-white/10 rounded px-1 py-0.5 text-center text-white focus:border-blue-500 outline-none transition-colors"
                                                />
                                                <span>of {Math.max(1, Math.ceil(totalRows / pageSize))}</span>
                                            </div>

                                            <button
                                                onClick={() => handlePageChange(page + 1)}
                                                disabled={page * pageSize >= totalRows}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                title="Next Page"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 gap-6">
                            <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
                                <TableIcon size={48} className="text-gray-500" />
                            </div>
                            <p className="text-lg font-medium text-gray-500">Pick a table from the sidebar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirm Dialog Overlay */}
            {confirmState && (
                <ConfirmDialog
                    isOpen={confirmState.isOpen}
                    title={confirmState.title}
                    message={confirmState.message}
                    onConfirm={confirmState.onConfirm}
                    onCancel={() => setConfirmState(null)}
                    confirmText={confirmState.confirmText}
                    isDestructive={confirmState.isDestructive}
                />
            )}

            {/* Toast Container */}
            <Toast
                message={toast.message}
                type={toast.type}
                isVisible={toast.isVisible}
                onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
            />
        </div>
    );
}
