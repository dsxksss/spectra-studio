import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search,
    RefreshCw,
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
    Trash2,
    Plus,
    Terminal,
    Hash as HashIcon,
    List as ListIcon,
    Activity,
    Clock
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Toast, ToastType } from './Toast';
import { RedisIcon } from './icons';
import { useTranslation } from '../i18n/I18nContext';

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
    const { t } = useTranslation();
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
                        {cancelText || t('cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg transition-all ${isDestructive
                            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                            : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
                            }`}
                    >
                        {confirmText || t('confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function RedisManager({ onClose, onDisconnect, onDragStart, connectionName }: { onClose: () => void, onDisconnect: () => void, onDragStart?: (e: React.PointerEvent) => void, connectionName?: string }) {
    const { t } = useTranslation();
    const [keys, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [, setKeyValue] = useState<string>(""); // Raw string from Redis
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

    // New Rows (not yet in Redis)
    const [newRows, setNewRows] = useState<any[]>([]);

    // Column Resizing
    const [colWidths, setColWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [newKeyData, setNewKeyData] = useState({ name: '', type: 'string', value: '' });

    const [isRenamingKey, setIsRenamingKey] = useState<string | null>(null);
    const [renamedKeyName, setRenamedKeyName] = useState("");

    // Console
    const [activeView, setActiveView] = useState<'browser' | 'console'>('browser');
    const [consoleQuery, setConsoleQuery] = useState('');
    const [consoleResults, setConsoleResults] = useState<{ cmd: string; res: string; isError?: boolean }[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);

    // TTL
    const [selectedKeyTTL, setSelectedKeyTTL] = useState<number | null>(null);

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

            // Automatically select the first key if available
            if (res.length > 0) {
                setSelectedKey(res[0]);
            }
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
            setNewRows([]);
            setSelectedKeyTTL(null);
        }
    }, [selectedKey]);

    const fetchTTL = async (key: string) => {
        try {
            const ttl = await invoke<number>('redis_get_ttl', { key });
            setSelectedKeyTTL(ttl);
        } catch (err) {
            console.error("Failed to fetch TTL", err);
        }
    };

    useEffect(() => {
        if (selectedKey) {
            fetchTTL(selectedKey);
        }
    }, [selectedKey]);

    const handleExecuteCommand = async () => {
        if (!consoleQuery.trim()) return;
        setIsExecuting(true);
        try {
            const result = await invoke<string>('redis_execute_raw', { command: consoleQuery });
            setConsoleResults(prev => [{ cmd: consoleQuery, res: result }, ...prev]);
            setConsoleQuery('');
            // If it's a mutation, maybe refresh keys? 
            // For now just keep it as a scratchpad.
        } catch (err: any) {
            setConsoleResults(prev => [{ cmd: consoleQuery, res: err, isError: true }, ...prev]);
        } finally {
            setIsExecuting(false);
        }
    };

    const handleAddRow = () => {
        const initialRow = columns.reduce((acc, col) => ({ ...acc, [col]: "" }), {});
        setNewRows(prev => [...prev, initialRow]);
        setMode('edit');
    };

    const handleNewRowChange = (index: number, col: string, val: string) => {
        const updated = [...newRows];
        updated[index] = { ...updated[index], [col]: val };
        setNewRows(updated);
    };

    const removeNewRow = (index: number) => {
        setNewRows(newRows.filter((_, i) => i !== index));
    };

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

    const handleDeleteKey = async (key: string) => {
        setConfirmState({
            isOpen: true,
            title: "Delete Key",
            message: `Are you sure you want to delete the key "${key}"? This will permanently remove all data associated with it.`,
            isDestructive: true,
            confirmText: "Delete",
            onConfirm: async () => {
                try {
                    await invoke('redis_del_key', { key });
                    showToast(`Key "${key}" deleted`, 'success');
                    if (selectedKey === key) {
                        setSelectedKey(null);
                    }
                    fetchKeys();
                } catch (err: any) {
                    showToast(err, 'error');
                } finally {
                    closeConfirm();
                }
            }
        });
    };

    const handleCreateKey = async () => {
        if (!newKeyData.name) {
            showToast("Key name is required", 'error');
            return;
        }
        setIsLoading(true);
        try {
            let val = newKeyData.value;
            // Provide sensible defaults based on type if value is empty
            if (!val) {
                if (newKeyData.type === 'hash') {
                    val = JSON.stringify({ "field": "value" });
                } else if (newKeyData.type === 'list' || newKeyData.type === 'set' || newKeyData.type === 'zset') {
                    val = JSON.stringify(["item1"]);
                } else {
                    val = "";
                }
            }

            await invoke('redis_set_value', { key: newKeyData.name, value: val });
            showToast(`Key "${newKeyData.name}" created`, 'success');
            setIsCreatingKey(false);
            setNewKeyData({ name: '', type: 'string', value: '' });
            fetchKeys();
            setSelectedKey(newKeyData.name);
            setActiveView('browser');
        } catch (err: any) {
            showToast(err, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRenameKey = async (oldKey: string) => {
        if (!renamedKeyName.trim() || renamedKeyName === oldKey) {
            setIsRenamingKey(null);
            return;
        }
        const newKey = renamedKeyName;
        setIsLoading(true);
        try {
            await invoke('redis_rename_key', { oldKey, newKey });
            showToast(`Key renamed to ${newKey}`, 'success');
            // Fetch keys first, then set the new selected key
            const res = await invoke<string[]>('redis_get_keys', { pattern: '*' });
            setKeys(res.sort());
            if (selectedKey === oldKey) {
                setSelectedKey(newKey);
            }
        } catch (err: any) {
            showToast(err, 'error');
        } finally {
            setIsRenamingKey(null);
            setIsLoading(false);
        }
    };

    const handleDeleteRow = (rowIdx: number) => {
        setConfirmState({
            isOpen: true,
            title: "Delete Row",
            message: `Are you sure you want to delete this specific row? This change will be applied to the Redis value immediately.`,
            isDestructive: true,
            confirmText: "Delete",
            onConfirm: async () => {
                closeConfirm();
                const newData = parsedData.filter((_, i) => i !== rowIdx);
                await performDataSave(newData);
            }
        });
    };

    const performDataSave = async (data: any[]) => {
        setIsSaving(true);
        try {
            let valueToSave = "";
            const isKeyValueTable = data.length > 0 && 'Key' in data[0] && 'Value' in data[0] && Object.keys(data[0]).length === 2;

            if (isKeyValueTable) {
                const obj: Record<string, any> = {};
                data.forEach((row: any) => {
                    obj[row.Key] = row.Value;
                });
                valueToSave = JSON.stringify(obj);
            } else if (data.length === 1 && 'Value' in data[0] && Object.keys(data[0]).length === 1) {
                valueToSave = data[0].Value;
            } else if (data.length === 0) {
                // If it's a key-value table, save empty object. Otherwise empty array.
                const wasKV = parsedData.length > 0 && 'Key' in parsedData[0];
                valueToSave = wasKV ? "{}" : "[]";
            } else {
                valueToSave = JSON.stringify(data);
            }

            await invoke('redis_set_value', { key: selectedKey, value: valueToSave });
            showToast("Value updated successfully", 'success');
            setParsedData(data);
            setKeyValue(valueToSave);
            setPendingChanges({}); // Clear changes as structure changed
            setEditHistory([]);
        } catch (err: any) {
            console.error("Save failed", err);
            showToast("Save failed: " + err, 'error');
        } finally {
            setIsSaving(false);
        }
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

        if (updates.length === 0 && newRows.length === 0) return;

        const message = (
            <div>
                <p className="mb-2">Save <span className="text-white font-bold">{updates.length + newRows.length}</span> change(s) for key <span className="text-blue-400">{selectedKey}</span>?</p>
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

            // Append new rows
            const finalData = [...newData, ...newRows];

            if (finalData.length === 0) {
                // If it was Key/Value table, save empty object. Otherwise empty array.
                const wasKV = parsedData.length > 0 && 'Key' in parsedData[0];
                await invoke('redis_set_value', { key: selectedKey, value: wasKV ? "{}" : "[]" });
                setParsedData([]);
            } else {
                let valueToSave = "";
                const isKeyValueTable = finalData.length > 0 && 'Key' in finalData[0] && 'Value' in finalData[0] && Object.keys(finalData[0]).length === 2;

                if (isKeyValueTable) {
                    const obj: Record<string, any> = {};
                    finalData.forEach((row: any) => {
                        obj[row.Key] = row.Value;
                    });
                    valueToSave = JSON.stringify(obj);
                } else if (finalData.length === 1 && 'Value' in finalData[0] && Object.keys(finalData[0]).length === 1) {
                    valueToSave = finalData[0].Value;
                } else {
                    valueToSave = JSON.stringify(finalData);
                }

                await invoke('redis_set_value', { key: selectedKey, value: valueToSave });
                setParsedData(finalData);
                setKeyValue(valueToSave);
            }

            showToast("Saved successfully", 'success');
            setNewRows([]);
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
                    <RedisIcon size={32} className="mb-4 opacity-50" />
                    <p className="text-sm font-medium">{t('loading')}</p>
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
                    <p className="text-sm">{t('select_key')}</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full overflow-hidden p-6">
                <div className="flex items-center gap-2 mb-3 px-1 text-xs text-gray-500 justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <TableIcon size={12} />
                        <span>{parsedData.length + newRows.length} items {(parsedData.length + newRows.length) === 1 ? 'entry' : 'entries'} in this key</span>
                        {mode === 'edit' && (
                            <button
                                onClick={handleAddRow}
                                className="ml-4 px-2 py-0.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded border border-blue-500/30 flex items-center gap-1 transition-colors"
                            >
                                <Plus size={10} /> Add Item
                            </button>
                        )}
                    </div>
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
                                            className="px-4 py-3 border-b border-white/10 whitespace-nowrap bg-[#18181b] relative group"
                                            style={{ width, minWidth: width, maxWidth: width }}
                                        >
                                            <div className="flex items-center justify-between overflow-hidden">
                                                <span className="truncate" title={col}>{col}</span>
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
                        <tbody className="divide-y divide-white/5">
                            {newRows.map((row, i) => (
                                <tr key={`new-${i}`} className="bg-green-500/5 border-b border-green-500/10 group transition-colors">
                                    <td className="px-4 py-2 font-mono text-xs text-green-500/50 text-center border-r border-green-500/10 relative">
                                        <span className="group-hover:hidden text-[10px] font-bold">NEW</span>
                                        <button
                                            onClick={() => removeNewRow(i)}
                                            className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-red-500 text-white transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </td>
                                    {columns.map(col => {
                                        const width = colWidths[col] || 150;
                                        return (
                                            <td key={col} className="p-0 border-r border-green-500/10 last:border-0" style={{ width }}>
                                                <input
                                                    autoFocus={i === newRows.length - 1 && col === columns[0]}
                                                    type="text"
                                                    value={row[col] || ""}
                                                    onChange={(e) => handleNewRowChange(i, col, e.target.value)}
                                                    placeholder={`Enter ${col}...`}
                                                    className="w-full h-full px-4 py-2 bg-transparent outline-none text-sm text-green-200 focus:bg-white/5 transition-colors placeholder:text-green-900/50"
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {parsedData.length === 0 && newRows.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-20 text-center text-gray-600 italic">
                                        <div className="flex flex-col items-center gap-4 opacity-70">
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 text-blue-500">
                                                <Plus size={32} />
                                            </div>
                                            <div>
                                                <p className="text-gray-300 font-medium text-lg not-italic">{t('key_is_empty')}</p>
                                                <p className="text-sm not-italic text-gray-500">{t('choose_add_method')} <span className="text-blue-400 font-mono">{selectedKey}</span></p>
                                            </div>
                                            <div className="flex items-center gap-3 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setNewRows([{ Value: "" }]);
                                                        setMode('edit');
                                                    }}
                                                    className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-sm transition-all flex items-center gap-2"
                                                >
                                                    {t('add_string')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setNewRows([{ Key: "field1", Value: "value1" }]);
                                                        setMode('edit');
                                                    }}
                                                    className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-xl text-sm transition-all flex items-center gap-2"
                                                >
                                                    {t('add_hash')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setNewRows([{ "Item": "item1" }]);
                                                        setMode('edit');
                                                    }}
                                                    className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl text-sm transition-all flex items-center gap-2"
                                                >
                                                    {t('add_list_item')}
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {parsedData.map((row, rowIdx) => {
                                const rowChanges = pendingChanges[rowIdx] || {};

                                return (
                                    <tr key={rowIdx} className={`border-b border-white/5 transition-colors ${mode === 'edit' ? 'hover:bg-amber-500/5' : 'hover:bg-white/5'}`}>
                                        <td className="px-4 py-2 font-mono text-xs opacity-50 text-center border-r border-white/5 relative group">
                                            <span className={mode === 'edit' ? 'group-hover:hidden' : ''}>{rowIdx + 1}</span>
                                            {mode === 'edit' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteRow(rowIdx); }}
                                                    className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-red-500 text-white transition-colors"
                                                    title="Delete row"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </td>
                                        {columns.map((col) => {
                                            const width = colWidths[col] || 150;
                                            const rowVal = row[col];
                                            const editedVal = rowChanges[col];
                                            const isDirty = editedVal !== undefined;
                                            const val = isDirty ? editedVal : rowVal;

                                            return (
                                                <td
                                                    key={`${rowIdx}-${col}`}
                                                    className={`p-0 border-r border-white/5 last:border-0 relative ${isDirty ? 'bg-amber-900/20' : ''}`}
                                                    style={{ width, minWidth: width, maxWidth: width }}
                                                >
                                                    {mode === 'edit' ? (
                                                        <div className="relative w-full h-full">
                                                            <input
                                                                type="text"
                                                                value={String(val ?? '')}
                                                                onChange={(e) => handleInputChange(rowIdx, col, e.target.value)}
                                                                className={`w-full h-full px-4 py-2 bg-transparent outline-none text-sm transition-colors truncate
                                                                    ${isDirty ? 'text-amber-200 font-medium' : 'text-gray-300 focus:text-white focus:bg-white/5'}
                                                                `}
                                                                spellCheck={false}
                                                            />
                                                            {isDirty && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-full m-1 pointer-events-none" />}
                                                        </div>
                                                    ) : (
                                                        <div className={`px-4 py-2 truncate text-sm transition-colors ${isDirty ? 'text-amber-200' : 'text-gray-300'}`} title={String(val ?? '')}>
                                                            {String(val ?? '')}
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
            </div>
        );
    };

    const renderConsole = () => {
        return (
            <div className="flex flex-col h-full overflow-hidden p-6 gap-6">
                {/* Console Input */}
                <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl relative group">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-500 flex items-center justify-center">
                            <Terminal size={16} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-200">Redis CLI</h3>
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Raw Commands</span>
                        </div>
                    </div>

                    <div className="relative">
                        <textarea
                            value={consoleQuery}
                            onChange={(e) => setConsoleQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleExecuteCommand();
                                }
                            }}
                            placeholder="Enter Redis command (e.g. SET user:1 name 'Admin')... Use Ctrl+Enter to run."
                            className="w-full h-32 bg-[#121214] border border-white/5 rounded-xl px-5 py-4 text-sm text-gray-200 font-mono focus:outline-none focus:border-red-500/30 transition-all placeholder:text-gray-700 shadow-inner resize-none"
                        />
                        <button
                            onClick={handleExecuteCommand}
                            disabled={isExecuting || !consoleQuery.trim()}
                            className="absolute bottom-4 right-4 bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-xs font-bold shadow-lg shadow-red-500/20 transition-all flex items-center gap-2"
                        >
                            {isExecuting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                            Execute
                        </button>
                    </div>
                </div>

                {/* Console Output */}
                <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0e]/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm shadow-inner">
                    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-gray-500 bg-[#18181b]/50">
                        <span>Execution History</span>
                        <button onClick={() => setConsoleResults([])} className="hover:text-red-400 transition-colors">Clear</button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-3 custom-scrollbar">
                        {consoleResults.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-700 italic gap-2 opacity-50">
                                <Activity size={24} />
                                <span className="text-xs">No commands executed yet</span>
                            </div>
                        ) : (
                            consoleResults.map((result, i) => (
                                <div key={i} className="animate-in slide-in-from-left-2 duration-200 border border-white/5 bg-[#121214]/50 rounded-xl overflow-hidden shadow-sm">
                                    <div className="px-4 py-2 bg-white/5 flex items-center gap-2 font-mono text-[11px] text-gray-400 border-b border-white/5">
                                        <ChevronLeft size={10} className="text-red-500" />
                                        <span className="text-red-400">{result.cmd}</span>
                                    </div>
                                    <div className={`px-4 py-3 font-mono text-xs whitespace-pre-wrap leading-relaxed ${result.isError ? 'text-red-400 bg-red-500/5' : 'text-green-400 bg-green-500/5'}`}>
                                        {result.res}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-blue-500/30">
            {/* Sidebar (Keys) */}
            <div className="w-64 bg-[#0c0c0e]/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                <div className="p-3 border-b border-white/5 cursor-move" onPointerDown={onDragStart}>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-500 flex items-center justify-center">
                                <RedisIcon size={18} />
                            </div>
                            <div className="flex flex-col min-w-0 max-w-[120px]">
                                <span className="font-bold text-white text-sm truncate" title={connectionName}>{connectionName || 'Redis Manager'}</span>
                                <span className="text-[10px] text-red-400/80 font-mono">Redis</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsCreatingKey(true)}
                            className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                            title="New Key"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    <div className="relative group mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder={t('search_placeholder')}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-[#18181b] border border-white/5 rounded-lg py-1.5 pl-9 pr-3 text-xs text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                            onClick={() => { setActiveView('browser'); setSelectedKey(keys[0] || null); }}
                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${activeView === 'browser' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-white/5 border-white/5 text-gray-400 hover:text-gray-200 hover:border-white/10'}`}
                        >
                            <Activity size={12} /> {t('browser')}
                        </button>
                        <button
                            onClick={() => setActiveView('console')}
                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${activeView === 'console' ? 'bg-red-500/10 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-white/5 border-white/5 text-gray-400 hover:text-gray-200 hover:border-white/10'}`}
                        >
                            <Terminal size={12} /> {t('sql_console')}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="px-2 py-2 space-y-0.5">
                        {keys.length === 0 && !isLoading ? (
                            <div className="text-center py-8 text-gray-600 text-xs">{t('no_data')}</div>
                        ) : (
                            keys.map(key => (
                                <div
                                    key={key}
                                    onClick={() => setSelectedKey(key)}
                                    className={`group w-full text-left px-3 py-2 rounded-md transition-all text-xs font-medium cursor-pointer truncate flex items-center justify-between gap-2 ${selectedKey === key ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-2 truncate flex-1">
                                        <Key size={12} className={selectedKey === key ? 'text-blue-500' : 'text-gray-600'} />
                                        <span className="truncate" title={key}>{key}</span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteKey(key); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-all"
                                        title={t('delete_key')}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                {/* Footer Actions */}
                <div className="p-3 border-t border-white/5 flex items-center justify-between text-xs bg-[#0c0c0e]/50">
                    <span className="text-gray-500 font-mono">{keys.length} {t('keys')}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={fetchKeys} className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors" title={t('reload')}>
                            <RefreshCw size={14} />
                        </button>
                        <button onClick={onDisconnect} className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors" title={t('disconnect')}>
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#09090b]/60 relative overflow-hidden backdrop-blur-md">
                {/* Header */}
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#09090b]/50 backdrop-blur-md cursor-move z-10 sticky top-0" onPointerDown={onDragStart}>
                    <div className="flex items-center gap-4 overflow-hidden">
                        {activeView === 'browser' && selectedKey ? (
                            <div className="flex flex-col group">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('current_key')}</span>
                                {isRenamingKey === selectedKey ? (
                                    <input
                                        autoFocus
                                        value={renamedKeyName}
                                        onChange={(e) => setRenamedKeyName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameKey(selectedKey);
                                            if (e.key === 'Escape') setIsRenamingKey(null);
                                        }}
                                        onBlur={() => handleRenameKey(selectedKey)}
                                        className="bg-[#18181b] border border-blue-500/50 rounded px-2 py-0.5 text-white font-medium text-lg outline-none focus:ring-2 focus:ring-blue-500/20 w-64"
                                    />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate text-lg">{selectedKey}</span>
                                        <button
                                            onClick={() => {
                                                setIsRenamingKey(selectedKey);
                                                setRenamedKeyName(selectedKey);
                                            }}
                                            className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Rename Key"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : activeView === 'console' ? (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Interactive</span>
                                <span className="text-white font-medium truncate text-lg">Redis Console</span>
                            </div>
                        ) : (
                            <span className="text-gray-500 text-sm">Select a key to view data</span>
                        )}
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
                                    {t('discard')}
                                </button>
                                <button
                                    onClick={requestSave}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-green-500/20 transition-all"
                                >
                                    {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} {t('save')}
                                </button>
                            </div>
                        )}

                        {selectedKey && (
                            <div className="flex bg-[#18181b] rounded-lg p-1 border border-white/10">
                                <button
                                    onClick={() => { setMode('view'); setPendingChanges({}); }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${mode === 'view' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Eye size={14} /> {t('views')}
                                </button>
                                <button
                                    onClick={() => setMode('edit')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${mode === 'edit' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Pencil size={14} /> {t('edit')}
                                </button>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {activeView === 'browser' ? renderTable() : renderConsole()}

                {/* Footer (Status) */}
                <div className="h-9 border-t border-white/5 bg-[#0c0c0e]/30 flex items-center justify-between px-4 text-[10px] text-gray-500 font-mono cursor-default select-none z-20">
                    <div className="flex items-center gap-4">
                        {selectedKey && (
                            <>
                                <span>{t('rows')}: <span className="text-gray-300">{parsedData.length}</span></span>
                                {selectedKeyTTL !== null && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={10} className="text-blue-500/70" />
                                        TTL: <span className={selectedKeyTTL === -1 ? 'text-gray-300' : 'text-amber-400'}>
                                            {selectedKeyTTL === -1 ? `∞ (${t('persistent')})` : `${selectedKeyTTL}s`}
                                        </span>
                                    </span>
                                )}
                            </>
                        )}
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

                {/* New Key Modal */}
                {isCreatingKey && (
                    <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                        <div className="bg-[#1c1c1f] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-md w-full animate-in zoom-in-95 duration-300">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center shadow-inner">
                                    <Plus size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white tracking-tight">{t('create_key')}</h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mt-0.5">Redis Database</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">{t('key_name')}</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newKeyData.name}
                                        onChange={e => setNewKeyData({ ...newKeyData, name: e.target.value })}
                                        placeholder="e.g. user:100:profile"
                                        className="w-full bg-[#121214] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-gray-600 shadow-inner"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">{t('type')}</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['string', 'hash', 'list', 'set'] as const).map(type => (
                                            <button
                                                key={type}
                                                onClick={() => setNewKeyData({ ...newKeyData, type })}
                                                className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border flex flex-col items-center gap-1 ${newKeyData.type === type
                                                    ? 'bg-blue-500 border-blue-500 text-white shadow-lg'
                                                    : 'bg-[#121214] border-white/5 text-gray-500 hover:text-gray-300'
                                                    }`}
                                            >
                                                {type === 'string' && <Activity size={12} />}
                                                {type === 'hash' && <HashIcon size={12} />}
                                                {type === 'list' && <ListIcon size={12} />}
                                                {type === 'set' && <Key size={12} />}
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {newKeyData.type === 'string' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Value</label>
                                        <textarea
                                            value={newKeyData.value}
                                            onChange={e => setNewKeyData({ ...newKeyData, value: e.target.value })}
                                            placeholder="Enter string value..."
                                            className="w-full h-24 bg-[#121214] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-gray-600 shadow-inner resize-none"
                                        />
                                    </div>
                                )}

                                {newKeyData.type !== 'string' && (
                                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl text-[11px] text-blue-400/80 leading-relaxed italic">
                                        Key will be initialized with a default {newKeyData.type === 'hash' ? 'field/value' : 'item'} that you can edit later.
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 mt-10">
                                <button
                                    onClick={() => setIsCreatingKey(false)}
                                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateKey}
                                    disabled={!newKeyData.name || isLoading}
                                    className="px-8 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 transition-all uppercase tracking-widest flex items-center gap-2"
                                >
                                    {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Create Key
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
