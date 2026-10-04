import { useState, useEffect } from 'react';
import { DEFAULT_PRESET_IDS } from '@tersoo/contracts';

import {
  AndroidIcon,
  AppleIcon,
  BoltIcon,
  CheckIcon,
  DeviceMobileIcon,
  KeyboardIcon,
  PlusIcon,
  RefreshIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SlidersIcon,
  WindowsIcon,
  XIcon,
} from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';
import { useNichesStore } from '../../stores/nichesStore';

interface OsVersion {
  id: string;
  name: string;
  desc: string;
  presetId: string;
  platform: 'windows' | 'macos' | 'android';
  resolution: string;
  cpuCores: number;
  memoryGb: number;
  webglRenderer: string;
}

interface OsFamily {
  key: 'windows' | 'macos' | 'android' | 'ios';
  name: string;
  icon: typeof WindowsIcon;
  color: string;
  versions: OsVersion[];
}

const OS_OPTIONS: OsFamily[] = [
  {
    key: 'windows',
    name: 'Windows',
    icon: WindowsIcon,
    color: '#00a4ef',
    versions: [
      {
        id: 'win-11-24h2',
        name: 'Windows 11 (24H2)',
        desc: 'Chrome 128 / RTX 4070',
        presetId: DEFAULT_PRESET_IDS.windows11,
        platform: 'windows',
        resolution: '1920 × 1080 (Full HD)',
        cpuCores: 8,
        memoryGb: 16,
        webglRenderer: 'NVIDIA Corporation / NVIDIA GeForce RTX 4070 Direct3D11',
      },
      {
        id: 'win-11-23h2',
        name: 'Windows 11 (23H2)',
        desc: 'Chrome 126 / RTX 4080',
        presetId: DEFAULT_PRESET_IDS.windows11,
        platform: 'windows',
        resolution: '2560 × 1440 (2K QHD)',
        cpuCores: 12,
        memoryGb: 32,
        webglRenderer: 'NVIDIA Corporation / NVIDIA GeForce RTX 4080 Direct3D11',
      },
      {
        id: 'win-10-22h2',
        name: 'Windows 10 (22H2)',
        desc: 'Chrome 124 / GTX 1660',
        presetId: DEFAULT_PRESET_IDS.windows10,
        platform: 'windows',
        resolution: '1920 × 1080 (Full HD)',
        cpuCores: 8,
        memoryGb: 16,
        webglRenderer: 'NVIDIA Corporation / NVIDIA GeForce GTX 1660 SUPER',
      },
    ],
  },
  {
    key: 'macos',
    name: 'macOS',
    icon: AppleIcon,
    color: '#ffffff',
    versions: [
      {
        id: 'macos-15-sequoia',
        name: 'macOS 15 Sequoia',
        desc: 'Safari 18 / Apple M3 Pro',
        presetId: DEFAULT_PRESET_IDS.macosSequoia,
        platform: 'macos',
        resolution: '1728 × 1117 (MacBook Pro 16)',
        cpuCores: 12,
        memoryGb: 36,
        webglRenderer: 'Apple / ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
      },
      {
        id: 'macos-14-sonoma',
        name: 'macOS 14 Sonoma',
        desc: 'Safari 17 / Apple M2',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '1440 × 900 (MacBook)',
        cpuCores: 8,
        memoryGb: 16,
        webglRenderer: 'Apple / ANGLE (Apple, Apple M2, OpenGL 4.1)',
      },
      {
        id: 'macos-13-ventura',
        name: 'macOS 13 Ventura',
        desc: 'Safari 16 / Apple M1',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '1440 × 900 (MacBook)',
        cpuCores: 8,
        memoryGb: 16,
        webglRenderer: 'Apple / ANGLE (Apple, Apple M1, OpenGL 4.1)',
      },
      {
        id: 'macos-12-monterey',
        name: 'macOS 12 Monterey',
        desc: 'Safari 15 / Intel Core i7',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '1440 × 900 (MacBook)',
        cpuCores: 6,
        memoryGb: 16,
        webglRenderer: 'Intel Inc. / Intel Iris Plus Graphics 655',
      },
    ],
  },
  {
    key: 'android',
    name: 'Android',
    icon: AndroidIcon,
    color: '#3ddc84',
    versions: [
      {
        id: 'android-16',
        name: 'Android 16 (Preview)',
        desc: 'Pixel 9 Pro / Chrome 129',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '412 × 915 (Pixel Mobile)',
        cpuCores: 8,
        memoryGb: 16,
        webglRenderer: 'ARM / Mali-G715 MC11',
      },
      {
        id: 'android-15',
        name: 'Android 15 (Vanilla)',
        desc: 'Pixel 9 / Chrome 128',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '412 × 915 (Pixel Mobile)',
        cpuCores: 8,
        memoryGb: 12,
        webglRenderer: 'ARM / Mali-G715 MC11',
      },
      {
        id: 'android-14',
        name: 'Android 14 (Upside Down)',
        desc: 'Pixel 8 Pro / Adreno 750',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '412 × 915 (Pixel Mobile)',
        cpuCores: 8,
        memoryGb: 8,
        webglRenderer: 'Qualcomm / Adreno (TM) 750',
      },
      {
        id: 'android-13',
        name: 'Android 13 (Tiramisu)',
        desc: 'Galaxy S23 / Adreno 740',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '390 × 844 (Galaxy Mobile)',
        cpuCores: 8,
        memoryGb: 8,
        webglRenderer: 'Qualcomm / Adreno (TM) 740',
      },
      {
        id: 'android-12',
        name: 'Android 12 (Snow Cone)',
        desc: 'Galaxy S22 / Adreno 730',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '390 × 844 (Galaxy Mobile)',
        cpuCores: 8,
        memoryGb: 8,
        webglRenderer: 'Qualcomm / Adreno (TM) 730',
      },
      {
        id: 'android-11',
        name: 'Android 11 (Red Velvet)',
        desc: 'Pixel 5 / Adreno 620',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '393 × 851 (Pixel 5)',
        cpuCores: 8,
        memoryGb: 8,
        webglRenderer: 'Qualcomm / Adreno (TM) 620',
      },
      {
        id: 'android-10',
        name: 'Android 10 (Quince Tart)',
        desc: 'Pixel 4 / Adreno 640',
        presetId: DEFAULT_PRESET_IDS.android14,
        platform: 'android',
        resolution: '393 × 851 (Pixel 4)',
        cpuCores: 8,
        memoryGb: 6,
        webglRenderer: 'Qualcomm / Adreno (TM) 640',
      },
    ],
  },
  {
    key: 'ios',
    name: 'iOS',
    icon: DeviceMobileIcon,
    color: '#a855f7',
    versions: [
      {
        id: 'ios-18',
        name: 'iOS 18',
        desc: 'iPhone 16 Pro Max / Safari 18',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '430 × 932 (iPhone 16 Pro Max)',
        cpuCores: 6,
        memoryGb: 8,
        webglRenderer: 'Apple / Apple GPU (A18 Pro / Metal)',
      },
      {
        id: 'ios-17',
        name: 'iOS 17',
        desc: 'iPhone 15 Pro / Safari 17',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '393 × 852 (iPhone 15 Pro)',
        cpuCores: 6,
        memoryGb: 8,
        webglRenderer: 'Apple / Apple GPU (A17 Pro / Metal)',
      },
      {
        id: 'ios-16',
        name: 'iOS 16',
        desc: 'iPhone 14 / Safari 16',
        presetId: DEFAULT_PRESET_IDS.macosSonoma,
        platform: 'macos',
        resolution: '390 × 844 (iPhone 14)',
        cpuCores: 6,
        memoryGb: 6,
        webglRenderer: 'Apple / Apple GPU (A15 Bionic / Metal)',
      },
    ],
  },
];

const RESOLUTION_OPTIONS = [
  { label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { label: '2560 × 1440 (2K QHD)', width: 2560, height: 1440 },
  { label: '1440 × 900 (MacBook)', width: 1440, height: 900 },
  { label: '1728 × 1117 (MacBook Pro 16)', width: 1728, height: 1117 },
  { label: '3840 × 2160 (4K UHD)', width: 3840, height: 2160 },
  { label: '412 × 915 (Pixel Mobile)', width: 412, height: 915 },
  { label: '393 × 851 (Pixel 5)', width: 393, height: 851 },
  { label: '390 × 844 (iPhone 14 / Galaxy)', width: 390, height: 844 },
  { label: '393 × 852 (iPhone 15 Pro)', width: 393, height: 852 },
  { label: '430 × 932 (iPhone 16 Pro Max)', width: 430, height: 932 },
];

export function CreateProfileModal() {
  const {
    isCreateModalOpen,
    editingProfileId,
    closeModal,
    createProfile,
    bulkCreateProfiles,
    updateProfile,
    profiles,
  } = useProfilesStore();
  const { niches, loadNiches } = useNichesStore();

  const [engine, setEngine] = useState<'apostate' | 'camoufox'>('apostate');
  const [creationMode, setCreationMode] = useState<'single' | 'bulk'>('single');
  const [bulkCount, setBulkCount] = useState<number>(10);
  const [distMode, setDistMode] = useState<'single' | 'mixed'>('mixed');
  const [weights, setWeights] = useState<{ apostate: number; camoufox: number }>({ apostate: 70, camoufox: 30 });

  const [name, setName] = useState('');
  const [persona, setPersona] = useState('casual');
  const [nicheId, setNicheId] = useState('');
  const [selectedOsKey, setSelectedOsKey] = useState<'windows' | 'macos' | 'android' | 'ios'>('windows');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('win-11-24h2');
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_IDS.windows11);
  const [platform, setPlatform] = useState('windows');
  const [tags, setTags] = useState('');
  const [proxyId, setProxyId] = useState('');
  const [fingerprintSeed, setFingerprintSeed] = useState('');
  const [seedToast, setSeedToast] = useState(false);
  const [notes, setNotes] = useState('');

  // Behavioral Persona & Timing Dynamics (Single Mode & Edit)
  const [trustScore, setTrustScore] = useState<number>(10);
  const [maturationStage, setMaturationStage] = useState<'infant' | 'seeding' | 'maturing' | 'mature'>('infant');
  const [typingWpm, setTypingWpm] = useState<number>(72);
  const [typoRate, setTypoRate] = useState<number>(3.8);
  const [patienceIndex, setPatienceIndex] = useState<number>(5.5);
  const [engagementRate, setEngagementRate] = useState<number>(22);
  const [selectedNicheIds, setSelectedNicheIds] = useState<string[]>([]);
  const [weightedNiches, setWeightedNiches] = useState<Array<{ nicheId: string; weight: number; isPrimary?: boolean }>>([]);
  const [newNicheName, setNewNicheName] = useState('');
  const [showAddNiche, setShowAddNiche] = useState(false);

  // Bulk Mode Persona Controls
  const [bulkRandomizePersona, setBulkRandomizePersona] = useState<boolean>(true);
  const [bulkSelectedNicheIds, setBulkSelectedNicheIds] = useState<string[]>([]);

  // Hardware & Fingerprint Customization
  const [resolution, setResolution] = useState('1920 × 1080 (Full HD)');
  const [cpuCores, setCpuCores] = useState(8);
  const [memoryGb, setMemoryGb] = useState(16);
  const [canvasNoise, setCanvasNoise] = useState(true);
  const [audioNoise, setAudioNoise] = useState(true);
  const [webglRenderer, setWebglRenderer] = useState('NVIDIA Corporation / NVIDIA GeForce RTX 4070 Direct3D11');

  // Launch options
  const [startUrl, setStartUrl] = useState('https://browserleaks.com');
  const [headless, setHeadless] = useState(false);
  const [openDevtools, setOpenDevtools] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load niches on open
  useEffect(() => {
    if (isCreateModalOpen) {
      void loadNiches();
    }
  }, [isCreateModalOpen, loadNiches]);

  // Set default seed on open
  useEffect(() => {
    if (isCreateModalOpen && !editingProfileId) {
      setName(`Profile ${Math.floor(Math.random() * 900) + 100}`);
      setPersona('casual');
      setNicheId('');
      setTrustScore(10);
      setMaturationStage('infant');
      setTypingWpm(72);
      setTypoRate(3.8);
      setPatienceIndex(5.5);
      setEngagementRate(22);
      setSelectedNicheIds([]);
      setWeightedNiches([]);
      setBulkRandomizePersona(true);
      setBulkSelectedNicheIds([]);
      setShowAddNiche(false);
      setNewNicheName('');
      setSelectedOsKey('windows');
      setSelectedVersionId('win-11-24h2');
      setPresetId(DEFAULT_PRESET_IDS.windows11);
      setPlatform('windows');
      setTags('farming, us');
      setProxyId('');
      setFingerprintSeed(crypto.randomUUID());
      setSeedToast(false);
      setNotes('');
      setResolution('1920 × 1080 (Full HD)');
      setCpuCores(8);
      setMemoryGb(16);
      setCanvasNoise(true);
      setAudioNoise(true);
      setWebglRenderer('NVIDIA Corporation / NVIDIA GeForce RTX 4070 Direct3D11');
      setStartUrl('https://browserleaks.com');
      setHeadless(false);
      setOpenDevtools(false);
      setEngine('apostate');
      setCreationMode('single');
      setBulkCount(10);
      setDistMode('mixed');
      setWeights({ apostate: 70, camoufox: 30 });
      setError(null);
    } else if (editingProfileId) {
      const existing = profiles.find((p) => p.id === editingProfileId);
      if (existing) {
        setName(existing.name);
        setPersona(existing.persona ?? 'casual');
        setNicheId(existing.nicheId ?? '');
        setTrustScore(existing.trustScore ?? 10);
        setMaturationStage((existing.maturationStage as any) ?? 'infant');
        setTypingWpm(existing.typingWpm ?? 72);
        setTypoRate(existing.typoRate ?? 3.8);
        setPatienceIndex(existing.patienceIndex ?? 5.5);
        setEngagementRate(existing.engagementRate ?? 22);

        const nIds = existing.nicheIds && existing.nicheIds.length > 0
          ? existing.nicheIds
          : existing.nicheId
            ? [existing.nicheId]
            : [];
        setSelectedNicheIds(nIds);

        if (existing.weightedNiches && existing.weightedNiches.length > 0) {
          setWeightedNiches(existing.weightedNiches.map((w) => ({ nicheId: w.nicheId, weight: w.weight, isPrimary: Boolean(w.isPrimary) })));
        } else {
          setWeightedNiches(nIds.map((id, index) => ({ nicheId: id, weight: 100 - index * 20, isPrimary: index === 0 })));
        }

        setPresetId(existing.presetId);
        setPlatform(existing.platform);
        setEngine(existing.engine ?? 'apostate');
        setTags(existing.tags?.join(', ') ?? '');
        setProxyId(existing.proxyId ?? '');
        setError(null);
      }
    }
  }, [isCreateModalOpen, editingProfileId, profiles]);

  // Stage button handler
  const handleStageSelect = (stage: 'infant' | 'seeding' | 'maturing' | 'mature') => {
    setMaturationStage(stage);
    if (stage === 'infant') setTrustScore(10);
    else if (stage === 'seeding') setTrustScore(35);
    else if (stage === 'maturing') setTrustScore(60);
    else if (stage === 'mature') setTrustScore(85);
  };

  // Trust score change handler
  const handleTrustScoreChange = (score: number) => {
    setTrustScore(score);
    if (score <= 25) setMaturationStage('infant');
    else if (score <= 50) setMaturationStage('seeding');
    else if (score <= 75) setMaturationStage('maturing');
    else setMaturationStage('mature');
  };

  // Presets handler
  const applyKeystrokePreset = (presetPersona: string, wpm: number, typo: number, patience: number, engagement: number) => {
    setPersona(presetPersona);
    setTypingWpm(wpm);
    setTypoRate(typo);
    setPatienceIndex(patience);
    setEngagementRate(engagement);
  };

  // Niche toggle handler
  const handleToggleNiche = (nId: string) => {
    if (selectedNicheIds.includes(nId)) {
      const updated = selectedNicheIds.filter((id) => id !== nId);
      setSelectedNicheIds(updated);
      setWeightedNiches((prev) => prev.filter((w) => w.nicheId !== nId));
    } else {
      const updated = [...selectedNicheIds, nId];
      setSelectedNicheIds(updated);
      const isPrimary = updated.length === 1;
      setWeightedNiches((prev) => [...prev, { nicheId: nId, weight: 80, isPrimary }]);
    }
  };

  // Niche weight change handler
  const handleNicheWeightChange = (nId: string, weight: number) => {
    setWeightedNiches((prev) =>
      prev.map((item) => (item.nicheId === nId ? { ...item, weight } : item))
    );
  };

  // Set primary niche
  const handleSetPrimaryNiche = (nId: string) => {
    setWeightedNiches((prev) =>
      prev.map((item) => ({ ...item, isPrimary: item.nicheId === nId }))
    );
  };

  // Quick create niche
  const handleCreateNewNiche = async () => {
    if (!newNicheName.trim()) return;
    try {
      const created = await (useNichesStore.getState().createNiche)({
        name: newNicheName.trim(),
        description: 'Custom target audience niche',
        keywords: [newNicheName.toLowerCase().trim()],
        seedUrls: [],
        tags: [newNicheName.toLowerCase().trim()],
      });
      setSelectedNicheIds((prev) => [...prev, created.id]);
      setWeightedNiches((prev) => [...prev, { nicheId: created.id, weight: 80, isPrimary: prev.length === 0 }]);
      setNewNicheName('');
      setShowAddNiche(false);
    } catch {
      // handled
    }
  };

  // Bulk niche toggle handler
  const handleToggleBulkNiche = (nId: string) => {
    if (bulkSelectedNicheIds.includes(nId)) {
      setBulkSelectedNicheIds(bulkSelectedNicheIds.filter((id) => id !== nId));
    } else {
      setBulkSelectedNicheIds([...bulkSelectedNicheIds, nId]);
    }
  };

  if (!isCreateModalOpen) return null;

  const currentOsFamily = OS_OPTIONS.find((o) => o.key === selectedOsKey) ?? OS_OPTIONS[0]!;

  const handleOsSelect = (os: OsFamily) => {
    setSelectedOsKey(os.key);
    const firstVersion = os.versions[0]!;
    handleVersionSelect(firstVersion);
  };

  const handleVersionSelect = (ver: OsVersion) => {
    setSelectedVersionId(ver.id);
    setPresetId(ver.presetId);
    setPlatform(ver.platform);
    if (ver.platform === 'android') {
      setEngine('apostate');
      setDistMode('single');
    }
    setResolution(ver.resolution);
    setCpuCores(ver.cpuCores);
    setMemoryGb(ver.memoryGb);
    setWebglRenderer(ver.webglRenderer);
  };

  const handleRandomizeSeed = () => {
    const newSeed = crypto.randomUUID();
    setFingerprintSeed(newSeed);

    // Permute hardware coherent with selected OS
    if (selectedOsKey === 'windows') {
      const gpus = [
        'NVIDIA Corporation / NVIDIA GeForce RTX 4090 Direct3D11',
        'NVIDIA Corporation / NVIDIA GeForce RTX 4080 Direct3D11',
        'NVIDIA Corporation / NVIDIA GeForce RTX 4070 Ti Direct3D11',
        'NVIDIA Corporation / NVIDIA GeForce RTX 3080 Direct3D11',
        'AMD / AMD Radeon RX 7900 XTX Direct3D11',
      ];
      const resolutions = ['1920 × 1080 (Full HD)', '2560 × 1440 (2K QHD)', '3840 × 2160 (4K UHD)'];
      const cores = [8, 12, 16];
      const rams = [16, 32, 64];

      setWebglRenderer(gpus[Math.floor(Math.random() * gpus.length)]!);
      setResolution(resolutions[Math.floor(Math.random() * resolutions.length)]!);
      setCpuCores(cores[Math.floor(Math.random() * cores.length)]!);
      setMemoryGb(rams[Math.floor(Math.random() * rams.length)]!);
    } else if (selectedOsKey === 'macos') {
      const gpus = [
        'Apple / ANGLE (Apple, Apple M3 Max, OpenGL 4.1)',
        'Apple / ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
        'Apple / ANGLE (Apple, Apple M2, OpenGL 4.1)',
        'Apple / ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
      ];
      const resolutions = ['1440 × 900 (MacBook)', '1728 × 1117 (MacBook Pro 16)', '2560 × 1440 (2K QHD)'];
      const cores = [8, 10, 12];
      const rams = [16, 24, 32, 36];

      setWebglRenderer(gpus[Math.floor(Math.random() * gpus.length)]!);
      setResolution(resolutions[Math.floor(Math.random() * resolutions.length)]!);
      setCpuCores(cores[Math.floor(Math.random() * cores.length)]!);
      setMemoryGb(rams[Math.floor(Math.random() * rams.length)]!);
    } else if (selectedOsKey === 'android') {
      const gpus = [
        'Qualcomm / Adreno (TM) 750',
        'Qualcomm / Adreno (TM) 740',
        'ARM / Mali-G715 MC11',
        'Qualcomm / Adreno (TM) 730',
      ];
      const resolutions = ['412 × 915 (Pixel Mobile)', '390 × 844 (iPhone 14 / Galaxy)', '393 × 851 (Pixel 5)'];
      const rams = [8, 12, 16];

      setWebglRenderer(gpus[Math.floor(Math.random() * gpus.length)]!);
      setResolution(resolutions[Math.floor(Math.random() * resolutions.length)]!);
      setCpuCores(8);
      setMemoryGb(rams[Math.floor(Math.random() * rams.length)]!);
    } else {
      // iOS
      const gpus = [
        'Apple / Apple GPU (A18 Pro / Metal)',
        'Apple / Apple GPU (A17 Pro / Metal)',
        'Apple / Apple GPU (A16 Bionic / Metal)',
      ];
      const resolutions = ['430 × 932 (iPhone 16 Pro Max)', '393 × 852 (iPhone 15 Pro)', '390 × 844 (iPhone 14 / Galaxy)'];
      const rams = [6, 8];

      setWebglRenderer(gpus[Math.floor(Math.random() * gpus.length)]!);
      setResolution(resolutions[Math.floor(Math.random() * resolutions.length)]!);
      setCpuCores(6);
      setMemoryGb(rams[Math.floor(Math.random() * rams.length)]!);
    }

    setSeedToast(true);
    setTimeout(() => setSeedToast(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Profile name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const parsedTags = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      if (editingProfileId) {
        const primaryNiche = weightedNiches.find((w) => w.isPrimary)?.nicheId ?? selectedNicheIds[0] ?? null;
        await updateProfile(editingProfileId, {
          name: name.trim(),
          tags: parsedTags,
          notes: notes.trim() || null,
          persona,
          trustScore,
          maturationStage,
          typingWpm,
          typoRate,
          patienceIndex,
          engagementRate,
          nicheId: primaryNiche,
          nicheIds: selectedNicheIds,
          weightedNiches,
        });
      } else if (creationMode === 'bulk') {
        await bulkCreateProfiles({
          count: bulkCount,
          presetId: presetId || DEFAULT_PRESET_IDS.windows11,
          engineDistribution:
            distMode === 'single'
              ? { mode: 'single', engine }
              : { mode: 'mixed', weights },
          tags: parsedTags,
          persona: bulkRandomizePersona ? undefined : persona,
          nicheId: bulkSelectedNicheIds[0] || undefined,
          nicheIds: bulkSelectedNicheIds.length > 0 ? bulkSelectedNicheIds : undefined,
          randomizePersona: bulkRandomizePersona,
        });
      } else {
        const resMatch = RESOLUTION_OPTIONS.find((r) => r.label === resolution);
        const primaryNiche = weightedNiches.find((w) => w.isPrimary)?.nicheId ?? selectedNicheIds[0] ?? null;
        await createProfile({
          name: name.trim(),
          presetId: presetId || DEFAULT_PRESET_IDS.windows11,
          engine,
          persona,
          trustScore,
          maturationStage,
          typingWpm,
          typoRate,
          patienceIndex,
          engagementRate,
          nicheId: primaryNiche,
          nicheIds: selectedNicheIds,
          weightedNiches: weightedNiches.length > 0 ? weightedNiches : undefined,
          tags: parsedTags,
          proxyId: proxyId.trim() || undefined,
          fingerprintSeed: fingerprintSeed.trim() || undefined,
          notes: notes.trim() || undefined,
          webglRenderer: webglRenderer.trim() || undefined,
          cpuCores: Number(cpuCores) || 8,
          memoryGb: Number(memoryGb) || 16,
          resolution: resMatch ? { width: resMatch.width, height: resMatch.height } : undefined,
          canvasNoise,
          audioNoise,
          startUrl: startUrl.trim() || undefined,
        });
      }
      closeModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={closeModal}
    >
      <div
        className="glass-panel animate-scale-in"
        style={{
          width: '740px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d131f',
          border: '1px solid var(--border-card-highlight)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <BoltIcon size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                  {editingProfileId ? 'Edit Browser Profile' : 'Create New Profile'}
                </span>
                <span className="badge badge-tag" style={{ fontSize: '10px' }}>
                  {platform.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                {editingProfileId
                  ? 'Update persona properties, tags, and proxy assignments'
                  : 'Configure an isolated anti-detect browser environment'}
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={closeModal}>
            <XIcon size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '20px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              flex: 1,
            }}
          >
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#f43f5e',
                  fontSize: '12px',
                }}
              >
                {error}
              </div>
            )}

            {/* OS Family & Version Hierarchy */}
            {!editingProfileId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 1. Primary OS Family */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      1. CHOOSE OPERATING SYSTEM
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Active: <strong style={{ color: currentOsFamily.color }}>{currentOsFamily.name}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {OS_OPTIONS.map((os) => {
                      const isSelected = selectedOsKey === os.key;
                      const Icon = os.icon;
                      return (
                        <div
                          key={os.key}
                          onClick={() => handleOsSelect(os)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: isSelected ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255, 255, 255, 0.02)',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-card)',
                            boxShadow: isSelected ? '0 0 12px rgba(59, 130, 246, 0.25)' : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            transition: 'all var(--transition-fast)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Icon size={20} color={os.color} />
                            {isSelected && (
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }} />
                            )}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#ffffff' : 'var(--text-main)' }}>
                            {os.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                            {os.versions.length} versions available
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Secondary Version & Device Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    2. CHOOSE {currentOsFamily.name.toUpperCase()} VERSION & SPECIFICATION
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: currentOsFamily.versions.length > 4 ? 'repeat(auto-fill, minmax(190px, 1fr))' : `repeat(${currentOsFamily.versions.length}, 1fr)`,
                      gap: '8px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      padding: '2px',
                    }}
                  >
                    {currentOsFamily.versions.map((ver) => {
                      const isSelected = selectedVersionId === ver.id;
                      return (
                        <div
                          key={ver.id}
                          onClick={() => handleVersionSelect(ver)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected ? '1px solid #60a5fa' : '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? '#ffffff' : 'var(--text-main)' }}>
                              {ver.name}
                            </span>
                            {isSelected && (
                              <span style={{ fontSize: '10px', color: '#60a5fa' }}>●</span>
                            )}
                          </div>
                          <div style={{ fontSize: '9.5px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ver.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Mode & Engine Selection */}
            {!editingProfileId && (
              <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.4)' }}>
                {/* Creation Mode Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setCreationMode('single')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: creationMode === 'single' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Single Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreationMode('bulk')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: creationMode === 'bulk' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Bulk Generate
                  </button>
                </div>

                {creationMode === 'single' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                      3. BROWSER ENGINE
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div
                        onClick={() => setEngine('apostate')}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: `1px solid ${engine === 'apostate' ? '#3b82f6' : 'var(--border-subtle)'}`,
                          background: engine === 'apostate' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="radio" checked={engine === 'apostate'} onChange={() => setEngine('apostate')} />
                          <strong style={{ color: '#60a5fa', fontSize: '13px' }}>Apostate</strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>(Chromium)</span>
                        </div>
                        <p style={{ margin: '0 0 0 24px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Recommended for YouTube, Google, Chrome-trust targets.
                        </p>
                      </div>

                      <div
                        onClick={() => {
                          if (platform !== 'android') setEngine('camoufox');
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: `1px solid ${engine === 'camoufox' ? '#f97316' : 'var(--border-subtle)'}`,
                          background: engine === 'camoufox' ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: platform === 'android' ? 'not-allowed' : 'pointer',
                          opacity: platform === 'android' ? 0.5 : 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="radio"
                            disabled={platform === 'android'}
                            checked={engine === 'camoufox'}
                            onChange={() => {
                              if (platform !== 'android') setEngine('camoufox');
                            }}
                          />
                          <strong style={{ color: '#fb923c', fontSize: '13px' }}>Camoufox</strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>(Firefox/Gecko)</span>
                        </div>
                        <p style={{ margin: '0 0 0 24px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {platform === 'android'
                            ? 'Camoufox does not support Android personas.'
                            : 'Recommended for non-English regions and Cloudflare-protected sites.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '14px', alignItems: 'center' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                          BATCH COUNT
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={bulkCount}
                          onChange={(e) => setBulkCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="input"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                          DISTRIBUTION STRATEGY
                        </label>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="distMode"
                              checked={distMode === 'single'}
                              onChange={() => setDistMode('single')}
                            />
                            <span>Single engine</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="distMode"
                              disabled={platform === 'android'}
                              checked={distMode === 'mixed'}
                              onChange={() => setDistMode('mixed')}
                            />
                            <span>Mixed (weighted random)</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {distMode === 'single' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                          CHOSEN ENGINE FOR BATCH
                        </label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#60a5fa', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="bulkEngine"
                              checked={engine === 'apostate'}
                              onChange={() => setEngine('apostate')}
                            />
                            <span>Apostate (Chromium)</span>
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              color: '#fb923c',
                              cursor: platform === 'android' ? 'not-allowed' : 'pointer',
                              opacity: platform === 'android' ? 0.5 : 1,
                            }}
                          >
                            <input
                              type="radio"
                              name="bulkEngine"
                              disabled={platform === 'android'}
                              checked={engine === 'camoufox'}
                              onChange={() => {
                                if (platform !== 'android') setEngine('camoufox');
                              }}
                            />
                            <span>Camoufox (Firefox)</span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>Apostate Weight: <strong style={{ color: '#60a5fa' }}>{weights.apostate}%</strong></span>
                            <span>Camoufox Weight: <strong style={{ color: '#fb923c' }}>{weights.camoufox}%</strong></span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={weights.apostate}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setWeights({ apostate: val, camoufox: 100 - val });
                            }}
                            style={{ width: '100%', accentColor: '#3b82f6' }}
                          />
                        </div>

                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            fontSize: '12px',
                            color: '#93c5fd',
                          }}
                        >
                          Creates <strong>{Math.round((bulkCount * weights.apostate) / 100)} Apostate</strong>,{' '}
                          <strong>{Math.round((bulkCount * weights.camoufox) / 100)} Camoufox</strong> profiles
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Profile Persona Identity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  PROFILE NAME *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Pixel 8 Pro #04"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  TAGS (COMMA SEPARATED)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="farming, social, banking, ads"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Behavioral Persona Integration: Single Mode / Edit vs Bulk Randomization Mode */}
            {creationMode === 'single' || editingProfileId ? (
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BoltIcon size={16} color="#a855f7" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                      BEHAVIORAL PERSONA & MATURATION DYNAMICS
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: maturationStage === 'mature' ? 'rgba(16, 185, 129, 0.15)' : maturationStage === 'maturing' ? 'rgba(6, 182, 212, 0.15)' : maturationStage === 'seeding' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: maturationStage === 'mature' ? '#34d399' : maturationStage === 'maturing' ? '#22d3ee' : maturationStage === 'seeding' ? '#fbbf24' : '#94a3b8',
                        border: `1px solid ${maturationStage === 'mature' ? 'rgba(16, 185, 129, 0.3)' : maturationStage === 'maturing' ? 'rgba(6, 182, 212, 0.3)' : maturationStage === 'seeding' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {maturationStage} STAGE
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      Trust: {trustScore}/100
                    </span>
                  </div>
                </div>

                {/* 1. Maturation Stage Selector & Trust Score Slider */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      MATURATION STAGE & TRUST SCORE
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Auto-adjusts as profile ages and browses
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[
                      { id: 'infant', label: 'Infant', range: '0–25', icon: '🍼', desc: 'Burn-in' },
                      { id: 'seeding', label: 'Seeding', range: '26–50', icon: '🌱', desc: 'Warmup' },
                      { id: 'maturing', label: 'Maturing', range: '51–75', icon: '🌿', desc: 'Active' },
                      { id: 'mature', label: 'Mature', range: '76–100', icon: '👑', desc: 'High Trust' },
                    ].map((s) => {
                      const active = maturationStage === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleStageSelect(s.id as any)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: active ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: active ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                            color: active ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600 }}>{s.icon} {s.label}</span>
                            <span style={{ fontSize: '9px', opacity: 0.7 }}>{s.range}</span>
                          </div>
                          <span style={{ fontSize: '9px', color: active ? '#c4b5fd' : 'var(--text-dim)' }}>{s.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>Trust Calibration Slider</span>
                      <strong style={{ color: '#a78bfa' }}>{trustScore} / 100</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={trustScore}
                      onChange={(e) => handleTrustScoreChange(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#8b5cf6' }}
                    />
                  </div>
                </div>

                {/* 2. Physical Keystroke Dynamics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <KeyboardIcon size={13} color="#60a5fa" />
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                        PHYSICAL KEYSTROKE DYNAMICS
                      </label>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Bézier timing & natural backspace correction
                    </span>
                  </div>

                  {/* Preset Chips */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[
                      { key: 'casual', label: '🛋️ Casual', wpm: 52, typo: 3.8, patience: 5.5, eng: 22 },
                      { key: 'gamer', label: '⚡ Gamer/Tech', wpm: 88, typo: 2.1, patience: 3.5, eng: 35 },
                      { key: 'researcher', label: '🔬 Methodical', wpm: 42, typo: 1.2, patience: 8.2, eng: 18 },
                      { key: 'skimmer', label: '⏩ Skimmer', wpm: 74, typo: 5.2, patience: 2.4, eng: 14 },
                    ].map((p) => {
                      const isSelected = persona === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => applyKeystrokePreset(p.key, p.wpm, p.typo, p.patience, p.eng)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: isSelected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                            color: isSelected ? '#60a5fa' : 'var(--text-muted)',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sliders Grid: Speed & Error Rate */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                        <span>Typing Speed</span>
                        <strong style={{ color: '#60a5fa' }}>{typingWpm} WPM</strong>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={140}
                        value={typingWpm}
                        onChange={(e) => setTypingWpm(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                        <span>Typo & Backspace Rate</span>
                        <strong style={{ color: '#fb923c' }}>{typoRate}%</strong>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.1}
                        value={typoRate}
                        onChange={(e) => setTypoRate(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#f97316' }}
                      />
                    </div>
                  </div>

                  {/* Sliders Grid: Dwell Patience & Engagement */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                        <span>Reading Dwell Patience</span>
                        <strong style={{ color: '#34d399' }}>{patienceIndex} / 10</strong>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.1}
                        value={patienceIndex}
                        onChange={(e) => setPatienceIndex(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#10b981' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                        <span>Engagement / Click Likelihood</span>
                        <strong style={{ color: '#a78bfa' }}>{engagementRate}%</strong>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={engagementRate}
                        onChange={(e) => setEngagementRate(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#8b5cf6' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Multi-Niche Affiliation & Weights */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ScaleIcon size={13} color="#38bdf8" />
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                        TARGET NICHES & TRAFFIC WEIGHTS ({selectedNicheIds.length} ASSIGNED)
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddNiche(!showAddNiche)}
                      style={{
                        fontSize: '10px',
                        color: '#60a5fa',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <PlusIcon size={11} />
                      <span>{showAddNiche ? 'Cancel' : 'New Niche'}</span>
                    </button>
                  </div>

                  {/* Inline Quick Niche Form */}
                  {showAddNiche && (
                    <div style={{ display: 'flex', gap: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. Flight Simulators, Crypto DeFi"
                        value={newNicheName}
                        onChange={(e) => setNewNicheName(e.target.value)}
                        style={{ flex: 1, fontSize: '11px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleCreateNewNiche();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleCreateNewNiche()}
                        style={{ padding: '4px 12px', fontSize: '11px' }}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {/* Niches List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                    {niches.length === 0 ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                        No niches configured yet. Click "New Niche" above to create one.
                      </div>
                    ) : (
                      niches.map((n) => {
                        const isChecked = selectedNicheIds.includes(n.id);
                        const weighted = weightedNiches.find((w) => w.nicheId === n.id);
                        const weight = weighted?.weight ?? 80;
                        const isPrimary = weighted?.isPrimary || selectedNicheIds[0] === n.id;

                        return (
                          <div
                            key={n.id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: isChecked ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)',
                              background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleNiche(n.id)}
                                  style={{ accentColor: '#3b82f6' }}
                                />
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: isChecked ? '#ffffff' : 'var(--text-muted)' }}>
                                    {n.name}
                                  </div>
                                  {n.description && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {n.description}
                                    </div>
                                  )}
                                </div>
                              </label>

                              {isChecked && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryNiche(n.id)}
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    borderRadius: '4px',
                                    border: isPrimary ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                                    background: isPrimary ? '#2563eb' : 'rgba(255, 255, 255, 0.04)',
                                    color: isPrimary ? '#ffffff' : 'var(--text-dim)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isPrimary ? 'PRIMARY NICHE' : 'Set as Primary'}
                                </button>
                              )}
                            </div>

                            {isChecked && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '22px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-dim)', minWidth: '70px' }}>Traffic Weight:</span>
                                <input
                                  type="range"
                                  min={10}
                                  max={100}
                                  value={weight}
                                  onChange={(e) => handleNicheWeightChange(n.id, Number(e.target.value))}
                                  style={{ flex: 1, accentColor: '#3b82f6' }}
                                />
                                <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 600, minWidth: '32px', textAlign: 'right' }}>
                                  {weight}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* BEHAVIORAL PERSONA (BULK MODE: RANDOMIZATION ENGINE & NICHE POOL) */
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🎲</span>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                        ORGANIC BEHAVIORAL PERSONA RANDOMIZATION
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        Anti-detect stealth engine: prevents fingerprint & behavioral clustering across batch
                      </div>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#93c5fd' }}>
                    <input
                      type="checkbox"
                      checked={bulkRandomizePersona}
                      onChange={(e) => setBulkRandomizePersona(e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>Randomize across fleet</span>
                  </label>
                </div>

                {/* Randomization Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa', marginBottom: '2px' }}>
                      ⌨️ Dynamic Typing Dynamics
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Speeds randomized between 48–93 WPM with natural typo correction (1.6%–5.4%)
                    </div>
                  </div>

                  <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#34d399', marginBottom: '2px' }}>
                      ⏳ Dwell & Engagement Variance
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Reading patience (2.5–8.5) and interaction likelihood dispersed naturally
                    </div>
                  </div>

                  <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#a78bfa', marginBottom: '2px' }}>
                      🎭 Archetype Distribution
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Evenly distributes Casual Consumer, Gamer, Researcher, and Skimmer personas
                    </div>
                  </div>

                  <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#fbbf24', marginBottom: '2px' }}>
                      🍼 Infant Trust Seeding
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      Initial trust scores (10–24) calibrated for independent background auto-maturation
                    </div>
                  </div>
                </div>

                {/* Multi-Niche Distribution Across Batch */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ScaleIcon size={13} color="#38bdf8" />
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                        DISTRIBUTE NICHES ACROSS BATCH ({bulkSelectedNicheIds.length} SELECTED)
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setBulkSelectedNicheIds(niches.map((n) => n.id))}
                        style={{ fontSize: '10px', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Select All
                      </button>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>•</span>
                      <button
                        type="button"
                        onClick={() => setBulkSelectedNicheIds([])}
                        style={{ fontSize: '10px', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                    Selected niches will be rotated and assigned across the {bulkCount} generated profiles with varied traffic weights.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {niches.map((n) => {
                      const isChecked = bulkSelectedNicheIds.includes(n.id);
                      return (
                        <label
                          key={n.id}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: isChecked ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)',
                            background: isChecked ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.01)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleBulkNiche(n.id)}
                            style={{ accentColor: '#3b82f6' }}
                          />
                          <span style={{ fontSize: '11px', color: isChecked ? '#ffffff' : 'var(--text-muted)', fontWeight: isChecked ? 600 : 400 }}>
                            {n.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Proxy & Network Tunnel */}
            <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ShieldCheckIcon size={14} color="#3b82f6" />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff' }}>STICKY PROXY ASSIGNMENT</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    SELECT PROXY / LEASE
                  </label>
                  <select
                    className="select"
                    value={proxyId}
                    onChange={(e) => setProxyId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Auto-assign on start (Dynamic Lease)</option>
                    <option value="proxy-1">185.220.101.4:8080 (US Residential)</option>
                    <option value="proxy-2">194.38.20.12:9050 (UK Datacenter)</option>
                    <option value="proxy-3">45.142.122.9:3128 (DE SOCKS5)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    WEBRTC & DNS LEAK POLICY
                  </label>
                  <div
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '11px',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>🛡️</span>
                    <span>Disable Non-Proxied UDP (Zero Leak)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Fingerprint Hardware Configuration */}
            {!editingProfileId && (
              <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#ec4899' }}>🧬</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff' }}>
                      HARDWARE & FINGERPRINT NOISE
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        color: '#93c5fd',
                        background: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '3px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      title={`Active Seed: ${fingerprintSeed}`}
                    >
                      <span style={{ color: 'var(--text-dim)', fontSize: '9px', fontWeight: 700 }}>SEED:</span>
                      <span>{fingerprintSeed ? `${fingerprintSeed.slice(0, 8)}...` : 'Auto'}</span>
                    </div>

                    {seedToast && (
                      <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>
                        ✓ Seed Re-rolled!
                      </span>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={handleRandomizeSeed}
                      title="Roll new fingerprint seed & permute hardware noise"
                    >
                      <RefreshIcon size={11} />
                      <span>Randomize Seed</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                      SCREEN RESOLUTION
                    </label>
                    <select
                      className="select"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      style={{ width: '100%', fontSize: '11px' }}
                    >
                      {RESOLUTION_OPTIONS.map((r) => (
                        <option key={r.label} value={r.label}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                      CPU CORES
                    </label>
                    <select
                      className="select"
                      value={cpuCores}
                      onChange={(e) => setCpuCores(Number(e.target.value))}
                      style={{ width: '100%', fontSize: '11px' }}
                    >
                      <option value={4}>4 Cores</option>
                      <option value={8}>8 Cores (Recommended)</option>
                      <option value={12}>12 Cores</option>
                      <option value={16}>16 Cores</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                      DEVICE MEMORY (RAM)
                    </label>
                    <select
                      className="select"
                      value={memoryGb}
                      onChange={(e) => setMemoryGb(Number(e.target.value))}
                      style={{ width: '100%', fontSize: '11px' }}
                    >
                      <option value={8}>8 GB RAM</option>
                      <option value={16}>16 GB RAM</option>
                      <option value={32}>32 GB RAM</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                      GPU / WEBGL RENDERER
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={webglRenderer}
                      onChange={(e) => setWebglRenderer(e.target.value)}
                      style={{ width: '100%', fontSize: '11px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-main)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={canvasNoise}
                        onChange={(e) => setCanvasNoise(e.target.checked)}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span>Canvas Noise Mask</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-main)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={audioNoise}
                        onChange={(e) => setAudioNoise(e.target.checked)}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span>Audio Context Noise</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Launch Settings & Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  START URL
                </label>
                <input
                  type="url"
                  className="input"
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={headless}
                      onChange={(e) => setHeadless(e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>Headless Mode</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={openDevtools}
                      onChange={(e) => setOpenDevtools(e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>Auto-Open DevTools</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  NOTES / REMARKS
                </label>
                <textarea
                  className="input"
                  placeholder="Add notes for this persona..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-card)',
              background: 'rgba(10, 14, 23, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : editingProfileId
                  ? 'Update Profile'
                  : creationMode === 'bulk'
                    ? `Generate ${bulkCount} Profiles`
                    : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
