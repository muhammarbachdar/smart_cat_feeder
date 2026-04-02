import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Calendar,
  BarChart3,
  Activity,
  Droplets,
  Thermometer,
  Award,
  Clock
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';

const AnalyticsPage = ({ userId: _userId, petName = 'Maximus', connectedDeviceId }) => {
  const [feedingData, setFeedingData] = useState({
    bowlWeight: 0,
    tankLevel: 0,
    temperature: 0,
    humidity: 0,
    lastMealAmount: 0
  });
  
  const [feedingHistory, setFeedingHistory] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('week');
  const [refreshKey, setRefreshKey] = useState(0);

  const calculateFoodFreshness = (temp, humidity) => {
    let freshness = 100;

    if (temp < 15 || temp > 35) freshness -= 40;
    else if (temp < 18 || temp > 30) freshness -= 20;
    else if (temp < 20 || temp > 28) freshness -= 10;

    if (humidity < 30 || humidity > 70) freshness -= 30;
    else if (humidity < 35 || humidity > 65) freshness -= 15;
    else if (humidity < 40 || humidity > 60) freshness -= 5;

    freshness = Math.max(0, Math.min(100, freshness));

    let status = 'Baik';
    if (freshness < 30) status = 'Buruk';
    else if (freshness < 60) status = 'Sedang';
    else if (freshness < 80) status = 'Cukup';

    return { status, percentage: freshness };
  };

  const hasEnvironmentData = feedingData.temperature > 0 && feedingData.humidity > 0;
  const foodFreshness = hasEnvironmentData
    ? calculateFoodFreshness(feedingData.temperature, feedingData.humidity)
    : { status: 'Data tidak tersedia', percentage: 0 };

  const foodFreshnessColorClass =
    foodFreshness.percentage >= 80
      ? 'text-green-600'
      : foodFreshness.percentage >= 60
        ? 'text-yellow-600'
        : foodFreshness.percentage >= 40
          ? 'text-orange-600'
          : 'text-red-600';

  const foodFreshnessBarClass =
    foodFreshness.percentage >= 80
      ? 'bg-green-500'
      : foodFreshness.percentage >= 60
        ? 'bg-yellow-500'
        : foodFreshness.percentage >= 40
          ? 'bg-orange-500'
          : 'bg-red-500';

  // ==================== LOAD DATA FROM FIREBASE ====================

  const { feedingData, feedingHistory, schedules, connectedDeviceId } = useDevice();
  
  // ==================== HITUNG STATISTIK MINGGUAN ====================
  const calculateWeeklyStats = (history) => {
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const stats = days.map(day => ({ day, amount: 0, count: 0 }));
    
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    history.forEach(record => {
      const recordDate = new Date(record.timestamp);
      if (recordDate >= weekAgo) {
        const dayIndex = recordDate.getDay();
        const idx = dayIndex === 0 ? 6 : dayIndex - 1;
        stats[idx].amount += record.amount;
        stats[idx].count += 1;
      }
    });
    
    setWeeklyStats(stats);
  };
  
  // ==================== PERHITUNGAN STATISTIK ====================
  const totalConsumption = feedingHistory.reduce((sum, record) => sum + record.amount, 0);
  
  // [PERBAIKAN 3] Hitung uniqueDays dari timestamp yang sudah dikalikan 1000
  const uniqueDays = new Set(feedingHistory.map(record => 
    new Date(record.timestamp).toLocaleDateString('id-ID')
  )).size;
  
  const avgDaily = feedingHistory.length > 0 ? (totalConsumption / (uniqueDays || 1)).toFixed(0) : 0;
  const avgMeal = feedingHistory.length > 0 ? (totalConsumption / feedingHistory.length).toFixed(0) : 0;
  
  // ==================== FILTER DATA BERDASARKAN TIME RANGE ====================
  const getFilteredData = () => {
    const now = new Date();
    const filtered = feedingHistory.filter(record => {
      const recordDate = new Date(record.timestamp);
      if (timeRange === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return recordDate >= weekAgo;
      } else {
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return recordDate >= monthAgo;
      }
    });
    return filtered.reverse();
  };
  
  // [PERBAIKAN 4] Format chart data dengan lokal Indonesia (id-ID)
  const chartData = getFilteredData().map(record => ({
    date: new Date(record.timestamp).toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'short' 
    }),
    amount: record.amount
  }));
  
  // ==================== RENDER ====================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757]"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6" key={refreshKey}>
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Statistik konsumsi pakan {petName}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('week')}
            className={`px-4 py-2 rounded-lg transition ${
              timeRange === 'week'
                ? 'bg-[#D4A757] text-white'
                : 'bg-white/60 text-gray-600 hover:bg-white/80'
            }`}
          >
            Minggu Ini
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={`px-4 py-2 rounded-lg transition ${
              timeRange === 'month'
                ? 'bg-[#D4A757] text-white'
                : 'bg-white/60 text-gray-600 hover:bg-white/80'
            }`}
          >
            Bulan Ini
          </button>
        </div>
      </div>
      
      {/* STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-[#D4A757]" size={20} />
            <span className="text-xs text-gray-500">Total Konsumsi</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{totalConsumption}g</p>
          <p className="text-xs text-gray-400 mt-1">30 hari terakhir</p>
        </div>
        
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-[#D4A757]" size={20} />
            <span className="text-xs text-gray-500">Rata-rata Harian</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{avgDaily}g</p>
          <p className="text-xs text-gray-400 mt-1">per hari</p>
        </div>
        
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
          <div className="flex items-center gap-2 mb-2">
            <Award className="text-[#D4A757]" size={20} />
            <span className="text-xs text-gray-500">Rata-rata per Makan</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{avgMeal}g</p>
          <p className="text-xs text-gray-400 mt-1">per feeding</p>
        </div>
        
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-[#D4A757]" size={20} />
            <span className="text-xs text-gray-500">Total Feeding</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{feedingHistory.length}</p>
          <p className="text-xs text-gray-400 mt-1">kali</p>
        </div>
      </div>
      
      {/* CHART - KONSUMSI HARIAN */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="text-[#D4A757]" size={20} />
          <h3 className="text-base md:text-lg font-semibold text-gray-800">
            Konsumsi Pakan Harian
          </h3>
        </div>
        <div className="w-full h-64 md:h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} label={{ value: 'Gram (g)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }} />
                <Tooltip formatter={(value) => [`${value}g`, 'Konsumsi']} />
                <Bar dataKey="amount" fill="#D4A757" radius={[4, 4, 0, 0]} name="Konsumsi (g)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              Belum ada data feeding
            </div>
          )}
        </div>
      </div>
      
      {/* WEEKLY STATS & ENVIRONMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WEEKLY PATTERN */}
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-[#D4A757]" size={20} />
            <h3 className="text-base md:text-lg font-semibold text-gray-800">
              Pola Makan Mingguan
            </h3>
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
          <p className="text-xs text-gray-400 mt-4 text-center">
            *Berdasarkan 7 hari terakhir
          </p>
        </div>
        
        {/* ENVIRONMENT & HEALTH */}
        <div className="space-y-6">
          {/* ENVIRONMENT CARD */}
          <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="text-[#D4A757]" size={20} />
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                Kondisi Lingkungan
              </h3>
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
                <span className={`${foodFreshnessColorClass} font-medium`}>
                  {foodFreshness.status} ({foodFreshness.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className={`${foodFreshnessBarClass} rounded-full h-2 transition-all duration-300`}
                  style={{ width: `${foodFreshness.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {hasEnvironmentData
                  ? `Pakan masih segar, sisa ${feedingData.tankLevel}% di tangki`
                  : 'Sensor suhu/kelembaban belum mengirim data.'}
              </p>
            </div>
          </div>
          
          {/* RECOMMENDATION CARD */}
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
                {feedingData.tankLevel < 30 ? 'Segera isi ulang pakan, stok tersisa sedikit!' : `Stok pakan tersisa ${feedingData.tankLevel}%, cukup untuk ${Math.floor(feedingData.tankLevel / 10)} hari ke depan.`}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4A757]">•</span>
                Suhu dan kelembaban dalam kondisi optimal untuk penyimpanan pakan.
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* TREND CHART */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-[#D4A757]" size={20} />
          <h3 className="text-base md:text-lg font-semibold text-gray-800">
            Tren Konsumsi (30 Hari)
          </h3>
        </div>
        <div className="w-full h-64 md:h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.slice(-30)}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4A757" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#D4A757" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip formatter={(value) => [`${value}g`, 'Konsumsi']} />
                <Area type="monotone" dataKey="amount" stroke="#D4A757" strokeWidth={2} fill="url(#trendGradient)" name="Konsumsi (g)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              Belum ada data feeding
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;