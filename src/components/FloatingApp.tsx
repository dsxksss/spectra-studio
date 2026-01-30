import { useState, useRef } from "react";
import {
    X,
    Minus,
    GripVertical,
    Maximize2,
    Minimize2
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

export default function FloatingApp() {
    const { t } = useTranslation();
    const [viewMode, setViewMode] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [connectedService, setConnectedService] = useState<string | null>(null);
    const [currentConnectionName, setCurrentConnectionName] = useState<string>("");
    const [connectionConfig, setConnectionConfig] = useState<any>(null);
    const [preselectedService, setPreselectedService] = useState<string | null>(null);
    const [visibleContent, setVisibleContent] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [contentOpacity, setContentOpacity] = useState(1);

    const [currentUiSize, setCurrentUiSize] = useState(UI_SIZES.toolbar);

    // 默认为右下角
    const [layoutAlign, setLayoutAlign] = useState<{ x: 'start' | 'end', y: 'start' | 'end' }>({ x: 'end', y: 'end' });

    const isAnimatingRef = useRef(false);
    // 智能动态调整工具栏宽度逻辑已被移除，使用固定宽度

    const [isMaximized, setIsMaximized] = useState(false);
    const [showBackground, setShowBackground] = useState(false);

    const resetToStandardSize = async () => {
        const appWindow = getCurrentWindow();
        const factor = await appWindow.scaleFactor();

        // Get Work Area for constraints
        const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
        const [waX, waY, waW, waH] = workArea;

        // Target: 1200x800 or Screen Size (whichever is smaller)
        const targetPhysicalW = 1200 * factor;
        const targetPhysicalH = 800 * factor;

        const finalW = Math.min(targetPhysicalW, waW);
        const finalH = Math.min(targetPhysicalH, waH);

        // Calculate Anchor (Bottom-Right) based on current window
        const outerPos = await appWindow.outerPosition();
        const outerSize = await appWindow.outerSize();

        const brX = outerPos.x + outerSize.width;
        const brY = outerPos.y + outerSize.height;

        // New Top-Left
        // If we strictly anchor BR:
        let newX = brX - finalW;
        let newY = brY - finalH;

        // Boundary Check: Ensure we don't push off-screen (top/left)
        // If window was near left edge, resizing width might push x negative relative to Work Area?
        // Let's ensure newX >= waX and newY >= waY
        if (newX < waX) newX = waX;
        if (newY < waY) newY = waY;

        // Also check right/bottom bounds (though size clamping helps)
        if (newX + finalW > waX + waW) newX = waX + waW - finalW;
        if (newY + finalH > waY + waH) newY = waY + waH - finalH;

        await Promise.all([
            appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY))),
            appWindow.setSize(new PhysicalSize(Math.round(finalW), Math.round(finalH)))
        ]);

        // Logic UI Size (convert back to Logical for state)
        const logicalW = finalW / factor;
        const logicalH = finalH / factor;

        setCurrentUiSize({ w: logicalW, h: logicalH, r: UI_SIZES.expanded.r });
        // Update persistent size
        if (UI_SIZES.expanded) {
            UI_SIZES.expanded.w = logicalW;
            UI_SIZES.expanded.h = logicalH;
        }
        setIsMaximized(false);
    };

    const toggleMaximize = async () => {
        const appWindow = getCurrentWindow();
        const factor = await appWindow.scaleFactor();

        if (isMaximized) {
            // Restore
            const targetW = UI_SIZES.expanded.w * factor;
            const targetH = UI_SIZES.expanded.h * factor;

            // Restore relies on persisted size, usually we center or reuse saved pos.
            // Since we don't save pos, let's Center it in Work Area (as implemented before) OR Anchor Bottom Right?
            // "Toggle Maximize" usually restores to previous position.
            // But for simplicity/robustness, user didn't complain about Maximize/Restore behavior, 
            // only about "Minimize" (Reset) behavior. 
            // I'll keep Restore centering logic for now unless requested, 
            // OR I can make Restore also Anchor BR if I knew where it was.
            // Let's stick to existing logic for Toggle Maximize (Center).

            const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
            const [waX, waY, waW, waH] = workArea;

            const newX = waX + (waW - targetW) / 2;
            const newY = waY + (waH - targetH) / 2;

            await Promise.all([
                appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY))),
                appWindow.setSize(new PhysicalSize(Math.round(targetW), Math.round(targetH)))
            ]);

            setCurrentUiSize(UI_SIZES.expanded);
            setIsMaximized(false);
        } else {
            // Maximize
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

            // 2. Identify Anchor Point based on CURRENT layout alignment
            // This is the point that should remain stationary
            let anchorX = currentOuterPos.x;
            let anchorY = currentOuterPos.y;

            if (layoutAlign.x === 'end') {
                anchorX = currentOuterPos.x + curPhysW;
            }
            if (layoutAlign.y === 'end') {
                anchorY = currentOuterPos.y + curPhysH;
            }

            // 3. Determine NEW Alignment if Expanding
            // If we are expanding, we might need to flip alignment if we are too close to screen edges
            let nextAlignX = layoutAlign.x;
            let nextAlignY = layoutAlign.y;

            if (targetMode === 'expanded') {
                const screenMidX = waX + waW / 2;
                const screenMidY = waY + waH / 2;

                // Center of current window
                const centerX = currentOuterPos.x + curPhysW / 2;
                const centerY = currentOuterPos.y + curPhysH / 2;

                nextAlignX = centerX < screenMidX ? 'start' : 'end';
                nextAlignY = centerY < screenMidY ? 'start' : 'end';

                // If expanding and alignment changes, we effectively pivot around the current 'center' or 'corner' 
                // closest to the center? 
                // Creating a smooth transition when flipping alignment is tricky. 
                // Let's stick to the simplest anchor: The current top-left (if start) or top-right (if end).

                if (nextAlignX === 'start') {
                    // We want to be Start aligned. Anchor is Top-Left.
                    anchorX = currentOuterPos.x;
                } else {
                    // We want to be End aligned. Anchor is Top-Right (conceptually)
                    anchorX = currentOuterPos.x + curPhysW;
                }

                if (nextAlignY === 'start') {
                    anchorY = currentOuterPos.y;
                } else {
                    anchorY = currentOuterPos.y + curPhysH;
                }
            }

            // 4. Calculate Target Window Position (Top-Left)
            let targetWinX = anchorX;
            let targetWinY = anchorY;

            if (nextAlignX === 'end') {
                targetWinX = anchorX - targetPhysW;
            }
            if (nextAlignY === 'end') {
                targetWinY = anchorY - targetPhysH;
            }

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
                            <button
                                onClick={resetToStandardSize}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                title="Reset Size (1200x800)"
                            >
                                <Minimize2 size={14} />
                            </button>
                            <button
                                onClick={toggleMaximize}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                title={isMaximized ? "Restore" : "Maximize"}
                            >
                                {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button
                                onClick={() => {
                                    setConnectedService(null);
                                    handleChangeMode('toolbar');
                                }}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                title="Close Panel"
                            >
                                <X size={14} />
                            </button>
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

                            <button onClick={() => getCurrentWindow().close()} className="p-2 text-gray-400 rounded-md hover:bg-white/5 hover:text-red-400 transition-colors">
                                <X size={16} />
                            </button>
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
                        opacity: showBackground ? 1 : 0,
                        borderRadius: `${currentUiSize.r}px`,
                        transitionDelay: showBackground ? '150ms' : '0ms',
                        transitionDuration: showBackground ? '300ms' : '0ms',
                        transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
                    }}
                >
                    <Silk
                        speed={5}
                        scale={1}
                        color="#364774ff"
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