import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Bell, 
  BellOff,
  Edit2,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { ref, push, set, update, remove, onValue } from 'firebase/database'; 
import { database } from '../firebase/config';

const SchedulePage = ({ userId, petName = 'Maximus', isDeviceConnected = false, connectedDeviceId }) => {
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    time: '08:00',
    amount: 50,
    days: [true, true, true, true, true, true, true],
    enabled: true
  });

  const daysName = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  // Load schedules from Firebase
  useEffect(() => {
    if (!connectedDeviceId) return;
    
    const schedulesRef = ref(database, `devices/${connectedDeviceId}/schedules`);
    
    const unsubscribe = onValue(schedulesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const schedulesList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setSchedules(schedulesList);
      } else {
        setSchedules([]);
      }
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [connectedDeviceId]);

  const handleAddSchedule = async () => {
    if (!connectedDeviceId) return;
    
    if (formData.amount < 10 || formData.amount > 200) {
      alert("Jumlah pakan harus antara 10g - 200g");
      return;
    }
    if (!formData.days.some(d => d)) {
      alert("Pilih minimal 1 hari aktif");
      return;
    }

    const schedulesRef = ref(database, `devices/${connectedDeviceId}/schedules`);
    const newScheduleRef = push(schedulesRef);
    
    await set(newScheduleRef, {
      time: formData.time,
      amount: formData.amount,
      days: formData.days,
      enabled: formData.enabled,
      createdAt: Date.now()
    });
    
    setShowAddModal(false);
    setFormData({
      time: '08:00',
      amount: 50,
      days: [true, true, true, true, true, true, true],
      enabled: true
    });
  };

  const handleUpdateSchedule = async () => {
    if (!connectedDeviceId || !editingSchedule) return;
    if (formData.amount < 10 || formData.amount > 200) {
      alert("Jumlah pakan harus antara 10g - 200g");
      return;
    }
    if (!formData.days.some(d => d)) {
      alert("Pilih minimal 1 hari aktif");
      return;
    } 
    const scheduleRef = ref(database, `devices/${connectedDeviceId}/schedules/${editingSchedule.id}`);
    
    await update(scheduleRef, {
      time: formData.time,
      amount: formData.amount,
      days: formData.days,
      enabled: formData.enabled,
      updatedAt: Date.now()
    });
    
    setEditingSchedule(null);
    setShowAddModal(false);
    setFormData({
      time: '08:00',
      amount: 50,
      days: [true, true, true, true, true, true, true],
      enabled: true
    });
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!connectedDeviceId) return;
    if (!confirm('Hapus jadwal ini?')) return;
    
    const scheduleRef = ref(database, `devices/${connectedDeviceId}/schedules/${scheduleId}`);
    await remove(scheduleRef);
  };

  const handleToggleEnabled = async (schedule) => {
    if (!connectedDeviceId) return;
    
    const scheduleRef = ref(database, `devices/${connectedDeviceId}/schedules/${schedule.id}`);
    await update(scheduleRef, {
      enabled: !schedule.enabled
    });
  };

  const openEditModal = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      time: schedule.time,
      amount: schedule.amount,
      days: schedule.days,
      enabled: schedule.enabled
    });
    setShowAddModal(true);
  };

  const toggleDay = (index) => {
    const newDays = [...formData.days];
    newDays[index] = !newDays[index];
    setFormData({ ...formData, days: newDays });
  };

  const formatTime = (time) => {
    return time.substring(0, 5);
  };

  const getActiveDaysText = (days) => {
    const activeDays = daysName.filter((_, i) => days[i]);
    if (activeDays.length === 7) return 'Setiap hari';
    if (activeDays.length === 5 && !days[5] && !days[6]) return 'Senin - Jumat';
    if (activeDays.length === 2 && days[5] && days[6]) return 'Akhir Pekan';
    return activeDays.join(', ');
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Jadwal Makan</h1>
          <p className="text-sm text-gray-500 mt-1">
            Atur jadwal pemberian makan otomatis untuk {petName}
          </p>
        </div>
        <button
          onClick={() => {
            if (!isDeviceConnected) {
              alert('⚠️ Hubungkan Smart Feeder dulu sebelum membuat jadwal!');
              return;
            }
            setEditingSchedule(null);
            setFormData({
              time: '08:00',
              amount: 50,
              days: [true, true, true, true, true, true, true],
              enabled: true
            });
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 bg-[#D4A757] text-white px-4 py-2 rounded-xl hover:bg-[#c29644] transition shadow-md"
        >
          <Plus size={20} />
          <span>Tambah Jadwal</span>
        </button>
      </div>

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-12 text-center border border-white/50">
          <Calendar className="mx-auto text-gray-400 mb-4" size={64} />
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Belum Ada Jadwal
          </h3>
          <p className="text-gray-500 mb-4">
            {!isDeviceConnected 
              ? "Hubungkan Smart Feeder dulu untuk membuat jadwal makan"
              : `Tambahkan jadwal makan pertama untuk ${petName}`}
          </p>
          {isDeviceConnected ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-[#D4A757] text-white px-6 py-3 rounded-xl hover:bg-[#c29644] transition"
            >
              <Plus size={20} />
              Buat Jadwal
            </button>
          ) : (
            <div className="text-yellow-600 text-sm mt-2">
              ⚠️ Silakan hubungkan Smart Feeder terlebih dahulu di halaman Dashboard
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className={`bg-white/60 backdrop-blur-lg rounded-2xl p-4 border transition-all ${
                schedule.enabled 
                  ? 'border-white/50 hover:shadow-md' 
                  : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Left Section - Time & Amount */}
                <div className="flex items-center gap-4">
                  <div className="bg-[#D4A757]/10 rounded-xl p-3">
                    <Clock className="text-[#D4A757]" size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-800">
                        {formatTime(schedule.time)}
                      </span>
                      <span className="text-sm text-gray-500">WIB</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-sm font-semibold text-[#D4A757]">
                        {schedule.amount}g
                      </span>
                      <span className="text-xs text-gray-400">pakan</span>
                    </div>
                  </div>
                </div>

                {/* Days */}
                <div className="flex-1">
                  <div className="flex flex-wrap gap-1">
                    {daysName.map((day, idx) => (
                      <div
                        key={idx}
                        className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-medium ${
                          schedule.days[idx]
                            ? 'bg-[#D4A757] text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {getActiveDaysText(schedule.days)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(schedule)}
                    className={`p-2 rounded-lg transition ${
                      schedule.enabled
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {schedule.enabled ? <Bell size={18} /> : <BellOff size={18} />}
                  </button>
                  <button
                    onClick={() => openEditModal(schedule)}
                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                {editingSchedule ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSchedule(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Time Picker */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Waktu Makan
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757]"
              />
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jumlah Pakan (gram)
              </label>
              <input
                type="number"
                min="10"
                max="200"
                step="5"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757]"
              />
              <p className="text-xs text-gray-500 mt-1">Rekomendasi: 30-70g per makan</p>
            </div>

            {/* Days Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hari Aktif
              </label>
              <div className="flex gap-2 flex-wrap">
                {daysName.map((day, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`w-12 h-12 rounded-xl font-medium transition ${
                      formData.days[idx]
                        ? 'bg-[#D4A757] text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between mb-6 p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-700">Aktifkan Jadwal</p>
                <p className="text-xs text-gray-500">Jadwal akan berjalan sesuai waktu</p>
              </div>
              <button
                onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                className={`relative w-12 h-6 rounded-full transition ${
                  formData.enabled ? 'bg-[#D4A757]' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                    formData.enabled ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSchedule(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                onClick={editingSchedule ? handleUpdateSchedule : handleAddSchedule}
                className="flex-1 bg-[#D4A757] text-white px-4 py-2 rounded-lg hover:bg-[#c29644] transition"
              >
                {editingSchedule ? 'Simpan Perubahan' : 'Tambah Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;