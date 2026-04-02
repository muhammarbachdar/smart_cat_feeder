import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DeviceProvider, useDevice } from './context/DeviceContext';

import LoginPage    from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SchedulePage  from './pages/SchedulePage';
import SettingsPage  from './pages/SettingsPage';
import AppShell      from './components/layout/AppShell';

// ─── Loading screen ───────────────────────────────────────────
const Loader = () => (
  <div className="min-h-screen bg-gradient-to-br from-sky-100 via-sky-50 to-white flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4A757] mx-auto mb-4" />
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

// ─── Route guards ─────────────────────────────────────────────
const PrivateRoute = ({ children }) => {
  const { user, isAppLoading } = useDevice();
  if (isAppLoading) return <Loader />;
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, isAppLoading } = useDevice();
  if (isAppLoading) return <Loader />;
  return !user ? children : <Navigate to="/dashboard" replace />;
};

// ─── Router tree ──────────────────────────────────────────────
const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

    {/* Private — wrapped in the shared shell (sidebar + topbar) */}
    <Route
      element={
        <PrivateRoute>
          <AppShell />
        </PrivateRoute>
      }
    >
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/schedule"  element={<SchedulePage />} />
      <Route path="/settings"  element={<SettingsPage />} />
    </Route>

    {/* Fallback */}
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

// ─── Root ─────────────────────────────────────────────────────
const App = () => (
  <BrowserRouter>
    <DeviceProvider>
      <AppRoutes />
    </DeviceProvider>
  </BrowserRouter>
);

export default App;
