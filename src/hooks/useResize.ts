import { useRef, useCallback } from 'react';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
    startX: number;
    startY: number;
    startWinX: number;
    startWinY: number;
    startWidth: number;
    startHeight: number;
    factor: number;
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
            factor, corner, workArea: _workArea
        } = resizeState.current;

        const currentX = mousePos.current.x;
        const currentY = mousePos.current.y;

        // Calculate delta (assuming mouse pixels match screen pixels)
        // Usually, screenX/Y are logical or physical depending on OS, 
        // but let's assume raw delta needs scaling if we work in physical coordinates.
        // Actually, if we compare screen-to-screen, standard delta is fine.
        const deltaX = (currentX - startX) * factor;
        const deltaY = (currentY - startY) * factor;

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

        // Min Size Constraints (Physical Pixels)
        const minW = minWidth * factor;
        const minH = minHeight * factor;

        if (newWidth < minW) {
            if (corner === 'sw' || corner === 'nw') newX = startWinX + (startWidth - minW);
            newWidth = minW;
        }
        if (newHeight < minH) {
            if (corner === 'ne' || corner === 'nw') newY = startWinY + (startHeight - minH);
            newHeight = minH;
        }

        // Apply to window
        try {
            const appWindow = getCurrentWindow();
            // Apply to window atomically-ish
            await Promise.all([
                appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY))),
                appWindow.setSize(new PhysicalSize(Math.round(newWidth), Math.round(newHeight)))
            ]);

            // Sync click region - fire and forget
            invoke('update_click_region', {
                width: newWidth / factor,
                height: newHeight / factor,
                alignX: 'start',
                alignY: 'start'
            }).catch(() => { });

            // Update current state for the "End" handler to use the latest values
            if (resizeState.current) {
                resizeState.current.lastW = newWidth / factor;
                resizeState.current.lastH = newHeight / factor;
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
            const outerPos = await appWindow.outerPosition();
            const innerSize = await appWindow.innerSize();
            // const wa = await invoke<[number, number, number, number]>('get_screen_work_area'); // Removed unused

            isResizing.current = true;
            onResizeEndRef.current = onResizeEnd;
            mousePos.current = { x: e.screenX, y: e.screenY };

            resizeState.current = {
                startX: e.screenX,
                startY: e.screenY,
                startWinX: outerPos.x,
                startWinY: outerPos.y,
                startWidth: innerSize.width,
                startHeight: innerSize.height,
                factor,
                corner,
                workArea: { x: 0, y: 0, w: 0, h: 0 }, // unused
                lastW: innerSize.width / factor,
                lastH: innerSize.height / factor
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
