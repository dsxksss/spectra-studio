"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Minus,
    Folder,
    Monitor,
    Circle,
    GripVertical
} from "lucide-react";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";

export default function FloatingApp() {
    // Mode: 'toolbar' (default) or 'collapsed' (minimized state)
    const [isCollapsed, setIsCollapsed] = useState(false);
    const isDraggingRef = useRef(false);
    const dragStartPosRef = useRef({ x: 0, y: 0 });
    const windowStartPosRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        // Enforce empty title to prevent Windows drag tooltip showing URL
        document.title = " ";
    }, []);

    const handleMinimize = () => setIsCollapsed(true);
    const handleRestore = () => setIsCollapsed(false);

    const handleClose = async () => {
        const appWindow = getCurrentWindow();
        await appWindow.close();
    };

    // Custom drag implementation to avoid Windows native drag tooltip
    const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const appWindow = getCurrentWindow();
            const position = await appWindow.outerPosition();

            isDraggingRef.current = true;
            dragStartPosRef.current = { x: e.screenX, y: e.screenY };
            windowStartPosRef.current = { x: position.x, y: position.y };

            // Add global event listeners
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        } catch (err) {
            console.error("Failed to start custom drag:", err);
        }
    }, []);

    const handleMouseMove = useCallback(async (e: MouseEvent) => {
        if (!isDraggingRef.current) return;

        try {
            const appWindow = getCurrentWindow();
            const deltaX = e.screenX - dragStartPosRef.current.x;
            const deltaY = e.screenY - dragStartPosRef.current.y;

            const newX = windowStartPosRef.current.x + deltaX;
            const newY = windowStartPosRef.current.y + deltaY;

            await appWindow.setPosition(new LogicalPosition(newX, newY));
        } catch (err) {
            console.error("Failed to move window:", err);
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    }, [handleMouseMove]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div className="flex items-center justify-center w-screen h-screen pointer-events-none">
            <motion.div
                layout
                initial={false}
                animate={{
                    width: isCollapsed ? 48 : 420,
                    height: 56,
                    borderRadius: 28, // Fully rounded (pill shape)
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="pointer-events-auto bg-[#18181b] border border-white/5 shadow-lg flex items-center overflow-hidden relative select-none"
            >
                {/* Drag Handle Background (always active for entire shape if needed, but let's be specific) */}
                <div className="absolute inset-0 -z-10 bg-[#18181b]" />

                <AnimatePresence mode="wait">
                    {isCollapsed ? (
                        // COLLAPSED STATE: 
                        // Outer ring for dragging, Inner dot for clicking/restoring
                        <motion.div
                            key="collapsed"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full h-full relative"
                        >
                            {/* Drag Area - Full size but behind the center button */}
                            <div
                                className="absolute inset-0 z-0 cursor-move"
                                onMouseDown={handleMouseDown}
                            />

                            {/* Restore Button - Centered, absolute to be on top */}
                            <div
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            >
                                <div
                                    className="bg-blue-500 w-3 h-3 rounded-full cursor-pointer pointer-events-auto hover:scale-125 transition-transform"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestore();
                                    }}
                                />
                            </div>
                        </motion.div>
                    ) : (
                        // TOOLBAR STATE
                        <motion.div
                            key="toolbar"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center w-full h-full px-2"
                        >
                            {/* 1. Drag Handle */}
                            <div
                                className="flex items-center justify-center px-2 cursor-move text-gray-500 hover:text-gray-300 transition-colors"
                                onMouseDown={handleMouseDown}
                            >
                                <GripVertical size={20} className="pointer-events-none" />
                            </div>

                            {/* 2. Screen Action */}
                            <button className="flex items-center gap-2.5 px-3 py-2 text-gray-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors group select-none">
                                <Monitor size={18} />
                                <span className="text-sm font-medium">Screen</span>
                            </button>

                            {/* Divider */}
                            <div className="w-[1px] h-6 bg-white/10 mx-1" />

                            {/* 3. Record Action */}
                            <button className="flex items-center gap-2.5 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors group select-none">
                                <Circle size={14} className="fill-current" />
                                <span className="text-sm font-medium">Record</span>
                            </button>

                            {/* Divider */}
                            <div className="w-[1px] h-6 bg-white/10 mx-1" />

                            {/* 4. Open Folder Action */}
                            <button className="flex items-center gap-2.5 px-3 py-2 text-gray-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors group select-none">
                                <Folder size={18} />
                                <span className="text-sm font-medium">Open</span>
                            </button>

                            {/* Divider */}
                            <div className="w-[1px] h-6 bg-white/10 mx-1" />

                            {/* 5. Window Controls */}
                            <div className="flex items-center gap-1 ml-auto pr-1">
                                <button
                                    onClick={handleMinimize}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <Minus size={16} />
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
