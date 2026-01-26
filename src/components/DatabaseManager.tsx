import { useState } from 'react';
import {
    Search,
    Settings,
    Plus,
    Database,
    X,
    Eye,
    EyeOff,
    ChevronDown
} from 'lucide-react';
import { motion } from 'framer-motion';

const ServiceTypeButton = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
    <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={`flex items-center gap-3 px-6 py-3 rounded-lg border transition-all duration-200 ${active
            ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            : 'bg-[#18181b] border-white/10 text-gray-400 hover:border-white/20 hover:bg-white/5'
            } flex-1 justify-center relative overflow-hidden`}
    >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
        {active && (
            <motion.div
                layoutId="active-glow"
                className="absolute inset-0 bg-blue-500/5"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
        )}
    </motion.button>
);

const InputField = ({ label, placeholder, type = "text", value, defaultValue, className = "" }: any) => (
    <div className={`flex flex-col gap-2 ${className}`}>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        <input
            type={type}
            defaultValue={defaultValue}
            value={value}
            placeholder={placeholder}
            className="w-full bg-[#09090b] border border-white/10 rounded-md px-4 py-2.5 text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm placeholder:text-gray-700"
        />
    </div>
);

export default function DatabaseManager({ onClose, onConnect, activeService }: { onClose?: () => void, onConnect?: (service: string) => void, activeService?: string | null }) {
    const [selectedService, setSelectedService] = useState(activeService || 'PostgreSQL');
    const [showPassword, setShowPassword] = useState(false);

    const handleConnectClick = () => {
        if (onConnect) {
            onConnect(selectedService);
        }
    };

    return (
        <div className="flex w-full h-full bg-[#09090b] text-gray-300 font-sans overflow-hidden border border-white/5 selection:bg-blue-500/30 rounded-[28px]">
            {/* Sidebar */}
            <div className="w-80 bg-[#0c0c0e] border-r border-white/5 flex flex-col z-20">
                {/* Sidebar Header */}
                <div
                    className="p-4 border-b border-white/5"
                    data-tauri-drag-region
                >
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="w-full bg-[#18181b] border border-white/5 rounded-md py-2 pl-9 pr-3 text-sm text-gray-300 focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-gray-700"
                        />
                    </div>
                </div>

                {/* Explorer Section */}
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-4 py-3 text-xs font-bold text-gray-500 tracking-wider uppercase">
                        <span>Explorer</span>
                        <span className="bg-white/5 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">0</span>
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-col items-center justify-center h-40 text-center px-6 mt-10 opacity-50"
                    >
                        <span className="text-sm text-gray-600 mb-2">No connections.</span>
                        <button className="flex items-center gap-1.5 text-xs text-blue-500/80 hover:text-blue-400 transition-colors">
                            Click <Plus size={14} /> to start.
                        </button>
                    </motion.div>
                </div>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                        <span>v2.4.0 • Stable</span>
                    </div>
                    <button className="p-2 hover:bg-white/5 rounded-md text-gray-500 hover:text-gray-300 transition-colors">
                        <Settings size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#09090b] relative overflow-hidden">
                {/* Background Gradients for visuals */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />

                {/* Header Content */}
                <div
                    className="flex-1 p-12 overflow-y-auto w-full max-w-4xl mx-auto z-10 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
                    data-tauri-drag-region
                >

                    {/* Title Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="flex items-start gap-6 mb-12"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
                            <Database size={32} className="text-white drop-shadow-md" />
                        </div>
                        <div className="pt-1">
                            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Connect to Service</h1>
                            <p className="text-gray-500">Configure your database connection parameters.</p>
                        </div>
                    </motion.div>

                    {/* Form Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
                        className="space-y-8"
                    >

                        {/* Row 1: Name & Group */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="col-span-2 space-y-2">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Connection Name</label>
                                <input
                                    type="text"
                                    defaultValue="New Connection"
                                    className="w-full bg-[#18181b] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-all font-medium placeholder:text-gray-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group</label>
                                <div className="relative">
                                    <select className="w-full bg-[#18181b] border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-blue-500/50 transition-all font-medium cursor-pointer">
                                        <option>Development</option>
                                        <option>Production</option>
                                        <option>Staging</option>
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={16} />
                                </div>
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Type</label>
                            <div className="flex gap-4">
                                {['PostgreSQL', 'MySQL', 'Redis', 'MongoDB'].map((service) => (
                                    <ServiceTypeButton
                                        key={service}
                                        icon={Database} // ideally map different icons
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
                            className="border border-white/10 rounded-xl bg-[#0c0c0e]/50 p-6 space-y-6 backdrop-blur-sm relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                            <div className="flex items-center gap-2 mb-2 text-gray-400">
                                <span className="font-mono text-blue-500 font-bold">{">_"}</span>
                                <h3 className="text-sm font-semibold uppercase tracking-wider">Connection Details</h3>
                            </div>

                            <div className="grid grid-cols-4 gap-6">
                                <div className="col-span-3">
                                    <InputField label="Host / IP Address" defaultValue="127.0.0.1" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Port</label>
                                    <div className="flex items-center bg-[#09090b] border border-white/10 rounded-md transition-colors hover:border-white/20">
                                        <button className="px-3 py-2.5 hover:text-white text-gray-500 border-r border-white/10 transition-colors hover:bg-white/5 disabled:opacity-50">-</button>
                                        <input
                                            className="w-full bg-transparent text-center text-gray-200 outline-none font-mono text-sm py-2.5"
                                            defaultValue="5432"
                                        />
                                        <button className="px-3 py-2.5 hover:text-white text-gray-500 border-l border-white/10 transition-colors hover:bg-white/5 disabled:opacity-50">+</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <InputField label="Username" defaultValue="postgres" />
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            defaultValue="password"
                                            className="w-full bg-[#09090b] border border-white/10 rounded-md px-4 py-2.5 text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm placeholder:text-gray-700"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                    className="p-8 border-t border-white/5 flex items-center justify-end gap-4 bg-[#09090b]/95 backdrop-blur-md sticky bottom-0 z-20"
                >
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onClose}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all font-medium text-sm"
                    >
                        <X size={16} />
                        <span>Close</span>
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleConnectClick}
                        className="flex items-center gap-2 px-8 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all font-medium text-sm"
                    >
                        <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse"></div>
                        <span>Connect</span>
                    </motion.button>
                </motion.div>
            </div>
        </div>
    );
}
