import React, { useState } from 'react';
import { Mail, Lock, PawPrint, Dog, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config';
import loginImg from '../assets/img/login.png';


  const LoginPage = ({ onLogin, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [petName, setPetName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return regex.test(email);
  };

  const handleResetPassword = async () => {
    if (!email) {
      alert("Tolong ketik email Anda dulu di kolom Email sebelum klik Lupa Password!");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Link reset password berhasil dikirim! Silakan cek Inbox atau folder Spam email Anda.");
    } catch (error) {
      console.error("Reset password error:", error);
      alert("Gagal mengirim email reset. Pastikan email Anda terdaftar.");
    }
  };

  const handleLogin = async () => {
    const newErrors = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      onLogin({
        uid: user.uid,
        email: user.email,
        petName: petName || user.displayName || 'Pet Parent'
      });
      
    } catch (error) {
      console.error("Login error:", error);
      if (error.code === 'auth/user-not-found') {
        setErrors({ email: 'Email not found. Please register first.' });
      } else if (error.code === 'auth/wrong-password') {
        setErrors({ password: 'Incorrect password. Please try again.' });
      } else if (error.code === 'auth/invalid-credential') {
        setErrors({ general: 'Invalid email or password' });
      } else {
        setErrors({ general: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    // Container full screen dengan background image di semua ukuran
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image - Selalu muncul di semua ukuran layar */}
      <div className="absolute inset-0 z-0">
        <img
          src={loginImg}
          alt="SmartPet Login"
          className="w-full h-full object-cover object-center"
        />
        {/* Overlay gelap agar teks terbaca */}
        <div className="absolute inset-0 bg-gradient-to-t from-sky-900/70 via-sky-800/40 to-transparent" />
      </div>
      
      {/* Content - Flex column untuk mobile, row untuk desktop */}
      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        
        {/* LEFT SIDE - Branding (hidden di mobile, tampil di desktop) */}
        <div className="hidden lg:flex lg:w-[70%] items-center justify-center p-12">
          <div className="text-white max-w-2xl">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight drop-shadow-lg">
              Your pet's mealtime,
              <br />
              handled with love.
            </h1>
            <p className="text-xl md:text-2xl font-light drop-shadow-md opacity-95">
              Because they give us their best,
              <br />
              let's give them our smartest.
            </p>
            <div className="flex gap-4 mt-12 opacity-50">
              <PawPrint size={24} className="animate-bounce" style={{ animationDelay: '0s' }} />
              <PawPrint size={28} className="animate-bounce" style={{ animationDelay: '0.2s' }} />
              <PawPrint size={24} className="animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Form Area (full width di mobile, 30% di desktop) */}
        <div className="w-full lg:w-[30%] flex items-center justify-center p-4 sm:p-6 md:p-8 bg-white/90 lg:bg-white/80 backdrop-blur-sm lg:backdrop-blur-xl min-h-screen lg:h-full overflow-y-auto">
          <div className="w-full max-w-md">
            
            {/* Logo untuk mobile - muncul di layar kecil */}
            <div className="lg:hidden text-center mb-6">
              <div className="inline-flex items-center justify-center">
                <Dog className="w-12 h-12 text-[#D4A757]" strokeWidth={1.5} />
                <span className="text-3xl font-bold text-gray-800 ml-2">
                  Smart<span className="text-[#D4A757]">.</span>Pet
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">IoT Pet Feeder</p>
            </div>
            
            {/* Form Card */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/20">
              
              {/* Logo untuk desktop - hanya di desktop */}
              <div className="hidden lg:block text-center mb-8">
                <div className="inline-flex items-center justify-center mb-4">
                  <Dog className="w-12 h-12 text-[#D4A757]" strokeWidth={1.5} />
                  <span className="text-3xl font-bold text-gray-800 ml-2">
                    Smart<span className="text-[#D4A757]">.</span>Pet
                  </span>
                </div>
                <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                  Welcome Back, Pet Parent!
                </h2>
                <p className="text-sm text-gray-500">
                  Sign in to take care of your furry friend
                </p>
              </div>

              {/* Error Alert */}
              {errors.general && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                  {errors.general}
                </div>
              )}

              {/* Form */}
              <div className="space-y-5">
                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="your@email.com"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757] focus:border-transparent transition-all ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                  )}
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757] focus:border-transparent transition-all ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                  )}
                </div>

                <div className="flex justify-end mt-1 mb-2">
                  <button 
                    type="button" 
                    onClick={handleResetPassword}
                    className="text-sm text-blue-500 hover:text-blue-700 font-medium transition"
                  >
                    Lupa Password?
                  </button>
                </div>
                {/* ---------------------------- */}

                {/* Pet Name - Optional */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Your Pet's Name
                    </label>
                    <span className="text-xs text-gray-400 italic">(Optional)</span>
                  </div>
                  <div className="relative">
                    <PawPrint className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={petName}
                      onChange={(e) => setPetName(e.target.value)}
                      placeholder="e.g., Max, Luna, Charlie"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A757] focus:border-transparent transition-all"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    We'll personalize your experience with your pet's name!
                  </p>
                </div>

                {/* Login Button */}
                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="w-full bg-[#D4A757] hover:bg-[#c29644] text-white font-semibold py-3 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Signing in...' : 'Feed with Love'}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white/80 text-gray-500">Or continue with</span>
                  </div>
                </div>

                {/* Social Login */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => alert('Google Sign-In coming soon!')}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-gray-700 text-sm font-medium"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </button>
                  <button 
                    onClick={() => alert('Apple Sign-In coming soon!')}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-gray-700 text-sm font-medium"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.221-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z" />
                    </svg>
                    Apple
                  </button>
                </div>

                {/* Register Link */}
                <div className="text-center mt-6">
                  <p className="text-sm text-gray-500">
                    New to Smart.Pet?{' '}
                    <button
                      onClick={onSwitchToRegister}
                      className="text-[#D4A757] font-medium hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-6">
              <p className="text-xs text-gray-400">
                By signing in, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;