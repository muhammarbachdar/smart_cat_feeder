import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, BarChart3, Settings,
  Dog, LogOut, Menu, X, PawPrint,
} from 'lucide-react';
import { auth } from '../../firebase/config';
import { useDevice } from '../../context/DeviceContext';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics', icon: BarChart3,       label: 'Analytics'  },
  { to: '/schedule',  icon: Calendar,         label: 'Schedule'   },
  { to: '/settings',  icon: Settings,         label: 'Settings'   },
];

const AppShell = () => {
  const { petName, deviceStatus, connectedDeviceId } = useDevice();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login', { replace: true });
  };

  const NavItem = ({ item }) => (
    <NavLink
      to={item.to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'bg-[#D4A757]/20 text-[#D4A757]'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <item.icon size={20} />
      <span>{item.label}</span>
    </NavLink>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full p-4">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mb-8">
        <Dog className="text-[#D4A757]" size={28} strokeWidth={1.5} />
        <span className="text-xl font-bold text-gray-800">
          Smart<span className="text-[#D4A757]">.</span>Pet
        </span>
      </div>

      {/* Pet status pill */}
      <div className="bg-gradient-to-r from-[#D4A757]/10 to-amber-50 rounded-xl p-3 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <PawPrint size={14} className="text-[#D4A757]" />
          <span className="text-xs text-gray-500 font-medium">Your Pet</span>
        </div>
        <p className="font-semibold text-gray-800 text-sm truncate">{petName}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`w-2 h-2 rounded-full ${connectedDeviceId && deviceStatus.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-xs text-gray-400">
            {connectedDeviceId ? (deviceStatus.isOnline ? 'Device Online' : 'Device Offline') : 'No Device'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(item => <NavItem key={item.to} item={item} />)}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all mt-4"
      >
        <LogOut size={20} />
        <span>Sign Out</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-sky-100 via-sky-50 to-white overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white/70 backdrop-blur-xl border-r border-white/50 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-64 bg-white shadow-2xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur-xl border-b border-white/50">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Dog className="text-[#D4A757]" size={22} strokeWidth={1.5} />
            <span className="font-bold text-gray-800">Smart<span className="text-[#D4A757]">.</span>Pet</span>
          </div>
          <div className="w-8" /> {/* spacer */}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
