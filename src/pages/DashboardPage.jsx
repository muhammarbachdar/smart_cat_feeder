import React, { useState, useMemo } from 'react';
import {
  Wifi, WifiOff, Battery, BatteryFull, BatteryCharging, BatteryLow, Zap,
  Thermometer, Droplets, HardDrive, Clock, TrendingUp, Circle, AlertCircle,
  ChevronRight, Coffee, Plus, Signal, SignalLow, SignalMedium,
  Usb, Loader2, AlertTriangle,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useDevice } from '../context/DeviceContext';

// ─────────────────────────────────────────────
//  Pure helpers (no hooks, easy to unit-test)
// ─────────────────────────────────────────────
const getWifiStatus = (strength) => {
  if (strength >= 70) return { label: 'Strong', Icon: Signal,      color: 'text-green-500' };
  if (strength >= 30) return { label: 'Medium', Icon: SignalMedium, color: 'text-yellow-500' };
  return               { label: 'Low',    Icon: SignalLow,   color: 'text-red-500' };
};

const freshnessColor = (pct) => {
  if (pct >= 80) return 'text-green-600';
  if (pct >= 60) return 'text-yellow-600';
  if (pct >= 40) return 'text-orange-600';
  return 'text-red-600';
};

const formatMealTime = (ts) => {
  if (!ts) return 'Not set';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────
const BatteryIcon = ({ level, isCharging }) => {
  if (isCharging)  return <Zap        className="text-green-500"  size={16} />;
  if (level > 70)  return <BatteryFull className="text-green-500"  size={16} />;
  if (level > 30)  return <Battery     className="text-yellow-500" size={16} />;
  return                  <BatteryLow  className="text-red-500"    size={16} />;
};

const StatCard = ({ title, children, icon: Icon }) => (
  <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
    {Icon && (
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} className="text-[#D4A757]" />
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

// ─────────────────────────────────────────────
//  Feed-Now modal
// ─────────────────────────────────────────────
const FeedModal = ({ info, onFeed, onClose, isProcessing }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="text-yellow-500" size={28} />
        <h2 className="text-xl font-bold text-gray-800">Ada Jadwal Mendekat!</h2>
      </div>
      <p className="text-gray-600 mb-4">Terdapat jadwal makan dalam {info.minutesLeft} menit lagi:</p>
      <div className="bg-yellow-50 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div><p className="text-xs text-gray-500">Waktu</p><p className="text-lg font-bold text-gray-800">{info.time} WIB</p></div>
          <div><p className="text-xs text-gray-500">Porsi</p><p className="text-lg font-bold text-[#D4A757]">{info.amount}g</p></div>
        </div>
      </div>
      <div className="space-y-3">
        <button onClick={() => onFeed(true)}  disabled={isProcessing} className="w-full bg-[#D4A757] text-white py-3 rounded-xl hover:bg-[#c29644] transition shadow-md flex items-center justify-center gap-2">
          {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <><Coffee size={20} /> Feed Now + Skip Jadwal {info.time}</>}
        </button>
        <button onClick={() => onFeed(false)} disabled={isProcessing} className="w-full border-2 border-[#D4A757] text-[#D4A757] py-3 rounded-xl hover:bg-[#D4A757]/10 transition flex items-center justify-center gap-2">
          Feed Now (Jadwal Tetap Jalan)
        </button>
        <button onClick={onClose} className="w-full border border-gray-300 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition">
          Batal
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
//  Main page
// ─────────────────────────────────────────────
const DashboardPage = () => {
  const {
    petName, connectedDeviceId, connectDevice,
    deviceStatus, feedingData, feedingHistory,
    foodFreshness, nextScheduleInfo, countdown,
    sendFeedCommand, schedules, isDeviceLoading,
  } = useDevice();

  const [showFeedModal, setShowFeedModal] = useState(false);
  const [isProcessingFeed, setIsProcessingFeed] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ── Derived data ───────────────────────────
  const wifi = getWifiStatus(deviceStatus.wifiStrength);

  const { todayFeedCount, totalSchedulesToday } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayIdx = (today.getDay() + 6) % 7;

    const todayFeedCount = feedingHistory.filter(i => {
      const d = new Date(i.timestamp);
      return d >= today && d < tomorrow;
    }).length;

    const totalSchedulesToday = schedules.filter(s => s.enabled && s.days?.[dayIdx]).length;
    return { todayFeedCount, totalSchedulesToday };
  }, [feedingHistory, schedules]);

  const chartData = useMemo(() =>
    feedingHistory.slice(-24).map(item => ({
      time: new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      amount: item.amount,
    })),
  [feedingHistory]);

  // ── Actions ────────────────────────────────
  const handleFeedClick = () => {
    if (!connectedDeviceId) { alert('⚠️ No device connected.'); return; }
    if (nextScheduleInfo && nextScheduleInfo.minutesLeft <= 30) {
      setShowFeedModal(true);
    } else {
      executeFeed(false);
    }
  };

  const executeFeed = async (skipNext) => {
    setIsProcessingFeed(true);
    setIsFeeding(true);
    try {
      await sendFeedCommand(skipNext);
      setTimeout(() => { setIsFeeding(false); setIsProcessingFeed(false); setShowFeedModal(false); }, 3000);
    } catch (e) {
      alert('Failed to dispense food. Please try again.');
      setIsFeeding(false); setIsProcessingFeed(false); setShowFeedModal(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectDevice();
      alert('✅ Device connected successfully!');
    } catch { alert('Failed to connect device.'); }
    finally { setIsConnecting(false); }
  };

  // ── Render ─────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">

      {/* Header */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#D4A757]/10 p-2 md:p-3 rounded-full">
              <Clock className="text-[#D4A757]" size={24} />
            </div>
            <div>
              <h2 className="text-lg md:text-2xl font-bold text-gray-800">Hello, {petName}'s Parent! 🐕</h2>
              {connectedDeviceId ? (
                <p className="text-sm text-gray-600 mt-1">
                  {petName} is full!{' '}
                  <span className="text-[#D4A757] font-semibold">
                    Next meal at {formatMealTime(feedingData.nextMealTime)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-yellow-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={14} /> No device connected. Please connect your Smart Feeder!
                </p>
              )}
            </div>
          </div>
          {connectedDeviceId && (
            <div className="text-left md:text-right">
              <div className="text-2xl md:text-3xl font-mono font-bold text-[#D4A757]">{countdown}</div>
              <p className="text-xs text-gray-500">until next feeding</p>
            </div>
          )}
        </div>
      </div>

      {/* No device state */}
      {!connectedDeviceId ? (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-8 md:p-12 text-center border border-white/50">
          <div className="max-w-md mx-auto">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <Usb className="text-gray-400" size={48} />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-3">Connect Your Smart Feeder</h3>
            <p className="text-gray-600 mb-4">
              Belum ada alat terhubung. Ayo hubungkan Smart Feeder kamu untuk mulai memantau {petName} dari jarak jauh!
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-blue-800 font-medium mb-2">📋 Cara Menghubungkan:</p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Pastikan Smart Pet Feeder dalam keadaan menyala</li>
                <li>Tekan tombol pairing selama 3 detik</li>
                <li>Tunggu LED berkedip biru</li>
                <li>Klik tombol "Hubungkan Alat" di bawah</li>
              </ol>
            </div>
            <button onClick={handleConnect} disabled={isConnecting} className="inline-flex items-center gap-2 bg-[#D4A757] text-white px-8 py-4 rounded-xl hover:bg-[#c29644] transition shadow-lg text-lg font-semibold disabled:opacity-50">
              {isConnecting ? <><Loader2 className="animate-spin" size={24} /> Menghubungkan...</> : <><Plus size={24} /> Hubungkan Alat</>}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Action row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">

            {/* Feed Now button */}
            <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col items-center justify-center border border-white/50">
              <button
                onClick={handleFeedClick}
                disabled={isFeeding || isProcessingFeed}
                className={`relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-[#D4A757] text-white shadow-2xl transition-all duration-300 hover:scale-105 focus:outline-none ${(isFeeding || isProcessingFeed) ? 'animate-pulse cursor-not-allowed opacity-75' : ''}`}
              >
                <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-75" />
                <div className="relative flex flex-col items-center justify-center h-full">
                  <Coffee size={32} className="mb-1" />
                  <span className="text-sm font-bold">{isFeeding ? 'Feeding...' : 'Feed Now!'}</span>
                </div>
              </button>
            </div>

            {/* Bowl status */}
            <StatCard title="Bowl Status" icon={HardDrive}>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Current Weight</p>
                  <p className="text-2xl font-bold text-gray-800">{(feedingData.bowlWeight || 0).toFixed(1)}g</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Meal</p>
                  <p className="text-sm font-semibold text-gray-700">{feedingData.lastMealAmount}g dispensed</p>
                </div>
              </div>
            </StatCard>

            {/* Daily feedings */}
            <StatCard title="">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Daily Feedings</p>
                <p className="text-2xl font-bold text-[#D4A757]">{todayFeedCount}/{totalSchedulesToday}</p>
                <p className="text-xs text-gray-500">{Math.max(0, totalSchedulesToday - todayFeedCount)} meals remaining</p>
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Food Freshness</span>
                    <span className={`font-medium ${freshnessColor(foodFreshness.percentage)}`}>{foodFreshness.status}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div className="bg-green-500 rounded-full h-1.5 transition-all duration-300" style={{ width: `${foodFreshness.percentage}%` }} />
                  </div>
                </div>
              </div>
            </StatCard>
          </div>

          {/* Tank + environment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <StatCard title="Food Tank" icon={HardDrive}>
              <div className="relative w-full h-32 bg-gray-200 rounded-lg overflow-hidden mb-2">
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#D4A757] to-[#f0c674] transition-all duration-500" style={{ height: `${feedingData.tankLevel}%` }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-gray-700 bg-white/80 px-3 py-1 rounded-full backdrop-blur-sm">{feedingData.tankLevel}%</span>
                </div>
              </div>
              <p className="text-center text-sm text-gray-600">{Math.round(feedingData.tankLevel * 8.33)}g remaining</p>
            </StatCard>

            <StatCard title="Storage Environment">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Thermometer size={18} className="text-orange-500" /><span className="text-sm text-gray-600">Temperature</span></div>
                  <span className="font-semibold text-gray-800">{feedingData.temperature}°C</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Droplets size={18} className="text-blue-500" /><span className="text-sm text-gray-600">Humidity</span></div>
                  <span className="font-semibold text-gray-800">{feedingData.humidity}%</span>
                </div>
              </div>
            </StatCard>
          </div>

          {/* Chart */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="text-[#D4A757]" size={20} />
                <h3 className="text-base md:text-lg font-semibold text-gray-800">Food Level History (Last 24 Hours)</h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Circle className="fill-[#D4A757] text-[#D4A757]" size={10} />
                <span>Food Level (g)</span>
              </div>
            </div>
            <div className="w-full h-48 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#D4A757" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#D4A757" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} interval="preserveStartEnd" />
                  <YAxis stroke="#9ca3af" fontSize={10} domain={[0, 'auto']} width={30} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="amount" stroke="#D4A757" strokeWidth={2} fill="url(#colorLevel)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showFeedModal && nextScheduleInfo && (
        <FeedModal
          info={nextScheduleInfo}
          onFeed={executeFeed}
          onClose={() => setShowFeedModal(false)}
          isProcessing={isProcessingFeed}
        />
      )}
      {isFeeding && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757] mb-4" />
            <p className="text-gray-700">Dispensing food... 🐾</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
