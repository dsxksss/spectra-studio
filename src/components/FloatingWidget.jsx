import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

// Floating circular button with minimize/maximize/close controls using Framer Motion
export default function FloatingWidget() {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const fabRef = useRef(null);

  // Keep the widget within viewport on resize
  useEffect(() => {
    const ensureInViewport = () => {
      const el = fabRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      let nextX = rect.left;
      let nextY = rect.top;
      if (nextX > maxX) nextX = maxX;
      if (nextY > maxY) nextY = maxY;
      el.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    };
    window.addEventListener("resize", ensureInViewport);
    return () => window.removeEventListener("resize", ensureInViewport);
  }, []);

  if (closed) return null;

  const handleClose = () => setClosed(true);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        pointerEvents: "auto",
      }}
    >
      {/* Draggable circular button */}
      <motion.button
        ref={fabRef}
        drag="xy"
        dragElastic={0.2}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          border: "none",
          cursor: "grab",
          outline: "none",
          color: "#1a1a1a",
          background:
            "conic-gradient(from 180deg at 50% 50%, #ffffff 0deg, #f0f5ff 180deg, #e0f2ff 360deg)",
          boxShadow: "0 6px 18px rgba(0,0,0,.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Floating action"
      >
        <span style={{ fontSize: 26, fontWeight: 700 }}>?</span>
      </motion.button>

      {/* Controls panel (minimize / maximize / close) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.95 }}
            animate={{ opacity: 1, x: -8, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.95 }}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <ControlButton label="Min" onClick={() => setOpen(false)} />
            <ControlButton label="Max" onClick={() => setOpen(false)} />
            <ControlButton label="Close" onClick={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        border: "none",
        background: "#fff",
        boxShadow: "0 2px 6px rgba(0,0,0,.15)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );
}
