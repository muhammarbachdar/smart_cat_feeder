import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Calendar, BarChart3, Settings, Wifi, WifiOff, 
  Battery, BatteryFull, BatteryCharging, BatteryLow, Zap, Thermometer, 
  Droplets, HardDrive, PawPrint, Clock, TrendingUp, Circle, AlertCircle, 
  ChevronRight, Coffee, Plus, Signal, SignalLow, SignalMedium, LogOut, 
  Usb, Loader2, AlertTriangle
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ref, onValue, set, get, off } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, database } from '../firebase/config';
import SchedulePage from './SchedulePage';
import AnalyticsPage from './AnalyticsPage';
import SettingsPage from './SettingsPage';

const Dashboard = ({ petName = 'Maximus', userId, onLogout }) => {
  // ==================== STATE ====================
  const [deviceStatus, setDeviceStatus] = useState({
    isOnline: false, batteryLevel: 0, isCharging: false, wifiStrength: 0
  });
  
  const [feedingData, setFeedingData] = useState({
    nextMeal: "19:00", nextMealTime: null, countdown: "00:00:00",
    bowlWeight: 0, tankLevel: 0, temperature: 0, humidity: 0, lastMealAmount: 0
  });
  
  const [foodHistory, setFoodHistory] = useState([]);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [isFeeding, setIsFeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingDevice, setIsConnectingDevice] = useState(false);
  const [currentPetName, setCurrentPetName] = useState(petName);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [chartKey, setChartKey] = useState(0);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [nextScheduleInfo, setNextScheduleInfo] = useState(null);
  const [isProcessingFeed, setIsProcessingFeed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(auth.currentUser?.uid || userId || null);

  // ==================== STATE UNTUK DATA REAL ====================
  const [todayFeedCount, setTodayFeedCount] = useState(0);
  const [totalSchedulesToday, setTotalSchedulesToday] = useState(0);
  const [foodFreshness, setFoodFreshness] = useState({ status: 'Good', percentage: 85 });

  // ==================== HELPER FUNCTIONS ====================
  const getWifiStatus = (strength) => {
    if (strength >= 70) return { label: 'Strong', icon: Signal, color: 'text-green-500' };
    if (strength >= 30) return { label: 'Medium', icon: SignalMedium, color: 'text-yellow-500' };
    return { label: 'Low', icon: SignalLow, color: 'text-red-500' };
  };

  const getBatteryIcon = () => {
    if (deviceStatus.isCharging) return <Zap className="text-green-500" size={16} />;
    if (deviceStatus.batteryLevel > 70) return <BatteryFull className="text-green-500" size={16} />;
    if (deviceStatus.batteryLevel > 30) return <Battery className="text-yellow-500" size={16} />;
    return <BatteryLow className="text-red-500" size={16} />;
  };

  const calculateCountdown = (nextMealTime) => {
    if (!nextMealTime) return "00:00:00";
    const now = new Date();
    const mealTime = new Date(nextMealTime);
    if (mealTime < now) mealTime.setDate(mealTime.getDate() + 1);
    const diff = mealTime - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatMealTime = (timestamp) => {
    if (!timestamp) return "Not set";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ==================== HITUNG FOOD FRESHNESS DARI SUHU & HUMIDITY ====================
  const calculateFoodFreshness = (temp, humidity) => {
    // Suhu ideal: 20-25°C, Kelembaban ideal: 40-60%
    let freshness = 100;
    
    // Penalti suhu
    if (temp < 15 || temp > 35) freshness -= 40;
    else if (temp < 18 || temp > 30) freshness -= 20;
    else if (temp < 20 || temp > 28) freshness -= 10;
    
    // Penalti kelembaban
    if (humidity < 30 || humidity > 70) freshness -= 30;
    else if (humidity < 35 || humidity > 65) freshness -= 15;
    else if (humidity < 40 || humidity > 60) freshness -= 5;
    
    // Batasi antara 0-100
    freshness = Math.max(0, Math.min(100, freshness));
    
    let status = 'Good';
    if (freshness < 30) status = 'Bad';
    else if (freshness < 60) status = 'Moderate';
    else if (freshness < 80) status = 'Fair';
    
    return { status, percentage: freshness };
  };

  // ==================== HITUNG DAILY FEEDINGS ====================
  const calculateDailyFeedings = (historyList, schedulesList) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Hitung feeding history hari ini
    const todayFeeds = historyList.filter(item => {
      const feedDate = new Date(item.timestamp);
      return feedDate >= today && feedDate < tomorrow;
    }).length;
    
    // Hitung total jadwal hari ini
    const currentDayIndex = (today.getDay() + 6) % 7; // 0=Senin
    let todaySchedules = 0;
    
    schedulesList.forEach(schedule => {
      if (schedule.enabled && schedule.days[currentDayIndex]) {
        todaySchedules++;
      }
    });
    
    setTodayFeedCount(todayFeeds);
    setTotalSchedulesToday(todaySchedules);
  };

  // ==================== EFFECTS (FIREBASE LISTENERS) ====================

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setCurrentUserId(firebaseUser?.uid || userId || null);
    });
    return () => unsubscribeAuth();
  }, [userId]);

  useEffect(() => {
    if (!currentUserId) return;
    // Fetching data berdasarkan deviceId yang terhubung di profile user
    const userRef = ref(database, `users/${currentUserId}/connectedDevice`);
    const handleConnectedDevice = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setConnectedDeviceId(data);
      } else {
        setConnectedDeviceId(null);
      }
      setIsLoading(false);
    };
    onValue(userRef, handleConnectedDevice);
    return () => off(userRef, 'value', handleConnectedDevice);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setConnectedDeviceId(null);
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!connectedDeviceId) return;
    const deviceStatusRef = ref(database, `devices/${connectedDeviceId}/deviceStatus`);
    const feedingDataRef = ref(database, `devices/${connectedDeviceId}/feedingData`);
    
    const handleDeviceStatus = (snapshot) => {
      const data = snapshot.val();
      if (data) setDeviceStatus(data);
    };
    
    const handleFeedingData = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setFeedingData(prev => ({
          ...prev,
          bowlWeight: data.bowlWeight || data.bowWeight || 0,
          tankLevel: data.tankLevel || 0,
          temperature: data.temperature || 0,
          humidity: data.humidity || 0,
          lastMealAmount: data.lastMealAmount || 0,
          nextMealTime: data.nextMealTime || null,
          countdown: calculateCountdown(data.nextMealTime)
        }));
        
        // Update food freshness berdasarkan suhu dan kelembaban real
        const freshness = calculateFoodFreshness(data.temperature || 0, data.humidity || 0);
        setFoodFreshness(freshness);
      }
    };

    onValue(deviceStatusRef, handleDeviceStatus);
    onValue(feedingDataRef, handleFeedingData);

    return () => {
      off(deviceStatusRef, 'value', handleDeviceStatus);
      off(feedingDataRef, 'value', handleFeedingData);
    };
  }, [connectedDeviceId]);

  // ==================== BACA FOOD HISTORY & SCHEDULE UNTUK DAILY FEEDINGS ====================
  useEffect(() => {
    if (!connectedDeviceId) return;

    const historyRef = ref(database, `devices/${connectedDeviceId}/feedingHistory`);
    const schedulesRef = ref(database, `devices/${connectedDeviceId}/schedules`);
    
    let latestHistoryList = [];

    const calculateAndSetFromSchedules = (scheduleData) => {
      if (scheduleData && typeof scheduleData === 'object') {
        const schedulesList = Object.values(scheduleData);
        calculateDailyFeedings(latestHistoryList, schedulesList);
      } else {
        calculateDailyFeedings(latestHistoryList, []);
      }
    };

    const handleHistory = (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        latestHistoryList = Object.values(data)
          .map(item => ({
            timestamp: (item.timestamp || 0) * 1000,
            amount: item.amount || 0
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
        
        const chartData = latestHistoryList.map(item => ({
          time: new Date(item.timestamp).toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          amount: item.amount
        }));
        
        setFoodHistory(chartData);
        setChartKey(prev => prev + 1);
      } else {
        latestHistoryList = [];
        setFoodHistory([]);
      }
    };

    const handleSchedules = (snapshot) => {
      calculateAndSetFromSchedules(snapshot.val());
    };

    onValue(historyRef, handleHistory);
    onValue(schedulesRef, handleSchedules);

    return () => {
      off(historyRef, 'value', handleHistory);
      off(schedulesRef, 'value', handleSchedules);
    };
  }, [connectedDeviceId]);

  // [EFFECT 4] BACA schedule & update nextMealTime
  useEffect(() => {
    if (!connectedDeviceId) return;
    
    const schedulesRef = ref(database, `devices/${connectedDeviceId}/schedules`);
    
    const handleSchedules = async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const schedules = Object.values(data).filter(s => s.enabled !== false);
        if (schedules.length > 0) {
          const now = new Date();
          const currentDayIndex = (now.getDay() + 6) % 7;
          const currentHours = now.getHours();
          const currentMinutes = now.getMinutes();
          
          let nextMeal = null;
          let minDiff = Infinity;
          let nearestSchedule = null;
          
          schedules.forEach(schedule => {
            const [hours, minutes] = schedule.time.split(':');
            const scheduleHour = parseInt(hours);
            const scheduleMinute = parseInt(minutes);
            
            schedule.days.forEach((active, dayIndex) => {
              if (active) {
                let daysToAdd = dayIndex - currentDayIndex;
                if (daysToAdd < 0) daysToAdd += 7;
                
                if (daysToAdd === 0) {
                  if (scheduleHour < currentHours || 
                      (scheduleHour === currentHours && scheduleMinute < currentMinutes)) {
                    daysToAdd = 7;
                  }
                }
                
                let mealTime = new Date(now);
                mealTime.setDate(mealTime.getDate() + daysToAdd);
                mealTime.setHours(scheduleHour, scheduleMinute, 0, 0);
                
                const diff = mealTime - now;
                if (diff > 0 && diff < minDiff) {
                  minDiff = diff;
                  nextMeal = mealTime;
                  nearestSchedule = schedule;
                }
              }
            });
          });
          
          if (nearestSchedule && minDiff < 30 * 60 * 1000) {
            setNextScheduleInfo({
              time: nearestSchedule.time,
              amount: nearestSchedule.amount,
              minutesLeft: Math.floor(minDiff / 60000)
            });
          } else {
            setNextScheduleInfo(null);
          }
          
          if (nextMeal) {
            const feedingDataRef = ref(database, `devices/${connectedDeviceId}/feedingData`);
            const snapshot = await get(feedingDataRef);
            const currentData = snapshot.val() || {};
            
            await set(feedingDataRef, {
              ...currentData,
              nextMealTime: nextMeal.getTime()
            });
          }
        }
      }
    };

    onValue(schedulesRef, handleSchedules);
    return () => off(schedulesRef, 'value', handleSchedules);
  }, [connectedDeviceId]);
  
  // COUNTDOWN TIMER
  useEffect(() => {
    const updateCountdown = () => {
      if (feedingData.nextMealTime) {
        const now = new Date();
        let mealTime = new Date(feedingData.nextMealTime);
        if (mealTime < now) {
          mealTime = new Date(mealTime);
          mealTime.setDate(mealTime.getDate() + 1);
        }
        const diff = mealTime - now;
        if (diff > 0) {
          const hours = Math.floor(diff / 3600000);
          const minutes = Math.floor((diff % 3600000) / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          setFeedingData(prev => ({
            ...prev,
            countdown: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          }));
        }
      }
    };
    const interval = setInterval(updateCountdown, 1000);
    updateCountdown();
    return () => clearInterval(interval);
  }, [feedingData.nextMealTime]);

  // BACA pet name
  useEffect(() => {
    if (!currentUserId) return;
    const userRef = ref(database, `users/${currentUserId}/petName`);
    const handlePetName = (snapshot) => {
      const data = snapshot.val();
      if (data) setCurrentPetName(data);
    };
    onValue(userRef, handlePetName);
    return () => off(userRef, 'value', handlePetName);
  }, [currentUserId]);

  // ==================== FUNGSI FEED NOW ====================
  const executeFeedNow = async (skipNext) => {
    if (!connectedDeviceId) return;
    setIsProcessingFeed(true);
    try {
      const commandRef = ref(database, `devices/${connectedDeviceId}/commands/feedNow`);
      const timestampRef = ref(database, `devices/${connectedDeviceId}/commands/timestamp`);
      const skipNextRef = ref(database, `devices/${connectedDeviceId}/commands/skipNext`);
      
      await set(commandRef, true);
      await set(timestampRef, Date.now());
      await set(skipNextRef, skipNext);
      
      setTimeout(() => {
        setIsFeeding(false);
        setIsProcessingFeed(false);
        setShowFeedModal(false);
      }, 3000);
    } catch (error) {
      console.error("Error feeding:", error);
      alert('Failed to dispense food. Please try again.');
      setIsProcessingFeed(false);
      setShowFeedModal(false);
    }
  };

  const handleFeedNowClick = () => {
    if (!connectedDeviceId) {
      alert('⚠️ No device connected. Please connect your Smart Pet Feeder first!');
      return;
    }
    if (nextScheduleInfo && nextScheduleInfo.minutesLeft <= 30) {
      setShowFeedModal(true);
    } else {
      executeFeedNow(false);
    }
  };

  // ==================== KONEKSI DEVICE & LOGOUT ====================
  const handleConnectDevice = async () => {
    setIsConnectingDevice(true);
    try {
      const normalizedUserId = currentUserId || userId;
      if (!normalizedUserId) {
        throw new Error("User is not authenticated");
      }
      const defaultDeviceId = `device_${normalizedUserId.slice(0, 8)}`;
      const userRef = ref(database, `users/${normalizedUserId}/connectedDevice`);
      await set(userRef, defaultDeviceId);
      
      const deviceStatusRef = ref(database, `devices/${defaultDeviceId}/deviceStatus`);
      const deviceStatusSnap = await get(deviceStatusRef);
      if (!deviceStatusSnap.exists()) {
        await set(deviceStatusRef, {
          isOnline: true,
          batteryLevel: 85,
          isCharging: false,
          wifiStrength: 75
        });
      }
      
      const feedingDataRef = ref(database, `devices/${defaultDeviceId}/feedingData`);
      const feedingDataSnap = await get(feedingDataRef);
      if (!feedingDataSnap.exists()) {
        await set(feedingDataRef, {
          bowlWeight: 245,
          tankLevel: 75,
          temperature: 24.5,
          humidity: 45,
          lastMealAmount: 50
        });
      }
      alert('✅ Device connected successfully! Your Smart Pet Feeder is now online.');
    } catch (error) {
      console.error("Error connecting device:", error);
      alert('Failed to connect device. Please try again.');
    } finally {
      setIsConnectingDevice(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    if (onLogout) onLogout();
  };

  // ==================== RENDER ====================
  const wifiInfo = getWifiStatus(deviceStatus.wifiStrength);
  const WifiIcon = wifiInfo.icon;
  
  // Hitung sisa feeding hari ini
  const remainingFeedings = Math.max(0, totalSchedulesToday - todayFeedCount);
  const feedingsDone = todayFeedCount;
  const totalFeedings = totalSchedulesToday;

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'schedule', icon: Calendar, label: 'Schedule' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-sky-100 via-sky-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Warna food freshness berdasarkan persentase
  const getFreshnessColor = () => {
    if (foodFreshness.percentage >= 80) return 'text-green-600';
    if (foodFreshness.percentage >= 60) return 'text-yellow-600';
    if (foodFreshness.percentage >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-100 via-sky-50 to-white">
      <div className="flex flex-col lg:flex-row min-h-screen">
        
        {/* MOBILE NAVIGATION */}
        <div className="lg:hidden bg-white/80 backdrop-blur-lg border-b border-white/50 sticky top-0 z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#D4A757] p-2 rounded-xl">
                <PawPrint className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Smart<span className="text-[#D4A757]">.</span>Pet</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {connectedDeviceId && (
                <>
                  {getBatteryIcon()}
                  <WifiIcon size={16} className={wifiInfo.color} />
                </>
              )}
              <button onClick={handleLogout} className="text-gray-500 hover:text-red-500">
                <LogOut size={20} />
              </button>
            </div>
          </div>
          <div className="flex justify-around p-2 border-t border-gray-200">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
                    isActive ? 'text-[#D4A757]' : 'text-gray-500'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DESKTOP SIDEBAR */}
        <div className="hidden lg:block lg:w-64 sticky top-0 h-screen">
          <div className="h-full flex flex-col bg-white/30 backdrop-blur-xl border-r border-white/50 shadow-lg">
            <div className="p-6 border-b border-white/50">
              <div className="flex items-center gap-2">
                <div className="bg-[#D4A757] p-2 rounded-xl">
                  <PawPrint className="text-white" size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Smart<span className="text-[#D4A757]">.</span>Pet</h1>
                  <p className="text-xs text-gray-500">IoT Pet Feeder</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <nav className="p-4 space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isActive 
                          ? 'bg-[#D4A757] text-white shadow-lg' 
                          : 'text-gray-600 hover:bg-white/50 hover:text-[#D4A757]'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="font-medium">{item.label}</span>
                      {isActive && <ChevronRight size={16} className="ml-auto" />}
                    </button>
                  );
                })}
              </nav>
            </div>
            
            <div className="border-t border-white/40 bg-white/10 backdrop-blur-lg p-4 space-y-3">
              {connectedDeviceId ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {deviceStatus.isOnline ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500" />}
                      <span className="text-xs text-gray-600">WiFi {wifiInfo.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getBatteryIcon()}
                      <span className="text-xs text-gray-600">
                        {deviceStatus.isCharging ? 'Plugged In' : `${deviceStatus.batteryLevel}%`}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-green-500 rounded-full h-1.5 transition-all duration-300" style={{ width: `${deviceStatus.wifiStrength}%` }} />
                  </div>
                  <p className="text-xs text-center text-gray-400 mt-1">Device: {connectedDeviceId}</p>
                </>
              ) : (
                <div className="text-center">
                  <AlertCircle className="mx-auto text-yellow-500 mb-2" size={24} />
                  <p className="text-xs text-gray-600 mb-2">No device connected</p>
                </div>
              )}
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-red-500 transition py-2">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* MAIN CONTENT */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {activeNav === 'dashboard' && (
            <div className="space-y-4 md:space-y-5">
              <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#D4A757]/10 p-2 md:p-3 rounded-full">
                      <Clock className="text-[#D4A757]" size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg md:text-2xl font-bold text-gray-800">Hello, {currentPetName}'s Parent! 🐕</h2>
                      {connectedDeviceId ? (
                        <p className="text-sm text-gray-600 mt-1">
                          {currentPetName} is full!{' '}
                          <span className="text-[#D4A757] font-semibold">
                            Next meal at {formatMealTime(feedingData.nextMealTime)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm text-yellow-600 mt-1 flex items-center gap-1">
                          <AlertCircle size={14} />
                          No device connected. Please connect your Smart Feeder to start!
                        </p>
                      )}
                    </div>
                  </div>
                  {connectedDeviceId && (
                    <div className="text-left md:text-right">
                      <div className="text-2xl md:text-3xl font-mono font-bold text-[#D4A757]">{feedingData.countdown}</div>
                      <p className="text-xs text-gray-500">until next feeding</p>
                    </div>
                  )}
                </div>
              </div>
              
              {!connectedDeviceId ? (
                <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-8 md:p-12 text-center border border-white/50">
                  <div className="max-w-md mx-auto">
                    <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Usb className="text-gray-400" size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-3">Connect Your Smart Feeder</h3>
                    <p className="text-gray-600 mb-4">
                      Belum ada alat terhubung. Ayo hubungkan Smart Feeder kamu untuk mulai memantau dan memberi makan {currentPetName} dari jarak jauh!
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                      <p className="text-sm text-blue-800 font-medium mb-2">📋 Cara Menghubungkan:</p>
                      <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Pastikan Smart Pet Feeder dalam keadaan menyala</li>
                        <li>Tekan tombol pairing pada device selama 3 detik</li>
                        <li>Tunggu LED berkedip biru</li>
                        <li>Klik tombol "Hubungkan Alat" di bawah</li>
                      </ol>
                    </div>
                    <button onClick={handleConnectDevice} disabled={isConnectingDevice} className="inline-flex items-center gap-2 bg-[#D4A757] text-white px-8 py-4 rounded-xl hover:bg-[#c29644] transition shadow-lg text-lg font-semibold disabled:opacity-50">
                      {isConnectingDevice ? (
                        <><Loader2 className="animate-spin" size={24} /> Menghubungkan...</>
                      ) : (
                        <><Plus size={24} /> Hubungkan Alat</>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col items-center justify-center border border-white/50">
                      <button onClick={handleFeedNowClick} disabled={isFeeding || isProcessingFeed} className={`relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-[#D4A757] text-white shadow-2xl transition-all duration-300 hover:scale-105 focus:outline-none ${(isFeeding || isProcessingFeed) ? 'animate-pulse cursor-not-allowed opacity-75' : ''}`}>
                        <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-75 group-hover:animate-none" />
                        <div className="relative flex flex-col items-center justify-center h-full">
                          <Coffee size={32} className="mb-1" />
                          <span className="text-sm font-bold">{isFeeding ? 'Feeding...' : 'Feed Now!'}</span>
                        </div>
                      </button>
                    </div>

                    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
                      <div className="flex items-center gap-3 mb-3">
                        <HardDrive className="text-[#D4A757]" size={20} />
                        <h3 className="font-semibold text-gray-800">Bowl Status</h3>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-gray-500">Current Weight</p>
                          <p className="text-2xl font-bold text-gray-800">{feedingData.bowlWeight.toFixed(1)}g</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Last Meal</p>
                          <p className="text-sm font-semibold text-gray-700">{feedingData.lastMealAmount}g dispensed</p>
                        </div>
                      </div>
                    </div>

                    {/* CARD DAILY FEEDINGS - MENGGUNAKAN DATA REAL */}
                    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">Daily Feedings</p>
                        <p className="text-2xl font-bold text-[#D4A757]">{feedingsDone}/{totalFeedings}</p>
                        <p className="text-xs text-gray-500">{remainingFeedings} meals remaining</p>
                        <div className="mt-3 pt-2 border-t border-gray-200">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Food Freshness</span>
                            <span className={`font-medium ${getFreshnessColor()}`}>{foodFreshness.status}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div 
                              className="bg-green-500 rounded-full h-1.5 transition-all duration-300" 
                              style={{ width: `${foodFreshness.percentage}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
                      <div className="flex items-center gap-2 mb-3">
                        <HardDrive size={18} className="text-[#D4A757]" />
                        <h3 className="font-semibold text-gray-800">Food Tank</h3>
                      </div>
                      <div className="relative w-full h-32 bg-gray-200 rounded-lg overflow-hidden mb-2">
                        <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#D4A757] to-[#f0c674] transition-all duration-500" style={{ height: `${feedingData.tankLevel}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-bold text-gray-700 bg-white/80 px-3 py-1 rounded-full backdrop-blur-sm">{feedingData.tankLevel}%</span>
                        </div>
                      </div>
                      <p className="text-center text-sm text-gray-600">{Math.round(feedingData.tankLevel * 8.33)}g remaining</p>
                    </div>

                    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 border border-white/50">
                      <h3 className="font-semibold text-gray-800 mb-3">Storage Environment</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Thermometer size={18} className="text-orange-500" />
                            <span className="text-sm text-gray-600">Temperature</span>
                          </div>
                          <span className="font-semibold text-gray-800">{feedingData.temperature}°C</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Droplets size={18} className="text-blue-500" />
                            <span className="text-sm text-gray-600">Humidity</span>
                          </div>
                          <span className="font-semibold text-gray-800">{feedingData.humidity}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-sm border border-white/50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="text-[#D4A757]" size={20} />
                        <h3 className="text-base md:text-lg font-semibold text-gray-800">Food Level History (Last 24 Hours)</h3>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Circle className="fill-[#D4A757] text-[#D4A757]" size={10} />
                        <span>Food Level (%)</span>
                      </div>
                    </div>
                    <div className="w-full h-48 md:h-56" style={{ minHeight: "200px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart key={chartKey} data={foodHistory}>
                          <defs>
                            <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#D4A757" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#D4A757" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                          <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis stroke="#9ca3af" fontSize={10} domain={[0, 'auto']} width={30} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '12px' }} />
                          <Area type="monotone" dataKey="amount" stroke="#D4A757" strokeWidth={2} fill="url(#colorLevel)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          {activeNav === 'schedule' && (
            <SchedulePage 
              userId={currentUserId || userId} 
              petName={currentPetName || petName}
              isDeviceConnected={!!connectedDeviceId}
              connectedDeviceId={connectedDeviceId}
            />
          )}
          
          {activeNav === 'analytics' && (
            <AnalyticsPage 
              userId={currentUserId || userId} 
              petName={currentPetName || petName}
              connectedDeviceId={connectedDeviceId}
            />
          )}
          
          {activeNav === 'settings' && (
            <SettingsPage 
              userId={currentUserId || userId}
              petName={currentPetName}
              onPetNameUpdate={(newName) => setCurrentPetName(newName)}
            />
          )}
        </main>
      </div>
      
      {/* FEED NOW MODAL */}
      {showFeedModal && nextScheduleInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-yellow-500" size={28} />
              <h2 className="text-xl font-bold text-gray-800">Ada Jadwal Mendekat!</h2>
            </div>
            <p className="text-gray-600 mb-4">Terdapat jadwal makan dalam {nextScheduleInfo.minutesLeft} menit lagi:</p>
            <div className="bg-yellow-50 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Waktu</p>
                  <p className="text-lg font-bold text-gray-800">{nextScheduleInfo.time} WIB</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Porsi</p>
                  <p className="text-lg font-bold text-[#D4A757]">{nextScheduleInfo.amount}g</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-4">Pilih opsi di bawah:</p>
            <div className="space-y-3">
              <button onClick={() => executeFeedNow(true)} disabled={isProcessingFeed} className="w-full bg-[#D4A757] text-white py-3 rounded-xl hover:bg-[#c29644] transition shadow-md flex items-center justify-center gap-2">
                {isProcessingFeed ? <Loader2 className="animate-spin" size={20} /> : <><Coffee size={20} /> Feed Now + Skip Jadwal {nextScheduleInfo.time}</>}
              </button>
              <button onClick={() => executeFeedNow(false)} disabled={isProcessingFeed} className="w-full border-2 border-[#D4A757] text-[#D4A757] py-3 rounded-xl hover:bg-[#D4A757]/10 transition flex items-center justify-center gap-2">
                Feed Now (Jadwal Tetap Jalan)
              </button>
              <button onClick={() => setShowFeedModal(false)} className="w-full border border-gray-300 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* LOADING OVERLAY */}
      {isFeeding && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757] mb-4"></div>
            <p className="text-gray-700">Dispensing food... 🐾</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;