import { useState, useEffect, useRef } from "react";
import {
    X,
    Minus,
    GripVertical
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
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import DatabaseManager from "./DatabaseManager";
import RedisManager from "./RedisManager";
import PostgresManager from "./PostgresManager";
import MySQLManager from "./MySQLManager";
import SQLiteManager from "./SQLiteManager";
import { useCustomDrag } from "../hooks/useCustomDrag";
import ClickSpark from "./ClickSpark";
import Silk from "./BG";



// UI 尺寸定义
const UI_SIZES = {
    collapsed: { w: 56, h: 56, r: 28 },
    toolbar: { w: 200, h: 56, r: 28 }, // Initial visible width
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
    const [visibleContent, setVisibleContent] = useState<'toolbar' | 'collapsed' | 'expanded'>('toolbar');
    const [contentOpacity, setContentOpacity] = useState(1);

    const [currentUiSize, setCurrentUiSize] = useState(UI_SIZES.toolbar);

    const [layoutAlign, setLayoutAlign] = useState<{ x: 'start' | 'end', y: 'start' | 'end' }>({ x: 'end', y: 'end' });

    const isAnimatingRef = useRef(false);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // 智能动态调整工具栏宽度
    useEffect(() => {
        if (viewMode === 'toolbar' && toolbarRef.current) {
            const updateSize = () => {
                // 核心修复：如果正在动画过程中，跳过测量更新，防止捕获错误的中间宽度
                if (isAnimatingRef.current) return;

                // 使用 scrollWidth 获取内容真实需要的宽度，不受容器限制
                const width = toolbarRef.current?.scrollWidth || 0;
                if (width > 0 && Math.abs(width - currentUiSize.w) > 1) { // 增加容错，避免微小抖动
                    setCurrentUiSize(prev => ({ ...prev, w: width }));
                    invoke('update_click_region', {
                        width: width,
                        height: UI_SIZES.toolbar.h,
                        alignX: layoutAlign.x,
                        alignY: layoutAlign.y
                    });
                }
            };

            const observer = new ResizeObserver(() => {
                // 防止频繁触发，放入 requestAnimationFrame
                requestAnimationFrame(updateSize);
            });

            observer.observe(toolbarRef.current);
            // 初始延迟测量，确保 DOM 已经完全按照样式渲染完毕
            // 缩短延迟，使其在大部分布局完成后尽早同步
            const timer = setTimeout(updateSize, 60);

            return () => {
                observer.disconnect();
                clearTimeout(timer);
            };
        }
    }, [viewMode, layoutAlign, t]); // 移除了 currentUiSize.w 依赖，避免不必要的重新绑定

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
                                    activeService={connectedService}
                                    onDragStart={handleDragStart}
                                />
                            )}
                        </div>
                    </div>
                );
            default:

                return (
                    <div
                        ref={toolbarRef}
                        className="flex items-center h-full px-3 gap-1.5 bg-[#18181b] whitespace-nowrap"
                        style={{ minWidth: 'max-content' }} // 确保内容始终完全渲染，不被父级裁剪
                    >
                        <div className="cursor-move text-gray-500 hover:text-gray-300 transition-colors shrink-0" onPointerDown={handleDragStart}>
                            <GripVertical size={20} />
                        </div>
                        <button
                            onClick={() => handleChangeMode('expanded')}
                            className={`flex items-center justify-between gap-3 px-2 py-2 rounded-lg transition-colors shrink-0 ${connectedService ? 'text-blue-400 hover:bg-white/5' : 'text-gray-400 hover:bg-white/5 hover:text-white group'}`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {getServiceIcon(connectedService)}
                                <span className="text-sm font-medium truncate" style={{ color: getServiceColor() }} title={currentConnectionName || ''}>{connectedService ? (currentConnectionName || connectedService) : t('brand_name')}</span>
                            </div>

                            {
                                !connectedService && (
                                    <div className="flex items-center ml-2 shrink-0">
                                        <div className="flex items-center -space-x-2.5 hover:-space-x-1 transition-all duration-300 ease-out group/icons">
                                            {[SQLiteIcon, PostgresIcon, MySQLIcon, MongoIconSingle, RedisIcon].map((Icon, i) => (
                                                <div
                                                    key={i}
                                                    className="w-6 h-6 rounded-full bg-[#1e1e22] flex items-center justify-center border border-white/10 shadow-sm relative transition-all duration-300 hover:scale-125 hover:z-20 hover:border-blue-500/50"
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
                            <button onClick={() => handleChangeMode('collapsed')} className="p-2 text-gray-400 rounded-md hover:bg-white/5 hover:text-white transition-colors">
                                <Minus size={16} />
                            </button>
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
                    width: `${currentUiSize.w}px`,
                    height: `${currentUiSize.h}px`,
                    borderRadius: `${currentUiSize.r}px`,
                    clipPath: `inset(0px round ${currentUiSize.r}px)`,
                    // 增加 1.5px 的实体扩边，彻底封死背景。同时使用无偏移的阴影。
                    boxShadow: '0 0 0 1.5px #18181b, 0 8px 24px rgba(0, 0, 0, 0.5)',
                    willChange: 'width, height',
                    transitionProperty: 'width, height, border-radius',
                    transitionDuration: `${ANIMATION_DURATION}ms`,
                    transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
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
                        className={`${viewMode === 'toolbar' ? 'w-fit' : 'w-full'} h-full transition-opacity duration-150 ease-out relative z-10`}
                        style={{ opacity: contentOpacity }}
                    >
                        {renderContent()}
                    </div>
                </ClickSpark>
            </div>
        </div>
    );
}