import { useState, useEffect, useRef } from "react";
import {
    X,
    Minus,
    GripVertical,
    Database
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import DatabaseManager from "./DatabaseManager";
import { useCustomDrag } from "../hooks/useCustomDrag";

// UI 尺寸定义
const UI_SIZES = {
    collapsed: { w: 56, h: 56, r: 28 },
    toolbar: { w: 420, h: 56, r: 28 },
    expanded: { w: 1200, h: 800, r: 16 }
};

const ANIMATION_DURATION = 300;

export default function FloatingApp() {
    const [viewMode, setViewMode] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [connectedService, setConnectedService] = useState<string | null>(null);
    const [visibleContent, setVisibleContent] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [contentOpacity, setContentOpacity] = useState(1);

    const [currentUiSize, setCurrentUiSize] = useState(UI_SIZES.toolbar);

    const isAnimatingRef = useRef(false);
    const { handlePointerDown: handleDragStart } = useCustomDrag(currentUiSize.w, currentUiSize.h);

    useEffect(() => {
        // 初始化时设置点击区域为 toolbar 大小
        invoke('update_click_region', {
            width: UI_SIZES.toolbar.w,
            height: UI_SIZES.toolbar.h
        });
    }, []);

    const handleChangeMode = async (targetMode: 'toolbar' | 'collapsed' | 'expanded') => {
        if (targetMode === viewMode || isAnimatingRef.current) return;

        isAnimatingRef.current = true;
        const currentSize = UI_SIZES[viewMode];
        const targetSize = UI_SIZES[targetMode];
        const isExpanding = targetSize.w > currentSize.w || targetSize.h > currentSize.h;

        setContentOpacity(0);
        await new Promise(r => setTimeout(r, 50));

        if (isExpanding) {
            // 变大：先扩大点击区域
            await invoke('update_click_region', {
                width: targetSize.w,
                height: targetSize.h
            });

            setVisibleContent(targetMode);
            setViewMode(targetMode);

            requestAnimationFrame(() => {
                setCurrentUiSize(targetSize);
                setTimeout(() => setContentOpacity(1), 100);
                setTimeout(() => {
                    isAnimatingRef.current = false;
                }, ANIMATION_DURATION + 50);
            });

        } else {
            // 变小：先做动画
            setVisibleContent(targetMode);
            setViewMode(targetMode);
            setCurrentUiSize(targetSize);
            setTimeout(() => setContentOpacity(1), 50);

            // 动画结束后缩小点击区域
            setTimeout(async () => {
                await invoke('update_click_region', {
                    width: targetSize.w,
                    height: targetSize.h
                });
                isAnimatingRef.current = false;
            }, ANIMATION_DURATION);
        }
    };

    const getServiceIcon = (service: string | null, size = 18) => {
        if (!service) return <Database size={size} />;
        return <Database size={size} className={service ? "text-blue-400" : ""} />;
    };

    const renderContent = () => {
        switch (visibleContent) {
            case 'collapsed':
                return (
                    <div className="w-full h-full relative flex items-center justify-center">
                        <div className="absolute inset-0 cursor-move" onPointerDown={handleDragStart} />
                        <div
                            className={`z-10 w-10 h-10 rounded-full cursor-pointer flex items-center justify-center transition-transform hover:scale-110 active:scale-90 ${connectedService ? 'bg-white/5 border border-white/10' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}
                            onClick={() => handleChangeMode('toolbar')}
                        >
                            {getServiceIcon(connectedService, 20)}
                        </div>
                    </div>
                );
            case 'expanded':
                return (
                    <div className="w-full h-full bg-[#09090b] flex flex-col">
                        <DatabaseManager
                            onClose={() => handleChangeMode('toolbar')}
                            onConnect={(s) => { setConnectedService(s); handleChangeMode('toolbar'); }}
                            activeService={connectedService}
                            onDragStart={handleDragStart}
                        />
                    </div>
                );
            default:
                return (
                    <div className="flex items-center w-full h-full px-4 gap-3 bg-[#18181b]">
                        <div className="cursor-move text-gray-500 hover:text-gray-300 transition-colors" onPointerDown={handleDragStart}>
                            <GripVertical size={20} />
                        </div>
                        <button
                            onClick={() => handleChangeMode('expanded')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${connectedService ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                        >
                            {getServiceIcon(connectedService)}
                            <span className="text-sm font-medium whitespace-nowrap">{connectedService ? `Connected to ${connectedService}` : 'Connect'}</span>
                        </button>
                        <div className="w-[1px] h-6 bg-white/10" />
                        <div className="flex items-center gap-1">
                            <button onClick={() => handleChangeMode('collapsed')} className="p-2 text-gray-400 rounded-md hover:bg-white/5 hover:text-white transition-colors">
                                <Minus size={16} />
                            </button>
                            <button onClick={() => getCurrentWindow().close()} className="p-2 text-gray-400 rounded-md hover:bg-white/5 hover:text-red-400 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none flex items-end justify-end">
            <div
                className="bg-[#18181b] border border-white/10 overflow-hidden shadow-2xl pointer-events-auto"
                style={{
                    width: `${currentUiSize.w}px`,
                    height: `${currentUiSize.h}px`,
                    borderRadius: `${currentUiSize.r}px`,
                    willChange: 'width, height',
                    transitionProperty: 'width, height, border-radius',
                    transitionDuration: `${ANIMATION_DURATION}ms`,
                    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
                }}
            >
                <div
                    className="w-full h-full transition-opacity duration-150 ease-out"
                    style={{ opacity: contentOpacity }}
                >
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}