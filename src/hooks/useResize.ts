import { useRef, useCallback } from 'react';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
    startX: number;
    startY: number;
    startWinX: number;
    startWinY: number;
    startWidth: number;
    startHeight: number;
    corner: ResizeCorner;
    workArea: { x: number; y: number; w: number; h: number };
    lastW?: number;
    lastH?: number;
}

export function useResize(minWidth = 1200, minHeight = 800) {
    const isResizing = useRef(false);
    const resizeState = useRef<ResizeState | null>(null);
    const mousePos = useRef({ x: 0, y: 0 });
    const rafId = useRef<number | null>(null);

    // Callback ref to persist the latest handler
    const onResizeEndRef = useRef<((w: number, h: number) => void) | null>(null);

    const updateResize = useCallback(async () => {
        if (!isResizing.current || !resizeState.current) return;

        const {
            startX, startY, startWinX, startWinY,
            startWidth, startHeight,
            corner
        } = resizeState.current;

        const currentX = mousePos.current.x;
        const currentY = mousePos.current.y;

        const deltaX = (currentX - startX);
        const deltaY = (currentY - startY);

        let newX = startWinX;
        let newY = startWinY;
        let newWidth = startWidth;
        let newHeight = startHeight;

        // Apply resizing logic
        switch (corner) {
            case 'se': // Bottom-Right
                newWidth = startWidth + deltaX;
                newHeight = startHeight + deltaY;
                break;
            case 'sw': // Bottom-Left
                newWidth = startWidth - deltaX;
                newHeight = startHeight + deltaY;
                newX = startWinX + deltaX;
                break;
            case 'ne': // Top-Right
                newWidth = startWidth + deltaX;
                newHeight = startHeight - deltaY;
                newY = startWinY + deltaY;
                break;
            case 'nw': // Top-Left
                newWidth = startWidth - deltaX;
                newHeight = startHeight - deltaY;
                newX = startWinX + deltaX;
                newY = startWinY + deltaY;
                break;
        }

        // Min Size Constraints (Logical Units)
        if (newWidth < minWidth) {
            if (corner === 'sw' || corner === 'nw') newX = startWinX + (startWidth - minWidth);
            newWidth = minWidth;
        }
        if (newHeight < minHeight) {
            if (corner === 'ne' || corner === 'nw') newY = startWinY + (startHeight - minHeight);
            newHeight = minHeight;
        }

        // Apply to window
        try {
            const appWindow = getCurrentWindow();
            await Promise.all([
                appWindow.setPosition(new LogicalPosition(newX, newY)),
                appWindow.setSize(new LogicalSize(newWidth, newHeight))
            ]);

            // Sync click region
            invoke('update_click_region', {
                width: newWidth,
                height: newHeight,
                alignX: 'start',
                alignY: 'start'
            }).catch(() => { });

            // Update current state
            if (resizeState.current) {
                resizeState.current.lastW = newWidth;
                resizeState.current.lastH = newHeight;
            }

        } catch (e) {
            console.error(e);
        }

        if (isResizing.current) {
            rafId.current = requestAnimationFrame(updateResize);
        }
    }, [minWidth, minHeight]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        mousePos.current = { x: e.screenX, y: e.screenY };
    }, []);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (!isResizing.current) return;
        isResizing.current = false;

        const target = e.target as HTMLElement;
        try { target.releasePointerCapture(e.pointerId); } catch { }

        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }

        // Trigger ONE final state update
        if (resizeState.current && resizeState.current.lastW !== undefined && resizeState.current.lastH !== undefined && onResizeEndRef.current) {
            onResizeEndRef.current(resizeState.current.lastW, resizeState.current.lastH);
        }

        resizeState.current = null;
    }, [handlePointerMove]);

    const handleResizeStart = useCallback(async (
        e: React.PointerEvent,
        corner: ResizeCorner,
        _w: number, // Legacy args
        _h: number,
        _ax: any,
        _ay: any,
        onResizeEnd: (width: number, height: number) => void
    ) => {
        if (e.button !== 0) return;
        e.preventDefault();

        const target = e.target as HTMLElement;
        try { target.setPointerCapture(e.pointerId); } catch { }

        const appWindow = getCurrentWindow();
        try {
            const factor = await appWindow.scaleFactor();
            const physPos = await appWindow.outerPosition();
            const logPos = { x: physPos.x / factor, y: physPos.y / factor };
            const innerSize = await appWindow.innerSize();
            const logSize = { w: innerSize.width / factor, h: innerSize.height / factor };

            isResizing.current = true;
            onResizeEndRef.current = onResizeEnd;
            mousePos.current = { x: e.screenX, y: e.screenY };

            resizeState.current = {
                startX: e.screenX,
                startY: e.screenY,
                startWinX: logPos.x,
                startWinY: logPos.y,
                startWidth: logSize.w,
                startHeight: logSize.h,
                corner,
                workArea: { x: 0, y: 0, w: 0, h: 0 },
                lastW: logSize.w,
                lastH: logSize.h
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);

            // Kickoff loop
            rafId.current = requestAnimationFrame(updateResize);

        } catch (err) {
            console.error("Failed to init manual resize", err);
            isResizing.current = false;
        }
    }, [handlePointerMove, handlePointerUp, updateResize]);

    return { handleResizeStart, isResizing: () => isResizing.current };
}
