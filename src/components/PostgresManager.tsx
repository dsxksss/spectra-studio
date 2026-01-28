import { useState, useEffect } from 'react';
import {
    Search,
    Database,
    RefreshCw,
    ChevronRight,
    X,
    LogOut,
    Table as TableIcon,
    AlertCircle,
    Plus
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export default function PostgresManager({ onClose, onDisconnect, onDragStart, serviceType }: { onClose?: () => void, onDisconnect?: () => void, onDragStart?: (e: React.PointerEvent) => void, serviceType: string }) {
    const [keys, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState<string>("");
    const [filter, setFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchKeys = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let res: string[] = [];
            if (serviceType === 'PostgreSQL') {
                res = await invoke<string[]>('postgres_get_tables');
            } else {
                // TODO: MySQL / MongoDB
                res = [];
            }
            // Filter out internal tables if needed, for now just sort
            setKeys(res.sort());
        } catch (err: any) {
            console.error("Failed to fetch tables", err);
            setError(typeof err === 'string' ? err : "Failed to fetch tables.");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchValue = async (table: string) => {
        setIsLoading(true);
        try {
            if (serviceType === 'PostgreSQL') {
                const res = await invoke<string[]>('postgres_get_rows', { tableName: table });
                // Combine JSON strings into a JSON array string
                setKeyValue(`[${res.join(',')}]`);
            } else {
                setKeyValue("[]");
            }
        } catch (err) {
            console.error(err);
            setKeyValue("Error loading data");
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
        } else {
            setKeyValue("");
        }
    }, [selectedKey]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchKeys();
        }
    };

    // ValueViewer... (Keep as is, it handles JSON arrays well)
    const ValueViewer = ({ value }: { value: string }) => {
        try {
            const parsed = JSON.parse(value);
            // Array of Objects -> Table
            if (Array.isArray(parsed)) {
                if (parsed.length === 0) {
                    return <div className="text-gray-500 p-6 italic">Table is empty</div>;
                }
                const columns = Array.from(new Set(parsed.flatMap(x => x ? Object.keys(x) : [])));
                return (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                            <TableIcon size={12} />
                            <span>{parsed.length} rows</span>
                        </div>
                        <div className="flex-1 overflow-auto border border-white/5 rounded-xl bg-[#121214] shadow-inner custom-scrollbar">
                            <table className="w-full text-left text-sm text-gray-400 border-collapse">
                                <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-white/10 w-12 text-center bg-[#18181b] z-20">#</th>
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
        } catch (e) { }
        return <div className="text-red-400 p-4">Error parsing data</div>;
    };

    return (
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-blue-500/30">
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

                    <div className="flex items-center gap-2">
                        {selectedKey && (
                            <button onClick={() => fetchValue(selectedKey)} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Reload Data">
                                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors" title="Close Window">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 relative">
                    <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />

                    {selectedKey ? (
                        <div className="h-full flex flex-col space-y-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-blue-400 gap-2">
                                    <RefreshCw className="animate-spin" /> Loading data...
                                </div>
                            ) : (
                                <div className="flex-1 min-h-0">
                                    <ValueViewer value={keyValue} />
                                </div>
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
        </div>
    );
}
