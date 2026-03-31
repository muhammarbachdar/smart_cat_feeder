import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Bell,
  Moon,
  Droplets,
  Volume2,
  Shield,
  Smartphone,
  Database,
  Trash2,
  Save,
  Edit2,
  Check,
  X,
  AlertCircle,
  PawPrint,
  Clock
} from 'lucide-react';
import { ref, onValue, set, update, off } from 'firebase/database';
import { auth, database } from '../firebase/config';
import { updateProfile, onAuthStateChanged } from 'firebase/auth';

const SettingsPage = ({ userId, petName: initialPetName, onPetNameUpdate }) => {
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    soundEnabled: true,
    autoFeed: true,
    lowStockAlert: 20,
    language: 'id'
  });
  
  const [petName, setPetName] = useState(initialPetName);
  const [isEditingPetName, setIsEditingPetName] = useState(false);
  const [tempPetName, setTempPetName] = useState(initialPetName);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(auth.currentUser?.uid || userId || null);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setCurrentUserId(firebaseUser?.uid || userId || null);
    });
    return () => unsubscribeAuth();
  }, [userId]);

  useEffect(() => {
    if (!currentUserId) return;
    // Fetching data berdasarkan deviceId yang terhubung di profile user
    const connectedDeviceRef = ref(database, `users/${currentUserId}/connectedDevice`);
    const handleConnectedDevice = (snapshot) => {
      setConnectedDeviceId(snapshot.val() || null);
    };
    onValue(connectedDeviceRef, handleConnectedDevice);
    return () => off(connectedDeviceRef, 'value', handleConnectedDevice);
  }, [currentUserId]);

  // Load settings from Firebase
  useEffect(() => {
    if (!connectedDeviceId) {
      setIsLoading(false);
      return;
    }

    const settingsRef = ref(database, `devices/${connectedDeviceId}/settings`);

    const handleSettings = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSettings(prev => ({ ...prev, ...data }));
      }
      setIsLoading(false);
    };

    onValue(settingsRef, handleSettings);
    return () => off(settingsRef, 'value', handleSettings);
  }, [connectedDeviceId]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      if (!connectedDeviceId) {
        throw new Error("No connected device found");
      }
      const settingsRef = ref(database, `devices/${connectedDeviceId}/settings`);
      await set(settingsRef, settings);
      
      setSaveMessage({ type: 'success', text: 'Pengaturan berhasil disimpan!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage({ type: 'error', text: 'Gagal menyimpan pengaturan.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePetName = async () => {
    if (!tempPetName.trim()) return;
    
    setIsSaving(true);
    
    try {
      if (!currentUserId) {
        throw new Error("User is not authenticated");
      }
      // Update di Firebase Realtime Database
      const userRef = ref(database, `users/${currentUserId}`);
      await update(userRef, { petName: tempPetName });
      
      // Update di Firebase Auth profile
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: tempPetName
        });
      }
      
      setPetName(tempPetName);
      setIsEditingPetName(false);
      if (onPetNameUpdate) onPetNameUpdate(tempPetName);
      
      setSaveMessage({ type: 'success', text: 'Nama pet berhasil diubah!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error("Error updating pet name:", error);
      setSaveMessage({ type: 'error', text: 'Gagal mengubah nama pet.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetData = async () => {
    if (!confirm('Yakin ingin menghapus semua data? Tindakan ini tidak dapat dibatalkan!')) return;
    
    setIsSaving(true);
    
    try {
      if (!connectedDeviceId) {
        throw new Error("No connected device found");
      }
      // Hapus feeding history
      const historyRef = ref(database, `devices/${connectedDeviceId}/feedingHistory`);
      await set(historyRef, null);
      
      // Hapus schedules
      const schedulesRef = ref(database, `devices/${connectedDeviceId}/schedules`);
      await set(schedulesRef, null);
      
      // Reset feeding data
      const feedingDataRef = ref(database, `devices/${connectedDeviceId}/feedingData`);
      await set(feedingDataRef, {
        bowlWeight: 0,
        tankLevel: 0,
        temperature: 0,
        humidity: 0,
        lastMealAmount: 0
      });
      
      setSaveMessage({ type: 'success', text: 'Semua data berhasil direset!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error("Error resetting data:", error);
      setSaveMessage({ type: 'error', text: 'Gagal mereset data.' });
    } finally {
      setIsSaving(false);
      setShowResetConfirm(false);
    }
  };

  const SettingToggle = ({ label, description, icon: Icon, value, onChange }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Icon size={18} className="text-[#D4A757]" />
        </div>
        <div>
          <p className="font-medium text-gray-800">{label}</p>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition ${
          value ? 'bg-[#D4A757]' : 'bg-gray-300'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition ${
            value ? 'right-0.5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );

  const SettingSlider = ({ label, icon: Icon, value, min, max, unit, onChange }) => (
    <div className="py-3 border-b border-gray-200">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Icon size={18} className="text-[#D4A757]" />
        </div>
        <div>
          <p className="font-medium text-gray-800">{label}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">{min}%</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#D4A757]"
        />
        <span className="text-xs text-gray-500">{max}%</span>
      </div>
      <p className="text-sm font-medium text-[#D4A757] mt-1 text-right">
        {value}% {unit}
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Atur preferensi dan pengaturan aplikasi
        </p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`p-3 rounded-lg ${
          saveMessage.type === 'success' 
            ? 'bg-green-100 text-green-700 border border-green-200' 
            : 'bg-red-100 text-red-700 border border-red-200'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <User className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                Profil
              </h3>
            </div>
            
            <div className="space-y-4">
              {/* Pet Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama Hewan Peliharaan
                </label>
                <div className="flex items-center gap-2">
                  {isEditingPetName ? (
                    <>
                      <input
                        type="text"
                        value={tempPetName}
                        onChange={(e) => setTempPetName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757]"
                        autoFocus
                      />
                      <button
                        onClick={handleUpdatePetName}
                        className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingPetName(false);
                          setTempPetName(petName);
                        }}
                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <PawPrint size={16} className="text-[#D4A757]" />
                        <span className="text-gray-800">{petName}</span>
                      </div>
                      <button
                        onClick={() => {
                          setIsEditingPetName(true);
                          setTempPetName(petName);
                        }}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                      >
                        <Edit2 size={18} />
                      </button>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Nama ini akan muncul di dashboard dan notifikasi
                </p>
              </div>
              
              {/* User ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ID Pengguna
                </label>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <Smartphone size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-500 font-mono">
                    {currentUserId ? `${currentUserId.substring(0, 16)}...` : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                Notifikasi
              </h3>
            </div>
            
            <div className="space-y-2">
              <SettingToggle
                label="Notifikasi Push"
                description="Terima notifikasi saat feeding selesai"
                icon={Bell}
                value={settings.notifications}
                onChange={(val) => setSettings({ ...settings, notifications: val })}
              />
              <SettingToggle
                label="Suara Notifikasi"
                description="Mainkan suara saat ada notifikasi"
                icon={Volume2}
                value={settings.soundEnabled}
                onChange={(val) => setSettings({ ...settings, soundEnabled: val })}
              />
              <SettingToggle
                label="Mode Malam"
                description="Jangan kirim notifikasi jam 22:00 - 06:00"
                icon={Moon}
                value={settings.darkMode}
                onChange={(val) => setSettings({ ...settings, darkMode: val })}
              />
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Feeding Settings */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                Pengaturan Feeding
              </h3>
            </div>
            
            <div className="space-y-2">
              <SettingToggle
                label="Auto Feeding"
                description="Jalankan feeding otomatis sesuai jadwal"
                icon={Clock}
                value={settings.autoFeed}
                onChange={(val) => setSettings({ ...settings, autoFeed: val })}
              />
              <SettingSlider
                label="Alert Stok Rendah"
                icon={AlertCircle}
                value={settings.lowStockAlert}
                min={0}
                max={50}
                unit="%"
                onChange={(val) => setSettings({ ...settings, lowStockAlert: val })}
              />
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Database className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                Manajemen Data
              </h3>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-between p-3 bg-red-50 rounded-xl hover:bg-red-100 transition"
              >
                <div className="flex items-center gap-3">
                  <Trash2 size={18} className="text-red-500" />
                  <div className="text-left">
                    <p className="font-medium text-red-600">Reset Semua Data</p>
                    <p className="text-xs text-gray-500">Hapus history dan jadwal feeding</p>
                  </div>
                </div>
                <span className="text-xs text-red-500">Hapus →</span>
              </button>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full bg-[#D4A757] text-white py-3 rounded-xl hover:bg-[#c29644] transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Menyimpan...
              </>
            ) : (
              <>
                <Save size={18} />
                Simpan Pengaturan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-red-500" size={24} />
              <h2 className="text-xl font-bold text-gray-800">Reset Data</h2>
            </div>
            <p className="text-gray-600 mb-6">
              Apakah Anda yakin ingin mereset semua data? Tindakan ini akan menghapus:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 mb-6 space-y-1">
              <li>Seluruh history feeding</li>
              <li>Semua jadwal makan</li>
              <li>Data feeding yang tersimpan</li>
            </ul>
            <p className="text-red-500 text-sm mb-6 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleResetData}
                className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
              >
                Ya, Reset Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;