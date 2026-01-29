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
    AlertTriangle,
    Key,
    Type,
    Plus,
    Trash2
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

export default function RedisManager({ onClose, onDisconnect, onDragStart }: { onClose: () => void, onDisconnect: () => void, onDragStart?: (e: React.PointerEvent) => void }) {
    const [keys, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState<string>(""); // Raw string from Redis
    const [parsedData, setParsedData] = useState<any[]>([]); // Parsed for table
    const [filter, setFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editing
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    // Batch Editing: pendingChanges map rowIndex -> { colName: newValue }
    const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, string>>>({});
    // History
    const [editHistory, setEditHistory] = useState<Record<number, Record<string, string>>[]>([]);

    // Saving State
    const [isSaving, setIsSaving] = useState(false);

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
            const res = await invoke<string[]>('redis_get_keys', { pattern: filter || '*' });
            setKeys(res.sort());
        } catch (err: any) {
            console.error("Failed to fetch keys", err);
            setError(typeof err === 'string' ? err : "Failed to fetch keys.");
            showToast("Failed to fetch keys", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchValue = async (key: string) => {
        setIsLoading(true);
        try {
            const res = await invoke<string>('redis_get_value', { key });
            setKeyValue(res);

            // Try parse as JSON/Table
            try {
                const parsed = JSON.parse(res);
                if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                    setParsedData(parsed);
                } else if (typeof parsed === 'object' && parsed !== null) {
                    // Object -> Array of Key/Value for table
                    const table = Object.entries(parsed).map(([k, v]) => ({ Key: k, Value: String(v) }));
                    setParsedData(table);
                } else {
                    // Primitive or simple array
                    setParsedData([{ Value: res }]);
                }
            } catch {
                // Not JSON, simple string
                setParsedData([{ Value: res }]);
            }
        } catch (err) {
            console.error(err);
            setKeyValue("Error loading data");
            showToast("Error loading data", 'error');
            setParsedData([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    useEffect(() => {
        if (selectedKey) {
            fetchValue(selectedKey);
            setMode('view');
            setPendingChanges({});
            setEditHistory([]);
        } else {
            setKeyValue("");
            setParsedData([]);
        }
    }, [selectedKey]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchKeys();
        }
    };

    // Calculate changes
    const changeCount = Object.keys(pendingChanges).reduce((acc, rowIdx) => acc + Object.keys(pendingChanges[parseInt(rowIdx)]).length, 0);

    const handleUndo = () => {
        if (editHistory.length === 0) return;
        const previousState = editHistory[editHistory.length - 1];
        setPendingChanges(previousState);
        setEditHistory(prev => prev.slice(0, -1));
    };

    const handleInputChange = (rowIndex: number, colName: string, val: string) => {
        setEditHistory(prev => [...prev, JSON.parse(JSON.stringify(pendingChanges))]);

        setPendingChanges(prev => {
            const rowChanges = prev[rowIndex] || {};

            // Check if value is reverting to original
            const originalVal = String(parsedData[rowIndex][colName]);

            if (val === originalVal) {
                const { [colName]: _, ...rest } = rowChanges;
                if (Object.keys(rest).length === 0) {
                    const { [rowIndex]: __, ...restRows } = prev;
                    return restRows;
                }
                return { ...prev, [rowIndex]: rest };
            }

            return {
                ...prev,
                [rowIndex]: { ...rowChanges, [colName]: val }
            };
        });
    };

    const requestSave = () => {
        const updates: any[] = [];
        Object.entries(pendingChanges).forEach(([rowIdx, cols]) => {
            Object.entries(cols).forEach(([colName, newVal]) => {
                updates.push({
                    rowIndex: parseInt(rowIdx),
                    colName,
                    newVal
                });
            });
        });

        if (updates.length === 0) return;

        const message = (
            <div>
                <p className="mb-2">Update <span className="text-white font-bold">{updates.length}</span> value(s) for key <span className="text-blue-400">{selectedKey}</span>?</p>
                <p className="text-xs text-gray-500">This will overwrite the current value in Redis.</p>
            </div>
        );

        setConfirmState({
            isOpen: true,
            title: "Confirm Update",
            message: message,
            confirmText: "Apply Changes",
            onConfirm: () => {
                closeConfirm();
                executeBatchUpdate();
            }
        });
    };

    const executeBatchUpdate = async () => {
        setIsSaving(true);
        try {
            // Reconstruct the full object/string
            const newData = [...parsedData];
            Object.entries(pendingChanges).forEach(([idxStr, colChanges]) => {
                const idx = parseInt(idxStr);
                if (newData[idx]) {
                    newData[idx] = { ...newData[idx], ...colChanges };
                }
            });

            // Convert back to format Redis expects
            // Check original keyValue to guess format? 
            // Or infer from parsedData structure.
            let valueToSave = "";

            // If it was Key/Value table (from Object)
            const isKeyValueTable = parsedData.length > 0 && 'Key' in parsedData[0] && 'Value' in parsedData[0] && Object.keys(parsedData[0]).length === 2;

            if (isKeyValueTable) {
                const obj: Record<string, any> = {};
                newData.forEach((row: any) => {
                    obj[row.Key] = row.Value;
                });
                valueToSave = JSON.stringify(obj);
            } else if (parsedData.length === 1 && 'Value' in parsedData[0] && Object.keys(parsedData[0]).length === 1) {
                // Simple string wrapped in object
                valueToSave = newData[0].Value;
            } else {
                // Array logic
                valueToSave = JSON.stringify(newData);
            }

            await invoke('redis_set_value', { key: selectedKey, value: valueToSave });

            showToast("Saved successfully", 'success');
            setParsedData(newData); // Optimistic-ish (backend matches)
            setKeyValue(valueToSave);
            setPendingChanges({});
            setEditHistory([]);
        } catch (err: any) {
            console.error("Save failed", err);
            showToast("Save failed: " + err, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const columns = useMemo(() => {
        if (parsedData.length > 0) {
            return Object.keys(parsedData[0]);
        }
        return ['Value'];
    }, [parsedData]);

    const renderTable = () => {
        if (isLoading && parsedData.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 animate-pulse">
                    <Database size={32} className="mb-4 opacity-50" />
                    <p className="text-sm font-medium">Loading data...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-red-400">
                    <AlertCircle size={32} className="mb-4" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            );
        }

        if (!selectedKey) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                        <Key size={32} className="opacity-50" />
                    </div>
                    <p className="text-lg font-medium text-gray-400">No Key Selected</p>
                    <p className="text-sm">Select a key from the sidebar to view value</p>
                </div>
            );
        }

        return (
            <div className="flex-1 overflow-auto custom-scrollbar relative">
                <table className="w-full text-left text-sm text-gray-300 border-collapse">
                    <thead className="bg-[#18181b] sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-2 border-b border-white/10 w-10 text-center text-xs font-mono text-gray-500 bg-[#18181b]">#</th>
                            {columns.map(col => (
                                <th
                                    key={col}
                                    className="px-3 py-2 border-b border-white/10 text-xs font-bold text-gray-400 uppercase tracking-wider relative group select-none bg-[#18181b]"
                                    style={{ width: colWidths[col] || 'auto' }}
                                >
                                    <div className="flex items-center gap-2">
                                        <Type size={10} className="text-blue-500/50" />
                                        {col}
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-1 hover:bg-blue-500/50 cursor-col-resize transition-colors"
                                        onMouseDown={(e) => startResize(e, col)}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {parsedData.map((row, rowIdx) => {
                            const rowChanges = pendingChanges[rowIdx] || {};
                            const isRowDirty = Object.keys(rowChanges).length > 0;

                            return (
                                <tr key={rowIdx} className={`group transition-colors ${isRowDirty ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-white/5'}`}>
                                    <td className="px-3 py-2 text-center text-xs font-mono text-gray-600 border-r border-white/5 bg-[#18181b]/30">
                                        {rowIdx + 1}
                                    </td>
                                    {columns.map((col, colIdx) => {
                                        const val = rowChanges[col] !== undefined ? rowChanges[col] : row[col];
                                        const isDirty = rowChanges[col] !== undefined;

                                        return (
                                            <td key={`${rowIdx}-${col}`} className={`px-0 py-0 relative border-r border-white/5 last:border-0 p-0 ${isDirty ? 'bg-amber-900/20' : ''}`}>
                                                {mode === 'edit' ? (
                                                    <>
                                                        <input
                                                            type="text"
                                                            value={val}
                                                            onChange={(e) => handleInputChange(rowIdx, col, e.target.value)}
                                                            className={`w-full h-full px-3 py-2 bg-transparent border-none outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500/50 transition-all font-mono text-xs ${isDirty ? 'text-amber-200 font-medium' : 'text-gray-300'}`}
                                                            spellCheck={false}
                                                        />
                                                        {isDirty && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-500 rounded-full pointer-events-none" />}
                                                    </>
                                                ) : (
                                                    <div className={`px-3 py-2 truncate text-xs font-mono h-full block ${isDirty ? 'text-amber-200' : 'text-gray-300'}`} title={String(val)}>
                                                        {String(val)}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-blue-500/30">
            {/* Sidebar (Keys) */}
            <div className="w-64 bg-[#0c0c0e]/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                <div className="p-3 border-b border-white/5 cursor-move" onPointerDown={onDragStart}>
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder="Filter keys..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-[#18181b] border border-white/5 rounded-lg py-1.5 pl-9 pr-3 text-xs text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="px-2 py-2 space-y-0.5">
                        {keys.length === 0 && !isLoading ? (
                            <div className="text-center py-8 text-gray-600 text-xs">No keys found</div>
                        ) : (
                            keys.map(key => (
                                <div
                                    key={key}
                                    onClick={() => setSelectedKey(key)}
                                    className={`w-full text-left px-3 py-2 rounded-md transition-all text-xs font-medium cursor-pointer truncate flex items-center gap-2 ${selectedKey === key ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'}`}
                                >
                                    <Key size={12} className={selectedKey === key ? 'text-blue-500' : 'text-gray-600'} />
                                    {key}
                                </div>
                            ))
                        )}
                    </div>
                </div>
                {/* Footer Actions */}
                <div className="p-3 border-t border-white/5 flex items-center justify-between text-xs bg-[#0c0c0e]/50">
                    <span className="text-gray-500 font-mono">{keys.length} Keys</span>
                    <div className="flex items-center gap-1">
                        <button onClick={fetchKeys} className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors" title="Refresh">
                            <RefreshCw size={14} />
                        </button>
                        <button onClick={onDisconnect} className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors" title="Disconnect">
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#09090b]/60 relative overflow-hidden backdrop-blur-md">
                {/* Header */}
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0c0c0e]/30 z-20 cursor-move" onPointerDown={onDragStart}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => { onClose(); onClose(); }} className="md:hidden p-2 -ml-2 text-gray-400">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                <Database size={18} className="text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                                    Redis
                                    {selectedKey && (
                                        <>
                                            <span className="text-gray-600">/</span>
                                            <span className="text-blue-400 font-mono">{selectedKey}</span>
                                        </>
                                    )}
                                </h2>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Batch Action Bar */}
                        {changeCount > 0 && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg mr-4">
                                <span className="text-xs font-semibold text-blue-300 ml-1">{changeCount} changes</span>
                                <div className="h-4 w-[1px] bg-blue-500/20 mx-1" />
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
                                    onClick={() => setPendingChanges({})}
                                    className="px-3 py-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-md text-xs font-medium transition-colors"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={requestSave}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-green-500/20 transition-all"
                                >
                                    {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Save
                                </button>
                            </div>
                        )}

                        {selectedKey && (
                            <div className="flex bg-[#18181b] rounded-lg p-1 border border-white/10">
                                <button
                                    onClick={() => { setMode('view'); setPendingChanges({}); }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${mode === 'view' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Eye size={14} /> View
                                </button>
                                <button
                                    onClick={() => setMode('edit')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${mode === 'edit' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Pencil size={14} /> Edit
                                </button>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {renderTable()}

                {/* Footer (Status) */}
                <div className="h-9 border-t border-white/5 bg-[#0c0c0e]/30 flex items-center justify-between px-4 text-[10px] text-gray-500 font-mono cursor-default select-none z-20">
                    <div className="flex items-center gap-4">
                        {selectedKey && (
                            <span>Rows: <span className="text-gray-300">{parsedData.length}</span></span>
                        )}
                        {/* Pagination placeholder if needed */}
                    </div>
                </div>

                <ConfirmDialog
                    isOpen={confirmState?.isOpen || false}
                    title={confirmState?.title || ""}
                    message={confirmState?.message}
                    onConfirm={confirmState?.onConfirm || (() => { })}
                    onCancel={closeConfirm}
                    confirmText={confirmState?.confirmText}
                    isDestructive={confirmState?.isDestructive}
                />
                <Toast
                    message={toast.message}
                    type={toast.type}
                    isVisible={toast.isVisible}
                    onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
                />
            </div>
        </div>
    );
}
