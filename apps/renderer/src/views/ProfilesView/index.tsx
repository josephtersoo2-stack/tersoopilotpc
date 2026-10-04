import { useEffect } from 'react';

import { subscribeIpc } from '../../lib/ipc';
import { useProfilesStore } from '../../stores/profilesStore';

import { BehavioralPersonaModal } from './BehavioralPersonaModal';
import { CreateProfileModal } from './CreateProfileModal';
import { ImportExportModal } from './ImportExportModal';
import { ProfileInspector } from './ProfileInspector';
import { ProfilesFilterBar } from './ProfilesFilterBar';
import { ProfileStudioHeader } from './ProfileStudioHeader';
import { ProfilesTable } from './ProfilesTable';

export function ProfilesView() {
  const { loadProfiles, handleStateChanged } = useProfilesStore();

  useEffect(() => {
    // Initial load
    void loadProfiles();

    // Subscribe to live state change events from Electron main process
    const unsubscribeState = subscribeIpc('profile.state_changed', (payload) => {
      handleStateChanged(payload);
    });

    const unsubscribeCreated = subscribeIpc('profile.created', () => {
      void loadProfiles();
    });

    const unsubscribeDeleted = subscribeIpc('profile.deleted', () => {
      void loadProfiles();
    });

    const unsubscribeLeaseAcquired = subscribeIpc('lease.acquired', () => {
      void loadProfiles();
    });

    const unsubscribeLeaseReleased = subscribeIpc('lease.released', () => {
      void loadProfiles();
    });

    return () => {
      unsubscribeState();
      unsubscribeCreated();
      unsubscribeDeleted();
      unsubscribeLeaseAcquired();
      unsubscribeLeaseReleased();
    };
  }, [loadProfiles, handleStateChanged]);

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
      {/* Header with Title and Metrics */}
      <ProfileStudioHeader />

      {/* Filter and Actions Bar */}
      <ProfilesFilterBar />

      {/* Main Profiles Table */}
      <ProfilesTable />

      {/* Side Profile Inspector Drawer */}
      <ProfileInspector />

      {/* Create / Edit Profile Modal */}
      <CreateProfileModal />

      {/* Import / Export JSON Modal */}
      <ImportExportModal />

      {/* Behavioral Persona & Multi-Niche Modal */}
      <BehavioralPersonaModal />
    </div>
  );
}

export default ProfilesView;
