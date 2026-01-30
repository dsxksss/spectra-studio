import { useRef, useCallback } from 'react';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';



interface MonitorArea {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface DragState {
    startX: number;
    startY: number;
    winStartX: number;
    winStartY: number;
    allMonitors: MonitorArea[];
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

    // Helper to calculate overshoot across all monitors
    const calculateOvershoot = (x: number, y: number, w: number, h: number, monitors: MonitorArea[]) => {
        let minDx = 0;
        let minDy = 0;

        // Find if we are inside ANY monitor. If yes, no overshoot (simplistic but effective)
        // More advanced: find the monitor with MOST overlap and calculate overshoot from there, 
        // but ONLY if the overshoot isn't covered by another monitor.

        const isPointInMonitors = (px: number, py: number) => {
            return monitors.some(m => px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h);
        };

        const rectsOverlap = (r1: { x: number, y: number, w: number, h: number }, r2: MonitorArea) => {
            return !(r1.x + r1.w <= r2.x || r1.x >= r2.x + r2.w || r1.y + r1.h <= r2.y || r1.y >= r2.y + r2.h);
        };

        // If the rectangle overlaps with any monitor, we check edges
        const overlappingMonitors = monitors.filter(m => rectsOverlap({ x, y, w, h }, m));

        if (overlappingMonitors.length > 0) {
            // We are at least partially on screen. 
            // Only dampen if an edge is "out of bounds" and NO monitor covers that direction.

            // Checking Left
            if (!isPointInMonitors(x, y + h / 2)) {
                // Find nearest left boundary
                const nearestLeft = Math.min(...monitors.map(m => m.x));
                if (x < nearestLeft) minDx = nearestLeft - x;
            }
            // Checking Right
            if (!isPointInMonitors(x + w, y + h / 2)) {
                const furthestRight = Math.max(...monitors.map(m => m.x + m.w));
                if (x + w > furthestRight) minDx = furthestRight - (x + w);
            }
            // Checking Top
            if (!isPointInMonitors(x + w / 2, y)) {
                const nearestTop = Math.min(...monitors.map(m => m.y));
                if (y < nearestTop) minDy = nearestTop - y;
            }
            // Checking Bottom
            if (!isPointInMonitors(x + w / 2, y + h)) {
                const furthestBottom = Math.max(...monitors.map(m => m.y + m.h));
                if (y + h > furthestBottom) minDy = furthestBottom - (y + h);
            }
        } else {
            // Fully off-screen? Snap to nearest monitor.
            // Find "closest" monitor
            let closestM = monitors[0];
            let minDist = Infinity;
            for (const m of monitors) {
                const dx = Math.max(m.x - (x + w), 0, x - (m.x + m.w));
                const dy = Math.max(m.y - (y + h), 0, y - (m.y + m.h));
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    closestM = m;
                }
            }

            if (x < closestM.x) minDx = closestM.x - x;
            else if (x + w > closestM.x + closestM.w) minDx = (closestM.x + closestM.w) - (x + w);

            if (y < closestM.y) minDy = closestM.y - y;
            else if (y + h > closestM.y + closestM.h) minDy = (closestM.y + closestM.h) - (y + h);
        }

        return { dx: minDx, dy: minDy };
    };

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
            allMonitors,
            factor, widgetW: currentWidgetW, widgetH: currentWidgetH
        } = dragState.current;

        const currentX = mousePos.current.x;
        const currentY = mousePos.current.y;

        const deltaX = (currentX - startX) * factor;
        const deltaY = (currentY - startY) * factor;

        if (!hasDragged.current && (Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD)) {
            hasDragged.current = true;
        }

        let newX = winStartX + deltaX;
        let newY = winStartY + deltaY;

        // Calculate physical dimensions for overshoot detection
        const wPhys = currentWidgetW * factor;
        const hPhys = currentWidgetH * factor;

        // With the new architecture, the window size exactly matches the widget size.
        // So the visual top-left is simply the window's position (newX, newY).
        const visualLeft = newX;
        const visualTop = newY;

        // Intelligent Damping
        const overshoot = calculateOvershoot(visualLeft, visualTop, wPhys, hPhys, allMonitors);
        newX += overshoot.dx * DAMPING_FACTOR;
        newY += overshoot.dy * DAMPING_FACTOR;

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

        if (!dragState.current) return;
        const state = dragState.current;
        dragState.current = null; // Clear state

        const appWindow = getCurrentWindow();
        const currentPos = await appWindow.outerPosition();

        // Calculate Snap Targets
        let targetX = currentPos.x;
        let targetY = currentPos.y;

        const { factor, allMonitors, widgetW: wW, widgetH: wH } = state;
        const winPhysW = wW * factor;
        const winPhysH = wH * factor;

        // Visual position IS the window position now
        const vLeft = targetX;
        const vTop = targetY;

        const overshoot = calculateOvershoot(vLeft, vTop, winPhysW, winPhysH, allMonitors);

        if (Math.abs(overshoot.dx) > 1 || Math.abs(overshoot.dy) > 1) {
            animateTo(currentPos.x, currentPos.y, currentPos.x + overshoot.dx, currentPos.y + overshoot.dy);
        }

    }, [handlePointerMove, animateTo]);

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
            // Fetch ALL monitor work areas for intelligent boundary detection
            const monitorData = await invoke<[number, number, number, number][]>('get_all_monitors_work_area');
            const allMonitors = monitorData.map(([x, y, w, h]) => ({ x, y, w, h }));

            const outerPos = await appWindow.outerPosition();

            isDragging.current = true;
            mousePos.current = { x: e.screenX, y: e.screenY };

            dragState.current = {
                startX: e.screenX,
                startY: e.screenY,
                winStartX: outerPos.x,
                winStartY: outerPos.y,
                allMonitors,
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
