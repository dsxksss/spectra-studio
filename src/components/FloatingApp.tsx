import { useState, useEffect, useRef } from "react";
import {
    X,
    Minus,
    GripVertical,
    Database,
    FileJson
} from "lucide-react";
import {
    RedisIcon,
    PostgresIcon,
    MySQLIcon,
    MongoIcon,
    MongoIconSingle,
    SQLiteIcon
} from "./icons";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import DatabaseManager from "./DatabaseManager";
import RedisManager from "./RedisManager";
import PostgresManager from "./PostgresManager";
import { useCustomDrag } from "../hooks/useCustomDrag";
import ClickSpark from "./ClickSpark";
import Silk from "./BG";

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

    useEffect(() => {
        // 初始化时根据当前状态设置点击区域 (修复 HMR/重载时的显示问题)
        invoke('update_click_region', {
            width: currentUiSize.w,
            height: currentUiSize.h,
            alignX: layoutAlign.x,
            alignY: layoutAlign.y
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [layoutAlign, setLayoutAlign] = useState<{ x: 'start' | 'end', y: 'start' | 'end' }>({ x: 'end', y: 'end' });

    const { handlePointerDown: handleDragStart, isActuallyDragging } = useCustomDrag(currentUiSize.w, currentUiSize.h, layoutAlign.x, layoutAlign.y);

    const handleChangeMode = async (targetMode: 'toolbar' | 'collapsed' | 'expanded') => {
        if (targetMode === viewMode || isAnimatingRef.current) return;

        const currentSize = UI_SIZES[viewMode];
        const targetSize = UI_SIZES[targetMode];
        const isExpanding = targetSize.w > currentSize.w || targetSize.h > currentSize.h;

        let newAlignX = layoutAlign.x;
        let newAlignY = layoutAlign.y;

        if (isExpanding) {
            try {
                const appWindow = getCurrentWindow();
                const factor = await appWindow.scaleFactor();
                const currentOuterPos = await appWindow.outerPosition();
                const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
                const [waX, waY, waW, waH] = workArea;

                const winPhysW = UI_SIZES.expanded.w * factor;
                const winPhysH = UI_SIZES.expanded.h * factor;

                const currentPhysW = currentSize.w * factor;
                const currentPhysH = currentSize.h * factor;

                // 1. Calculate Visual Top-Left of the CURRENT content (before expansion check)
                // This depends on the OLD alignment
                let visualLeft = currentOuterPos.x;
                let visualTop = currentOuterPos.y;

                if (layoutAlign.x === 'end') {
                    visualLeft = currentOuterPos.x + (winPhysW - currentPhysW);
                }
                if (layoutAlign.y === 'end') {
                    visualTop = currentOuterPos.y + (winPhysH - currentPhysH);
                }

                // 2. Determine NEW Desired Alignment based on Quadrant
                // Center point of visual content
                const midX = visualLeft + currentPhysW / 2;
                const midY = visualTop + currentPhysH / 2;
                const screenMidX = waX + waW / 2;
                const screenMidY = waY + waH / 2;

                newAlignX = midX < screenMidX ? 'start' : 'end'; // Left side -> Align Start (Expand Right)
                newAlignY = midY < screenMidY ? 'start' : 'end'; // Top Side -> Align Start (Expand Down)

                // 3. Calculate NEW Window Position to maintain Visual Position
                let targetWinX = currentOuterPos.x;
                let targetWinY = currentOuterPos.y;

                if (newAlignX === 'start') {
                    // If Align Start, Window X = Visual Left
                    targetWinX = visualLeft;
                } else {
                    // If Align End, Window X = Visual Left - (Window W - Content W)
                    // Note: We use CURRENT content width for the transition point
                    targetWinX = visualLeft - (winPhysW - currentPhysW);
                }

                if (newAlignY === 'start') {
                    targetWinY = visualTop;
                } else {
                    targetWinY = visualTop - (winPhysH - currentPhysH);
                }

                // 4. Safety Bounds Check (Keep Window fully on screen)
                if (targetWinX < waX) targetWinX = waX;
                if (targetWinY < waY) targetWinY = waY;
                if (targetWinX + winPhysW > waX + waW) targetWinX = (waX + waW) - winPhysW;
                if (targetWinY + winPhysH > waY + waH) targetWinY = (waY + waH) - winPhysH;

                // 5. Apply Changes
                if (targetWinX !== currentOuterPos.x || targetWinY !== currentOuterPos.y) {
                    await appWindow.setPosition(new PhysicalPosition(
                        Math.round(targetWinX),
                        Math.round(targetWinY)
                    ));
                }

                // Update alignment state
                setLayoutAlign({ x: newAlignX, y: newAlignY });

            } catch (err) {
                console.error("Failed to adjust window position:", err);
            }
        }

        isAnimatingRef.current = true;

        setContentOpacity(0);
        await new Promise(r => setTimeout(r, 50));

        if (isExpanding) {
            // 变大：先扩大点击区域
            await invoke('update_click_region', {
                width: targetSize.w,
                height: targetSize.h,
                alignX: newAlignX,
                alignY: newAlignY
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
                    height: targetSize.h,
                    alignX: layoutAlign.x,
                    alignY: layoutAlign.y
                });
                isAnimatingRef.current = false;
            }, ANIMATION_DURATION);
        }
    };

    const getServiceIcon = (service: string | null, size = 18) => {
        if (!service) return <Database size={size} />;
        switch (service) {
            case 'Redis': return <RedisIcon size={size} className="text-red-400" />;
            case 'PostgreSQL': return <PostgresIcon size={size} className="text-blue-400" />;
            case 'MySQL': return <MySQLIcon size={size} className="text-blue-500" />;
            case 'MongoDB': return <MongoIcon size={size} />;
            case 'SQLite': return <SQLiteIcon size={size} className="text-blue-300" />;
            default: return <Database size={size} className="text-blue-400" />;
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
                            className={`z-10 w-10 h-10 rounded-full cursor-pointer flex items-center justify-center transition-transform hover:scale-110 active:scale-90 ${connectedService ? 'bg-white/5 border border-white/10' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}
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
                        <div className="relative z-10 w-full h-full flex flex-col">
                            {connectedService === 'Redis' ? (
                                <RedisManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                />
                            ) : connectedService ? (
                                <PostgresManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onDisconnect={() => setConnectedService(null)}
                                    onDragStart={handleDragStart}
                                    serviceType={connectedService}
                                />
                            ) : (
                                <DatabaseManager
                                    onClose={() => handleChangeMode('toolbar')}
                                    onConnect={(s) => setConnectedService(s)}
                                    activeService={connectedService}
                                    onDragStart={handleDragStart}
                                />
                            )}
                        </div>
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
                            className={`flex flex-1 items-center gap-4 px-4 py-2 rounded-lg transition-colors ${connectedService ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 justify-center' : 'text-gray-400 hover:bg-white/5 hover:text-white justify-between group'}`}
                        >
                            <div className="flex items-center gap-2">
                                {getServiceIcon(connectedService)}
                                <span className="text-sm font-medium whitespace-nowrap">{connectedService ? `Connected to ${connectedService}` : 'Connect'}</span>
                            </div>

                            {!connectedService && (
                                <div className="flex items-center -space-x-2 mr-1">
                                    {[SQLiteIcon, PostgresIcon, MySQLIcon, MongoIconSingle, RedisIcon].map((Icon, i) => (
                                        <div key={i} className="w-6 h-6 rounded-full bg-[#18181b] flex items-center justify-center border border-white/10 relative z-[1] transition-transform group-hover:scale-110" style={{ zIndex: 10 - i }}>
                                            <Icon size={12} className="text-gray-400" />
                                        </div>
                                    ))}
                                </div>
                            )}
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

    const containerFlexClass = `fixed inset-0 overflow-hidden pointer-events-none flex ${layoutAlign.y === 'start' ? 'items-start' : 'items-end'} ${layoutAlign.x === 'start' ? 'justify-start' : 'justify-end'}`;

    return (
        <div className={containerFlexClass}>
            <div
                className="bg-[#18181b] overflow-hidden shadow-2xl pointer-events-auto"
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
                {/* Persistent Background Layer */}
                <div
                    className="absolute py-[1px] inset-0 z-0 transition-opacity pointer-events-none overflow-hidden"
                    style={{
                        opacity: viewMode === 'expanded' ? 1 : 0,
                        borderRadius: `${currentUiSize.r}px`,
                        transitionDelay: viewMode === 'expanded' ? '150ms' : '0ms',
                        transitionDuration: viewMode === 'expanded' ? '300ms' : '100ms',
                        transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
                    }}
                >
                    <Silk
                        speed={5}
                        scale={1}
                        color="#4778ffff"
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
                        className="w-full h-full transition-opacity duration-150 ease-out relative z-10"
                        style={{ opacity: contentOpacity }}
                    >
                        {renderContent()}
                    </div>
                </ClickSpark>
            </div>
        </div>
    );
}