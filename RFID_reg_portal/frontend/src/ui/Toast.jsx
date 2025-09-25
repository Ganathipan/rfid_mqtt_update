import { useEffect, useState } from "react";

export default function Toast({ text, show, onClose, ms = 2500 }) {
  const [open, setOpen] = useState(show);
  useEffect(() => {
    setOpen(show);
    if (show) {
      const t = setTimeout(() => { setOpen(false); onClose?.(); }, ms);
      return () => clearTimeout(t);
    }
  }, [show, ms, onClose]);
  return (
    <div className={`fixed bottom-6 right-6 transition ${open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>
      <div className="rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-white shadow-2xl">{text}</div>
    </div>
  );
}
