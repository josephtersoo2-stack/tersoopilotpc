import { useEffect, useRef, useState } from 'react';

import { useNotificationsStore } from '../../stores/notificationsStore';
import { useProfilesStore } from '../../stores/profilesStore';
import { BellIcon, BoltIcon, CheckIcon, SearchIcon, SettingsIcon, TrashIcon, XIcon } from '../icons';

export interface TitlebarProps {
  activeView?: string;
  onSelectView?: (view: string) => void;
}

export function Titlebar({ activeView, onSelectView }: TitlebarProps = {}) {
  const { searchQuery, setSearchQuery } = useProfilesStore();
  const { notifications, markAllAsRead, removeNotification, purgeNotifications, initSubscriptions } =
    useNotificationsStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return initSubscriptions();
  }, [initSubscriptions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header
      style={{
        height: '48px',
        background: '#0a0e17',
        borderBottom: '1px solid var(--border-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      {/* Left: Window Controls & App Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* macOS Traffic Lights */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }} />
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#27c93f', display: 'inline-block' }} />
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
            }}
          >
            <BoltIcon size={16} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.02em', color: '#ffffff' }}>
            TersooPilot <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Desktop</span>
          </span>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            v1.0.0
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div style={{ flex: 1, maxWidth: '520px', margin: '0 24px', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: '12px',
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
          placeholder="Search profiles, proxies, tasks (Ctrl+K)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '7px 40px 7px 34px',
            color: 'var(--text-main)',
            fontSize: '12px',
            outline: 'none',
            backdropFilter: 'blur(8px)',
            transition: 'all var(--transition-fast)',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
        />
        <div
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '10px',
            color: 'var(--text-dim)',
            pointerEvents: 'none',
          }}
        >
          Ctrl+K
        </div>
      </div>

      {/* Right: Daemon Status & User Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
        {/* Daemon Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '4px 10px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#34d399',
          }}
        >
          <span className="status-dot online pulse" style={{ width: '6px', height: '6px' }} />
          <span>DAEMON: ONLINE (WAL)</span>
        </div>

        {/* Notifications Bell */}
        <button
          className="btn-icon"
          title="Notifications"
          onClick={() => {
            const next = !showNotifications;
            setShowNotifications(next);
            if (next && unreadCount > 0) {
              markAllAsRead();
            }
          }}
          style={{ position: 'relative' }}
        >
          <BellIcon size={16} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                minWidth: '14px',
                height: '14px',
                padding: '0 3px',
                borderRadius: '7px',
                background: '#f43f5e',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #0a0e17',
                boxShadow: '0 0 6px rgba(244, 63, 94, 0.6)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          className="btn-icon"
          title="Settings"
          onClick={() => onSelectView?.('settings')}
          style={{
            background: activeView === 'settings' ? 'rgba(59, 130, 246, 0.2)' : undefined,
            color: activeView === 'settings' ? 'var(--color-primary)' : undefined,
            border: activeView === 'settings' ? '1px solid rgba(59, 130, 246, 0.4)' : undefined,
          }}
        >
          <SettingsIcon size={16} />
        </button>

        {/* User Profile Avatar */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            border: '2px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '11px',
            color: '#ffffff',
            cursor: 'pointer',
          }}
          title="User Account: John Tersoo"
        >
          JT
        </div>

        {/* Notification Popup Dropdown */}
        {showNotifications && (
          <div
            ref={dropdownRef}
            className="animate-fade-in"
            style={{
              position: 'absolute',
              top: '44px',
              right: '0',
              width: '340px',
              maxHeight: '440px',
              background: '#0f172a',
              border: '1px solid var(--border-card-highlight)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>Notifications</span>
                {notifications.length > 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: 'var(--color-primary)',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}
                  >
                    {notifications.length}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    title="Mark all as read"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      padding: '3px 6px',
                      borderRadius: '4px',
                      transition: 'color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                  >
                    <CheckIcon size={12} />
                    <span>Read</span>
                  </button>
                )}

                {notifications.length > 0 && (
                  <button
                    onClick={() => purgeNotifications()}
                    title="Purge all notifications"
                    style={{
                      background: 'rgba(244, 63, 94, 0.1)',
                      border: '1px solid rgba(244, 63, 94, 0.25)',
                      color: '#fb7185',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.25)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                      e.currentTarget.style.color = '#fb7185';
                    }}
                  >
                    <TrashIcon size={12} />
                    <span>Purge All</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notifications Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: '340px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: 'var(--text-dim)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <BellIcon size={24} style={{ opacity: 0.3 }} />
                  <div>No notifications logged</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Action results, profile state changes, and alerts will be recorded here.
                  </div>
                </div>
              ) : (
                notifications.map((item) => {
                  const dotColor =
                    item.level === 'success'
                      ? '#10b981'
                      : item.level === 'error'
                        ? '#ef4444'
                        : item.level === 'warning'
                          ? '#f59e0b'
                          : '#3b82f6';

                  const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 10px',
                        background: item.read ? 'rgba(255, 255, 255, 0.02)' : 'rgba(59, 130, 246, 0.08)',
                        border: item.read ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        position: 'relative',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: dotColor,
                              boxShadow: `0 0 5px ${dotColor}`,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: item.read ? 'var(--text-main)' : '#ffffff',
                            }}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0 }}>
                            {timeStr}
                          </span>
                          <button
                            onClick={() => removeNotification(item.id)}
                            title="Dismiss notification"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-dim)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '3px',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          lineHeight: '1.4',
                          paddingLeft: '12px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
