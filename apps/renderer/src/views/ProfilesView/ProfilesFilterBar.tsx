import {
  DownloadIcon,
  GridIcon,
  ListIcon,
  RefreshIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';

export function ProfilesFilterBar() {
  const {
    profiles,
    filterPlatform,
    filterEngine,
    filterState,
    filterTag,
    searchQuery,
    viewMode,
    setViewMode,
    setPlatformFilter,
    setEngineFilter,
    setStateFilter,
    setTagFilter,
    setSearchQuery,
    loadProfiles,
    selectedIds,
    launchSelected,
    stopSelected,
    deleteSelected,
    clearSelection,
    openImportModal,
  } = useProfilesStore();

  const hasSelection = selectedIds.size > 0;

  // Extract all unique tags dynamically
  const uniqueTags = Array.from(
    new Set(
      profiles.flatMap((p) => p.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()),
    ),
  ).filter(Boolean);

  const defaultTags = ['farming', 'social', 'banking', 'ecommerce', 'ads', 'automation', 'test'];
  const allAvailableTags = Array.from(new Set([...defaultTags, ...uniqueTags]));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left Filter Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Platform */}
          <div style={{ position: 'relative' }}>
            <select
              className="select"
              value={filterPlatform}
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{ paddingRight: '28px' }}
            >
              <option value="all">Platform: All</option>
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </select>
          </div>

          {/* Engine */}
          <div style={{ position: 'relative' }}>
            <select
              className="select"
              value={filterEngine}
              onChange={(e) => setEngineFilter(e.target.value)}
              style={{ paddingRight: '28px' }}
            >
              <option value="all">Engine: All</option>
              <option value="apostate">Apostate (Chromium)</option>
              <option value="camoufox">Camoufox (Firefox)</option>
            </select>
          </div>

          {/* Status */}
          <div style={{ position: 'relative' }}>
            <select
              className="select"
              value={filterState}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{ paddingRight: '28px' }}
            >
              <option value="all">Status: All</option>
              <option value="running">Running</option>
              <option value="idle">Idle</option>
              <option value="crashed">Crashed</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Dynamic Tags */}
          <div style={{ position: 'relative' }}>
            <select
              className="select"
              value={filterTag}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{ paddingRight: '28px' }}
            >
              <option value="all">Tag: All</option>
              {allAvailableTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </div>

          {/* Search by Name, IP or Tag */}
          <div style={{ position: 'relative', width: '260px' }}>
            <div
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <SearchIcon size={14} />
            </div>
            <input
              type="text"
              className="input"
              placeholder="Search by name, IP or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '32px', paddingRight: searchQuery ? '28px' : '10px' }}
            />
            {searchQuery && (
              <button
                className="btn-icon"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '2px',
                }}
                title="Clear Search"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: View Mode, Import, Export, Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* View Mode Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
            }}
          >
            <button
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: viewMode === 'table' ? '#60a5fa' : 'var(--text-dim)',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
              }}
              title="Table View"
            >
              <ListIcon size={13} />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                background: viewMode === 'grid' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: viewMode === 'grid' ? '#60a5fa' : 'var(--text-dim)',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
              }}
              title="Grid Cards View"
            >
              <GridIcon size={13} />
              <span>Grid</span>
            </button>
          </div>

          {/* Import / Export JSON */}
          <button
            className="btn btn-secondary"
            onClick={openImportModal}
            title="Import or Export Profile JSON"
            style={{ padding: '6px 10px', fontSize: '11px' }}
          >
            <UploadIcon size={12} />
            <span>Import / Export</span>
          </button>

          {/* Refresh */}
          <button
            className="btn btn-secondary"
            onClick={() => void loadProfiles()}
            title="Refresh Profiles List"
            style={{ padding: '6px 10px', fontSize: '11px' }}
          >
            <RefreshIcon size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Floating Bulk Action Bar when items selected */}
      {hasSelection && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.4) 0%, rgba(88, 28, 135, 0.4) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 16px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '12px' }}>
              {selectedIds.size} profile{selectedIds.size > 1 ? 's' : ''} selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-success" onClick={() => void launchSelected()}>
              Launch Selected
            </button>
            <button className="btn btn-secondary" onClick={() => void stopSelected()}>
              Stop Selected
            </button>
            <button
              className="btn btn-secondary"
              onClick={openImportModal}
              title="Export selected profiles to JSON"
            >
              <DownloadIcon size={12} />
              <span>Export Selected</span>
            </button>
            <button className="btn btn-danger" onClick={() => void deleteSelected()}>
              Delete Selected
            </button>
            <button
              className="btn btn-secondary"
              onClick={clearSelection}
              style={{ background: 'transparent', borderColor: 'transparent' }}
            >
              Deselect All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
