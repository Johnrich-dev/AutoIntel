import { useState, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export function TagInput({
  label,
  tags,
  onChange,
  placeholder = 'Type and press Enter...',
  maxTags = 50,
  className = '',
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  
  // Ensure tags is always an array
  const safeTags = Array.isArray(tags) ? tags : [];

  // Normalize a tag: lowercase, trim, remove extra spaces
  const normalizeTag = (tag: string): string => {
    return tag
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  };

  const addTag = (rawTag: string) => {
    const normalizedTag = normalizeTag(rawTag);
    
    if (!normalizedTag) return;
    if (safeTags.includes(normalizedTag)) return; // Avoid duplicates
    if (safeTags.length >= maxTags) return;

    onChange([...safeTags, normalizedTag]);
    setInputValue('');
  };

  const removeTag = (index: number) => {
    onChange(safeTags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        <span className="text-gray-400 text-xs ml-2">({safeTags.length}/{maxTags})</span>
      </label>
      
      <div className="min-h-[100px] p-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        <div className="flex flex-wrap gap-2 mb-2">
          {safeTags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-md"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="hover:bg-blue-200 rounded p-0.5 transition-colors"
                title="Remove tag"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400"
            disabled={tags.length >= maxTags}
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Add tag"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      <p className="text-xs text-gray-500">
        Press Enter to add a tag. Tags are converted to lowercase and duplicates are removed.
      </p>
    </div>
  );
}
