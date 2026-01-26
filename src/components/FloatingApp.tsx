import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Minus,
    GripVertical,
    Database
} from "lucide-react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import DatabaseManager from "./DatabaseManager";
import { useCustomDrag } from "../hooks/useCustomDrag";

export default function FloatingApp() {
    const [viewMode, setViewMode] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [connectedService, setConnectedService] = useState<string | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const prevModeRef = useRef(viewMode);
    const savedPosRef = useRef<{ x: number, y: number } | null>(null);
    const bounceTimeoutRef = useRef<number | null>(null);

    const SIZES = {
        collapsed: { w: 56, h: 56 },
        toolbar: { w: 420, h: 56 },
        expanded: { w: 800, h: 600 }
    };

    const checkAndBounceBack = useCallback(async () => {
        if (isAnimating) return;
        const appWindow = getCurrentWindow();
        try {
            // Prevent bounce check if window is minimized or closed
            if (await appWindow.isMinimized()) return;

            const monitor = await currentMonitor();
            if (!monitor) return;

            const factor = await appWindow.scaleFactor();
            const physicalPos = await appWindow.outerPosition();

            // Fix: Windows reports negative large values when minimized (e.g., -32000)
            // Even if isMinimized() returns false (race condition), this catches it.
            if (physicalPos.x <= -10000 || physicalPos.y <= -10000) return;

            const physicalSize = await appWindow.innerSize();

            const pos = { x: physicalPos.x / factor, y: physicalPos.y / factor };
            const size = { w: physicalSize.width / factor, h: physicalSize.height / factor };
            const mPos = { x: monitor.position.x / factor, y: monitor.position.y / factor };
            const mSize = { w: monitor.size.width / factor, h: monitor.size.height / factor };

            let nX = pos.x, nY = pos.y, bounce = false;
            if (pos.x < mPos.x - size.w + 40) { nX = mPos.x + 20; bounce = true; }
            if (pos.x > mPos.x + mSize.w - 40) { nX = mPos.x + mSize.w - size.w - 20; bounce = true; }
            if (pos.y < mPos.y) { nY = mPos.y + 20; bounce = true; }
            if (pos.y > mPos.y + mSize.h - 40) { nY = mPos.y + mSize.h - size.h - 20; bounce = true; }

            if (bounce) await appWindow.setPosition(new LogicalPosition(nX, nY));
        } catch (e) { }
    }, [isAnimating]);

    const { handleMouseDown: handleDragStart } = useCustomDrag();

    useEffect(() => {
        // Just show the UI with a small delay to ensure window is ready
        setTimeout(() => setIsReady(true), 100);
    }, []);

    useEffect(() => {
        const appWindow = getCurrentWindow();
        let unlisten: any;
        appWindow.onMoved(() => {
            if (isAnimating) return;
            if (bounceTimeoutRef.current) clearTimeout(bounceTimeoutRef.current);
            bounceTimeoutRef.current = window.setTimeout(checkAndBounceBack, 100);
        }).then(u => unlisten = u);
        return () => { if (unlisten) unlisten(); };
    }, [checkAndBounceBack, isAnimating]);

    useEffect(() => {
        const syncWindow = async () => {
            const appWindow = getCurrentWindow();
            const prev = SIZES[prevModeRef.current as keyof typeof SIZES];
            const target = SIZES[viewMode as keyof typeof SIZES];
            if (prevModeRef.current === viewMode) return;

            setIsAnimating(true);

            const factor = await appWindow.scaleFactor();
            const physicalPos = await appWindow.outerPosition();
            const pos = { x: physicalPos.x / factor, y: physicalPos.y / factor };

            // When GROWING: expand physical window BEFORE animation starts
            if (target.w > prev.w || target.h > prev.h) {
                // Save current position when expanding (for restoration later)
                if (viewMode === 'expanded') {
                    savedPosRef.current = { x: pos.x, y: pos.y };
                }

                const nX = pos.x - (target.w - prev.w);
                const nY = pos.y - (target.h - prev.h);

                // Atomic move & resize via backend command
                await invoke('resize_window', {
                    width: target.w,
                    height: target.h,
                    x: nX,
                    y: nY
                });
            }
        };
        syncWindow();
    }, [viewMode]);

    const onFinish = async () => {
        const appWindow = getCurrentWindow();
        const prev = SIZES[prevModeRef.current as keyof typeof SIZES];
        const target = SIZES[viewMode as keyof typeof SIZES];

        // When SHRINKING: adjust physical window AFTER CSS animation finishes
        if (prev.w > target.w || prev.h > target.h) {
            // If returning from expanded, use saved position for perfect restoration
            if (prevModeRef.current === 'expanded' && savedPosRef.current) {
                const { x, y } = savedPosRef.current;
                // Sanity check
                if (x !== undefined && y !== undefined && x > -5000 && y > -5000) {
                    await invoke('resize_window', {
                        width: target.w,
                        height: target.h,
                        x: x,
                        y: y
                    });
                }
                savedPosRef.current = null; // Clear after use
            } else {
                // Standard shrink (e.g., toolbar -> collapsed)
                const factor = await appWindow.scaleFactor();
                const physPos = await appWindow.outerPosition();
                const physSize = await appWindow.innerSize();
                const curL = { x: physPos.x / factor, y: physPos.y / factor };
                const curS = { w: physSize.width / factor, h: physSize.height / factor };

                const nX = curL.x + (curS.w - target.w);
                const nY = curL.y + (curS.h - target.h);

                // Sanity check for coordinates before applying
                if (nX > -5000 && nY > -5000) {
                    await invoke('resize_window', {
                        width: target.w,
                        height: target.h,
                        x: nX,
                        y: nY
                    });
                }
            }
        }

        prevModeRef.current = viewMode;
        setTimeout(() => setIsAnimating(false), 200);
    };

    const getServiceIcon = (service: string | null, size = 18) => {
        if (!service) return <Database size={size} />;
        switch (service) {
            case 'PostgreSQL': return <Database size={size} className="text-blue-400" />;
            case 'MySQL': return <Database size={size} className="text-orange-400" />;
            case 'Redis': return <Database size={size} className="text-red-400" />;
            case 'MongoDB': return <Database size={size} className="text-green-400" />;
            default: return <Database size={size} />;
        }
    };

    return (
        <motion.div
            className="w-screen h-screen flex items-end justify-end pointer-events-none overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: isReady ? 1 : 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                initial={false}
                animate={{
                    width: viewMode === 'collapsed' ? 56 : (viewMode === 'expanded' ? 800 : 420),
                    height: viewMode === 'collapsed' ? 56 : (viewMode === 'expanded' ? 600 : 56),
                    borderRadius: viewMode === 'collapsed' ? 28 : (viewMode === 'expanded' ? 16 : 28),
                }}
                transition={{
                    type: "spring",
                    stiffness: 140,
                    damping: 20,
                    mass: 0.8
                }}
                onAnimationComplete={onFinish}
                className="bg-[#18181b] border border-white/10 flex flex-col items-center justify-center overflow-hidden relative select-none pointer-events-auto"
            >
                <AnimatePresence mode="wait">
                    {viewMode === 'collapsed' ? (
                        <motion.div
                            key="c"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.05 } }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full relative flex items-center justify-center"
                        >
                            <div className="absolute inset-0 cursor-move" onMouseDown={handleDragStart} />
                            <motion.div
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className={`z-10 w-10 h-10 rounded-full cursor-pointer flex items-center justify-center ${connectedService ? 'bg-white/5 border border-white/10' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}
                                onClick={() => setViewMode('toolbar')}
                            >
                                {getServiceIcon(connectedService, 20)}
                            </motion.div>
                        </motion.div>
                    ) : viewMode === 'expanded' ? (
                        <motion.div
                            key="e"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.05 } }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full bg-[#09090b] flex flex-col"
                        >
                            <DatabaseManager
                                onClose={() => setViewMode('toolbar')}
                                onConnect={(s) => { setConnectedService(s); setViewMode('toolbar'); }}
                                activeService={connectedService}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="t"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.05 } }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center w-full h-full px-4 gap-3 bg-[#18181b]"
                        >
                            <motion.div
                                className="cursor-move text-gray-500"
                                onMouseDown={handleDragStart}
                                whileHover={{ color: "#d1d5db" }}
                            >
                                <GripVertical size={20} />
                            </motion.div>
                            <motion.button
                                onClick={() => setViewMode('expanded')}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${connectedService ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-400'}`}
                                whileHover={!connectedService ? { color: "#ffffff", backgroundColor: "rgba(255,255,255,0.05)" } : {}}
                            >
                                {getServiceIcon(connectedService)}
                                <span className="text-sm font-medium">{connectedService ? `Connected to ${connectedService}` : 'Connect to Service'}</span>
                            </motion.button>
                            <div className="w-[1px] h-6 bg-white/10" />
                            <div className="flex items-center gap-1">
                                <motion.button
                                    onClick={() => setViewMode('collapsed')}
                                    className="p-2 text-gray-400 rounded-md"
                                    whileHover={{ color: "#ffffff", backgroundColor: "rgba(255,255,255,0.05)" }}
                                >
                                    <Minus size={16} />
                                </motion.button>
                                <motion.button
                                    onClick={() => getCurrentWindow().close()}
                                    className="p-2 text-gray-400 rounded-md"
                                    whileHover={{ color: "#f87171", backgroundColor: "rgba(255,255,255,0.05)" }}
                                >
                                    <X size={16} />
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
