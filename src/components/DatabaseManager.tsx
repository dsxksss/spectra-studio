import { useState } from 'react';
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
    Globe
} from 'lucide-react';
import { motion } from 'framer-motion';

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

const InputField = ({ label, placeholder, type = "text", value, defaultValue, className = "" }: any) => (
    <div className={`flex flex-col gap-2.5 ${className}`}>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">{label}</label>
        <div className="relative group">
            <input
                type={type}
                defaultValue={defaultValue}
                value={value}
                placeholder={placeholder}
                className="w-full bg-[#121214] border border-white/5 rounded-xl px-5 py-3 text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm placeholder:text-gray-700 shadow-inner"
            />
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5 pointer-events-none" />
        </div>
    </div>
);

export default function DatabaseManager({ onClose, onConnect, activeService, onDragStart }: { onClose?: () => void, onConnect?: (service: string) => void, activeService?: string | null, onDragStart?: (e: React.PointerEvent) => void }) {
    const [selectedService, setSelectedService] = useState(activeService || 'PostgreSQL');
    const [showPassword, setShowPassword] = useState(false);

    const handleConnectClick = () => {
        if (onConnect) {
            onConnect(selectedService);
        }
    };

    return (
        <div className="flex w-full h-full bg-[#09090b] text-gray-300 font-sans overflow-hidden border border-white/10 selection:bg-blue-500/30 rounded-[28px] shadow-2xl">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e]/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
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
                            className="w-full bg-[#18181b] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500/30 focus:bg-[#1c1c1f] transition-all placeholder:text-gray-600 shadow-sm"
                        />
                    </div>
                </div>

                {/* Explorer Section */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between px-6 py-4">
                        <span className="text-[11px] font-bold text-gray-500 tracking-widest uppercase">My Connections</span>
                        <span className="bg-white/5 text-gray-500 px-2 py-0.5 rounded-full text-[10px] font-mono border border-white/5">0</span>
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-col items-center justify-center h-48 text-center px-8 mt-4 opacity-60"
                    >
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                            <Box size={20} className="text-gray-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-500 mb-2">No connections yet</span>
                        <button className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20 hover:border-blue-500/40">
                            <Plus size={12} /> Create New
                        </button>
                    </motion.div>
                </div>

                {/* Sidebar Footer */}
                <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 bg-[#0c0c0e]">
                    <div className="flex items-center gap-2.5 px-2">
                        <div className="relative">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
                        </div>
                        <span className="font-medium tracking-wide">v2.4.0 Stable</span>
                    </div>
                    <button className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-gray-300 transition-all active:scale-95">
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#09090b] relative overflow-hidden">
                {/* Background Gradients for visuals */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2 mix-blend-screen" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/2 mix-blend-screen" />

                {/* Header Content */}
                <div
                    className="flex-1 p-10 overflow-y-auto w-full max-w-5xl mx-auto z-10 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent cursor-move"
                    onPointerDown={onDragStart}
                >

                    {/* Title Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="flex items-center gap-8 mb-12"
                    >
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_8px_32px_rgba(79,70,229,0.3)] ring-1 ring-white/20 relative group">
                            <div className="absolute inset-0 rounded-3xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <Database size={40} className="text-white drop-shadow-md" />
                        </div>
                        <div className="pt-2">
                            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Connect Service</h1>
                            <p className="text-gray-400 text-lg flex items-center gap-2">
                                Configure your database connection
                                <span className="w-1 h-1 rounded-full bg-gray-600" />
                                <span className="text-gray-500 text-sm">Secure Environment</span>
                            </p>
                        </div>
                    </motion.div>

                    {/* Form Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                        className="space-y-10"
                    >

                        {/* Row 1: Name & Group */}
                        <div className="grid grid-cols-3 gap-8">
                            <div className="col-span-2 space-y-2.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Connection Name</label>
                                <input
                                    type="text"
                                    defaultValue="New Connection"
                                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-5 py-3.5 text-white text-lg focus:outline-none focus:border-blue-500/50 transition-all font-medium placeholder:text-gray-700 shadow-sm"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Environment</label>
                                <div className="relative">
                                    <select className="w-full bg-[#18181b] border border-white/10 rounded-xl px-5 py-3.5 text-white appearance-none focus:outline-none focus:border-blue-500/50 transition-all font-medium cursor-pointer shadow-sm">
                                        <option>Development</option>
                                        <option>Production</option>
                                        <option>Staging</option>
                                    </select>
                                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                                </div>
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="space-y-4">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Service Type</label>
                            <div className="flex gap-4">
                                {['PostgreSQL', 'MySQL', 'Redis', 'MongoDB'].map((service) => (
                                    <ServiceTypeButton
                                        key={service}
                                        icon={service === 'Redis' ? Activity : (service === 'MongoDB' ? Globe : Database)}
                                        label={service}
                                        active={selectedService === service}
                                        onClick={() => setSelectedService(service)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Connection Details Box */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            className="border border-white/10 rounded-2xl bg-[#0c0c0e]/40 p-8 space-y-8 backdrop-blur-md relative overflow-hidden shadow-2xl"
                        >
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
                            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />

                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded text-xs">{">_"}</span>
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Connection Details</h3>
                            </div>

                            <div className="grid grid-cols-4 gap-8">
                                <div className="col-span-3">
                                    <InputField label="Host / IP Address" defaultValue="127.0.0.1" />
                                </div>
                                <div className="space-y-2.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Port</label>
                                    <div className="flex items-center bg-[#121214] border border-white/5 rounded-xl transition-colors hover:border-white/10 shadow-inner">
                                        <button className="px-3.5 py-3 hover:text-white text-gray-500 border-r border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50">-</button>
                                        <input
                                            className="w-full bg-transparent text-center text-gray-200 outline-none font-mono text-sm py-3"
                                            defaultValue="5432"
                                        />
                                        <button className="px-3.5 py-3 hover:text-white text-gray-500 border-l border-white/5 transition-colors hover:bg-white/5 disabled:opacity-50">+</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <InputField label="Username" defaultValue="postgres" />
                                <div className="space-y-2.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Password</label>
                                    <div className="relative group">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            defaultValue="password"
                                            className="w-full bg-[#121214] border border-white/5 rounded-xl px-5 py-3 text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm placeholder:text-gray-700 shadow-inner"
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

                            <InputField label="Database Name" defaultValue="postgres" />
                        </motion.div>
                    </motion.div>
                </div>

                {/* Footer Actions */}
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 20 }}
                    className="px-10 py-6 border-t border-white/5 flex items-center justify-end gap-5 bg-[#09090b]/90 backdrop-blur-xl sticky bottom-0 z-20"
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
                        className="flex items-center gap-2.5 px-10 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_4px_20px_rgba(79,70,229,0.4)] hover:shadow-[0_6px_25px_rgba(79,70,229,0.5)] transition-all font-semibold text-sm group"
                    >
                        <div className="flex relative items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white opacity-80 group-hover:animate-ping absolute" />
                            <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <span>Connect Server</span>
                    </motion.button>
                </motion.div>
            </div>
        </div>
    );
}
