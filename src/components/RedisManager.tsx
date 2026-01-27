import { useState, useEffect } from 'react';
import {
    Search,
    Database,
    RefreshCw,
    Key,
    ChevronRight,
    X,
    LogOut,
    Table as TableIcon,
    FileJson,
    AlertCircle,
    Plus,
    Trash2,
    Save,
    Pencil,
    Type
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

type EditRow = { field: string; value: string; id: number };

export default function RedisManager({ onClose, onDisconnect, onDragStart }: { onClose: () => void, onDisconnect: () => void, onDragStart?: (e: React.PointerEvent) => void }) {
    const [keys, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState<string>("");
    const [filter, setFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editing / Creating State
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editKeyName, setEditKeyName] = useState("");
    const [editRows, setEditRows] = useState<EditRow[]>([]);
    const [editMode, setEditMode] = useState<'structured' | 'raw'>('structured');
    const [rawEditValue, setRawEditValue] = useState("");

    const fetchKeys = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await invoke<string[]>('redis_get_keys', { pattern: filter || '*' });
            setKeys(res.sort());
        } catch (err: any) {
            console.error("Failed to fetch keys", err);
            setError(typeof err === 'string' ? err : "Failed to fetch keys from Redis.");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchValue = async (key: string) => {
        try {
            const res = await invoke<string>('redis_get_value', { key });
            setKeyValue(res);
        } catch (err) {
            console.error("Failed to fetch value", err);
            setKeyValue("Error fetching value");
        }
    };

    // Initialize Creator
    const startCreating = () => {
        setIsCreating(true);
        setIsEditing(false);
        setSelectedKey(null);
        setEditKeyName("");
        setEditRows([{ field: "", value: "", id: Date.now() }]);
        setEditMode('structured');
        setRawEditValue("");
    };

    // Initialize Editor with current data
    const startEditing = () => {
        if (!selectedKey) return;
        setIsCreating(false);
        setIsEditing(true);
        setEditKeyName(selectedKey);

        try {
            const parsed = JSON.parse(keyValue);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                // Compatible with Table View
                const rows = Object.entries(parsed).map(([k, v], i) => ({
                    field: k,
                    value: String(v),
                    id: Date.now() + i
                }));
                if (rows.length === 0) rows.push({ field: "", value: "", id: Date.now() });
                setEditRows(rows);
                setEditMode('structured');
            } else {
                // Fallback to Raw
                setEditMode('raw');
                setRawEditValue(keyValue);
            }
        } catch {
            setEditMode('raw');
            setRawEditValue(keyValue);
        }
    };

    const handleSave = async () => {
        const targetKey = isCreating ? editKeyName : selectedKey;
        if (!targetKey) return;

        let valueToSave = "";
        if (editMode === 'structured') {
            const obj = editRows.reduce((acc, row) => {
                if (row.field.trim()) acc[row.field.trim()] = row.value;
                return acc;
            }, {} as Record<string, any>);
            valueToSave = JSON.stringify(obj);
        } else {
            valueToSave = rawEditValue;
        }

        try {
            await invoke('redis_set_value', { key: targetKey, value: valueToSave });

            // Cleanup and Refresh
            setIsCreating(false);
            setIsEditing(false);
            setEditKeyName("");

            await fetchKeys();
            setSelectedKey(targetKey); // This will trigger fetchValue -> update view
        } catch (err) {
            alert("Failed to save: " + err);
        }
    };

    const cancelEdit = () => {
        setIsCreating(false);
        setIsEditing(false);
    };

    const addRow = () => {
        setEditRows([...editRows, { field: "", value: "", id: Date.now() }]);
    };

    const removeRow = (id: number) => {
        setEditRows(editRows.filter(r => r.id !== id));
    };

    const updateRow = (id: number, field: keyof EditRow, val: string) => {
        setEditRows(editRows.map(r => r.id === id ? { ...r, [field]: val } : r));
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    useEffect(() => {
        if (selectedKey) {
            setIsCreating(false);
            setIsEditing(false);
            fetchValue(selectedKey);
        } else {
            setKeyValue("");
        }
    }, [selectedKey]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchKeys();
        }
    };

    // ... ValueViewer Component ...
    const ValueViewer = ({ value }: { value: string }) => {
        try {
            const parsed = JSON.parse(value);

            // Array of Objects -> Table
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                const columns = Array.from(new Set(parsed.flatMap(Object.keys)));
                return (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                            <TableIcon size={12} />
                            <span>Table View ({parsed.length} items)</span>
                        </div>
                        <div className="flex-1 overflow-auto border border-white/5 rounded-xl bg-[#121214] shadow-inner custom-scrollbar">
                            <table className="w-full text-left text-sm text-gray-400 border-collapse">
                                <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-white/10 w-12 text-center bg-[#18181b]">#</th>
                                        {columns.map(col => (
                                            <th key={col} className="px-4 py-3 border-b border-white/10 whitespace-nowrap bg-[#18181b]">{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsed.map((row, i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-2 font-mono text-xs opacity-50 text-center border-r border-white/5">{i + 1}</td>
                                            {columns.map(col => (
                                                <td key={col} className="px-4 py-2 max-w-[250px] truncate border-r border-white/5 last:border-0" title={String((row as any)[col])}>
                                                    {String((row as any)[col] ?? '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            }
            // Object -> Key-Value Table
            else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                            <FileJson size={12} />
                            <span>Structured View</span>
                        </div>
                        <div className="flex-1 overflow-auto border border-white/5 rounded-xl bg-[#121214] shadow-inner custom-scrollbar">
                            <table className="w-full text-left text-sm text-gray-400 border-collapse">
                                <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 border-b border-white/10 w-1/3 bg-[#18181b]">Field</th>
                                        <th className="px-6 py-3 border-b border-white/10 bg-[#18181b]">Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(parsed).map(([k, v], i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-3 font-mono text-blue-400 border-r border-white/5">{k}</td>
                                            <td className="px-6 py-3 text-gray-300 break-all">{String(v)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            }
        } catch (e) { }

        return (
            <div className="w-full h-full bg-[#121214] border border-white/5 rounded-xl p-6 font-mono text-sm text-gray-300 whitespace-pre-wrap break-all shadow-inner overflow-auto custom-scrollbar">
                {value}
            </div>
        );
    };

    return (
        <div className="flex w-full h-full bg-[#09090b] text-gray-300 font-sans overflow-hidden border border-white/10 selection:bg-blue-500/30 rounded-[28px] shadow-2xl relative">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e]/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                {/* Fixed Header */}
                <div className="p-4 border-b border-white/5 cursor-move" onPointerDown={onDragStart}>
                    <div className="flex items-center justify-between mb-4 px-2">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                <Database size={18} />
                            </div>
                            <span className="font-bold text-white tracking-wide">Redis Explorer</span>
                        </div>
                        <button onClick={startCreating} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors" title="Add New Key">
                            <Plus size={18} />
                        </button>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search keys..."
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

                {/* Key List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {keys.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 opacity-60">
                            <span className="text-sm text-gray-500 mb-3">No keys found</span>
                            <button onClick={startCreating} className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all hover:bg-blue-500/20">
                                <Plus size={12} /> Add Key
                            </button>
                        </div>
                    ) : (
                        keys.map(key => (
                            <button
                                key={key}
                                onClick={() => setSelectedKey(key)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-left transition-all ${selectedKey === key
                                        ? 'bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
                                    }`}
                            >
                                <Key size={14} className="opacity-70 shrink-0" />
                                <span className="truncate">{key}</span>
                                {selectedKey === key && <ChevronRight size={14} className="ml-auto opacity-50" />}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 bg-[#0c0c0e]">
                    <span>{keys.length} Keys found</span>
                    <button onClick={onDisconnect} className="flex items-center gap-2 text-gray-500 hover:text-red-400 transition-colors p-1" title="Disconnect">
                        <LogOut size={14} /> <span className="font-medium">Disconnect</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col bg-[#09090b] relative overflow-hidden">
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#09090b]/50 backdrop-blur-md cursor-move z-10 sticky top-0" onPointerDown={onDragStart}>
                    {isCreating || isEditing ? (
                        <div className="flex items-center gap-4 flex-1">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{isCreating ? "Creating New Key" : "Editing Key"}</span>
                                <input
                                    value={editKeyName}
                                    onChange={e => isCreating && setEditKeyName(e.target.value)}
                                    readOnly={!isCreating}
                                    placeholder="Enter key name..."
                                    className={`bg-transparent text-white font-medium text-lg focus:outline-none placeholder:text-gray-600 ${!isCreating ? 'cursor-default opacity-80' : ''}`}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 overflow-hidden">
                            {selectedKey ? (
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current Key</span>
                                    <span className="text-white font-medium truncate text-lg">{selectedKey}</span>
                                </div>
                            ) : (
                                <span className="text-gray-500 text-sm">Select a key to view value</span>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {isCreating || isEditing ? (
                            <>
                                <button onClick={cancelEdit} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
                                <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
                                    <Save size={16} /> Save
                                </button>
                            </>
                        ) : (
                            <>
                                {selectedKey && (
                                    <>
                                        <button onClick={startEditing} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-blue-400 transition-colors" title="Edit Content">
                                            <Pencil size={18} />
                                        </button>
                                        <button onClick={() => fetchValue(selectedKey)} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Reload Value">
                                            <RefreshCw size={18} />
                                        </button>
                                    </>
                                )}
                                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Close Window">
                                    <X size={18} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 relative">
                    <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />

                    {isCreating || isEditing ? (
                        <div className="h-full flex flex-col space-y-4">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-4">
                                <button
                                    onClick={() => setEditMode('structured')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editMode === 'structured' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <TableIcon size={14} /> Table Editor
                                </button>
                                <button
                                    onClick={() => setEditMode('raw')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editMode === 'raw' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Type size={14} /> Raw Text
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 bg-[#121214] border border-white/5 rounded-xl shadow-inner overflow-hidden">
                                {editMode === 'structured' ? (
                                    <div className="h-full flex flex-col">
                                        <div className="flex-1 overflow-auto custom-scrollbar">
                                            <table className="w-full text-left text-sm text-gray-400 border-collapse">
                                                <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-3 border-b border-white/10 w-1/2">Field / Property</th>
                                                        <th className="px-4 py-3 border-b border-white/10 w-1/2">Value</th>
                                                        <th className="px-2 py-3 border-b border-white/10 w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {editRows.map((row) => (
                                                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 group">
                                                            <td className="p-0 border-r border-white/5">
                                                                <input
                                                                    value={row.field}
                                                                    onChange={e => updateRow(row.id, 'field', e.target.value)}
                                                                    placeholder="Property name"
                                                                    className="w-full bg-transparent px-4 py-3 focus:outline-none focus:bg-blue-500/5 transition-colors placeholder:text-gray-700 font-mono text-blue-400"
                                                                />
                                                            </td>
                                                            <td className="p-0 border-r border-white/5">
                                                                <input
                                                                    value={row.value}
                                                                    onChange={e => updateRow(row.id, 'value', e.target.value)}
                                                                    placeholder="Value"
                                                                    className="w-full bg-transparent px-4 py-3 focus:outline-none focus:bg-blue-500/5 transition-colors placeholder:text-gray-700 text-gray-300"
                                                                />
                                                            </td>
                                                            <td className="text-center">
                                                                <button onClick={() => removeRow(row.id)} className="p-2 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-3 border-t border-white/5 bg-[#18181b]">
                                            <button onClick={addRow} className="flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
                                                <Plus size={14} /> Add Property
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <textarea
                                        value={rawEditValue}
                                        onChange={e => setRawEditValue(e.target.value)}
                                        className="w-full h-full bg-transparent p-6 text-sm font-mono text-gray-300 resize-none focus:outline-none"
                                        placeholder="Enter raw text or JSON..."
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        selectedKey ? (
                            <div className="h-full flex flex-col space-y-4">
                                <div className="flex items-center justify-between shrink-0">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Value Content</span>
                                </div>
                                <div className="flex-1 min-h-0">
                                    <ValueViewer value={keyValue} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-30 gap-6">
                                <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
                                    <Database size={48} className="text-gray-500" />
                                </div>
                                <p className="text-lg font-medium text-gray-500">Pick a key from the sidebar</p>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
