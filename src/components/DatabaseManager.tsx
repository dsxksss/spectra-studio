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
    Save,
    Play,
    RefreshCw,
    Pencil,
    Trash2,
    Palette,
    Check,
    Shield,
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { Toast, ToastType } from './Toast';
import { Tooltip } from './Tooltip';
import {
    RedisIcon,
    PostgresIcon,
    MySQLIcon,
    MongoIcon,
    SQLiteIcon
} from "./icons";

// Helper function to get icon component by database type
const getDatabaseIcon = (type: string) => {
    switch (type) {
        case 'Redis': return RedisIcon;
        case 'PostgreSQL': return PostgresIcon;
        case 'MySQL': return MySQLIcon;
        case 'MongoDB': return MongoIcon;
        case 'SQLite': return SQLiteIcon;
        default: return Database;
    }
};

// Helper function to get icon color by database type
const getDatabaseIconColor = (type: string) => {
    switch (type) {
        case 'Redis': return 'text-red-400';
        case 'PostgreSQL': return 'text-blue-400';
        case 'MySQL': return 'text-orange-400';
        case 'MongoDB': return 'text-green-400';
        case 'SQLite': return 'text-cyan-400';
        default: return 'text-blue-400';
    }
};

type SavedConnection = {
    id: string;
    name: string;
    type: string;
    host: string;
    port: string;
    username: string;
    password?: string;
    database?: string;
    ssh?: {
        enabled: boolean;
        host: string;
        port: string;
        username: string;
        password?: string;
        privateKeyPath?: string;
    };
};

const ConnectionHoverCard = ({ connection, rect }: { connection: SavedConnection, rect: DOMRect }) => {
    if (!rect) return null;

    const top = rect.top;
    const left = rect.right + 12; // 12px gap
    const Icon = getDatabaseIcon(connection.type);
    const iconColor = getDatabaseIconColor(connection.type);

    return (
        <div
            style={{
                position: 'fixed',
                top: top,
                left: left,
                zIndex: 50
            }}
            className="pointer-events-none"
        >
            <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-64 bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4 overflow-hidden relative"
            >
                {/* Glass Reflection */}
                <div className="absolute inset-0 bg-white/5 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10 relative z-10">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-black/20 ${iconColor} shadow-inner`}>
                        <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-100 truncate text-sm">{connection.name}</h4>
                        <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${['Redis', 'MySQL', 'PostgreSQL', 'MongoDB', 'SQLite'].includes(connection.type) ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                            {connection.type}
                        </span>
                    </div>
                </div>

                {/* Details */}
                <div className="space-y-2.5 text-xs relative z-10">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">Host</span>
                        <span className="text-gray-300 font-mono truncate max-w-[120px] bg-white/5 px-1.5 py-0.5 rounded">{connection.host}</span>
                    </div>
                    {connection.port && connection.port !== '0' && (
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500 font-medium">Port</span>
                            <span className="text-gray-300 font-mono bg-white/5 px-1.5 py-0.5 rounded">{connection.port}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">User</span>
                        <span className="text-gray-300 font-mono truncate max-w-[120px]">{connection.username || <span className="text-gray-600 italic">None</span>}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">Database</span>
                        <span className="text-gray-300 font-mono truncate max-w-[120px]">{connection.database || <span className="text-gray-600 italic">Default</span>}</span>
                    </div>
                </div>

                {/* SSH Badge if enabled */}
                {connection.ssh?.enabled && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-2 text-[10px] text-blue-400 relative z-10">
                        <Shield size={12} />
                        <span className="font-mono uppercase tracking-wider">SSH Tunnel Active</span>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

const ServiceSelect = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const services = [
        { id: 'SQLite', icon: SQLiteIcon, color: 'text-blue-300' },
        { id: 'PostgreSQL', icon: PostgresIcon, color: 'text-blue-400' },
        { id: 'MySQL', icon: MySQLIcon, color: 'text-blue-500' },
        { id: 'MongoDB', icon: MongoIcon, color: 'text-green-500' },
        { id: 'Redis', icon: RedisIcon, color: 'text-red-400' }
    ];

    const selected = services.find(s => s.id === value) || services[0];
    const Icon = selected.icon;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-[46px] bg-[#18181b] border border-white/10 rounded-xl px-4 flex items-center justify-between text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all shadow-sm hover:bg-white/5 active:scale-[0.99]"
            >
                <div className="flex items-center gap-3">
                    <Icon size={18} className={selected.color} />
                    <span className="font-medium">{selected.id}</span>
                </div>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden py-1"
                        >
                            {services.map((service) => (
                                <button
                                    key={service.id}
                                    onClick={() => {
                                        onChange(service.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${value === service.id ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <service.icon size={16} className={value === service.id ? service.color : 'text-gray-500'} />
                                    <span>{service.id}</span>
                                    {value === service.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

const LanguageSelect = ({ value, onChange }: { value: string, onChange: (val: any) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const languages = [
        { id: 'en', name: 'English', icon: '🇺🇸' },
        { id: 'zh', name: '中文', icon: '🇨🇳' }
    ];
    const selected = languages.find(l => l.id === value) || languages[0];

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-[46px] bg-[#121214] border border-white/5 rounded-xl px-4 flex items-center justify-between text-gray-300 text-sm focus:outline-none focus:border-blue-500/50 transition-all shadow-sm hover:bg-white/5 active:scale-[0.99]"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg leading-none">{selected.icon}</span>
                    <span className="font-medium">{selected.name}</span>
                </div>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden py-1"
                        >
                            {languages.map(lang => (
                                <button
                                    key={lang.id}
                                    onClick={() => {
                                        onChange(lang.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${value === lang.id ? 'bg-blue-500/10 text-blue-400' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                >
                                    <span className="text-lg leading-none">{lang.icon}</span>
                                    <span className="font-medium">{lang.name}</span>
                                    {value === lang.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

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

import { useTranslation } from '../i18n/I18nContext';
import { useTheme, PRESET_THEME_COLORS, ThemeMode } from '../contexts/ThemeContext';

export default function DatabaseManager({ onConnect, activeService, onDragStart }: { onClose?: () => void, onConnect?: (service: string, name: string, config?: any) => void, activeService?: string | null, onDragStart?: (e: React.PointerEvent) => void }) {
    const { t, language, setLanguage } = useTranslation();
    const {
        themeSettings,
        currentThemeColor,
        setThemeMode,
        setAutoFollowDatabase,
        setPresetColor,
        setCustomColor
    } = useTheme();
    const [selectedService, setSelectedService] = useState(activeService || 'PostgreSQL');
    const [showPassword, setShowPassword] = useState(false);

    // Form State
    const [connectionName, setConnectionName] = useState('New Connection');
    const [isCustomName, setIsCustomName] = useState(false);
    const [host, setHost] = useState('localhost');
    const [port, setPort] = useState('5432');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [dbName, setDbName] = useState('postgres');

    // SSH State
    const [useSSH, setUseSSH] = useState(false);
    const [sshHost, setSshHost] = useState('');
    const [sshPort, setSshPort] = useState('22');
    const [sshUsername, setSshUsername] = useState('');
    const [sshPassword, setSshPassword] = useState('');
    // const [sshKeyPath, setSshKeyPath] = useState(''); // Future

    const [appVersion, setAppVersion] = useState("v0.1.0");

    useEffect(() => {
        getVersion().then(v => {
            setAppVersion(`v${v}`);
        }).catch(err => {
            console.error('Failed to get version', err);
        });
    }, []);

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
                showToast("Failed to load settings", 'error');
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
                showToast("Failed to load saved connections", 'error');
            }
        }
    }, []);

    const [editingId, setEditingId] = useState<string | null>(null);

    const handleCreateNew = () => {
        setEditingId(null);
        setConnectionName('New Connection');
        setHost('localhost');
        setPort('5432');
        setUsername('');
        setPassword('');
        setDbName('postgres');
        setSelectedService('PostgreSQL');
        setIsCustomName(false);
        setUseSSH(false);
        setSshHost('');
        setSshPort('22');
        setSshUsername('');
        setSshPassword('');
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
            ssh: useSSH ? {
                enabled: true,
                host: sshHost,
                port: sshPort,
                username: sshUsername,
                password: sshPassword
            } : undefined
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
        setIsCustomName(true);
        if (conn.ssh && conn.ssh.enabled) {
            setUseSSH(true);
            setSshHost(conn.ssh.host);
            setSshPort(conn.ssh.port);
            setSshUsername(conn.ssh.username);
            setSshPassword(conn.ssh.password || '');
        } else {
            setUseSSH(false);
            setSshHost('');
            setSshPort('22');
            setSshUsername('');
            setSshPassword('');
        }
    };

    const handleServiceChange = (service: string) => {
        setSelectedService(service);
        setUsername('');
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

    const [hoveredConn, setHoveredConn] = useState<{ data: SavedConnection, rect: DOMRect } | null>(null);

    const handleEditConnection = () => {
        const conn = contextMenu.conn;
        if (!conn) return;

        setConnectionName(conn.name);
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

        if (conn.ssh && conn.ssh.enabled) {
            setUseSSH(true);
            setSshHost(conn.ssh.host);
            setSshPort(conn.ssh.port);
            setSshUsername(conn.ssh.username);
            setSshPassword(conn.ssh.password || '');
        } else {
            setUseSSH(false);
            setSshHost('');
            setSshPort('22');
            setSshUsername('');
            setSshPassword('');
        }
    };

    const handleDeleteConnection = () => {
        const conn = contextMenu.conn;
        if (!conn) return;

        const updated = savedConnections.filter(c => c.id !== conn.id);
        setSavedConnections(updated);
        localStorage.setItem('spectra_saved_connections', JSON.stringify(updated));
        showToast('Connection deleted', 'success');
    };

    const performConnect = async (service: string, hostStr: string, portStr: string, passStr: string, usernameStr: string, dbNameStr: string, isTestOnly: boolean = false, nameOverride?: string, sshConfigOverride?: any) => {
        setIsConnecting(true);
        try {
            let res;
            const portNum = parseInt(portStr);
            const passwordArg = passStr || "";
            const usernameArg = usernameStr || '';
            const dbArg = dbNameStr || null;

            let sshConfig = null;
            if (sshConfigOverride !== undefined) {
                // If override is provided (even if null), use it, but ensure port is a number if it exists
                if (sshConfigOverride) {
                    sshConfig = {
                        ...sshConfigOverride,
                        port: typeof sshConfigOverride.port === 'string' ? parseInt(sshConfigOverride.port) : sshConfigOverride.port
                    };
                }
            } else if (useSSH) {
                // Fallback to form state
                sshConfig = {
                    host: sshHost,
                    port: parseInt(sshPort),
                    username: sshUsername,
                    password: sshPassword || null,
                };
            }

            switch (service) {
                case 'Redis':
                    res = await invoke('connect_redis', {
                        host: hostStr,
                        port: portNum,
                        password: passwordArg,
                        timeout_sec: timeoutSec,
                        sshConfig
                    });
                    break;
                case 'MySQL':
                    res = await invoke('connect_mysql', {
                        host: hostStr,
                        port: portNum,
                        username: usernameArg,
                        password: passwordArg,
                        database: dbArg,
                        timeout_sec: timeoutSec,
                        sshConfig
                    });
                    break;
                case 'PostgreSQL':
                    res = await invoke('connect_postgres', {
                        host: hostStr,
                        port: portNum,
                        username: usernameArg,
                        password: passwordArg,
                        database: dbArg,
                        timeout_sec: timeoutSec,
                        sshConfig
                    });
                    break;
                case 'MongoDB':
                    res = await invoke('connect_mongodb', {
                        host: hostStr,
                        port: portNum,
                        username: usernameArg || null, // Allow empty user for mongo
                        password: passwordArg,
                        timeout_sec: timeoutSec,
                        sshConfig
                    });
                    break;
                case 'SQLite':
                    res = await invoke('connect_sqlite', {
                        path: hostStr
                    });
                    break;
                default:
                    throw new Error(`Unsupported service: ${service}`);
            }

            console.log(res);
            showToast(`${service} Connection Successful`, 'success');
            if (!isTestOnly && onConnect) {
                const config = {
                    host: hostStr,
                    port: portStr,
                    username: usernameArg,
                    password: passwordArg,
                    database: dbArg,
                    type: service,
                    ssh: sshConfig
                };
                onConnect(service, nameOverride || connectionName || t('unsaved_connection'), config);
            }
        } catch (err: any) {
            console.error(`${service} Connection Failed:`, err);
            showToast(`Connection Failed: ${err}`, 'error');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnectClick = () => {
        performConnect(selectedService, host, port, password, username, dbName, true, undefined, undefined);
    };

    const handleSavedConnect = (e: React.MouseEvent, conn: SavedConnection) => {
        e.stopPropagation();
        // Just connect, do not load into form (user rule: edit only via context menu)
        performConnect(conn.type, conn.host, conn.port, conn.password || '', conn.username, conn.database || '', false, conn.name, conn.ssh);
    };

    const handleDoubleClick = (conn: SavedConnection) => {
        performConnect(conn.type, conn.host, conn.port, conn.password || '', conn.username, conn.database || '', false, conn.name, conn.ssh);
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
                            placeholder={t('search')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#18181b] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                    </div>
                </div>

                {/* Explorer Section */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between px-6 py-4">
                        <span className="text-[11px] font-bold text-gray-500 tracking-widest uppercase">{t('connection_name')}</span>
                        <div className="flex items-center gap-2">
                            <Tooltip content={t('new_connection')} position="bottom">
                                <button
                                    onClick={handleCreateNew}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                >
                                    <Plus size={14} />
                                </button>
                            </Tooltip>
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
                            <span className="text-sm font-medium text-gray-500 mb-2">{t('no_data')}</span>
                            <button
                                onClick={handleCreateNew}
                                className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20 hover:border-blue-500/40"
                            >
                                <Plus size={12} /> {t('new_connection')}
                            </button>
                        </motion.div>
                    ) : (
                        searchQuery ? (
                            <div className="px-3 space-y-1">
                                {filteredConnections.map(conn => (
                                    <div
                                        key={conn.id}
                                        onClick={() => loadConnection(conn)}
                                        onDoubleClick={() => handleDoubleClick(conn)}
                                        onContextMenu={(e) => handleContextMenu(e, conn)}
                                        onMouseEnter={(e) => setHoveredConn({ data: conn, rect: e.currentTarget.getBoundingClientRect() })}
                                        onMouseLeave={() => setHoveredConn(null)}
                                        className={`w-full relative text-left p-3 rounded-xl transition-all border border-transparent hover:border-white/5 hover:bg-white/5 group cursor-pointer ${editingId === conn.id ? 'bg-white/5 border-white/10' : ''}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-sm text-gray-200 group-hover:text-white truncate max-w-[120px]">{conn.name}</span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-tighter shrink-0 flex items-center gap-1 ${conn.type === 'Redis' ? 'bg-red-500/10 border-red-500/20 ' + getDatabaseIconColor(conn.type) :
                                                conn.type === 'MySQL' ? 'bg-orange-500/10 border-orange-500/20 ' + getDatabaseIconColor(conn.type) :
                                                    conn.type === 'MongoDB' ? 'bg-green-500/10 border-green-500/20 ' + getDatabaseIconColor(conn.type) :
                                                        conn.type === 'SQLite' ? 'bg-cyan-500/10 border-cyan-500/20 ' + getDatabaseIconColor(conn.type) :
                                                            'bg-blue-500/10 border-blue-500/20 ' + getDatabaseIconColor(conn.type)
                                                }`}>
                                                {(() => {
                                                    const IconComponent = getDatabaseIcon(conn.type);
                                                    return <IconComponent size={10} className={getDatabaseIconColor(conn.type)} />;
                                                })()}
                                                {conn.type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="truncate">{conn.host}:{conn.port}</span>
                                        </div>

                                        {/* Direct Connect Button */}
                                        {/* Direct Connect Button */}
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-110 active:scale-95">
                                            <Tooltip content={t('connect')} position="left">
                                                <button
                                                    onClick={(e) => handleSavedConnect(e, conn)}
                                                    className="p-2 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 shadow-lg shadow-green-500/20"
                                                >
                                                    <Play size={14} fill="currentColor" />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Reorder.Group axis="y" values={savedConnections} onReorder={(newOrder) => {
                                setSavedConnections(newOrder);
                                localStorage.setItem('spectra_saved_connections', JSON.stringify(newOrder));
                            }} className="px-3 space-y-1">
                                {savedConnections.map(conn => (
                                    <Reorder.Item key={conn.id} value={conn}>
                                        <div
                                            onClick={() => loadConnection(conn)}
                                            onDoubleClick={() => handleDoubleClick(conn)}
                                            onContextMenu={(e) => handleContextMenu(e, conn)}
                                            onMouseEnter={(e) => setHoveredConn({ data: conn, rect: e.currentTarget.getBoundingClientRect() })}
                                            onMouseLeave={() => setHoveredConn(null)}
                                            className={`w-full relative text-left p-3 rounded-xl transition-all border border-transparent hover:border-white/5 hover:bg-white/5 group cursor-pointer ${editingId === conn.id ? 'bg-white/5 border-white/10' : ''}`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-sm text-gray-200 group-hover:text-white truncate max-w-[120px]">{conn.name}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-tighter shrink-0 flex items-center gap-1 ${conn.type === 'Redis' ? 'bg-red-500/10 border-red-500/20 ' + getDatabaseIconColor(conn.type) :
                                                    conn.type === 'MySQL' ? 'bg-orange-500/10 border-orange-500/20 ' + getDatabaseIconColor(conn.type) :
                                                        conn.type === 'MongoDB' ? 'bg-green-500/10 border-green-500/20 ' + getDatabaseIconColor(conn.type) :
                                                            conn.type === 'SQLite' ? 'bg-cyan-500/10 border-cyan-500/20 ' + getDatabaseIconColor(conn.type) :
                                                                'bg-blue-500/10 border-blue-500/20 ' + getDatabaseIconColor(conn.type)
                                                    }`}>
                                                    {(() => {
                                                        const IconComponent = getDatabaseIcon(conn.type);
                                                        return <IconComponent size={10} className={getDatabaseIconColor(conn.type)} />;
                                                    })()}
                                                    {conn.type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span className="truncate">{conn.host}:{conn.port}</span>
                                            </div>

                                            {/* Direct Connect Button */}
                                            {/* Direct Connect Button */}
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-110 active:scale-95">
                                                <Tooltip content={t('connect')} position="left">
                                                    <button
                                                        onClick={(e) => handleSavedConnect(e, conn)}
                                                        className="p-2 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 shadow-lg shadow-green-500/20"
                                                    >
                                                        <Play size={14} fill="currentColor" />
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                        )
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
                                <Pencil size={14} /> {t('edit_connection')}
                            </button>
                            <div className="h-[1px] bg-white/5 my-1" />
                            <button
                                onClick={handleDeleteConnection}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
                            >
                                <Trash2 size={14} /> {t('delete')}
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
                        <span className="font-medium tracking-wide">{appVersion} Stable</span>
                    </div>
                    <Tooltip content={t('settings')} position="right">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-gray-300 transition-all active:scale-95"
                        >
                            <Settings size={18} />
                        </button>
                    </Tooltip>
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
                        <div className="w-16 h-16 flex items-center justify-center">
                            {(() => {
                                const IconComponent = getDatabaseIcon(selectedService);
                                return <IconComponent size={48} className={getDatabaseIconColor(selectedService)} />;
                            })()}
                        </div>
                        <div className="pt-1">
                            <h1 className="text-3xl font-bold text-white mb-1.5 tracking-tight flex items-center gap-3">
                                {editingId ? (
                                    <>
                                        {t('edit_connection')}
                                        <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs px-2 py-0.5 rounded uppercase tracking-wider font-bold">{t('edit')}</span>
                                    </>
                                ) : t('new_connection')}
                            </h1>
                            <p className="text-gray-400 text-sm flex items-center gap-2">
                                {editingId ? 'Modify existing configuration' : t('configure_connection')}
                                <span className="w-1 h-1 rounded-full bg-gray-600" />
                                <span className="text-gray-500 text-xs">{t('secure_env')}</span>
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

                        {/* Row 1: Name & Database Type Dropdown */}
                        <div className="flex gap-4 px-8">
                            <div className="space-y-2.5 flex-[3]">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{t('connection_name')}</label>
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
                            <div className="space-y-2.5 flex-[2]">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{t('db_type')}</label>
                                <ServiceSelect value={selectedService} onChange={handleServiceChange} />
                            </div>
                        </div>

                        {/* SSH Tunnel Section */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.3 }}
                            className={`border transition-all duration-300 rounded-2xl p-8 space-y-6 relative overflow-hidden ${useSSH ? 'bg-[#0c0c0e]/30 border-blue-500/30' : 'bg-[#0c0c0e]/10 border-white/5 opacity-80 hover:opacity-100'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <Shield size={16} className={useSSH ? "text-blue-400" : "text-gray-500"} />
                                    <h3 className={`text-sm font-bold uppercase tracking-widest ${useSSH ? "text-gray-200" : "text-gray-500"}`}>{t('ssh_tunnel')}</h3>
                                </div>
                                <Tooltip content={t('toggle_ssh')} position="top">
                                    <button
                                        onClick={() => setUseSSH(!useSSH)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${useSSH ? 'bg-blue-600' : 'bg-white/10'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${useSSH ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </Tooltip>
                            </div>

                            <AnimatePresence>
                                {useSSH && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="space-y-6 overflow-hidden"
                                    >
                                        <div className="flex gap-4">
                                            <div className="flex-[3]">
                                                <InputField
                                                    label={t('ssh_host')}
                                                    value={sshHost}
                                                    onChange={(e: any) => setSshHost(e.target.value)}
                                                    placeholder="e.g. 192.168.1.1"
                                                />
                                            </div>
                                            <div className="flex-[1]">
                                                <InputField
                                                    label={t('ssh_port')}
                                                    value={sshPort}
                                                    onChange={(e: any) => setSshPort(e.target.value)}
                                                    placeholder="22"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <InputField
                                                    label={t('ssh_username')}
                                                    value={sshUsername}
                                                    onChange={(e: any) => setSshUsername(e.target.value)}
                                                    placeholder="root"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <InputField
                                                    label={t('ssh_password')}
                                                    type="password"
                                                    value={sshPassword}
                                                    onChange={(e: any) => setSshPassword(e.target.value)}
                                                    placeholder="••••••"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

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
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{t('connection_details')}</h3>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-[3]">
                                    <InputField
                                        label={selectedService === 'SQLite' ? t('db_file') : t('host')}
                                        value={host}
                                        onChange={(e: any) => setHost(e.target.value)}
                                        placeholder={selectedService === 'SQLite' ? "e.g. /path/to/db.sqlite" : "e.g. 127.0.0.1"}
                                    />
                                </div>
                                {selectedService !== 'SQLite' && (
                                    <div className="flex flex-col gap-2.5 flex-[1]">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{t('port')}</label>
                                        <div className="flex items-center h-[46px] bg-[#121214] border border-white/5 rounded-xl transition-colors hover:border-white/10 shadow-inner">
                                            <Tooltip content={t('decrease_port')} position="top">
                                                <button
                                                    onClick={() => setPort((prev) => String(Math.max(1, parseInt(prev || '0') - 1)))}
                                                    className="px-3.5 py-3 hover:text-white text-gray-500 border-r border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50"
                                                >
                                                    -
                                                </button>
                                            </Tooltip>
                                            <input
                                                className="w-full bg-transparent text-center text-gray-200 outline-none font-mono text-sm py-3"
                                                value={port}
                                                onChange={(e: any) => setPort(e.target.value)}
                                            />
                                            <Tooltip content={t('increase_port')} position="top">
                                                <button
                                                    onClick={() => setPort((prev) => String(parseInt(prev || '0') + 1))}
                                                    className="px-3.5 py-3 hover:text-white text-gray-500 border-l border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50"
                                                >
                                                    +
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <InputField label={t('username')} value={username} onChange={(e: any) => setUsername(e.target.value)} placeholder={t('enter_username')} />
                                </div>
                                <div className="flex flex-col gap-2.5 flex-1">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{t('password')}</label>
                                    <div className="relative group">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('enter_password')}
                                            className="w-full h-[46px] bg-[#121214] border border-white/5 rounded-xl px-5 text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm placeholder:text-gray-700 shadow-inner flex items-center"
                                        />
                                        <Tooltip content={showPassword ? t('hide_password') : t('show_password')} position="left" triggerClassName="absolute right-4 top-1/2 -translate-y-1/2">
                                            <button
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="text-gray-500 hover:text-gray-300 transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>

                            {selectedService === 'Redis' && (
                                <InputField label="Database Index" value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="0" />
                            )}
                            {(selectedService === 'PostgreSQL' || selectedService === 'MySQL') && (
                                <InputField label={t('database')} value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="public" />
                            )}
                            {selectedService === 'MongoDB' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <InputField label="Auth Database" value={dbName} onChange={(e: any) => setDbName(e.target.value)} placeholder="admin" />
                                </div>
                            )}
                        </motion.div>

                        {/* SSH Tunnel Section */}

                    </motion.div >
                </div >

                {/* Footer Actions */}
                < motion.div
                    initial={{ y: 100 }
                    }
                    animate={{ y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 20 }}
                    className="px-10 py-6 border-t border-white/5 flex items-center justify-end gap-5 bg-[#09090b]/50 backdrop-blur-xl sticky bottom-0 z-20"
                >

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
                        <span>{isConnecting ? t('loading') : t('test_connection')}</span>
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(22, 163, 74, 1)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={saveConnection}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl text-white bg-green-600 border border-green-500/50 shadow-[0_4px_20px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_25px_rgba(22,163,74,0.4)] transition-all font-medium text-sm"
                    >
                        <Save size={18} />
                        <span>{editingId ? t('save') : t('save')}</span>
                    </motion.button>
                </motion.div >

                {/* Settings Modal */}
                <AnimatePresence>
                    {
                        showSettings && (
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
                                    className="w-full max-w-xl bg-[#121214] border border-white/10 rounded-2xl shadow-2xl relative z-10 overflow-hidden max-h-[80vh] flex flex-col"
                                >
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#18181b]">
                                        <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                            <Settings size={18} className="text-gray-500" />
                                            {t('settings')}
                                        </h3>
                                        <Tooltip content={t('close')} position="left">
                                            <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors">
                                                <X size={18} />
                                            </button>
                                        </Tooltip>
                                    </div>

                                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                                        {/* Language Section */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">{t('language')}</h4>
                                            <div className="w-full">
                                                <LanguageSelect value={language} onChange={setLanguage} />
                                            </div>
                                        </div>

                                        {/* Theme Settings Section */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                                                <Palette size={14} />
                                                {t('theme_settings')}
                                            </h4>

                                            {/* Theme Preview */}
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="w-16 h-16 rounded-xl shadow-lg border border-white/10 relative overflow-hidden"
                                                    style={{ backgroundColor: currentThemeColor }}
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm text-gray-300 font-medium">{t('theme_preview')}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{currentThemeColor}</p>
                                                </div>
                                            </div>

                                            {/* Theme Mode Selector */}
                                            <div className="space-y-2">
                                                <label className="text-sm text-gray-400">{t('theme_mode')}</label>
                                                <div className="flex gap-2">
                                                    {(['auto', 'preset', 'custom'] as ThemeMode[]).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            onClick={() => setThemeMode(mode)}
                                                            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${themeSettings.mode === mode
                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white'
                                                                }`}
                                                        >
                                                            {t(`theme_mode_${mode}`)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Auto Mode Options */}
                                            {themeSettings.mode === 'auto' && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-3 bg-white/5 rounded-xl p-4 border border-white/5"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm text-gray-300">{t('auto_follow_database')}</p>
                                                            <p className="text-xs text-gray-500 mt-1">{t('auto_follow_database_desc')}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setAutoFollowDatabase(!themeSettings.autoFollowDatabase)}
                                                            className={`relative w-12 h-7 rounded-full transition-colors ${themeSettings.autoFollowDatabase
                                                                ? 'bg-blue-500'
                                                                : 'bg-white/10'
                                                                }`}
                                                        >
                                                            <div
                                                                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${themeSettings.autoFollowDatabase ? 'left-6' : 'left-1'
                                                                    }`}
                                                            />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Preset Colors */}
                                            {themeSettings.mode === 'preset' && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-3"
                                                >
                                                    <label className="text-sm text-gray-400">{t('select_preset_color')}</label>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        {PRESET_THEME_COLORS.map((preset) => (
                                                            <button
                                                                key={preset.id}
                                                                onClick={() => setPresetColor(preset.id)}
                                                                className={`relative group p-3 rounded-xl border transition-all ${themeSettings.presetColorId === preset.id
                                                                    ? 'border-blue-500/50 bg-blue-500/10'
                                                                    : 'border-white/5 hover:border-white/20 bg-white/5'
                                                                    }`}
                                                            >
                                                                <div
                                                                    className="w-full aspect-square rounded-lg shadow-lg mb-2"
                                                                    style={{ backgroundColor: preset.color }}
                                                                />
                                                                <p className="text-[10px] text-gray-400 truncate text-center">{preset.name}</p>
                                                                {themeSettings.presetColorId === preset.id && (
                                                                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                                                                        <Check size={10} className="text-white" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Custom Color */}
                                            {themeSettings.mode === 'custom' && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-3"
                                                >
                                                    <label className="text-sm text-gray-400">{t('custom_color')}</label>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input
                                                                type="color"
                                                                value={themeSettings.customColor}
                                                                onChange={(e) => setCustomColor(e.target.value)}
                                                                className="w-14 h-14 rounded-xl cursor-pointer border-2 border-white/10 bg-transparent"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <input
                                                                type="text"
                                                                value={themeSettings.customColor}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                                                        setCustomColor(val);
                                                                    }
                                                                }}
                                                                placeholder={t('enter_hex_color')}
                                                                className="w-full h-11 bg-[#18181b] border border-white/10 rounded-xl px-4 text-gray-200 font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                                                            />
                                                            <p className="text-[10px] text-gray-500 mt-1.5">{t('enter_hex_color')}</p>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* Connection Settings */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">{t('settings')}</h4>

                                            <div className="space-y-2.5">
                                                <div className="flex justify-between text-sm text-gray-300">
                                                    <span>{language === 'zh' ? '连接超时' : 'Connection Timeout'}</span>
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
                                                    {t('timeout_desc')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 border-t border-white/5 bg-[#18181b]/50 flex justify-end gap-3 glass">
                                        <button
                                            onClick={() => setShowSettings(false)}
                                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {t('cancel')}
                                        </button>
                                        <button
                                            onClick={saveSettings}
                                            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                                        >
                                            {t('save')}
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )
                    }
                </AnimatePresence >

                <Toast
                    message={toast.message}
                    type={toast.type}
                    isVisible={toast.isVisible}
                    onClose={hideToast}
                />

                <AnimatePresence>
                    {hoveredConn && (
                        <ConnectionHoverCard connection={hoveredConn.data} rect={hoveredConn.rect} />
                    )}
                </AnimatePresence>
            </div >
        </div >
    );
}
