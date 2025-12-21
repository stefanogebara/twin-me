import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Brain, Lock, Sparkles, Users, ArrowRight, Zap, Eye, Network } from 'lucide-react';

/**
 * Advanced Hero Component - 2025 Design Patterns
 *
 * Implements cutting-edge techniques:
 * - Framer Motion scroll animations & parallax
 * - Glassmorphism with backdrop blur
 * - 3D card hover effects with mouse tracking
 * - Bento box asymmetric grid layout
 * - Animated gradient mesh backgrounds
 * - Blur text reveals
 * - Micro-interactions and spring physics
 * - Noise texture overlays
 */

export const AdvancedHero = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();
  const containerRef = useRef(null);

  // Scroll-driven animations
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, -200]), {
    stiffness: 100,
    damping: 30
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);

  // 3D Card hover effect
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>, cardRef: React.RefObject<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleCardMouseLeave = (cardRef: React.RefObject<HTMLDivElement>) => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };

  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);
  const card4Ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 opacity-30">
        <motion.div
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 0, 128, 0.3), transparent 50%), radial-gradient(circle at 40% 20%, rgba(0, 200, 255, 0.3), transparent 50%)',
            backgroundSize: '200% 200%',
          }}
        />
      </div>

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Glassmorphism Navigation */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-6xl px-4">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, type: "spring" }}
          className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl px-6 py-3 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-white font-bold text-xl bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
              Twin Me
            </span>
            <div className="flex items-center gap-3">
              {!isLoaded ? (
                <button disabled className="px-4 py-2 rounded-xl bg-white/5 text-white/50 text-sm">Loading...</button>
              ) : isSignedIn ? (
                <motion.button
                  onClick={() => navigate('/dashboard')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium shadow-lg hover:shadow-purple-500/50 transition-shadow"
                >
                  Dashboard
                </motion.button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium shadow-lg hover:shadow-purple-500/50 transition-shadow"
                  >
                    Get Started
                  </motion.button>
                </SignInButton>
              )}
            </div>
          </div>
        </motion.div>
      </nav>

      {/* Hero Content with Scroll Parallax */}
      <motion.div style={{ y, opacity, scale }} className="relative pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Main Headline with Gradient */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center mb-16"
          >
            <motion.h1
              className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.1] mb-6"
            >
              <span className="bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                Discover your
              </span>
              <br />
              <motion.span
                initial={{ backgroundPosition: '0% 50%' }}
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, repeat: Infinity }}
                className="bg-gradient-to-r from-purple-400 via-pink-400 to-stone-400 bg-clip-text text-transparent bg-[length:200%_auto]"
              >
                soul signature
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-lg md:text-xl text-purple-200/80 max-w-3xl mx-auto leading-relaxed"
            >
              Beyond cloning. AI-powered discovery of your authentic self through 30+ platform integrations.
              <br />
              Complete privacy control. Your data, your rules.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mt-10"
            >
              {!isLoaded ? (
                <button disabled className="px-8 py-4 rounded-2xl bg-white/5 text-white/50">Loading...</button>
              ) : isSignedIn ? (
                <motion.button
                  onClick={() => navigate('/dashboard')}
                  whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(168, 85, 247, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-5 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg shadow-2xl inline-flex items-center gap-3 justify-center"
                >
                  Start Your Journey
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                  <motion.button
                    whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(168, 85, 247, 0.4)" }}
                    whileTap={{ scale: 0.95 }}
                    className="px-10 py-5 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg shadow-2xl inline-flex items-center gap-3 justify-center"
                  >
                    Start Your Journey
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </SignInButton>
              )}
              <motion.button
                onClick={() => navigate('/watch-demo')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-5 rounded-2xl backdrop-blur-md bg-white/10 border border-white/20 text-white font-semibold text-lg hover:bg-white/20 transition-colors"
              >
                Watch Demo
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Bento Box Grid with Glassmorphism Cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto"
          >
            {/* Large feature card - spans 2 columns */}
            <motion.div
              ref={card1Ref}
              onMouseMove={(e) => handleCardMouseMove(e, card1Ref)}
              onMouseLeave={() => handleCardMouseLeave(card1Ref)}
              whileHover={{ y: -5 }}
              className="md:col-span-2 p-8 rounded-3xl backdrop-blur-md bg-gradient-to-br from-white/10 to-white/5 border border-white/20 shadow-2xl cursor-pointer transition-all duration-300"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-4">Your Soul Signature</h3>
              <p className="text-purple-200/70 text-lg leading-relaxed">
                Discover authentic patterns that make you unique. AI analyzes your entertainment,
                work, and social data to reveal hidden personality insights.
              </p>
            </motion.div>

            {/* Small cards */}
            <motion.div
              ref={card2Ref}
              onMouseMove={(e) => handleCardMouseMove(e, card2Ref)}
              onMouseLeave={() => handleCardMouseLeave(card2Ref)}
              whileHover={{ y: -5 }}
              className="p-8 rounded-3xl backdrop-blur-md bg-gradient-to-br from-white/10 to-white/5 border border-white/20 shadow-2xl cursor-pointer transition-all duration-300"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Privacy First</h3>
              <p className="text-purple-200/70">Granular control over every data point you share.</p>
            </motion.div>

            <motion.div
              ref={card3Ref}
              onMouseMove={(e) => handleCardMouseMove(e, card3Ref)}
              onMouseLeave={() => handleCardMouseLeave(card3Ref)}
              whileHover={{ y: -5 }}
              className="p-8 rounded-3xl backdrop-blur-md bg-gradient-to-br from-white/10 to-white/5 border border-white/20 shadow-2xl cursor-pointer transition-all duration-300"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-stone-500 to-red-500 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">AI Insights</h3>
              <p className="text-purple-200/70">Claude AI reveals patterns you didn't know existed.</p>
            </motion.div>

            <motion.div
              ref={card4Ref}
              onMouseMove={(e) => handleCardMouseMove(e, card4Ref)}
              onMouseLeave={() => handleCardMouseLeave(card4Ref)}
              whileHover={{ y: -5 }}
              className="md:col-span-2 p-8 rounded-3xl backdrop-blur-md bg-gradient-to-br from-white/10 to-white/5 border border-white/20 shadow-2xl cursor-pointer transition-all duration-300"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Soul Matching</h3>
              <p className="text-purple-200/70 text-lg">
                Find people with complementary soul signatures for meaningful connections.
              </p>
            </motion.div>
          </motion.div>

          {/* Platform Integration Pills with Hover Animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="mt-20 text-center"
          >
            <p className="text-purple-300/70 text-sm uppercase tracking-wider mb-6">Integrates with 30+ platforms</p>
            <div className="flex flex-wrap justify-center gap-3">
              {['Spotify', 'YouTube', 'Discord', 'GitHub', 'Netflix', 'Reddit', 'Gmail', 'Slack'].map((platform, i) => (
                <motion.div
                  key={platform}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 1.2 + i * 0.05 }}
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="px-6 py-3 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white text-sm font-medium cursor-pointer hover:bg-white/20 transition-colors"
                >
                  {platform}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};
