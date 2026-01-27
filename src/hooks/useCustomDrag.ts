import { useRef, useCallback } from 'react';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

const WIN_MAX_W = 1200;
const WIN_MAX_H = 800;

interface DragState {
    startX: number;
    startY: number;
    winStartX: number;
    winStartY: number;
    monitorX: number;
    monitorY: number;
    monitorW: number;
    monitorH: number;
    factor: number;
    widgetW: number;
    widgetH: number;
    alignX: 'start' | 'end';
    alignY: 'start' | 'end';
}

export function useCustomDrag(widgetW: number, widgetH: number, alignX: 'start' | 'end' = 'end', alignY: 'start' | 'end' = 'end') {
    const isDragging = useRef(false);
    const dragState = useRef<DragState | null>(null);
    const mousePos = useRef({ x: 0, y: 0 });
    const isBusy = useRef(false); // Prevent IPC flooding
    const rafId = useRef<number | null>(null);

    const hasDragged = useRef(false);

    // Physics constants
    const DAMPING_FACTOR = 0.5; // Slightly stiffer for better control
    const DRAG_THRESHOLD = 5;

    // Animation Helper
    const animateTo = useCallback((startX: number, startY: number, endX: number, endY: number) => {
        const appWindow = getCurrentWindow();
        let startTime: number | null = null;
        const duration = 600;

        function easeOutElastic(x: number): number {
            const c4 = (2 * Math.PI) / 3;
            return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
        }

        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const ease = easeOutElastic(progress);

            const currentX = startX + (endX - startX) * ease;
            const currentY = startY + (endY - startY) * ease;

            appWindow.setPosition(new PhysicalPosition(Math.round(currentX), Math.round(currentY)))
                .catch(() => { });

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    }, []);

    // The Drag Loop (RAF)
    const updatePosition = useCallback(async () => {
        if (!isDragging.current || !dragState.current) return;

        // If previous IPC call hasn't finished, skip this frame to prevent lag
        if (isBusy.current) {
            rafId.current = requestAnimationFrame(updatePosition);
            return;
        }

        const {
            startX, startY, winStartX, winStartY,
            monitorX, monitorY, monitorW, monitorH,
            factor, widgetW: currentWidgetW, widgetH: currentWidgetH,
            alignX: dragAlignX, alignY: dragAlignY
        } = dragState.current;

        const currentX = mousePos.current.x;
        const currentY = mousePos.current.y;

        const deltaX = (currentX - startX) * factor;
        const deltaY = (currentY - startY) * factor;

        // Check drag threshold
        if (!hasDragged.current && (Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD)) {
            hasDragged.current = true;
        }

        let newX = winStartX + deltaX;
        let newY = winStartY + deltaY;

        // Visual Bounds (Physical)
        const winPhysW = WIN_MAX_W * factor;
        const winPhysH = WIN_MAX_H * factor;
        const wPhys = currentWidgetW * factor;
        const hPhys = currentWidgetH * factor;

        let visualLeft = 0;
        let visualRight = 0;
        let visualTop = 0;
        let visualBottom = 0;

        if (dragAlignX === 'start') {
            visualLeft = newX;
            visualRight = newX + wPhys;
        } else {
            visualLeft = newX + (winPhysW - wPhys);
            visualRight = newX + winPhysW;
        }

        if (dragAlignY === 'start') {
            visualTop = newY;
            visualBottom = newY + hPhys;
        } else {
            visualTop = newY + (winPhysH - hPhys);
            visualBottom = newY + winPhysH;
        }

        // Apply Resistance (Damping)
        if (visualLeft < monitorX) {
            const overshoot = monitorX - visualLeft;
            newX += overshoot * DAMPING_FACTOR;
        }
        if (visualRight > monitorX + monitorW) {
            const overshoot = visualRight - (monitorX + monitorW);
            newX -= overshoot * DAMPING_FACTOR;
        }
        if (visualTop < monitorY) {
            const overshoot = monitorY - visualTop;
            newY += overshoot * DAMPING_FACTOR;
        }
        if (visualBottom > monitorY + monitorH) {
            const overshoot = visualBottom - (monitorY + monitorH);
            newY -= overshoot * DAMPING_FACTOR;
        }

        isBusy.current = true;
        try {
            await getCurrentWindow().setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)));
        } catch (e) {
            // ignore
        } finally {
            isBusy.current = false;
            if (isDragging.current) {
                rafId.current = requestAnimationFrame(updatePosition);
            }
        }
    }, []);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        mousePos.current = { x: e.screenX, y: e.screenY };
    }, []);

    const handlePointerUp = useCallback(async (e: PointerEvent) => {
        if (!isDragging.current) return;

        isDragging.current = false;
        const target = e.target as HTMLElement;
        if (target && target.releasePointerCapture) {
            try {
                target.releasePointerCapture(e.pointerId);
            } catch (err) { }
        }

        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }

        // Wait for final update to settle? 
        // We can just calculate the final snap logic immediately based on last known state.

        if (!dragState.current) return;
        const state = dragState.current;
        dragState.current = null; // Clear state

        const appWindow = getCurrentWindow();
        const currentPos = await appWindow.outerPosition();

        // Calculate Snap Targets
        let targetX = currentPos.x;
        let targetY = currentPos.y;

        const { factor, monitorX, monitorW, monitorY, monitorH, widgetW: wW, widgetH: wH, alignX: dragAlignX, alignY: dragAlignY } = state;
        const winPhysW = WIN_MAX_W * factor;
        const winPhysH = WIN_MAX_H * factor;
        const wPhys = wW * factor;
        const hPhys = wH * factor;

        let visualLeft = 0;
        let visualRight = 0;
        let visualTop = 0;
        let visualBottom = 0;

        if (dragAlignX === 'start') {
            visualLeft = targetX;
            visualRight = targetX + wPhys;
        } else {
            visualLeft = targetX + (winPhysW - wPhys);
            visualRight = targetX + winPhysW;
        }

        if (dragAlignY === 'start') {
            visualTop = targetY;
            visualBottom = targetY + hPhys;
        } else {
            visualTop = targetY + (winPhysH - hPhys);
            visualBottom = targetY + winPhysH;
        }

        let needsSnap = false;

        if (visualLeft < monitorX) {
            const overshoot = monitorX - visualLeft;
            targetX += overshoot;
            needsSnap = true;
        } else if (visualRight > monitorX + monitorW) {
            const overshoot = visualRight - (monitorX + monitorW);
            targetX -= overshoot;
            needsSnap = true;
        }

        if (visualTop < monitorY) {
            const overshoot = monitorY - visualTop;
            targetY += overshoot;
            needsSnap = true;
        } else if (visualBottom > monitorY + monitorH) {
            const overshoot = visualBottom - (monitorY + monitorH);
            targetY -= overshoot;
            needsSnap = true;
        }

        if (needsSnap) {
            animateTo(currentPos.x, currentPos.y, targetX, targetY);
        }

    }, [handlePointerMove, updatePosition, animateTo]);

    const handlePointerDown = useCallback(async (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        // Allow dragging if target or ancestor has data-draggable="true"
        if (target.closest('input, textarea, button, select, a, [role="button"], [data-no-drag]') && !target.closest('[data-draggable="true"]')) {
            return;
        }

        e.preventDefault();

        hasDragged.current = false;

        try {
            target.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn("Failed to capture pointer", err);
        }

        const appWindow = getCurrentWindow();
        try {
            const factor = await appWindow.scaleFactor();
            // Invoke Rust command to get Work Area (Physical Pixels)
            // returns [x, y, width, height]
            const workArea = await invoke<[number, number, number, number]>('get_screen_work_area');
            const [waX, waY, waW, waH] = workArea;

            const outerPos = await appWindow.outerPosition();

            isDragging.current = true;
            mousePos.current = { x: e.screenX, y: e.screenY };

            dragState.current = {
                startX: e.screenX,
                startY: e.screenY,
                winStartX: outerPos.x,
                winStartY: outerPos.y,
                monitorX: waX,
                monitorY: waY,
                monitorW: waW,
                monitorH: waH,
                factor,
                widgetW,
                widgetH,
                alignX,
                alignY
            };

            // We listen on window to be safe, but capture should keep it on target.
            // Using window ensures that if capture is lost/rejected, we still might get events.
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);

            // Start RAF loop
            rafId.current = requestAnimationFrame(updatePosition);

        } catch (err) {
            console.error('Failed to init drag:', err);
        }
    }, [handlePointerMove, handlePointerUp, updatePosition, widgetW, widgetH, alignX, alignY]);

    return { handlePointerDown, isActuallyDragging: () => hasDragged.current };
}
