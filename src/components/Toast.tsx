import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    isVisible: boolean;
    onClose: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose, duration = 3000 }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, x: 20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="fixed top-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#18181b]/90 backdrop-blur-xl border border-white/10 shadow-2xl min-w-[300px]"
                >
                    {type === 'success' && <CheckCircle2 className="text-green-500" size={20} />}
                    {type === 'error' && <XCircle className="text-red-500" size={20} />}
                    {type === 'info' && <div className="w-5 h-5 rounded-full border-2 border-blue-500" />}

                    <span className="flex-1 text-sm font-medium text-white">{message}</span>

                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X size={14} className="text-gray-500 hover:text-white" />
                    </button>

                    {/* Progress bar for auto dismiss */}
                    <div className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent w-full opacity-50" />
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
