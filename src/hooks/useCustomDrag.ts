import { useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Use Tauri's native startDragging for smooth window movement.
 * This resolves stuttering issues associated with manual position updates.
 */
export function useCustomDrag() {
    const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
        // Only respond to left mouse button
        if (e.button !== 0) return;

        // Prevent default behavior to avoid text selection during drag
        e.preventDefault();

        try {
            const appWindow = getCurrentWindow();
            await appWindow.startDragging();
        } catch (err) {
            console.error('Failed to start native drag:', err);
        }
    }, []);

    return { handleMouseDown };
}
