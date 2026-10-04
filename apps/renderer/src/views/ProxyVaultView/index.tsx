import { useEffect } from 'react';

import { subscribeIpc } from '../../lib/ipc';
import { useProfilesStore } from '../../stores/profilesStore';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

import { AddProxyModal } from './AddProxyModal';
import { BindProxyModal } from './BindProxyModal';
import { BulkIngestModal } from './BulkIngestModal';
import { ProxyVaultFilterBar } from './ProxyVaultFilterBar';
import { ProxyVaultHeader } from './ProxyVaultHeader';
import { ProxyVaultTable } from './ProxyVaultTable';

export function ProxyVaultView() {
  const { loadProxies, handleHealthChanged, handleLeaseAcquired, handleLeaseReleased } =
    useProxyVaultStore();
  const { loadProfiles } = useProfilesStore();

  useEffect(() => {
    // Initial load
    void loadProxies();
    void loadProfiles();

    // Subscribe to IPC proxy & lease events from main process
    const unsubscribeHealth = subscribeIpc('proxy.health_changed', (payload) => {
      handleHealthChanged(payload);
    });

    const unsubscribeLeaseAcquired = subscribeIpc('lease.acquired', (payload) => {
      handleLeaseAcquired(payload);
      void loadProfiles();
    });

    const unsubscribeLeaseReleased = subscribeIpc('lease.released', (payload) => {
      handleLeaseReleased(payload);
      void loadProfiles();
    });

    return () => {
      unsubscribeHealth();
      unsubscribeLeaseAcquired();
      unsubscribeLeaseReleased();
    };
  }, [loadProxies, loadProfiles, handleHealthChanged, handleLeaseAcquired, handleLeaseReleased]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 32px',
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Top Banner and Metric Cards */}
      <ProxyVaultHeader />

      {/* Filter and Multi-Action Bar */}
      <ProxyVaultFilterBar />

      {/* Main Proxy Table */}
      <ProxyVaultTable />

      {/* Modals */}
      <AddProxyModal />
      <BulkIngestModal />
      <BindProxyModal />
    </div>
  );
}

export default ProxyVaultView;
