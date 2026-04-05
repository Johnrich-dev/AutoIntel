import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterDropdownOption[];
  icon?: React.ReactNode;
  placeholder?: string;
  className?: string;
  /** Width of the trigger button, e.g. 'w-48' or 'w-full'. Defaults to 'w-full'. */
  width?: string;
}

export function FilterDropdown({
  value,
  onChange,
  options,
  icon,
  className = '',
  width = 'w-full',
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? options[0]?.label ?? '';

  return (
    <div ref={ref} className={`relative ${width} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full h-10 px-3 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors bg-white text-left"
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <span className="flex-1 truncate text-gray-700">{label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-full max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                value === opt.value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
