import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    className?: string;
}

export const Tooltip = ({ content, children, position = 'top', delay = 0.2, className = '' }: TooltipProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (updatePosition()) {
                setIsVisible(true);
            }
        }, delay * 1000);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // We store the anchor point based on the position prop
            // The actual offsetting is done via CSS transforms in the motion component
            // to avoid needing to know the tooltip's dimensions beforehand.

            let top = 0;
            let left = 0;

            switch (position) {
                case 'top':
                    top = rect.top;
                    left = rect.left + rect.width / 2;
                    break;
                case 'bottom':
                    top = rect.bottom;
                    left = rect.left + rect.width / 2;
                    break;
                case 'left':
                    top = rect.top + rect.height / 2;
                    left = rect.left;
                    break;
                case 'right':
                    top = rect.top + rect.height / 2;
                    left = rect.right;
                    break;
            }
            setCoords({ top, left });
            return true;
        }
        return false;
    };

    // Better Approach:
    // Use 'style' to set the transformOrigin and initial translation to the correct side of the anchor point.
    // Then animate opacity and small Y/X shift.

    const getMotionProps = () => {
        switch (position) {
            case 'top':
                return {
                    style: { top: coords.top, left: coords.left, translateX: '-50%', translateY: 'calc(-100% - 8px)' },
                    initial: { opacity: 0, scale: 0.9, y: 4 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    exit: { opacity: 0, scale: 0.9, y: 4 }
                };
            case 'bottom':
                return {
                    style: { top: coords.top, left: coords.left, translateX: '-50%', translateY: '8px' },
                    initial: { opacity: 0, scale: 0.9, y: -4 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    exit: { opacity: 0, scale: 0.9, y: -4 }
                };
            case 'left':
                return {
                    style: { top: coords.top, left: coords.left, translateX: 'calc(-100% - 8px)', translateY: '-50%' },
                    initial: { opacity: 0, scale: 0.9, x: 4 },
                    animate: { opacity: 1, scale: 1, x: 0 },
                    exit: { opacity: 0, scale: 0.9, x: 4 }
                };
            case 'right':
                return {
                    style: { top: coords.top, left: coords.left, translateX: '8px', translateY: '-50%' },
                    initial: { opacity: 0, scale: 0.9, x: -4 },
                    animate: { opacity: 1, scale: 1, x: 0 },
                    exit: { opacity: 0, scale: 0.9, x: -4 }
                };
        }
    };

    const motionProps = getMotionProps();

    return (
        <>
            <div
                ref={triggerRef}
                className="inline-flex w-fit h-fit" // w-fit h-fit to tightly wrap children
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            // onMouseDown={() => setIsVisible(false)} // Optional: hide on click
            >
                {children}
            </div>
            {createPortal(
                <AnimatePresence>
                    {isVisible && (
                        <motion.div
                            {...motionProps}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className={`fixed z-[9999] pointer-events-none ${className}`}
                        >
                            <div className="px-3 py-1.5 bg-[#18181b]/90 backdrop-blur-md border border-white/10 rounded-lg shadow-xl text-xs text-gray-200 font-medium whitespace-nowrap relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                <span className="relative z-10">{content}</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};
