import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ref, onValue, off, set, get } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, database } from '../firebase/config';

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
const calcFoodFreshness = (temp, humidity) => {
  let score = 100;
  if (temp < 15 || temp > 35) score -= 40;
  else if (temp < 18 || temp > 30) score -= 20;
  else if (temp < 20 || temp > 28) score -= 10;
  if (humidity < 30 || humidity > 70) score -= 30;
  else if (humidity < 35 || humidity > 65) score -= 15;
  else if (humidity < 40 || humidity > 60) score -= 5;
  score = Math.max(0, Math.min(100, score));
  const status = score < 30 ? 'Bad' : score < 60 ? 'Moderate' : score < 80 ? 'Fair' : 'Good';
  return { status, percentage: score };
};

const calcNextMeal = (schedulesObj) => {
  if (!schedulesObj) return { nextMealTime: null, nextScheduleInfo: null };
  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7;
  let minDiff = Infinity;
  let nextMealTime = null;
  let nextScheduleInfo = null;

  Object.values(schedulesObj)
    .filter(s => s.enabled !== false)
    .forEach(schedule => {
      const [h, m] = schedule.time.split(':').map(Number);
      schedule.days.forEach((active, dayIdx) => {
        if (!active) return;
        let daysToAdd = dayIdx - currentDayIndex;
        if (daysToAdd < 0) daysToAdd += 7;
        if (daysToAdd === 0) {
          if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) daysToAdd = 7;
        }
        const meal = new Date(now);
        meal.setDate(meal.getDate() + daysToAdd);
        meal.setHours(h, m, 0, 0);
        const diff = meal - now;
        if (diff > 0 && diff < minDiff) {
          minDiff = diff;
          nextMealTime = meal.getTime();
          nextScheduleInfo = diff < 30 * 60 * 1000
            ? { time: schedule.time, amount: schedule.amount, minutesLeft: Math.floor(diff / 60000) }
            : null;
        }
      });
    });

  return { nextMealTime, nextScheduleInfo };
};

// ─────────────────────────────────────────────
//  Context
// ─────────────────────────────────────────────
const DeviceContext = createContext(null);

export const DeviceProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [petName, setPetName] = useState('Maximus');
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);

  const [deviceStatus, setDeviceStatus] = useState({
    isOnline: false, batteryLevel: 0, isCharging: false, wifiStrength: 0,
  });
  const [feedingData, setFeedingData] = useState({
    bowlWeight: 0, tankLevel: 0, temperature: 0, humidity: 0,
    lastMealAmount: 0, nextMealTime: null,
  });
  const [schedules, setSchedules] = useState([]);
  const [feedingHistory, setFeedingHistory] = useState([]);
  const [nextScheduleInfo, setNextScheduleInfo] = useState(null);
  const [foodFreshness, setFoodFreshness] = useState({ status: 'Good', percentage: 85 });
  const [countdown, setCountdown] = useState('00:00:00');
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isDeviceLoading, setIsDeviceLoading] = useState(false);

  // ── 1. Auth listener ──────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      if (!firebaseUser) {
        setConnectedDeviceId(null);
        setIsAppLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── 2. Resolve connectedDevice + petName ──────────
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const handle = (snap) => {
      const data = snap.val() ?? {};
      setConnectedDeviceId(data.connectedDevice ?? null);
      setPetName(data.petName ?? user.displayName ?? 'Maximus');
      setIsAppLoading(false);
    };
    onValue(userRef, handle);
    return () => off(userRef, 'value', handle);
  }, [user]);

  // ── 3. Device listeners (one place, shared everywhere) ──
  useEffect(() => {
    if (!connectedDeviceId) return;
    setIsDeviceLoading(true);

    const statusRef  = ref(database, `devices/${connectedDeviceId}/deviceStatus`);
    const feedRef    = ref(database, `devices/${connectedDeviceId}/feedingData`);
    const histRef    = ref(database, `devices/${connectedDeviceId}/feedingHistory`);
    const schedRef   = ref(database, `devices/${connectedDeviceId}/schedules`);

    const hStatus = (snap) => {
      const d = snap.val();
      if (d) setDeviceStatus(d);
    };

    const hFeed = (snap) => {
      const d = snap.val();
      if (!d) return;
      setFeedingData(prev => ({
        ...prev,
        bowlWeight:    d.bowlWeight ?? d.bowWeight ?? 0,
        tankLevel:     d.tankLevel  ?? 0,
        temperature:   d.temperature ?? 0,
        humidity:      d.humidity    ?? 0,
        lastMealAmount: d.lastMealAmount ?? 0,
        nextMealTime:  d.nextMealTime ?? null,
      }));
      setFoodFreshness(calcFoodFreshness(d.temperature ?? 0, d.humidity ?? 0));
    };

    const hHistory = (snap) => {
      const d = snap.val();
      if (d && typeof d === 'object') {
        const list = Object.values(d)
          .map(item => ({
            timestamp: (item.timestamp ?? 0) * 1000,
            amount:    item.amount ?? 0,
            mode:      item.mode ?? '',
            date:      item.date ?? '',
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setFeedingHistory(list);
      } else {
        setFeedingHistory([]);
      }
      setIsDeviceLoading(false);
    };

    const hSchedules = (snap) => {
      const d = snap.val();
      const list = d
        ? Object.keys(d).map(key => ({ id: key, ...d[key] }))
        : [];
      setSchedules(list);

      // Derive next meal info from schedules
      const { nextMealTime, nextScheduleInfo: info } = calcNextMeal(d);
      setNextScheduleInfo(info);
      if (nextMealTime) {
        setFeedingData(prev => ({ ...prev, nextMealTime }));
        // Persist nextMealTime to Firebase so ESP32 can read it
        get(ref(database, `devices/${connectedDeviceId}/feedingData`)).then(snap => {
          set(ref(database, `devices/${connectedDeviceId}/feedingData`), {
            ...(snap.val() ?? {}),
            nextMealTime,
          });
        });
      }
    };

    onValue(statusRef,  hStatus);
    onValue(feedRef,    hFeed);
    onValue(histRef,    hHistory);
    onValue(schedRef,   hSchedules);

    return () => {
      off(statusRef,  'value', hStatus);
      off(feedRef,    'value', hFeed);
      off(histRef,    'value', hHistory);
      off(schedRef,   'value', hSchedules);
    };
  }, [connectedDeviceId]);

  // ── 4. Countdown timer (client-side, no Firebase) ──
  useEffect(() => {
    const tick = () => {
      if (!feedingData.nextMealTime) { setCountdown('00:00:00'); return; }
      let meal = new Date(feedingData.nextMealTime);
      const now = new Date();
      if (meal < now) meal.setDate(meal.getDate() + 1);
      const diff = meal - now;
      if (diff <= 0) { setCountdown('00:00:00'); return; }
      const hh = Math.floor(diff / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      setCountdown(
        `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [feedingData.nextMealTime]);

  // ── 5. Actions ─────────────────────────────────────
  const sendFeedCommand = useCallback(async (skipNext = false) => {
    if (!connectedDeviceId) throw new Error('No device connected');
    const base = `devices/${connectedDeviceId}/commands`;
    await set(ref(database, `${base}/feedNow`),   true);
    await set(ref(database, `${base}/timestamp`), Date.now());
    await set(ref(database, `${base}/skipNext`),  skipNext);
  }, [connectedDeviceId]);

  const connectDevice = useCallback(async () => {
    if (!user) return;
    const deviceId = `device_${user.uid.slice(0, 8)}`;
    await set(ref(database, `users/${user.uid}/connectedDevice`), deviceId);

    const statusSnap = await get(ref(database, `devices/${deviceId}/deviceStatus`));
    if (!statusSnap.exists()) {
      await set(ref(database, `devices/${deviceId}/deviceStatus`), {
        isOnline: true, batteryLevel: 85, isCharging: false, wifiStrength: 75,
      });
    }
    const feedSnap = await get(ref(database, `devices/${deviceId}/feedingData`));
    if (!feedSnap.exists()) {
      await set(ref(database, `devices/${deviceId}/feedingData`), {
        bowlWeight: 245, tankLevel: 75, temperature: 24.5, humidity: 45, lastMealAmount: 50,
      });
    }
  }, [user]);

  const updatePetName = useCallback(async (name) => {
    if (!user) return;
    await set(ref(database, `users/${user.uid}/petName`), name);
  }, [user]);

  return (
    <DeviceContext.Provider value={{
      // Auth
      user,
      // User
      petName,
      updatePetName,
      // Device
      connectedDeviceId,
      connectDevice,
      // Data
      deviceStatus,
      feedingData,
      schedules,
      feedingHistory,
      foodFreshness,
      nextScheduleInfo,
      countdown,
      // Actions
      sendFeedCommand,
      // Loading
      isAppLoading,
      isDeviceLoading,
    }}>
      {children}
    </DeviceContext.Provider>
  );
};

// ── Custom hook (throws early if used outside provider) ──
export const useDevice = () => {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used inside <DeviceProvider>');
  return ctx;
};
