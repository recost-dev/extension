import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}

export function Select({ value, onChange, options }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 bg-black/60 border border-white/[0.1] rounded-xl px-4 py-2.5 text-[13px] text-white cursor-pointer hover:border-white/[0.18] transition-colors whitespace-nowrap"
      >
        <span style={{ color: 'rgba(255,255,255,0.75)' }}>{selected?.label}</span>
        <ChevronDown
          size={13}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'rgba(255,255,255,0.35)' }}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-full z-50 overflow-hidden rounded-xl border border-white/[0.1] shadow-2xl" style={{ background: 'rgba(8,8,8,0.97)', backdropFilter: 'blur(20px)' }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[0.06]"
              style={{
                color: opt.value === value ? '#4EAA57' : 'rgba(255,255,255,0.65)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
