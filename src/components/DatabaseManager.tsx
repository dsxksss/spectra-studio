import { useState, useEffect } from 'react';
import {
    Search,
    Settings,
    Plus,
    Database,
    X,
    Eye,
    EyeOff,
    ChevronDown,
    Activity,
    Box,
    Globe,
    Save,
    Play,
    RefreshCw,
    Pencil,
    Trash2,
    FileJson
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Toast, ToastType } from './Toast';

type SavedConnection = {
    id: string;
    name: string;
    type: string;
    host: string;
    port: string;
    username: string;
    environment: string;
    password?: string;
    database?: string;
};

const ServiceTypeButton = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
    <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={`flex items-center gap-3 px-6 py-4 rounded-xl border transition-all duration-300 ${active
            ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
            : 'bg-[#18181b]/50 border-white/5 text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-gray-200'
            } flex-1 justify-center relative overflow-hidden group`}
    >
        <div className={`p-2 rounded-lg ${active ? 'bg-blue-500/20' : 'bg-white/5 group-hover:bg-white/10'} transition-colors`}>
            <Icon size={20} />
        </div>
        <span className="font-semibold tracking-wide">{label}</span>
        {active && (
            <motion.div
                layoutId="active-glow"
                className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-transparent"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
        )}
    </motion.button>
);

const InputField = ({ label, placeholder, type = "text", value, onChange, className = "" }: any) => (
    <div className={`flex flex-col gap-2.5 ${className}`}>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{label}</label>
        <div className="relative group">
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full h-[46px] bg-[#121214] border border-white/5 rounded-xl px-5 text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm placeholder:text-gray-700 shadow-inner flex items-center"
            />
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5 pointer-events-none" />
        </div>
    </div>
);

export default function DatabaseManager({ onClose, onConnect, activeService, onDragStart }: { onClose?: () => void, onConnect?: (service: string) => void, activeService?: string | null, onDragStart?: (e: React.PointerEvent) => void }) {
    const [selectedService, setSelectedService] = useState(activeService || 'Redis');
    const [showPassword, setShowPassword] = useState(false);

    // Form State
    const [connectionName, setConnectionName] = useState('New Connection');
    const [isCustomName, setIsCustomName] = useState(false);
    const [environment, setEnvironment] = useState('Development');
    const [host, setHost] = useState('127.0.0.1');
    const [port, setPort] = useState('6379');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [dbName, setDbName] = useState('0');

    useEffect(() => {
        if (!isCustomName) {
            setConnectionName(`${selectedService} - ${host}:${port}`);
        }
    }, [selectedService, host, port, isCustomName]);

    const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [timeoutSec, setTimeoutSec] = useState(5);

    useEffect(() => {
        const storedSettings = localStorage.getItem('spectra_settings');
        if (storedSettings) {
            try {
                const parsed = JSON.parse(storedSettings);
                if (parsed.timeout) setTimeoutSec(parsed.timeout);
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
    }, []);

    const saveSettings = () => {
        const settings = { timeout: timeoutSec };
        localStorage.setItem('spectra_settings', JSON.stringify(settings));
        showToast('Settings Saved', 'success');
        setShowSettings(false);
    };

    // Toast State
    const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
        message: '',
        type: 'info',
        isVisible: false
    });

    const showToast = (message: string, type: ToastType) => {
        setToast({ message, type, isVisible: true });
    };

    const hideToast = () => {
        setToast(prev => ({ ...prev, isVisible: false }));
    };

    useEffect(() => {
        const saved = localStorage.getItem('spectra_saved_connections');
        if (saved) {
            try {
                setSavedConnections(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved connections", e);
            }
        }
    }, []);

    const [editingId, setEditingId] = useState<string | null>(null);

    const handleCreateNew = () => {
        setEditingId(null);
        setConnectionName('New Connection');
        setEnvironment('Development');
        setHost('127.0.0.1');
        setPort('6379');
        setUsername('');
        setPassword('');
        setDbName('0');
        setSelectedService('Redis');
        setIsCustomName(false);
    };

    const saveConnection = () => {
        const newConnection: SavedConnection = {
            id: editingId || Date.now().toString(),
            name: connectionName,
            type: selectedService,
            host,
            port,
            username,
            password,
            database: dbName,
            environment
        };

        let newConnections;
        if (editingId) {
            newConnections = savedConnections.map(c => c.id === editingId ? newConnection : c);
            showToast('Connection Updated', 'success');
        } else {
            newConnections = [...savedConnections, newConnection];
            setEditingId(newConnection.id); // Switch to editing the newly created one
            showToast('Connection Created', 'success');
        }

        setSavedConnections(newConnections);
        localStorage.setItem('spectra_saved_connections', JSON.stringify(newConnections));
    };

    const loadConnection = (conn: SavedConnection) => {
        setEditingId(conn.id);
        setConnectionName(conn.name);
        setSelectedService(conn.type);
        setHost(conn.host);
        setPort(conn.port);
        setUsername(conn.username);
        setPassword(conn.password || '');
        setDbName(conn.database || '0');
        setEnvironment(conn.environment);
        setIsCustomName(true);
    };

    const handleServiceChange = (service: string) => {
        setSelectedService(service);
        switch (service) {
            case 'Redis':
                setHost('127.0.0.1');
                setPort('6379');
                setDbName('0');
                break;
            case 'MySQL':
                setHost('127.0.0.1');
                setPort('3306');
                setDbName('mysql');
                break;
            case 'PostgreSQL':
                setHost('127.0.0.1');
                setPort('5432');
                setDbName('postgres');
                break;
            case 'MongoDB':
                setHost('127.0.0.1');
                setPort('27017');
                setDbName('admin');
                break;
            case 'SQLite':
                setPort('0');
                setDbName('');
                setHost('data.db');
                break;
        }
    };

    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; conn: SavedConnection | null }>({
        visible: false, x: 0, y: 0, conn: null
    });

    useEffect(() => {
        const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, conn: SavedConnection) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            conn: conn
        });
    };

    const handleEditConnection = () => {
        const conn = contextMenu.conn;
        if (!conn) return;

        setConnectionName(conn.name);
        setEnvironment(conn.environment);
        setHost(conn.host);
        setPort(conn.port);
        setUsername(conn.username);
        if (conn.password) setPassword(conn.password);
        if (conn.database) setDbName(conn.database);

        // We set service which might reset defaults, so we need to be careful
        // The handleServiceChange function resets port/dbName. 
        // We should just set the state directly without calling handleServiceChange or call it then override.
        // But handleServiceChange is just a helper. Let's just set the state.
        setSelectedService(conn.type);
        // Note: handleServiceChange is NOT called here to avoid resetting port to default if user had custom.

        setIsCustomName(true);
        setShowSettings(false);
    };

    const handleDeleteConnection = () => {
        const conn = contextMenu.conn;
        if (!conn) return;

        const updated = savedConnections.filter(c => c.id !== conn.id);
        setSavedConnections(updated);
        localStorage.setItem('spectra_saved_connections', JSON.stringify(updated));
        showToast('Connection deleted', 'success');
    };

    const performConnect = async (service: string, hostStr: string, portStr: string, passStr: string, usernameStr: string, dbNameStr: string, isTestOnly: boolean = false) => {
        setIsConnecting(true);
        try {
            let res;
            const portNum = parseInt(portStr);
            const passwordArg = passStr || null;
            const usernameArg = usernameStr || '';
            const dbArg = dbNameStr || null;

            if (service === 'Redis') {
                res = await invoke('connect_redis', {
                    host: hostStr,
                    port: portNum,
                    password: passwordArg,
                    timeout_sec: timeoutSec
                });
            } else if (service === 'MySQL') {
                res = await invoke('connect_mysql', {
                    host: hostStr,
                    port: portNum,
                    username: usernameArg,
                    password: passwordArg,
                    database: dbArg,
                    timeout_sec: timeoutSec
                });
            } else if (service === 'PostgreSQL') {
                res = await invoke('connect_postgres', {
                    host: hostStr,
                    port: portNum,
                    username: usernameArg,
                    password: passwordArg,
                    database: dbArg,
                    timeout_sec: timeoutSec
                });
            } else if (service === 'MongoDB') {
                res = await invoke('connect_mongodb', {
                    host: hostStr,
                    port: portNum,
                    username: usernameArg || null, // Allow empty user for mongo
                    password: passwordArg,
                    timeout_sec: timeoutSec
                });
            } else if (service === 'SQLite') {
                res = await invoke('connect_sqlite', {
                    path: hostStr
                });
            }

            console.log(res);
            showToast(`${service} Connection Successful`, 'success');
            if (!isTestOnly && onConnect) {
                onConnect(service);
            }
        } catch (err: any) {
            console.error(`${service} Connection Failed:`, err);
            showToast(`Connection Failed: ${err}`, 'error');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnectClick = () => {
        performConnect(selectedService, host, port, password, username, dbName, true);
    };

    const handleSavedConnect = (e: React.MouseEvent, conn: SavedConnection) => {
        e.stopPropagation();
        // Just connect, do not load into form (user rule: edit only via context menu)
        performConnect(conn.type, conn.host, conn.port, conn.password || '', conn.username, conn.database || '', false);
    };

    const handleDoubleClick = (conn: SavedConnection) => {
        performConnect(conn.type, conn.host, conn.port, conn.password || '', conn.username, conn.database || '', false);
    };

    const filteredConnections = savedConnections.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.host.includes(searchQuery)
    );

    return (
        <div className="flex w-full h-full bg-transparent text-gray-300 font-sans overflow-hidden selection:bg-blue-500/30">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e]/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                {/* Sidebar Header */}
                <div
                    className="p-5 border-b border-white/5 cursor-move"
                    onPointerDown={onDragStart}
                >
                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Find connection..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#18181b] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                    </div>
                </div>

                {/* Explorer Section */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between px-6 py-4">
                        <span className="text-[11px] font-bold text-gray-500 tracking-widest uppercase">My Connections</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCreateNew}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white transition-all"
                                title="Add New Connection"
                            >
                                <Plus size={10} />
                            </button>
                            <span className="bg-white/5 text-gray-500 px-2 py-0.5 rounded-full text-[10px] font-mono border border-white/5">{savedConnections.length}</span>
                        </div>
                    </div>

                    {filteredConnections.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="flex flex-col items-center justify-center h-48 text-center px-8 mt-4 opacity-60"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                                <Box size={20} className="text-gray-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-500 mb-2">No connections found</span>
                            <button
                                onClick={handleCreateNew}
                                className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20 hover:border-blue-500/40"
                            >
                                <Plus size={12} /> Create New
                            </button>
                        </motion.div>
                    ) : (
                        <div className="px-3 space-y-1">
                            {filteredConnections.map(conn => (
                                <div
                                    key={conn.id}
                                    onClick={() => loadConnection(conn)}
                                    onDoubleClick={() => handleDoubleClick(conn)}
                                    onContextMenu={(e) => handleContextMenu(e, conn)}
                                    className={`w-full relative text-left p-3 rounded-xl transition-all border border-transparent hover:border-white/5 hover:bg-white/5 group cursor-pointer ${connectionName === conn.name ? 'bg-white/5 border-white/10' : ''}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-sm text-gray-200 group-hover:text-white truncate max-w-[120px]">{conn.name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-tighter shrink-0 ${conn.type === 'Redis' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                                            {conn.type}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <div className={`w-1.5 h-1.5 rounded-full ${conn.environment === 'Production' ? 'bg-red-500' : (conn.environment === 'Staging' ? 'bg-yellow-500' : 'bg-emerald-500')}`} />
                                        <span className="truncate">{conn.host}:{conn.port}</span>
                                    </div>

                                    {/* Direct Connect Button */}
                                    <button
                                        onClick={(e) => handleSavedConnect(e, conn)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-110 active:scale-95 shadow-lg shadow-green-500/20"
                                        title="Connect Now"
                                    >
                                        <Play size={14} fill="currentColor" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {/* Context Menu */}
                <AnimatePresence>
                    {contextMenu.visible && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                            className="fixed z-[100] w-48 bg-[#18181b] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1"
                        >
                            <button
                                onClick={handleEditConnection}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                            >
                                <Pencil size={14} /> Edit Connection
                            </button>
                            <div className="h-[1px] bg-white/5 my-1" />
                            <button
                                onClick={handleDeleteConnection}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
                            >
                                <Trash2 size={14} /> Delete
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Sidebar Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 bg-[#0c0c0e]/50">
                    <div className="flex items-center gap-2.5 px-2">
                        <div className="relative flex items-center justify-center w-2 h-2">
                            <div className="absolute w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                            <div className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
                        </div>
                        <span className="font-medium tracking-wide">v0.1.0 Stable</span>
                    </div>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-gray-300 transition-all active:scale-95"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#09090b]/60 relative overflow-hidden">
                {/* Background Gradients for visuals */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2 mix-blend-screen" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/2 mix-blend-screen" />

                {/* Header Content - Fixed */}
                <div
                    className="px-10 pt-10 pb-4 w-full max-w-5xl mx-auto z-10 cursor-move shrink-0"
                    onPointerDown={onDragStart}
                >
                    {/* Title Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="flex items-center gap-6"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_8px_32px_rgba(79,70,229,0.3)] ring-1 ring-white/20 relative group">
                            <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <Database size={32} className="text-white drop-shadow-md" />
                        </div>
                        <div className="pt-1">
                            <h1 className="text-3xl font-bold text-white mb-1.5 tracking-tight flex items-center gap-3">
                                {editingId ? (
                                    <>
                                        Edit Connection
                                        <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs px-2 py-0.5 rounded uppercase tracking-wider font-bold">Editing</span>
                                    </>
                                ) : 'New Connection'}
                            </h1>
                            <p className="text-gray-400 text-sm flex items-center gap-2">
                                {editingId ? 'Modify existing configuration' : 'Configure your database connection'}
                                <span className="w-1 h-1 rounded-full bg-gray-600" />
                                <span className="text-gray-500 text-xs">Secure Environment</span>
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* Scrollable Form Section */}
                <div className="flex-1 px-10 pb-10 overflow-y-auto w-full max-w-5xl mx-auto z-10 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">

                    {/* Form Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                        className="space-y-8 mt-2"
                    >

                        {/* Row 1: Name & Group */}
                        <div className="flex gap-4 px-8">
                            <div className="space-y-2.5 flex-[3]">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Connection Name</label>
                                <input
                                    type="text"
                                    value={connectionName}
                                    onChange={(e) => {
                                        setConnectionName(e.target.value);
                                        setIsCustomName(true);
                                    }}
                                    placeholder="e.g. Production DB"
                                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-5 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-medium placeholder:text-gray-700 shadow-sm"
                                />
                            </div>
                            <div className="space-y-2.5 flex-[1]">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Environment</label>
                                <div className="relative">
                                    <select
                                        value={environment}
                                        onChange={(e) => setEnvironment(e.target.value)}
                                        className="w-full bg-[#18181b] border border-white/10 rounded-xl px-5 py-3 text-white text-sm appearance-none focus:outline-none focus:border-blue-500/50 transition-all font-medium cursor-pointer shadow-sm"
                                    >
                                        <option>Development</option>
                                        <option>Production</option>
                                        <option>Staging</option>
                                    </select>
                                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={16} />
                                </div>
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="space-y-4 px-8">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Service Type</label>
                            <div className="grid grid-cols-3 gap-3">
                                {['PostgreSQL', 'MySQL', 'Redis', 'MongoDB', 'SQLite'].map((service) => (
                                    <ServiceTypeButton
                                        key={service}
                                        icon={service === 'Redis' ? Activity : (service === 'MongoDB' ? Globe : (service === 'SQLite' ? FileJson : Database))}
                                        label={service}
                                        active={selectedService === service}
                                        onClick={() => handleServiceChange(service)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Connection Details Box */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            className="border border-white/10 rounded-2xl bg-[#0c0c0e]/30 p-8 space-y-8 backdrop-blur-md relative overflow-hidden shadow-2xl"
                        >
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
                            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />

                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded text-xs">{">_"}</span>
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Connection Details</h3>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-[3]">
                                    <InputField
                                        label={selectedService === 'SQLite' ? "Database Path" : "Host / IP Address"}
                                        value={host}
                                        onChange={(e: any) => setHost(e.target.value)}
                                        placeholder={selectedService === 'SQLite' ? "e.g. /path/to/db.sqlite" : "e.g. 127.0.0.1"}
                                    />
                                </div>
                                {selectedService !== 'SQLite' && (
                                    <div className="flex flex-col gap-2.5 flex-[1]">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Port</label>
                                        <div className="flex items-center h-[46px] bg-[#121214] border border-white/5 rounded-xl transition-colors hover:border-white/10 shadow-inner">
                                            <button
                                                onClick={() => setPort((prev) => String(Math.max(1, parseInt(prev || '0') - 1)))}
                                                className="px-3.5 py-3 hover:text-white text-gray-500 border-r border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50"
                                            >
                                                -
                                            </button>
                                            <input
                                                className="w-full bg-transparent text-center text-gray-200 outline-none font-mono text-sm py-3"
                                                value={port}
                                                onChange={(e: any) => setPort(e.target.value)}
                                            />
                                            <button
                                                onClick={() => setPort((prev) => String(parseInt(prev || '0') + 1))}
                                                className="px-3.5 py-3 hover:text-white text-gray-500 border-l border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <InputField label="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-2.5 flex-1">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Password</label>
                                    <div className="relative group">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full h-[46px] bg-[#121214] border border-white/5 rounded-xl px-5 text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm placeholder:text-gray-700 shadow-inner flex items-center"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {selectedService === 'Redis' && (
                                <InputField label="Database Index" value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="0" />
                            )}
                            {(selectedService === 'PostgreSQL' || selectedService === 'MySQL') && (
                                <InputField label="Database Name" value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="public" />
                            )}
                            {selectedService === 'MongoDB' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <InputField label="Auth Database" value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="admin" />
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                </div>

                {/* Footer Actions */}
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 20 }}
                    className="px-10 py-6 border-t border-white/5 flex items-center justify-end gap-5 bg-[#09090b]/50 backdrop-blur-xl sticky bottom-0 z-20"
                >
                    <motion.button
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onClose}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl text-gray-400 hover:text-white bg-white/5 border border-white/5 transition-all font-medium text-sm"
                    >
                        <X size={18} />
                        <span>Cancel</span>
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleConnectClick}
                        disabled={isConnecting}
                        className="flex items-center gap-2.5 px-6 py-3 rounded-xl border border-white/10 hover:border-white/20 text-gray-300 hover:text-white transition-all font-semibold text-sm group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex relative items-center justify-center">
                            {isConnecting ? (
                                <RefreshCw size={16} className="animate-spin" />
                            ) : (
                                <Activity size={18} className="text-blue-500 group-hover:text-blue-400" />
                            )}
                        </div>
                        <span>{isConnecting ? 'Testing...' : 'Test Connection'}</span>
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(22, 163, 74, 1)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={saveConnection}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl text-white bg-green-600 border border-green-500/50 shadow-[0_4px_20px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_25px_rgba(22,163,74,0.4)] transition-all font-medium text-sm"
                    >
                        <Save size={18} />
                        <span>{editingId ? 'Update' : 'Save'}</span>
                    </motion.button>
                </motion.div>

                {/* Settings Modal */}
                <AnimatePresence>
                    {showSettings && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center p-8">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowSettings(false)}
                                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="w-full max-w-md bg-[#121214] border border-white/10 rounded-2xl shadow-2xl relative z-10 overflow-hidden"
                            >
                                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#18181b]">
                                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                        <Settings size={18} className="text-gray-500" />
                                        Settings
                                    </h3>
                                    <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">Connection Settings</h4>

                                        <div className="space-y-2.5">
                                            <div className="flex justify-between text-sm text-gray-300">
                                                <span>Connection Timeout</span>
                                                <span className="font-mono text-blue-400">{timeoutSec}s</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="60"
                                                value={timeoutSec}
                                                onChange={(e) => setTimeoutSec(parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                                            />
                                            <p className="text-[10px] text-gray-500">
                                                Timeout duration for database connection attempts (1-60 seconds).
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 border-t border-white/5 bg-[#18181b]/50 flex justify-end gap-3 glass">
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveSettings}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toast Notification */}
                <Toast
                    message={toast.message}
                    type={toast.type}
                    isVisible={toast.isVisible}
                    onClose={hideToast}
                />
            </div >
        </div >
    );
}
