import { useEffect, useMemo, useRef, useState } from 'react';
import type { LlmModelInfo } from '@tersoo/contracts';
import { ChevronDownIcon, SearchIcon, XIcon, CheckIcon, BoltIcon } from '../icons';

interface SearchableModelSelectProps {
  models: LlmModelInfo[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  filterVisionOnly?: boolean;
}

export function SearchableModelSelect({
  models,
  value,
  onChange,
  placeholder = 'Select a model...',
  label,
  disabled = false,
  loading = false,
  filterVisionOnly = false,
}: SearchableModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<'all' | 'vision' | 'free'>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const selectedModel = useMemo(() => {
    return models.find((m) => m.id === value) || null;
  }, [models, value]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (filterVisionOnly && !m.supportsVision) return false;
      if (tagFilter === 'vision' && !m.supportsVision) return false;
      if (tagFilter === 'free' && !m.isFree) return false;

      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.provider && m.provider.toLowerCase().includes(q))
      );
    });
  }, [models, search, tagFilter, filterVisionOnly]);

  const formatContext = (ctx?: number) => {
    if (!ctx) return null;
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
    if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}k`;
    return `${ctx}`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', zIndex: isOpen ? 100 : 1 }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginBottom: '6px',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </label>
      )}

      {/* Main Selector Button */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.7)',
          border: isOpen ? '1px solid var(--color-primary)' : '1px solid var(--border-card-highlight)',
          borderRadius: 'var(--radius-md)',
          color: value ? '#ffffff' : 'var(--text-dim)',
          fontSize: '12px',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
          transition: 'all var(--transition-fast)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {selectedModel ? (
            <>
              <span style={{ fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap' }}>
                {selectedModel.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ({selectedModel.id})
              </span>
              {selectedModel.supportsVision && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    color: '#c084fc',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Vision
                </span>
              )}
              {selectedModel.isFree && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 700,
                  }}
                >
                  FREE
                </span>
              )}
            </>
          ) : value ? (
            <span style={{ fontWeight: 600, color: '#ffffff' }}>{value}</span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>
              {loading ? 'Fetching live models...' : placeholder}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
          {loading ? (
            <span style={{ fontSize: '11px', color: 'var(--color-primary)' }}>Loading...</span>
          ) : (
            <ChevronDownIcon size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          )}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            minWidth: '360px',
            maxHeight: '340px',
            background: '#0b1120',
            border: '1px solid var(--border-card-highlight)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search Box Header */}
          <div
            style={{
              padding: '10px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '10px', color: 'var(--text-dim)', display: 'flex' }}>
                <SearchIcon size={14} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models (e.g. deepseek, gemini, claude, flash)..."
                style={{
                  width: '100%',
                  padding: '7px 28px 7px 32px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>

            {/* Quick Filter Tags */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setTagFilter('all')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: tagFilter === 'all' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.05)',
                  color: tagFilter === 'all' ? '#ffffff' : 'var(--text-dim)',
                }}
              >
                All ({models.length})
              </button>
              <button
                type="button"
                onClick={() => setTagFilter('vision')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: tagFilter === 'vision' ? '#9333ea' : 'rgba(255, 255, 255, 0.05)',
                  color: tagFilter === 'vision' ? '#ffffff' : 'var(--text-dim)',
                }}
              >
                Vision Supported
              </button>
              <button
                type="button"
                onClick={() => setTagFilter('free')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: tagFilter === 'free' ? '#059669' : 'rgba(255, 255, 255, 0.05)',
                  color: tagFilter === 'free' ? '#ffffff' : 'var(--text-dim)',
                }}
              >
                Free Tier
              </button>
            </div>
          </div>

          {/* Model Items List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '270px',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {filteredModels.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                <div>No matching models found.</div>
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(search.trim());
                      setIsOpen(false);
                    }}
                    style={{
                      marginTop: '8px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: 'var(--color-primary)',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Use custom model ID: &ldquo;{search.trim()}&rdquo;
                  </button>
                )}
              </div>
            ) : (
              filteredModels.map((item) => {
                const isSelected = item.id === value;
                const ctxStr = formatContext(item.contextLength);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onChange(item.id);
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                      border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#ffffff' : 'var(--text-main)' }}>
                          {item.name}
                        </span>
                        {item.supportsVision && (
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              background: 'rgba(168, 85, 247, 0.15)',
                              color: '#c084fc',
                              fontWeight: 700,
                            }}
                          >
                            Vision
                          </span>
                        )}
                        {item.isFree && (
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              fontWeight: 700,
                            }}
                          >
                            FREE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.id}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {ctxStr && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', background: 'rgba(255, 255, 255, 0.05)', padding: '1px 5px', borderRadius: '3px' }}>
                          {ctxStr}
                        </span>
                      )}
                      {item.pricing?.promptPerM && (
                        <span style={{ fontSize: '10px', color: item.isFree ? '#34d399' : 'var(--text-dim)' }}>
                          {item.pricing.promptPerM}
                        </span>
                      )}
                      {isSelected && <CheckIcon size={14} color="var(--color-primary)" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
