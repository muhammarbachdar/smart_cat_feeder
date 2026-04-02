import React, { useState, useMemo } from 'react';
import {
  TrendingUp, Calendar, BarChart3, Activity,
  Droplets, Thermometer, Award, Clock
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { useDevice } from '../context/DeviceContext';

const AnalyticsPage = () => {
  const { feedingData, feedingHistory, foodFreshness } = useDevice();

  const [timeRange, setTimeRange] = useState('week');

  // ── Derived stats ──────────────────────────────
  const totalConsumption = feedingHistory.reduce((sum, r) => sum + r.amount, 0);

  const uniqueDays = new Set(
    feedingHistory.map(r => new Date(r.timestamp).toLocaleDateString('id-ID'))
  ).size;

  const avgDaily = feedingHistory.length > 0 ? (totalConsumption / (uniqueDays || 1)).toFixed(0) : 0;
  const avgMeal  = feedingHistory.length > 0 ? (totalConsumption / feedingHistory.length).toFixed(0) : 0;

  // ── Weekly stats ───────────────────────────────
  const weeklyStats = useMemo(() => {
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const stats = days.map(day => ({ day, amount: 0, count: 0 }));
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

    feedingHistory.forEach(record => {
      const d = new Date(record.timestamp);
      if (d >= weekAgo) {
        const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        stats[idx].amount += record.amount;
        stats[idx].count  += 1;
      }
    });
    return stats;
  }, [feedingHistory]);

  // ── Filtered chart data ────────────────────────
  const chartData = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (timeRange === 'week' ? 7 : 30));

    return [...feedingHistory]
      .filter(r => new Date(r.timestamp) >= cutoff)
      .reverse()
      .map(r => ({
        date: new Date(r.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        amount: r.amount,
      }));
  }, [feedingHistory, timeRange]);

  // ── Freshness colors ───────────────────────────
  const freshnessColorClass =
    foodFreshness.percentage >= 80 ? 'text-green-600' :
    foodFreshness.percentage >= 60 ? 'text-yellow-600' :
    foodFreshness.percentage >= 40 ? 'text-orange-600' : 'text-red-600';

  const freshnessBarClass =
    foodFreshness.percentage >= 80 ? 'bg-green-500' :
    foodFreshness.percentage >= 60 ? 'bg-yellow-500' :
    foodFreshness.percentage >= 40 ? 'bg-orange-500' : 'bg-red-500';

  const hasEnvironmentData = feedingData.temperature > 0 && feedingData.humidity > 0;

  // ── Render ─────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Statistik konsumsi pakan</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTimeRange('week')} className={`px-4 py-2 rounded-lg transition ${timeRange === 'week' ? 'bg-[#D4A757] text-white' : 'bg-white/60 text-gray-600 hover:bg-white/80'}`}>
            Minggu Ini
          </button>
          <button onClick={() => setTimeRange('month')} className={`px-4 py-2 rounded-lg transition ${timeRange === 'month' ? 'bg-[#D4A757] text-white' : 'bg-white/60 text-gray-600 hover:bg-white/80'}`}>
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'Total Konsumsi', value: `${totalConsumption}g`, sub: '30 hari terakhir' },
          { icon: Activity,   label: 'Rata-rata Harian', value: `${avgDaily}g`, sub: 'per hari' },
          { icon: Award,      label: 'Rata-rata per Makan', value: `${avgMeal}g`, sub: 'per feeding' },
          { icon: Clock,      label: 'Total Feeding', value: feedingHistory.length, sub: 'kali' },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="text-[#D4A757]" size={20} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="text-[#D4A757]" size={20} />
          <h3 className="text-base md:text-lg font-semibold text-gray-800">Konsumsi Pakan Harian</h3>
        </div>
        <div className="w-full h-64 md:h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} label={{ value: 'Gram (g)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }} />
                <Tooltip formatter={(v) => [`${v}g`, 'Konsumsi']} />
                <Bar dataKey="amount" fill="#D4A757" radius={[4, 4, 0, 0]} name="Konsumsi (g)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Belum ada data feeding</div>
          )}
        </div>
      </div>

      {/* Weekly + Environment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Pattern */}
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-[#D4A757]" size={20} />
            <h3 className="text-base md:text-lg font-semibold text-gray-800">Pola Makan Mingguan</h3>
          </div>
          <div className="space-y-3">
            {weeklyStats.map((stat, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-12 text-sm font-medium text-gray-600">{stat.day}</div>
                <div className="flex-1 h-8 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#D4A757] rounded-full flex items-center justify-end pr-2 text-xs text-white font-medium"
                    style={{ width: `${Math.min(100, (stat.amount / 300) * 100)}%` }}
                  >
                    {stat.amount > 0 && `${stat.amount}g`}
                  </div>
                </div>
                <div className="w-12 text-xs text-gray-500">{stat.count}x</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4 text-center">*Berdasarkan 7 hari terakhir</p>
        </div>

        {/* Environment + Recommendation */}
        <div className="space-y-6">
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">Kondisi Lingkungan</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-orange-50 rounded-xl">
                <Thermometer className="mx-auto text-orange-500 mb-2" size={24} />
                <p className="text-2xl font-bold text-gray-800">{feedingData.temperature}°C</p>
                <p className="text-xs text-gray-500">Suhu Ruangan</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <Droplets className="mx-auto text-blue-500 mb-2" size={24} />
                <p className="text-2xl font-bold text-gray-800">{feedingData.humidity}%</p>
                <p className="text-xs text-gray-500">Kelembaban</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-green-50 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Kualitas Pakan</span>
                <span className={`${freshnessColorClass} font-medium`}>
                  {foodFreshness.status} ({foodFreshness.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className={`${freshnessBarClass} rounded-full h-2 transition-all duration-300`} style={{ width: `${foodFreshness.percentage}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {hasEnvironmentData
                  ? `Pakan masih segar, sisa ${feedingData.tankLevel}% di tangki`
                  : 'Sensor suhu/kelembaban belum mengirim data.'}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#D4A757]/20 to-amber-500/20 backdrop-blur-lg rounded-2xl p-4 md:p-6 border border-white/50">
            <div className="flex items-center gap-2 mb-3">
              <Award className="text-[#D4A757]" size={20} />
              <h3 className="text-base font-semibold text-gray-800">Rekomendasi</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-[#D4A757]">•</span>
                Konsumsi harian rata-rata {avgDaily}g, sesuai dengan rekomendasi untuk berat badan ideal.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4A757]">•</span>
                {feedingData.tankLevel < 30
                  ? 'Segera isi ulang pakan, stok tersisa sedikit!'
                  : `Stok pakan tersisa ${feedingData.tankLevel}%, cukup untuk ${Math.floor(feedingData.tankLevel / 10)} hari ke depan.`}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4A757]">•</span>
                Suhu dan kelembaban dalam kondisi optimal untuk penyimpanan pakan.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-[#D4A757]" size={20} />
          <h3 className="text-base md:text-lg font-semibold text-gray-800">Tren Konsumsi (30 Hari)</h3>
        </div>
        <div className="w-full h-64 md:h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.slice(-30)}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#D4A757" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D4A757" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip formatter={(v) => [`${v}g`, 'Konsumsi']} />
                <Area type="monotone" dataKey="amount" stroke="#D4A757" strokeWidth={2} fill="url(#trendGradient)" name="Konsumsi (g)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Belum ada data feeding</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
