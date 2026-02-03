import { useState, useRef, useEffect } from "react";
import {
    X,
    Minus,
    GripVertical,
    Maximize2,
    Minimize2,
    Pin,
    PinOff
} from "lucide-react";
import Logo from "./Logo";
import {
    RedisIcon,
    PostgresIcon,
    MySQLIcon,
    MongoIcon,
    MongoIconSingle,
    SQLiteIcon
} from "./icons";
import { Tooltip } from "./Tooltip";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import DatabaseManager from "./DatabaseManager";
import RedisManager from "./RedisManager";
import PostgresManager from "./PostgresManager";
import MySQLManager from "./MySQLManager";
import SQLiteManager from "./SQLiteManager";
import { useCustomDrag } from "../hooks/useCustomDrag";
import { useResize, ResizeCorner } from "../hooks/useResize";
import ClickSpark from "./ClickSpark";
import Silk from "./BG";



// UI 尺寸定义
const UI_SIZES = {
    collapsed: { w: 56, h: 56, r: 28 },
    toolbar: { w: 365, h: 56, r: 28 },
    expanded: { w: 1200, h: 800, r: 16 }
};

const ANIMATION_DURATION = 300;

import { useTranslation } from '../i18n/I18nContext';
import { useTheme } from '../contexts/ThemeContext';

export default function FloatingApp() {
    const { t } = useTranslation();
    const { currentThemeColor, setConnectedDatabase } = useTheme();
    const [viewMode, setViewMode] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [connectedService, setConnectedService] = useState<string | null>(null);
    const [currentConnectionName, setCurrentConnectionName] = useState<string>("");
    const [connectionConfig, setConnectionConfig] = useState<any>(null);
    const [preselectedService, setPreselectedService] = useState<string | null>(null);
    const [visibleContent, setVisibleContent] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [contentOpacity, setContentOpacity] = useState(1);

    // Sync connected service with theme context
    useEffect(() => {
        setConnectedDatabase(connectedService);
    }, [connectedService, setConnectedDatabase]);

    const [currentUiSize, setCurrentUiSize] = useState(UI_SIZES.toolbar);

    // 默认为右下角
    const [layoutAlign, setLayoutAlign] = useState<{ x: 'start' | 'end', y: 'start' | 'end' }>({ x: 'end', y: 'end' });

    const isAnimatingRef = useRef(false);
    // 智能动态调整工具栏宽度逻辑已被移除，使用固定宽度

    const [isMaximized, setIsMaximized] = useState(false);
    const [showBackground, setShowBackground] = useState(false);

    // Background color transition states
    const [appliedThemeColor, setAppliedThemeColor] = useState(currentThemeColor);
    const [bgOpacity, setBgOpacity] = useState(1);
    const bgTransitionRef = useRef(false);

    const [isPinned, setIsPinned] = useState(false);

    const togglePin = async () => {
        try {
            const newState = !isPinned;
            setIsPinned(newState);
            await getCurrentWindow().setAlwaysOnTop(newState);
        } catch (e) {
            console.error("Failed to toggle pin:", e);
        }
    };

    useEffect(() => {
        getCurrentWindow().setAlwaysOnTop(isPinned).catch(e => console.error("Failed to set initial pin state:", e));
    }, []);

    // Handle theme color change with fade transition
    useEffect(() => {
        if (currentThemeColor !== appliedThemeColor && !bgTransitionRef.current) {
            bgTransitionRef.current = true;

            // Fade out
            setBgOpacity(0);

            // After fade out (wait for transition), update color and fade in
            setTimeout(() => {
                setAppliedThemeColor(currentThemeColor);

                // Small buffer to ensure render cycle catches the color change
                requestAnimationFrame(() => {
                    setBgOpacity(1);
                    // Reset flag after fade in completes
                    setTimeout(() => {
                        bgTransitionRef.current = false;
                    }, 200);
                });
            }, 200);
        }
    }, [currentThemeColor, appliedThemeColor]);



    const [previousWindowBounds, setPreviousWindowBounds] = useState<{ x: number, y: number } | null>(null);

    const toggleMaximize = async () => {
        const appWindow = getCurrentWindow();
        const factor = await appWindow.scaleFactor();

        if (isMaximized) {
            // Restore
            const targetW = UI_SIZES.expanded.w * factor;
            const targetH = UI_SIZES.expanded.h * factor;

            let newX, newY;

            if (previousWindowBounds) {
                // Restore to previous position
                newX = previousWindowBounds.x;
                newY = previousWindowBounds.y;
            } else {
                // Fallback to center if no previous bounds
                const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
                const [waX, waY, waW, waH] = workArea;
                newX = waX + (waW - targetW) / 2;
                newY = waY + (waH - targetH) / 2;
            }

            await Promise.all([
                appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY))),
                appWindow.setSize(new PhysicalSize(Math.round(targetW), Math.round(targetH)))
            ]);

            setCurrentUiSize(UI_SIZES.expanded);
            setIsMaximized(false);
        } else {
            // Maximize
            // Save current position before maximizing
            const currentPos = await appWindow.outerPosition();
            setPreviousWindowBounds({ x: currentPos.x, y: currentPos.y });

            const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
            const [waX, waY, waW, waH] = workArea;

            await Promise.all([
                appWindow.setPosition(new PhysicalPosition(Math.round(waX), Math.round(waY))),
                appWindow.setSize(new PhysicalSize(Math.round(waW), Math.round(waH)))
            ]);

            // We don't update UI_SIZES.expanded so we can restore later
            setCurrentUiSize({ w: waW / factor, h: waH / factor, r: 0 }); // radius 0 for max
            setIsMaximized(true);
        }
    };

    const { handlePointerDown: handleDragStartBase, isActuallyDragging } = useCustomDrag(currentUiSize.w, currentUiSize.h, layoutAlign.x, layoutAlign.y);

    const handleDragStart = (e: React.PointerEvent) => {
        if (!isMaximized) handleDragStartBase(e);
    };

    // 四角拖拽缩放功能 - 最大尺寸根据屏幕工作区域动态计算
    const { handleResizeStart } = useResize();

    // 渲染四角拖拽手柄 - 放在容器内部四个角
    const renderResizeHandles = () => {
        if (viewMode !== 'expanded' || isMaximized) return null;

        const corners: { corner: ResizeCorner; position: string; cursor: string }[] = [
            { corner: 'nw', position: 'top-0 left-0', cursor: 'nw-resize' },
            { corner: 'ne', position: 'top-0 right-0', cursor: 'ne-resize' },
            { corner: 'sw', position: 'bottom-0 left-0', cursor: 'sw-resize' },
            { corner: 'se', position: 'bottom-0 right-0', cursor: 'se-resize' }
        ];

        return corners.map(({ corner, position, cursor }) => (
            <div
                key={corner}
                className={`absolute ${position} w-6 h-6 z-50 group pointer-events-auto`}
                style={{ cursor }}
                onPointerDown={(e) => handleResizeStart(
                    e,
                    corner,
                    0, // unused width
                    0, // unused height
                    layoutAlign.x, // unused alignX
                    layoutAlign.y, // unused alignY
                    (w, h) => {
                        setCurrentUiSize(prev => ({ ...prev, w, h }));
                        // Persist the size for next expansion
                        if (UI_SIZES.expanded) {
                            UI_SIZES.expanded.w = w;
                            UI_SIZES.expanded.h = h;
                        }
                    }
                )}
            >
                {/* 圆角弧线装饰 - hover时高亮 */}
                <div
                    className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                        ${corner === 'nw' ? 'rounded-tl-[16px] border-t-[4px] border-l-[4px]' : ''}
                        ${corner === 'ne' ? 'rounded-tr-[16px] border-t-[4px] border-r-[4px]' : ''}
                        ${corner === 'sw' ? 'rounded-bl-[16px] border-b-[4px] border-l-[4px]' : ''}
                        ${corner === 'se' ? 'rounded-br-[16px] border-b-[4px] border-r-[4px]' : ''}
                        border-white/80
                    `}
                />
            </div>
        ));
    };

    const handleChangeMode = async (targetMode: 'toolbar' | 'collapsed' | 'expanded', service?: string) => {
        if (targetMode === viewMode || isAnimatingRef.current) return;

        if (service) {
            setPreselectedService(service);
        } else {
            // If going back to toolbar, maybe clear it? Not strictly necessary but good for cleanup
            if (targetMode === 'toolbar') setPreselectedService(null);
        }

        isAnimatingRef.current = true;

        // 1. Fade out current content
        setContentOpacity(0);

        // If collapsing, hide background IMMEDIATELY to prevent glitch during resize
        if (targetMode !== 'expanded') {
            setShowBackground(false);
        }

        await new Promise(r => setTimeout(r, 150)); // Wait for fade out

        try {
            const appWindow = getCurrentWindow();
            const factor = await appWindow.scaleFactor();
            const currentOuterPos = await appWindow.outerPosition();
            const currentSize = UI_SIZES[viewMode];
            const targetSize = UI_SIZES[targetMode];

            const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
            const [waX, waY, waW, waH] = workArea;

            // Current Physical Bounds
            const curPhysW = currentSize.w * factor;
            const curPhysH = currentSize.h * factor;

            // Target Physical Bounds (Clamped)
            let targetPhysW = targetSize.w * factor;
            let targetPhysH = targetSize.h * factor;

            if (targetMode === 'expanded') {
                targetPhysW = Math.min(targetPhysW, waW);
                targetPhysH = Math.min(targetPhysH, waH);
                // Update logical target size for state
                targetSize.w = targetPhysW / factor;
                targetSize.h = targetPhysH / factor;
            }

            // 2. Calculate Anchor Point based on CURRENT layout alignment
            // The anchor point is the corner that should remain stationary during resize
            // For a floating widget at bottom-right, this is the bottom-right corner
            let anchorX = currentOuterPos.x;
            let anchorY = currentOuterPos.y;

            if (layoutAlign.x === 'end') {
                anchorX = currentOuterPos.x + curPhysW; // Right edge
            }
            if (layoutAlign.y === 'end') {
                anchorY = currentOuterPos.y + curPhysH; // Bottom edge
            }

            // 3. Keep the original alignment when expanding
            const nextAlignX = layoutAlign.x;
            const nextAlignY = layoutAlign.y;

            // 4. Calculate Target Window Position (Top-Left)
            // If aligned to 'end', the window should expand towards the left/top
            // so we subtract the target size from the anchor point
            let targetWinX = anchorX;
            let targetWinY = anchorY;

            if (nextAlignX === 'end') {
                targetWinX = anchorX - targetPhysW;
            }
            if (nextAlignY === 'end') {
                targetWinY = anchorY - targetPhysH;
            }

            // Boundary Check: Ensure we don't push off-screen
            if (targetWinX < waX) targetWinX = waX;
            if (targetWinY < waY) targetWinY = waY;
            if (targetWinX + targetPhysW > waX + waW) targetWinX = waX + waW - targetPhysW;
            if (targetWinY + targetPhysH > waY + waH) targetWinY = waY + waH - targetPhysH;

            // 5. Apply Position and Size
            // Set position FIRST to anchor it, then size.
            await appWindow.setPosition(new PhysicalPosition(Math.round(targetWinX), Math.round(targetWinY)));

            // Use update_click_region for size to ensure backend consistency (or just use setSize)
            await invoke('update_click_region', {
                width: targetSize.w,
                height: targetSize.h,
                alignX: nextAlignX,
                alignY: nextAlignY
            });

            // Update State
            setLayoutAlign({ x: nextAlignX, y: nextAlignY });
            setViewMode(targetMode);
            setVisibleContent(targetMode);
            setCurrentUiSize(targetSize);

            if (targetMode === 'expanded') {
                setShowBackground(true);
            }

            // 6. Fade In
            requestAnimationFrame(() => {
                setTimeout(() => setContentOpacity(1), 50);
                setTimeout(() => {
                    isAnimatingRef.current = false;
                }, ANIMATION_DURATION);
            });

        } catch (err) {
            console.error("Transition failed:", err);
            isAnimatingRef.current = false;
            setContentOpacity(1); // Ensure visible on error
        }
    };

    const getServiceColor = () => {
        return "gray";
    };

    const getServiceIcon = (service: string | null, size = 18) => {
        if (!service) return <Logo size={size} />;
        switch (service) {
            case 'Redis': return <RedisIcon size={size} className="text-red-400" />;
            case 'PostgreSQL': return <PostgresIcon size={size} className="text-blue-400" />;
            case 'MySQL': return <MySQLIcon size={size} className="text-orange-400" />;
            case 'MongoDB': return <MongoIcon size={size} className="text-green-400" />;
            case 'SQLite': return <SQLiteIcon size={size} className="text-cyan-400" />;
            default: return <Logo size={size} />;
        }
    };

    const renderContent = () => {
        switch (visibleContent) {
            case 'collapsed':
                return (
                    <div className="w-full h-full relative flex items-center justify-center">
                        <div className="absolute inset-0 cursor-move" onPointerDown={handleDragStart} />
                        <div
                            data-draggable="true"
                            className={`z-10 w-10 h-10 rounded-full cursor-pointer flex items-center justify-center transition-transform hover:scale-110 active:scale-90 ${connectedService ? 'bg-white/5 border border-white/10' : 'bg-gray-600'}`}
                            onPointerDown={handleDragStart}
                            onClick={() => {
                                if (!isActuallyDragging()) {
                                    handleChangeMode('toolbar');
                                }
                            }}
                        >
                            {getServiceIcon(connectedService, 20)}
                        </div>
                    </div>
                );
            case 'expanded':
                return (
                    <div className="w-full h-full relative flex flex-col overflow-hidden">
                        {/* Windows Controls Overlay */}
                        <div className="absolute top-4 right-4 z-[60] flex items-center gap-2 bg-[#18181b]/80 backdrop-blur rounded-lg p-1 border border-white/5 shadow-lg">
                            <Tooltip content={isPinned ? t('unpin') : t('pin')} position="bottom">
                                <button
                                    onClick={togglePin}
                                    className={`p-1.5 rounded-md transition-colors ${isPinned ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                                >
                                    {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                                </button>
                            </Tooltip>
                            <Tooltip content={isMaximized ? t('restore') : t('maximize')} position="bottom">
                                <button
                                    onClick={toggleMaximize}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                >
                                    {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                </button>
                            </Tooltip>
                            <Tooltip content={t('minimize')} position="bottom">
                                <button
                                    onClick={() => {
                                        handleChangeMode('toolbar');
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                >
                                    <Minus size={14} />
                                </button>
                            </Tooltip>
                        </div>

                        <div className="relative z-10 w-full h-full flex flex-col">
                            {connectedService === 'Redis' ? (
                                <RedisManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                    connectionName={currentConnectionName}
                                />
                            ) : connectedService === 'MySQL' ? (
                                <MySQLManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                    connectionName={currentConnectionName}
                                    config={connectionConfig}
                                />
                            ) : connectedService === 'SQLite' ? (
                                <SQLiteManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                    connectionName={currentConnectionName}
                                />
                            ) : connectedService ? (
                                <PostgresManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                    connectionName={currentConnectionName}
                                    config={connectionConfig}
                                />
                            ) : (
                                <DatabaseManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onConnect={(s: string, n: string, config: any) => {
                                        setConnectedService(s);
                                        setCurrentConnectionName(n);
                                        setConnectionConfig(config);
                                    }}
                                    activeService={preselectedService || connectedService}
                                    onDragStart={handleDragStart}
                                />
                            )}
                        </div>
                    </div>
                );
            default:

                return (
                    <div
                        className="flex items-center h-full px-3 gap-1.5 bg-[#18181b] whitespace-nowrap"

                    >
                        <div className="cursor-move text-gray-500 hover:text-gray-300 transition-colors shrink-0" onPointerDown={handleDragStart}>
                            <GripVertical size={20} />
                        </div>
                        <button
                            onClick={() => handleChangeMode('expanded')}
                            className={`flex-1 flex items-center justify-between gap-3 px-2 py-2 rounded-lg transition-colors min-w-0 ${connectedService ? 'text-blue-400 hover:bg-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white group'}`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {getServiceIcon(connectedService)}
                                <span className="text-sm font-medium truncate" style={{ color: getServiceColor() }} title={currentConnectionName || ''}>{connectedService ? (currentConnectionName || connectedService) : t('brand_name')}</span>
                            </div>

                            {
                                !connectedService && (
                                    <div className="flex items-center ml-2 shrink-0">
                                        <div className="flex items-center -space-x-2.5 hover:-space-x-1 transition-all duration-300 ease-out group/icons">
                                            {[
                                                { name: 'SQLite', icon: SQLiteIcon },
                                                { name: 'PostgreSQL', icon: PostgresIcon },
                                                { name: 'MySQL', icon: MySQLIcon },
                                                { name: 'MongoDB', icon: MongoIconSingle },
                                                { name: 'Redis', icon: RedisIcon }
                                            ].map(({ name, icon: Icon }, i) => (
                                                <div
                                                    key={name}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleChangeMode('expanded', name);
                                                    }}
                                                    className="w-6 h-6 rounded-full bg-[#1e1e22] flex items-center justify-center border border-white/10 shadow-sm relative transition-all duration-300 hover:scale-125 hover:z-20 hover:border-blue-500/50 cursor-pointer"
                                                    style={{
                                                        zIndex: 10 - i,
                                                    }}
                                                >
                                                    <Icon size={12} className="text-gray-400 group-hover/icons:text-gray-200 transition-colors" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            }
                        </button >
                        <div className="w-[1px] h-6 bg-white/10 shrink-0" />
                        <div className="flex items-center gap-1 shrink-0">
                            <Tooltip content={t('close')} position="left">
                                <button onClick={() => getCurrentWindow().close()} className="p-2 text-gray-400 rounded-md hover:bg-white/5 hover:text-red-400 transition-colors">
                                    <X size={16} />
                                </button>
                            </Tooltip>
                        </div>
                    </div >
                );
        }
    };

    const containerFlexClass = `fixed inset-0 overflow-hidden pointer-events-none flex ${layoutAlign.y === 'start' ? 'items-start' : 'items-end'} ${layoutAlign.x === 'start' ? 'justify-start' : 'justify-end'}`;

    return (
        <div className={containerFlexClass}>
            <div
                className="bg-[#18181b] pointer-events-auto relative outline-none"
                style={{
                    width: viewMode === 'expanded' ? '100vw' : `${currentUiSize.w}px`,
                    height: viewMode === 'expanded' ? '100vh' : `${currentUiSize.h}px`,
                    borderRadius: `${currentUiSize.r}px`,
                    clipPath: `inset(0px round ${currentUiSize.r}px)`,
                    boxShadow: '0 0 0 1.5px #18181b, 0 8px 24px rgba(0, 0, 0, 0.5)',
                }}
            >
                {/* Persistent Background Layer */}
                <div
                    className="absolute py-[1px] inset-0 z-0 transition-opacity pointer-events-none overflow-hidden"
                    style={{
                        opacity: showBackground ? bgOpacity : 0,
                        borderRadius: `${currentUiSize.r}px`,
                        transitionDelay: (showBackground && bgOpacity === 1) ? '150ms' : '0ms',
                        transitionDuration: showBackground ? '200ms' : '0ms',
                        transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
                    }}
                >
                    <Silk
                        key={appliedThemeColor}
                        speed={5}
                        scale={1}
                        color={appliedThemeColor}
                        noiseIntensity={1.5}
                        rotation={2}
                    />
                </div>

                <ClickSpark
                    sparkColor='#fff'
                    sparkSize={10}
                    sparkRadius={15}
                    sparkCount={8}
                    duration={400}
                >
                    <div
                        className={`w-full h-full transition-opacity duration-150 ease-out relative z-10`}
                        style={{ opacity: contentOpacity }}
                    >
                        {renderContent()}
                    </div>
                </ClickSpark>

                {/* 四角拖拽手柄 */}
                {renderResizeHandles()}
            </div>
        </div>
    );
}