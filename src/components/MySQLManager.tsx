import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    RefreshCw,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    X,
    LogOut,
    Table as TableIcon,
    AlertCircle,
    Eye,
    Pencil,
    Save,
    RotateCcw,
    AlertTriangle,
    Plus,
    Terminal,
    Hash,
    Trash2,
    Database,
    FolderOpen,
    Folder
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Toast, ToastType } from './Toast';
import { MySQLIcon } from './icons';
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

export default function MySQLManager({ onClose, onDisconnect, onDragStart, connectionName }: { onClose?: () => void, onDisconnect?: () => void, onDragStart?: (e: React.PointerEvent) => void, connectionName?: string }) {
    const { t } = useTranslation();
    const [, setKeys] = useState<string[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState<string>("");
    const [filter, setFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Database switching
    const SYSTEM_DATABASES = ['information_schema', 'mysql', 'performance_schema', 'sys'];
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [databaseTables, setDatabaseTables] = useState<Record<string, string[]>>({});
    const [databaseTableSizes, setDatabaseTableSizes] = useState<Record<string, Record<string, number>>>({}); // db -> table -> size
    const [databaseTotalSizes, setDatabaseTotalSizes] = useState<Record<string, number>>({}); // db -> total size
    const [databaseViews, setDatabaseViews] = useState<Record<string, string[]>>({});
    const [databaseFunctions, setDatabaseFunctions] = useState<Record<string, string[]>>({});
    const [databaseProcedures, setDatabaseProcedures] = useState<Record<string, string[]>>({});
    const [showSystemDatabases, setShowSystemDatabases] = useState(false);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()); // e.g. "test:tables", "test:views"

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // View Switching
    const [activeView, setActiveView] = useState<'browser' | 'console' | 'create-table'>('browser');

    const [isRenamingKey, setIsRenamingKey] = useState<string | null>(null);
    const [renamedKeyName, setRenamedKeyName] = useState("");

    // SQL Console State
    const [sqlQuery, setSqlQuery] = useState("");
    const [sqlResults, setSqlResults] = useState<any[]>([]);
    const [sqlError, setSqlError] = useState<string | null>(null);
    const [isExecutingSql, setIsExecutingSql] = useState(false);

    // Create Table State
    const [newTableName, setNewTableName] = useState("");
    const [newTableCols, setNewTableCols] = useState<{ name: string; type: string; isPk: boolean; isNullable: boolean }[]>([
        { name: 'id', type: 'INT', isPk: true, isNullable: false }
    ]);
    const [isCreatingTable, setIsCreatingTable] = useState(false);

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
    const [isSaving, setIsSaving] = useState(false);
    const [schemaColumns, setSchemaColumns] = useState<string[]>([]);
    const [newRows, setNewRows] = useState<Record<string, string>[]>([]);

    const fetchColumns = async (table: string) => {
        try {
            const cols = await invoke<string[]>('mysql_get_columns', { tableName: table });
            setSchemaColumns(cols);
        } catch (e) {
            console.error("Failed to fetch columns", e);
            setSchemaColumns([]);
        }
    };

    const handleAddRow = () => {
        const newRow: Record<string, string> = {};
        schemaColumns.forEach(col => {
            newRow[col] = "";
        });
        setNewRows([...newRows, newRow]);
    };

    const handleNewRowChange = (index: number, col: string, val: string) => {
        const updated = [...newRows];
        updated[index] = { ...updated[index], [col]: val };
        setNewRows(updated);
    };

    const removeNewRow = (index: number) => {
        setNewRows(newRows.filter((_, i) => i !== index));
    };

    const saveNewRows = async () => {
        if (newRows.length === 0) return;
        setIsSaving(true);
        try {
            for (const row of newRows) {
                await invoke('mysql_insert_row', { tableName: selectedKey, data: row });
            }
            showToast(`Successfully inserted ${newRows.length} rows.`, 'success');
            setNewRows([]);
            if (selectedKey) fetchTableData(selectedKey, page);
        } catch (err: any) {
            showToast(err, 'error');
        } finally {
            setIsSaving(false);
        }
    };



    const handleDeleteRow = async (rowIndex: number) => {
        if (!selectedKey || !primaryKey) {
            showToast("Primary key required to delete row", 'error');
            return;
        }
        const row = tableData[rowIndex];
        const pkVal = row[primaryKey];

        setConfirmState({
            isOpen: true,
            title: t('delete_row_title'),
            message: `${t('delete_row_msg')}\n\n${primaryKey}: ${pkVal}`,
            isDestructive: true,
            confirmText: t('delete'),
            onConfirm: async () => {
                try {
                    await invoke('mysql_delete_row', { tableName: selectedKey, pkCol: primaryKey, pkVal: String(pkVal) });
                    showToast("Row deleted successfully", 'success');
                    fetchTableData(selectedKey, page);
                    fetchCount(selectedKey);
                } catch (err: any) {
                    showToast(err, 'error');
                } finally {
                    closeConfirm();
                }
            }
        });
    };

    const handleDropTable = async (tableName: string) => {
        setConfirmState({
            isOpen: true,
            title: t('drop_table_title'),
            message: t('drop_table_msg').replace('{{tableName}}', tableName),
            isDestructive: true,
            confirmText: t('drop_table_confirm'),
            onConfirm: async () => {
                try {
                    await invoke('mysql_drop_table', { tableName });
                    showToast(`Table "${tableName}" dropped`, 'success');
                    if (selectedKey === tableName) {
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


    const fetchDatabases = async () => {
        try {
            const result = await invoke<[string, number][]>('mysql_get_databases');
            const dbs = result.map(([name]) => name).sort();

            const sizes: Record<string, number> = {};
            result.forEach(([name, size]) => { sizes[name] = size; });
            setDatabaseTotalSizes(sizes);

            setDatabases(dbs);
            // Auto-expand the connected database
            if (dbs.length > 0 && !selectedDatabase) {
                // Get the current database from connection
                const currentDb = connectionName?.split('@')[0] || dbs[0];
                const activeDb = dbs.includes(currentDb) ? currentDb : dbs[0];
                setSelectedDatabase(activeDb);
                setExpandedDatabases(new Set([activeDb]));
                // Fetch tables for the current database
                const tables = await invoke<string[]>('mysql_get_tables');
                setDatabaseTables(prev => ({ ...prev, [activeDb]: tables.sort() }));
                setKeys(tables.sort());
            }
        } catch (err: any) {
            console.error("Failed to fetch databases", err);
        }
    };

    // Fetch all schema objects for a specific database - switches to that database
    const fetchSchemaForDatabase = async (db: string) => {
        try {
            await invoke('mysql_use_database', { database: db });
            setSelectedDatabase(db);

            // Fetch tables with size
            const tablesWithSize = await invoke<[string, number][]>('mysql_get_tables_with_size', { database: db });
            const tableNames = tablesWithSize.map(([name]) => name).sort();

            const sizeMap: Record<string, number> = {};
            tablesWithSize.forEach(([name, size]) => {
                sizeMap[name] = size;
            });

            setDatabaseTables(prev => ({ ...prev, [db]: tableNames }));
            setDatabaseTableSizes(prev => ({ ...prev, [db]: sizeMap }));
            setKeys(tableNames);

            // Fetch views
            try {
                const views = await invoke<string[]>('mysql_get_views');
                setDatabaseViews(prev => ({ ...prev, [db]: views.sort() }));
            } catch { setDatabaseViews(prev => ({ ...prev, [db]: [] })); }

            // Fetch functions
            try {
                const functions = await invoke<string[]>('mysql_get_functions');
                setDatabaseFunctions(prev => ({ ...prev, [db]: functions.sort() }));
            } catch { setDatabaseFunctions(prev => ({ ...prev, [db]: [] })); }

            // Fetch procedures
            try {
                const procedures = await invoke<string[]>('mysql_get_procedures');
                setDatabaseProcedures(prev => ({ ...prev, [db]: procedures.sort() }));
            } catch { setDatabaseProcedures(prev => ({ ...prev, [db]: [] })); }

            // Auto-expand Tables folder
            setExpandedFolders(prev => new Set([...prev, `${db}:tables`]));
        } catch (err: any) {
            console.error(`Failed to fetch schema for ${db}`, err);
            showToast(`Failed to load schema for ${db}`, 'error');
        }
    };

    // Toggle folder expansion (e.g. "test:tables", "test:views")
    const toggleFolder = (folderId: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId);
            } else {
                newSet.add(folderId);
            }
            return newSet;
        });
    };

    // Handle clicking on a table - switch database if needed, then select table
    const handleSelectTable = async (db: string, table: string) => {
        if (selectedDatabase !== db) {
            try {
                await invoke('mysql_use_database', { database: db });
                setSelectedDatabase(db);
                setKeys(databaseTables[db] || []);
            } catch (err: any) {
                showToast(err, 'error');
                return;
            }
        }
        setSelectedKey(table);
        setActiveView('browser');
    };

    const toggleDatabaseExpand = async (db: string) => {
        const newSet = new Set(expandedDatabases);
        if (newSet.has(db)) {
            newSet.delete(db);
        } else {
            newSet.add(db);
            // Fetch schema for this database if not already fetched
            if (!databaseTables[db]) {
                setIsLoading(true);
                await fetchSchemaForDatabase(db);
                setIsLoading(false);
            }
        }
        setExpandedDatabases(newSet);
    };

    const fetchKeys = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await invoke<string[]>('mysql_get_tables');
            setKeys(res.sort());

            // Automatically select the first table if available
            if (res.length > 0) {
                setSelectedKey(res[0]);
            }
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
            const offset = (p - 1) * pageSize;
            const res = await invoke<string[]>('mysql_get_rows', { tableName: table, limit: pageSize, offset });
            setKeyValue(`[${res.join(',')}]`);
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
            const count = await invoke<number>('mysql_get_count', { tableName: table });
            setTotalRows(count);
        } catch (e) {
            console.error("Failed to fetch count", e);
        }
    };

    const fetchPrimaryKey = async (table: string) => {
        try {
            const pk = await invoke<string | null>('mysql_get_primary_key', { tableName: table });
            setPrimaryKey(pk);
        } catch (e) {
            console.error("Failed to fetch PK", e);
            setPrimaryKey(null);
        }
    };

    useEffect(() => {
        fetchDatabases();
        fetchKeys();
    }, []);

    useEffect(() => {
        if (selectedKey) {
            setPage(1);
            setPageInput("1");
            fetchTableData(selectedKey, 1);
            fetchCount(selectedKey);
            fetchPrimaryKey(selectedKey);
            fetchColumns(selectedKey);
            setMode('view');
            setPendingChanges({});
        } else {
            setKeyValue("");
            setTotalRows(0);
            setPrimaryKey(null);
            setSchemaColumns([]);
        }
    }, [selectedKey]);

    useEffect(() => {
        setPageInput(page.toString());
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

        const updates: any[] = [];

        for (const [rowIndexStr, cols] of Object.entries(pendingChanges)) {
            const rowIndex = parseInt(rowIndexStr);
            const row = tableData[rowIndex];
            const pkVal = row[primaryKey];

            if (pkVal === undefined || pkVal === null) {
                console.warn(`Row ${rowIndex} missing PK`);
                continue;
            }

            for (const [colName, newVal] of Object.entries(cols)) {
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
        setIsSaving(true);
        try {
            const command = 'mysql_update_cell';

            const results = await Promise.all(updates.map(u => invoke<number>(command, u)));
            const totalRowsAffected = results.reduce((sum, current) => sum + current, 0);

            if (totalRowsAffected > 0) {
                showToast(`Successfully saved ${totalRowsAffected} changes.`, 'success');

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
        } catch (err: any) {
            console.error("Batch update failed", err);
            showToast("Some updates failed. Check console.", 'error');
        } finally {
            setIsSaving(false);
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

    const handleRenameTable = async (oldName: string) => {
        if (!renamedKeyName.trim() || renamedKeyName === oldName) {
            setIsRenamingKey(null);
            return;
        }
        const newName = renamedKeyName;
        setIsLoading(true);
        try {
            await invoke('mysql_rename_table', { oldName, newName });
            showToast(`Table renamed to ${newName}`, 'success');
            // Fetch keys first, then set the new selected key
            const res = await invoke<string[]>('mysql_get_tables');
            setKeys(res.sort());
            if (selectedKey === oldName) {
                setSelectedKey(newName);
            }
        } catch (err: any) {
            showToast(err, 'error');
        } finally {
            setIsRenamingKey(null);
            setIsLoading(false);
        }
    };

    const executeSql = async () => {
        if (!sqlQuery.trim()) return;
        setIsExecutingSql(true);
        setSqlError(null);
        try {
            const res = await invoke<string>('mysql_execute_raw', { sql: sqlQuery });
            try {
                const parsed = JSON.parse(res);
                if (Array.isArray(parsed)) {
                    setSqlResults(parsed);
                    showToast("Query executed successfully", 'success');
                } else {
                    setSqlResults([]);
                    showToast(res, 'success');
                }
            } catch {
                setSqlResults([]);
                showToast(res, 'success');
            }
        } catch (err: any) {
            setSqlError(err);
            showToast("Execution failed", 'error');
        } finally {
            setIsExecutingSql(false);
        }
    };

    const handleCreateTable = async () => {
        if (!newTableName.trim()) {
            showToast("Table name is required", 'error');
            return;
        }

        const colsSql = newTableCols.map(c => {
            return `\`${c.name}\` ${c.type} ${c.isPk ? 'PRIMARY KEY' : ''} ${c.isPk && (c.type === 'INT' || c.type === 'BIGINT') ? 'AUTO_INCREMENT' : ''} ${!c.isNullable ? 'NOT NULL' : ''}`;
        }).join(', ');

        const sql = `CREATE TABLE \`${newTableName}\` (${colsSql});`;

        setIsCreatingTable(true);
        try {
            await invoke('mysql_execute_raw', { sql });
            showToast(`Table "${newTableName}" created`, 'success');
            setNewTableName("");
            setNewTableCols([{ name: 'id', type: 'INT', isPk: true, isNullable: false }]);
            setActiveView('browser');
            fetchKeys();
        } catch (err: any) {
            showToast(err, 'error');
        } finally {
            setIsCreatingTable(false);
        }
    };

    const handleAddCol = () => {
        setNewTableCols([...newTableCols, { name: '', type: 'VARCHAR(255)', isPk: false, isNullable: true }]);
    };

    const handleRemoveCol = (index: number) => {
        setNewTableCols(newTableCols.filter((_, i) => i !== index));
    };

    const handleColChange = (index: number, field: string, value: any) => {
        const updated = [...newTableCols];
        updated[index] = { ...updated[index], [field]: value };
        setNewTableCols(updated);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            fetchKeys();
        }
    };

    const changeCount = Object.values(pendingChanges).reduce((acc, row) => acc + Object.keys(row).length, 0);

    const tableData = useMemo(() => {
        try { return JSON.parse(keyValue); } catch { return []; }
    }, [keyValue]);

    const renderConsole = () => {
        return (
            <div className="flex flex-col h-full gap-4">
                <div className="flex-1 flex flex-col bg-[#121214] border border-white/5 rounded-xl overflow-hidden shadow-inner">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#18181b]/50">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Terminal size={12} />
                            <span>{t('sql_editor')}</span>
                        </div>
                        <button
                            onClick={executeSql}
                            disabled={isExecutingSql || !sqlQuery.trim()}
                            className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white rounded-md text-xs font-medium transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
                        >
                            {isExecutingSql ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                            {t('execute_query')}
                        </button>
                    </div>
                    <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        placeholder="SELECT * FROM users LIMIT 10;"
                        className="flex-1 w-full p-4 bg-transparent text-gray-300 font-mono text-sm outline-none resize-none custom-scrollbar"
                        spellCheck={false}
                    />
                </div>

                {sqlError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                        <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">{t('execution_error')}</span>
                            <p className="text-sm text-red-200 font-mono leading-relaxed">{sqlError}</p>
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 bg-[#121214] border border-white/5 rounded-xl overflow-hidden flex flex-col shadow-inner">
                    <div className="px-4 py-2 border-b border-white/5 bg-[#18181b]/50 flex items-center gap-2 text-xs text-gray-400">
                        <TableIcon size={12} />
                        <span>{t('query_results')} {sqlResults.length > 0 && `(${sqlResults.length} ${t('rows')})`}</span>
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar p-2">
                        {sqlResults.length > 0 ? (
                            <table className="w-full text-left text-sm text-gray-400 border-collapse table-fixed">
                                <thead className="bg-[#18181b] text-gray-200 font-medium sticky top-0 z-10">
                                    <tr>
                                        {Object.keys(sqlResults[0]).map(col => (
                                            <th key={col} className="px-4 py-3 border-b border-white/10 whitespace-nowrap bg-[#18181b] min-w-[150px] truncate" title={col}>
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sqlResults.map((row, i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            {Object.values(row).map((val: any, j) => (
                                                <td key={j} className="px-4 py-2 truncate border-r border-white/5 last:border-0" title={String(val)}>
                                                    {String(val ?? '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 italic text-sm">
                                {isExecutingSql ? t('executing_query') : t('run_select_desc')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderCreateTable = () => {
        return (
            <div className="flex flex-col h-full gap-6 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar pb-10">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                            <Plus size={24} />
                        </div>
                        {t('create_new_table_title')}
                    </h2>
                    <p className="text-gray-500 text-sm">{t('create_new_table_desc')}</p>
                </div>

                <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">{t('table_name')}</label>
                        <input
                            type="text"
                            value={newTableName}
                            onChange={(e) => setNewTableName(e.target.value)}
                            placeholder={t('table_name_placeholder')}
                            className="bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500/50 transition-all shadow-sm"
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('columns')}</label>
                            <button onClick={handleAddCol} className="flex items-center gap-2 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20">
                                <Plus size={14} /> {t('add_column')}
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            {newTableCols.map((col, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-[#18181b] border border-white/5 p-3 rounded-xl animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex-1 flex flex-col gap-1.5">
                                        <span className="text-[10px] text-gray-600 font-bold uppercase ml-1">{t('column_name')}</span>
                                        <input
                                            type="text"
                                            value={col.name}
                                            onChange={(e) => handleColChange(idx, 'name', e.target.value)}
                                            placeholder={t('column_name')}
                                            className="bg-[#09090b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/30 transition-all font-mono"
                                        />
                                    </div>
                                    <div className="w-40 flex flex-col gap-1.5">
                                        <span className="text-[10px] text-gray-600 font-bold uppercase ml-1">{t('column_type')}</span>
                                        <select
                                            value={col.type}
                                            onChange={(e) => handleColChange(idx, 'type', e.target.value)}
                                            className="bg-[#09090b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/30 transition-all"
                                        >
                                            <option value="INT">INT</option>
                                            <option value="BIGINT">BIGINT</option>
                                            <option value="VARCHAR(255)">VARCHAR(255)</option>
                                            <option value="TEXT">TEXT</option>
                                            <option value="TINYINT(1)">BOOLEAN (TINYINT)</option>
                                            <option value="DATETIME">DATETIME</option>
                                            <option value="TIMESTAMP">TIMESTAMP</option>
                                            <option value="JSON">JSON</option>
                                            <option value="DECIMAL(10,2)">DECIMAL</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-4 px-2 pt-5">
                                        <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                                            <span className="text-[10px] text-gray-600 font-bold uppercase group-hover:text-orange-400 transition-colors">{t('pk')}</span>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${col.isPk ? 'bg-orange-500 border-orange-500 text-white' : 'border-white/10 hover:border-white/30'}`}>
                                                <input type="checkbox" checked={col.isPk} onChange={(e) => handleColChange(idx, 'isPk', e.target.checked)} className="hidden" />
                                                {col.isPk && <Hash size={12} />}
                                            </div>
                                        </label>
                                        <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                                            <span className="text-[10px] text-gray-600 font-bold uppercase group-hover:text-white transition-colors">{t('null')}</span>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${col.isNullable ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 hover:border-white/30'}`}>
                                                <input type="checkbox" checked={col.isNullable} onChange={(e) => handleColChange(idx, 'isNullable', e.target.checked)} className="hidden" />
                                                {col.isNullable && <div className="w-2 h-2 rounded-full bg-white/40" />}
                                            </div>
                                        </label>
                                    </div>
                                    <button onClick={() => handleRemoveCol(idx)} className="p-2 text-gray-600 hover:text-red-400 transition-colors mt-5">
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={() => setActiveView('browser')} className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all">{t('cancel')}</button>
                        <button
                            onClick={handleCreateTable}
                            disabled={isCreatingTable || !newTableName.trim() || newTableCols.some(c => !c.name.trim())}
                            className="px-8 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-orange-500/20 flex items-center gap-3"
                        >
                            {isCreatingTable ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            {t('create_table_button')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };


    const renderTable = () => {
        const columns = (tableData as any[]).length > 0
            ? Array.from(new Set((tableData as any[]).flatMap((x: any) => x ? Object.keys(x) : [])))
            : schemaColumns;

        if (columns.length === 0 && !isLoading) {
            return (
                <div className="flex flex-col items-center justify-center p-12 text-gray-500 gap-4">
                    <TableIcon size={48} className="opacity-20" />
                    <p className="italic">{t('no_columns')}</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3 px-1 text-xs text-gray-500 justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <TableIcon size={12} />
                        <span>{(tableData as any[]).length} {t('rows_on_page')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {mode === 'edit' && (
                            <div className="flex items-center gap-2">
                                {newRows.length > 0 && (
                                    <button
                                        onClick={saveNewRows}
                                        disabled={isSaving}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded shadow-lg shadow-green-500/20 transition-all font-bold text-[10px] uppercase tracking-wider"
                                    >
                                        {isSaving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                                        {t('save_new_rows')} ({newRows.length})
                                    </button>
                                )}
                                <button
                                    onClick={handleAddRow}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded border border-orange-500/20 transition-all font-medium text-[10px] uppercase tracking-wider"
                                >
                                    <Plus size={10} /> {t('add_row')}
                                </button>
                            </div>
                        )}
                        {primaryKey && mode === 'edit' && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-bold tracking-wide">{t('batch_edit_mode')} {primaryKey}</span>}
                        {primaryKey && mode === 'view' && <span className="text-[10px] text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">{t('read_only')} {primaryKey}</span>}
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
                                            className={`px-4 py-3 border-b border-white/10 whitespace-nowrap bg-[#18181b] relative group ${col === primaryKey ? 'text-orange-400' : ''}`}
                                            style={{ width, minWidth: width, maxWidth: width }}
                                        >
                                            <div className="flex items-center justify-between overflow-hidden">
                                                <span className="truncate" title={col}>{col} {col === primaryKey && '🔑'}</span>
                                            </div>
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-orange-500/50 z-30 transition-colors"
                                                onMouseDown={(e) => startResize(e, col)}
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {(tableData as any[]).length === 0 && newRows.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-600 italic">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Search size={24} />
                                            <span>{t('no_records_found')}</span>
                                            {mode === 'view' && <span className="text-[10px] not-italic">{t('switch_to_edit_mode')}</span>}
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {newRows.map((row, i) => (
                                <tr key={`new-${i}`} className="border-b border-green-500/20 bg-green-500/5 transition-colors">
                                    <td className="px-4 py-2 font-mono text-xs text-center border-r border-white/5 relative group">
                                        <span className="group-hover:hidden text-green-500 font-bold">NEW</span>
                                        <button
                                            onClick={() => removeNewRow(i)}
                                            className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-red-500 text-white"
                                            title={t('remove_row')}
                                        >
                                            <X size={12} />
                                        </button>
                                    </td>
                                    {columns.map(col => {
                                        const width = colWidths[col] || 150;
                                        return (
                                            <td key={col} className="p-0 border-r border-white/5 last:border-0" style={{ width, minWidth: width, maxWidth: width }}>
                                                <input
                                                    type="text"
                                                    value={row[col] || ""}
                                                    onChange={(e) => handleNewRowChange(i, col, e.target.value)}
                                                    placeholder={`${t('enter_value_placeholder')} ${col}`}
                                                    className="w-full h-full px-4 py-2 bg-transparent outline-none text-sm text-green-200 focus:bg-white/5 transition-colors placeholder:text-green-900/50"
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}

                            {(tableData as any[]).map((row: any, i: number) => (
                                <tr key={i} className={`border-b border-white/5 transition-colors ${mode === 'edit' ? 'hover:bg-amber-500/5' : 'hover:bg-white/5'}`}>
                                    <td className="px-4 py-2 font-mono text-xs opacity-50 text-center border-r border-white/5 relative group">
                                        <span className={mode === 'edit' ? 'group-hover:hidden' : ''}>{((page - 1) * pageSize) + i + 1}</span>
                                        {mode === 'edit' && primaryKey && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteRow(i); }}
                                                className="hidden group-hover:flex items-center justify-center absolute inset-0 bg-red-500 text-white transition-colors"
                                                title={t('delete_row')}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </td>
                                    {columns.map(col => {
                                        const width = colWidths[col] || 150;
                                        const val = row[col];
                                        const editedVal = pendingChanges[i]?.[col];
                                        const isDirty = editedVal !== undefined && editedVal !== String(val ?? '');
                                        const displayVal = editedVal !== undefined ? editedVal : String(val ?? '');

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
                                                        title={isPK ? t('pk_cannot_edit') : String(val)}
                                                    />
                                                    {isDirty && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-full m-1" />}
                                                </td>
                                            );
                                        }

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
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-orange-500/30 relative">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e]/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                {/* Fixed Header */}
                <div className="p-4 border-b border-white/5 cursor-move" onPointerDown={onDragStart}>
                    <div className="flex items-center justify-between mb-4 px-2">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center">
                                <MySQLIcon size={18} />
                            </div>
                            <div className="flex flex-col min-w-0 max-w-[210px]">
                                <span className="font-bold text-white text-sm truncate" title={connectionName}>{connectionName || 'MySQL Manager'}</span>
                                <span className="text-[10px] text-orange-400/80 font-mono">MySQL</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder={t('search_placeholder')}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-[#18181b] border border-white/5 rounded-xl py-2.5 pl-10 pr-10 text-sm text-gray-300 focus:outline-none focus:border-orange-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                        <button onClick={fetchKeys} disabled={isLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors disabled:opacity-50">
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mt-4 px-1">
                        <button
                            onClick={() => { setActiveView('console'); setSelectedKey(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${activeView === 'console' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-[#18181b] text-gray-400 hover:text-white border border-white/5'}`}
                        >
                            <Terminal size={14} /> {t('sql_console')}
                        </button>
                        <button
                            onClick={() => { setActiveView('create-table'); setSelectedKey(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${activeView === 'create-table' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-[#18181b] text-gray-400 hover:text-white border border-white/5'}`}
                        >
                            <Plus size={14} /> {t('create_table')}
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

                {/* Database Tree List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {databases.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 opacity-60">
                            <span className="text-sm text-gray-500 mb-3">{t('no_databases')}</span>
                        </div>
                    ) : (
                        <>
                            {/* User Databases */}
                            {databases
                                .filter(db => !SYSTEM_DATABASES.includes(db.toLowerCase()))
                                .filter(db => {
                                    const dbTables = databaseTables[db] || [];
                                    return db.toLowerCase().includes(filter.toLowerCase()) ||
                                        (expandedDatabases.has(db) && dbTables.some(k => k.toLowerCase().includes(filter.toLowerCase())));
                                })
                                .map(db => {
                                    const dbTables = databaseTables[db] || [];
                                    const dbViews = databaseViews[db] || [];
                                    const dbFuncs = databaseFunctions[db] || [];
                                    const dbProcs = databaseProcedures[db] || [];

                                    return (
                                        <div key={db} className="mb-1">
                                            {/* Database Node */}
                                            <button
                                                onClick={() => toggleDatabaseExpand(db)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all ${selectedDatabase === db
                                                    ? 'bg-orange-500/10 text-orange-400'
                                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                    }`}
                                            >
                                                {expandedDatabases.has(db) ? (
                                                    <ChevronDown size={14} className="shrink-0 opacity-50" />
                                                ) : (
                                                    <ChevronRight size={14} className="shrink-0 opacity-50" />
                                                )}
                                                <Database size={14} className="shrink-0 opacity-70" />
                                                <span className="truncate flex-1">{db}</span>
                                                {databaseTotalSizes[db] !== undefined && (
                                                    <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap shrink-0 mr-2 opacity-70">
                                                        {formatBytes(databaseTotalSizes[db])}
                                                    </span>
                                                )}
                                                {selectedDatabase === db && (
                                                    <span className="text-[10px] bg-orange-500/20 px-1.5 py-0.5 rounded text-orange-400">active</span>
                                                )}
                                            </button>

                                            {/* Schema folders under this database */}
                                            <AnimatePresence>
                                                {expandedDatabases.has(db) && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                                        className="ml-4 mt-1 border-l border-white/5 pl-2 overflow-hidden"
                                                    >
                                                        {/* Tables folder */}
                                                        <motion.button
                                                            whileHover={{ x: 2 }}
                                                            onClick={() => toggleFolder(`${db}:tables`)}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                                        >
                                                            {expandedFolders.has(`${db}:tables`) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                            {dbTables.length > 0 ? <FolderOpen size={12} /> : <Folder size={12} />}
                                                            <span>Tables ({dbTables.length})</span>
                                                        </motion.button>
                                                        <AnimatePresence>
                                                            {expandedFolders.has(`${db}:tables`) && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    {dbTables.filter(k => k.toLowerCase().includes(filter.toLowerCase())).map(table => (
                                                                        <motion.div
                                                                            key={table}
                                                                            initial={{ x: -10, opacity: 0 }}
                                                                            animate={{ x: 0, opacity: 1 }}
                                                                            className={`group flex items-center gap-2 px-3 py-1.5 ml-4 rounded-lg text-sm transition-all ${selectedKey === table && selectedDatabase === db && activeView === 'browser'
                                                                                ? 'bg-orange-500/10 text-orange-400 font-medium'
                                                                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                                                }`}
                                                                        >
                                                                            <button onClick={() => handleSelectTable(db, table)} className="flex-1 flex items-center gap-2 min-w-0">
                                                                                <TableIcon size={12} className="opacity-70 shrink-0" />
                                                                                <span className="truncate" title={table}>{table}</span>
                                                                                {databaseTableSizes[db]?.[table] !== undefined && (
                                                                                    <span className="text-[10px] text-gray-500 ml-auto mr-1 font-mono whitespace-nowrap shrink-0">
                                                                                        {formatBytes(databaseTableSizes[db][table])}
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleSelectTable(db, table).then(() => handleDropTable(table)); }}
                                                                                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-all"
                                                                                title={t('delete')}
                                                                            >
                                                                                <Trash2 size={10} />
                                                                            </button>
                                                                        </motion.div>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Views folder */}
                                                        <motion.button
                                                            whileHover={{ x: 2 }}
                                                            onClick={() => toggleFolder(`${db}:views`)}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                                        >
                                                            {expandedFolders.has(`${db}:views`) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                            <Eye size={12} />
                                                            <span>{t('views')} ({dbViews.length})</span>
                                                        </motion.button>
                                                        <AnimatePresence>
                                                            {expandedFolders.has(`${db}:views`) && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    {dbViews.map(view => (
                                                                        <div key={view} className="flex items-center gap-2 px-3 py-1.5 ml-4 text-xs text-gray-500">
                                                                            <Eye size={12} className="opacity-50" />
                                                                            <span className="truncate">{view}</span>
                                                                        </div>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Functions folder */}
                                                        <motion.button
                                                            whileHover={{ x: 2 }}
                                                            onClick={() => toggleFolder(`${db}:functions`)}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                                        >
                                                            {expandedFolders.has(`${db}:functions`) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                            <Hash size={12} />
                                                            <span>{t('functions')} ({dbFuncs.length})</span>
                                                        </motion.button>
                                                        <AnimatePresence>
                                                            {expandedFolders.has(`${db}:functions`) && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    {dbFuncs.map(func => (
                                                                        <div key={func} className="flex items-center gap-2 px-3 py-1.5 ml-4 text-xs text-gray-500">
                                                                            <Hash size={12} className="opacity-50" />
                                                                            <span className="truncate">{func}</span>
                                                                        </div>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Procedures folder */}
                                                        <motion.button
                                                            whileHover={{ x: 2 }}
                                                            onClick={() => toggleFolder(`${db}:procedures`)}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                                        >
                                                            {expandedFolders.has(`${db}:procedures`) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                            <Terminal size={12} />
                                                            <span>{t('procedures')} ({dbProcs.length})</span>
                                                        </motion.button>
                                                        <AnimatePresence>
                                                            {expandedFolders.has(`${db}:procedures`) && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    {dbProcs.map(proc => (
                                                                        <div key={proc} className="flex items-center gap-2 px-3 py-1.5 ml-4 text-xs text-gray-500">
                                                                            <Terminal size={12} className="opacity-50" />
                                                                            <span className="truncate">{proc}</span>
                                                                        </div>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {isLoading && !databaseTables[db] && (
                                                            <div className="ml-2 px-3 py-2 text-xs text-gray-600 italic">{t('loading')}</div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}

                            {/* System Databases Folder */}
                            {showSystemDatabases && databases.some(db => SYSTEM_DATABASES.includes(db.toLowerCase())) && (
                                <div className="mt-4 pt-3 border-t border-white/5">
                                    <button
                                        onClick={() => toggleFolder('__system__')}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                                    >
                                        {expandedFolders.has('__system__') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        <Folder size={12} />
                                        <span>{t('system_databases')} ({databases.filter(db => SYSTEM_DATABASES.includes(db.toLowerCase())).length})</span>
                                    </button>

                                    {expandedFolders.has('__system__') && databases
                                        .filter(db => SYSTEM_DATABASES.includes(db.toLowerCase()))
                                        .map(db => {
                                            const dbTables = databaseTables[db] || [];

                                            return (
                                                <div key={db} className="ml-4">
                                                    <button
                                                        onClick={() => toggleDatabaseExpand(db)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-left transition-all ${selectedDatabase === db
                                                            ? 'bg-orange-500/10 text-orange-400'
                                                            : 'text-gray-500 hover:bg-white/5 hover:text-gray-400'
                                                            }`}
                                                    >
                                                        {expandedDatabases.has(db) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        <Database size={12} className="opacity-50" />
                                                        <span className="truncate flex-1">{db}</span>
                                                        {databaseTotalSizes[db] !== undefined && (
                                                            <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap shrink-0 mr-1 opacity-70">
                                                                {formatBytes(databaseTotalSizes[db])}
                                                            </span>
                                                        )}
                                                        {selectedDatabase === db && (
                                                            <span className="text-[10px] bg-orange-500/20 px-1 py-0.5 rounded text-orange-400">active</span>
                                                        )}
                                                    </button>

                                                    {expandedDatabases.has(db) && (
                                                        <div className="ml-4 mt-1 border-l border-white/5 pl-2">
                                                            <button
                                                                onClick={() => toggleFolder(`${db}:tables`)}
                                                                className="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-gray-600 hover:text-gray-500"
                                                            >
                                                                {expandedFolders.has(`${db}:tables`) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                                                <span>Tables ({dbTables.length})</span>
                                                            </button>
                                                            {expandedFolders.has(`${db}:tables`) && dbTables.slice(0, 20).map(table => (
                                                                <div key={table} className="flex items-center gap-2 px-3 py-1 ml-3 text-[11px] text-gray-600 hover:text-gray-500 cursor-pointer" onClick={() => handleSelectTable(db, table)}>
                                                                    <TableIcon size={10} className="opacity-50" />
                                                                    <span className="truncate flex-1" title={table}>{table}</span>
                                                                    {databaseTableSizes[db]?.[table] !== undefined && (
                                                                        <span className="text-[9px] text-gray-500 font-mono opacity-70 whitespace-nowrap shrink-0">
                                                                            {formatBytes(databaseTableSizes[db][table])}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {dbTables.length > 20 && expandedFolders.has(`${db}:tables`) && (
                                                                <div className="px-3 py-1 ml-3 text-[10px] text-gray-600 italic">+{dbTables.length - 20} more...</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 bg-[#0c0c0e]/50">
                    <div className="flex items-center gap-2">
                        <span>{databases.filter(db => db === selectedDatabase || showSystemDatabases || !SYSTEM_DATABASES.includes(db.toLowerCase())).length} {t('database')} · {Object.values(databaseTables).reduce((sum, tables) => sum + tables.length, 0)} {t('tables')}</span>
                        <button
                            onClick={() => setShowSystemDatabases(!showSystemDatabases)}
                            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${showSystemDatabases ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-gray-500 hover:text-gray-400'}`}
                            title={showSystemDatabases ? t('system_databases') : t('system_databases')}
                        >
                            {showSystemDatabases ? 'sys ✓' : 'sys'}
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => { fetchDatabases(); }} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors p-1" title={t('reload')}>
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={onDisconnect} className="flex items-center gap-2 text-gray-500 hover:text-red-400 transition-colors p-1" title={t('disconnect')}>
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col bg-[#09090b]/60 relative overflow-hidden">
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#09090b]/50 backdrop-blur-md cursor-move z-10 sticky top-0" onPointerDown={onDragStart}>
                    <div className="flex items-center gap-4 overflow-hidden">
                        {activeView === 'browser' && selectedKey ? (
                            <div className="flex flex-col group">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('current_table')}</span>
                                {isRenamingKey === selectedKey ? (
                                    <input
                                        autoFocus
                                        value={renamedKeyName}
                                        onChange={(e) => setRenamedKeyName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameTable(selectedKey);
                                            if (e.key === 'Escape') setIsRenamingKey(null);
                                        }}
                                        onBlur={() => handleRenameTable(selectedKey)}
                                        className="bg-[#18181b] border border-orange-500/50 rounded px-2 py-0.5 text-white font-medium text-lg outline-none focus:ring-2 focus:ring-orange-500/20 w-64"
                                    />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate text-lg">{selectedKey}</span>
                                        <button
                                            onClick={() => {
                                                setIsRenamingKey(selectedKey);
                                                setRenamedKeyName(selectedKey);
                                            }}
                                            className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                                            title={t('rename_key')}
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : activeView === 'console' ? (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('interactive')}</span>
                                <span className="text-white font-medium truncate text-lg">{t('sql_console')}</span>
                            </div>
                        ) : activeView === 'create-table' ? (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('structural')}</span>
                                <span className="text-white font-medium truncate text-lg">{t('create_table')}</span>
                            </div>
                        ) : (
                            <span className="text-gray-500 text-sm">{t('select_table')}</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View/Edit Toggle */}
                        {activeView === 'browser' && selectedKey && (
                            <div className="flex items-center gap-2 bg-[#18181b] rounded-lg p-1 border border-white/10 mr-2">
                                <button
                                    onClick={requestOutMode}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${mode === 'view' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Eye size={12} /> {t('views')}
                                </button>
                                <button
                                    onClick={() => setMode('edit')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${mode === 'edit' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Pencil size={12} /> {t('edit')}
                                </button>
                            </div>
                        )}

                        {/* Batch Actions */}
                        {activeView === 'browser' && mode === 'edit' && changeCount > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                {editHistory.length > 0 && (
                                    <button
                                        onClick={handleUndo}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-md text-xs font-medium flex items-center gap-1.5 border border-white/5 transition-all mr-1"
                                        title="Undo last change"
                                    >
                                        <RotateCcw size={12} className="scale-x-[-1]" /> {t('undo')}
                                    </button>
                                )}
                                <button
                                    onClick={requestSave}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-green-500/20 transition-all"
                                >
                                    {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                    {t('save')} ({changeCount})
                                </button>
                                <button
                                    onClick={requestDiscard}
                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs font-medium flex items-center gap-1.5 border border-red-500/10 transition-all"
                                >
                                    <RotateCcw size={12} /> {t('discard')}
                                </button>
                            </div>
                        )}

                        {activeView === 'browser' && selectedKey && (
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

                    {activeView === 'browser' ? (
                        selectedKey ? (
                            <div className="flex-1 flex flex-col min-h-0 bg-[#121214] border border-white/5 rounded-xl shadow-inner overflow-hidden p-1">
                                {isLoading ? (
                                    <div className="flex items-center justify-center h-full text-orange-400 gap-2">
                                        <RefreshCw className="animate-spin" /> {t('loading')}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-1 min-h-0 overflow-hidden p-3">
                                            {renderTable()}
                                        </div>

                                        {/* Pagination Footer */}
                                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-[#18181b] shrink-0">
                                            <div className="text-xs text-gray-500">
                                                {t('showing')} <span className="text-gray-300 font-mono">{((page - 1) * pageSize) + 1}</span> - <span className="text-gray-300 font-mono">{Math.min(page * pageSize, totalRows)}</span> {t('of')} <span className="text-gray-300 font-mono">{totalRows}</span> {t('rows')}
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
                                                    <span>{t('page')}</span>
                                                    <input
                                                        type="text"
                                                        value={pageInput}
                                                        onChange={e => setPageInput(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handlePageInputSubmit()}
                                                        onBlur={handlePageInputSubmit}
                                                        className="w-10 bg-[#27272a] border border-white/10 rounded px-1 py-0.5 text-center text-white focus:border-orange-500 outline-none transition-colors"
                                                    />
                                                    <span>{t('of')} {Math.max(1, Math.ceil(totalRows / pageSize))}</span>
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
                                <p className="text-lg font-medium text-gray-500">{t('select_table')}</p>
                            </div>
                        )
                    ) : activeView === 'console' ? (
                        renderConsole()
                    ) : (
                        renderCreateTable()
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
