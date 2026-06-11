import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider, useAnalytics } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
import ProtectedRoute from "./components/ProtectedRoute";
import { NavigationProvider } from "./contexts/NavigationContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { useExtensionSync } from "./hooks/useExtensionSync";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SunProvider } from "./contexts/SunContext";
import { DayNightBackground } from "./components/DayNightBackground";
import { ClassicBackground } from "./components/ClassicBackground";
import { BackgroundModeProvider, useBackgroundMode } from "./contexts/BackgroundModeContext";

// Eager-loaded (critical path: landing, auth, 404)
import Index from "./pages/Index";
import CustomAuth from "./pages/CustomAuth";
import DesktopHandoff from "./pages/DesktopHandoff";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";
// audit-2026-05-13 H1: route-local Suspense fallback for /talk-to-twin so
// mobile users see the chat shell (header + composer placeholder) within
// the first paint instead of waiting on a centered loading spinner.
import { TalkToTwinSkeleton } from "./pages/components/TalkToTwinSkeleton";

// Lazy-loaded pages (code-split into separate chunks).
// audit-2026-05-15 H12: MoneyPage chunk is one of the heaviest (147 KB raw)
// and was showing the global flower-pulse Suspense fallback for ~3s on cold
// cache. Adding it to the warmup list so navigation doesn't block.
const loadDashboardV2 = () => import("./pages/DashboardV2");
const loadTalkToTwin = () => import("./pages/TalkToTwin");
const loadMoneyPage = () => import("./pages/MoneyPage");
const loadMoneyInsightsPage = () => import("./pages/MoneyInsightsPage");

const DashboardV2 = lazy(loadDashboardV2);
const Settings = lazy(() => import("./pages/Settings"));
const VoiceSetupPage = lazy(() => import("./pages/VoiceSetupPage"));
const InstantTwinOnboarding = lazy(() => import("./pages/InstantTwinOnboarding"));
const BrainPage = lazy(() => import("./pages/BrainPage"));
const DataExportsPage = lazy(() => import("./pages/DataExportsPage"));
const TalkToTwin = lazy(loadTalkToTwin);
const Widget = lazy(() => import("./pages/Widget"));
const AdminLLMCosts = lazy(() => import("./pages/AdminLLMCosts"));
const AdminBetaDashboard = lazy(() => import("./pages/AdminBetaDashboard"));
const AdminBetaPage = lazy(() => import("./pages/AdminBetaPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const NewDiscoverFlow = lazy(() => import("./pages/onboarding/NewDiscoverFlow"));
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const DiscoverLanding = lazy(() => import("./pages/DiscoverLanding"));
const WaitlistPage = lazy(() => import("./pages/WaitlistPage"));
const BetaSignupPage = lazy(() => import("./pages/BetaSignupPage"));
const GmailCallback = lazy(() => import("./pages/oauth/GmailCallback"));
const SpotifyInsightsPage = lazy(() => import("./pages/insights/SpotifyInsightsPage"));
const CalendarInsightsPage = lazy(() => import("./pages/insights/CalendarInsightsPage"));
const YouTubeInsightsPage = lazy(() => import("./pages/insights/YouTubeInsightsPage"));
const WebBrowsingInsightsPage = lazy(() => import("./pages/insights/WebBrowsingInsightsPage"));
const DiscordInsightsPage = lazy(() => import("./pages/insights/DiscordInsightsPage"));
const PrivacySpectrumDashboard = lazy(() => import("./pages/PrivacySpectrumDashboard"));
const MemoryHealth = lazy(() => import("./pages/MemoryHealth"));
const EvalDashboard = lazy(() => import("./pages/EvalDashboard"));
const IdentityPage = lazy(() => import("./pages/IdentityPage"));
const InterviewPage = lazy(() => import("./pages/InterviewPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const WikiPage = lazy(() => import("./pages/WikiGraphPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const MoneyPage = lazy(loadMoneyPage);
const MoneyInsightsPage = lazy(loadMoneyInsightsPage);
const MeetingsPage = lazy(() => import("./pages/MeetingsPage"));
const TwinSoulPage = lazy(() => import("./pages/TwinSoulPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));



// Auto-track page views on route change
const PostHogPageTracker = () => {
  const location = useLocation();
  const { trackPageView } = useAnalytics();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      trackPageView(location.pathname);
      prevPath.current = location.pathname;
    }
  }, [location.pathname, trackPageView]);

  // Track initial page view
  useEffect(() => {
    trackPageView(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

const App = () => {
  // Automatically sync auth tokens to browser extension
  useExtensionSync();

  useEffect(() => {
    // Warm the heaviest authenticated routes after boot so route navigation
    // doesn't block on first-time dev transforms.
    // audit-2026-05-15 H12: added MoneyPage — Agent 2 found it flashed the
    // global flower-pulse Suspense fallback for ~3s on cold cache before
    // its chunk arrived.
    const prefetchHeavyRoutes = () => {
      void loadDashboardV2();
      void loadTalkToTwin();
      void loadMoneyPage();
    };

    const timer = window.setTimeout(prefetchHeavyRoutes, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ThemeProvider defaultTheme="dark">
    <BackgroundModeProvider>
    <SunProvider>
    <AppBackground />
    <div style={{ position: "relative", zIndex: 1 }}>
      <ErrorBoundary showHomeButton>
        <ErrorProvider>
          <LoadingProvider>
            <AnalyticsProvider>
              <QueryClientProvider client={queryClient}>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <ErrorNotification />
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                      {/* Skip to main content — WCAG 2.1 AA */}
                      <a
                        href="#main-content"
                        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
                        style={{
                          backgroundColor: 'var(--accent-vibrant)',
                          color: '#0a0909',
                        }}
                      >
                        Skip to main content
                      </a>
                      <PostHogPageTracker />
                      <SidebarProvider>
                      <NavigationProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><img src="/images/backgrounds/flower-hero.png" alt="Loading" className="w-12 h-12 animate-pulse" /></div>}>
          <Routes>
            {/* Authentication */}
            <Route path="/auth" element={<CustomAuth />} />
            {/* Desktop (Tauri) Google sign-in handoff: runs the registered web
                sign-in, then deep-links the session back via twinme://. Public
                route — it branches on signed-in/out itself. */}
            <Route path="/desktop-handoff" element={<DesktopHandoff />} />
            <Route path="/waitlist" element={<Suspense fallback={null}><WaitlistPage /></Suspense>} />
            <Route path="/beta" element={<Suspense fallback={null}><BetaSignupPage /></Suspense>} />
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            <Route path="/signin" element={<Navigate to="/auth" replace />} />

            {/* Legacy path redirects */}
            <Route path="/home" element={<Navigate to="/dashboard" replace />} />
            <Route path="/chat" element={<Navigate to="/talk-to-twin" replace />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/gmail/callback" element={<GmailCallback />} />

            {/* Landing */}
            <Route path="/" element={<Index />} />
            <Route path="/discover" element={<DiscoverLanding />} />

            {/* Main Dashboard */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <DashboardV2 />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            {/* Twin Insight Pages */}
            <Route path="/insights/spotify" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <SpotifyInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/insights/calendar" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <CalendarInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/insights/youtube" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <YouTubeInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/insights/web" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <WebBrowsingInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/insights/discord" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <DiscordInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            {/* Soul Signature → redirect to Identity (canonical "Who You Are" page) */}
            <Route path="/soul-signature" element={<Navigate to="/identity" replace />} />
            <Route path="/me" element={<Navigate to="/identity" replace />} />
            <Route path="/you" element={<Navigate to="/identity" replace />} />

            {/* Deep Interview — structured onboarding */}
            <Route path="/interview" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <InterviewPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Who You Are — identity explorer */}
            <Route path="/identity" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <IdentityPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Twins Brain Explorer */}
            <Route path="/brain" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <BrainPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/memories" element={<Navigate to="/brain" replace />} />

            {/* GDPR data-export uploads (Discord/LinkedIn/Instagram) */}
            <Route path="/data-exports" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <DataExportsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />


            {/* LLM Wiki Knowledge Base */}
            <Route path="/wiki" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <WikiPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            {/* Sidebar nav labels this entry "Knowledge"; mirror the label to a real URL. */}
            <Route path="/knowledge" element={<Navigate to="/wiki" replace />} />
            <Route path="/goals" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <GoalsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Twin Soul — directives learned from user corrections (pi-reflect pattern) */}
            <Route path="/twin-soul" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <TwinSoulPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Financial-Emotional Twin — bank statement upload + emotional tagging (Phase 2) */}
            <Route path="/money" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <MoneyPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Money insights — narrative read of correlation patterns, subscriptions, trades, timeline (Phase 4.4) */}
            <Route path="/money/insights" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <MoneyInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Meeting Prep Agent — surfaces briefings cron-meeting-prep produces */}
            <Route path="/meetings" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <MeetingsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Platform Connection — accessible at both /connect (nav) and /get-started (legacy) */}
            {["/connect", "/get-started"].map(path => (
              <Route key={path} path={path} element={
                <ProtectedRoute>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <InstantTwinOnboarding />
                    </ErrorBoundary>
                  </SidebarLayout>
                </ProtectedRoute>
              } />
            ))}
            <Route path="/connect-data" element={<Navigate to="/get-started" replace />} />
            <Route path="/connections" element={<Navigate to="/get-started" replace />} />
            <Route path="/onboarding/connect" element={<Navigate to="/connect" replace />} />
            <Route path="/memory-explorer" element={<Navigate to="/brain" replace />} />


            {/* Settings */}
            <Route path="/settings" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <Settings />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* askjo-inspired voice bridge — WhatsApp link flow (Phase 1) */}
            <Route path="/settings/voice" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <VoiceSetupPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            <Route path="/pricing" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <Suspense fallback={null}><PricingPage /></Suspense>
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Legacy onboarding routes */}
            <Route path="/welcome" element={<Navigate to="/get-started" replace />} />

            {/* Cinematic onboarding — new user flow */}
            <Route path="/onboarding" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <OnboardingFlow />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Cinematic Soul Reveal - post-onboarding discovery flow */}
            <Route path="/soul-reveal" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <NewDiscoverFlow />
                </ErrorBoundary>
              </ProtectedRoute>
            } />


            {/* Public Soul Card - redirects to Portfolio */}
            <Route path="/s/:userId" element={
              <ErrorBoundary>
                <PortfolioPage />
              </ErrorBoundary>
            } />

            {/* Public Portfolio Page - Premium shareable profile */}
            <Route path="/p/:userId" element={
              <ErrorBoundary>
                <PortfolioPage />
              </ErrorBoundary>
            } />

            {/* Soul Journal */}
            <Route path="/journal" element={<Navigate to="/brain" replace />} />

            {/* Inbox — unified proposal stream (replaces /departments) */}
            <Route path="/inbox" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <InboxPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Legacy /departments route — redirects to /inbox for one release */}
            <Route path="/departments" element={<Navigate to="/inbox" replace />} />

            {/* Privacy Spectrum Dashboard */}
            <Route path="/settings/privacy" element={<Navigate to="/privacy-spectrum" replace />} />
            <Route path="/privacy-spectrum" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <PrivacySpectrumDashboard />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Chat with Twin -- H1: route-local Suspense with a chat-shape
                skeleton so the composer placeholder is visible from the
                first paint on mobile (the global fallback was hiding the
                input region for >3.5s on slow connections). */}
            <Route path="/talk-to-twin" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <Suspense fallback={<TalkToTwinSkeleton />}>
                      <TalkToTwin />
                    </Suspense>
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Compact chrome-less twin chat for the desktop "Hummingbird"
                panel (Tauri webview -> https://twinme.me/widget). ProtectedRoute
                redirects unauthenticated users to /auth; NO SidebarLayout so the
                460x600 panel is pure chat. */}
            <Route path="/widget" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Widget />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Admin: LLM Cost Monitor */}
            <Route path="/admin/llm-costs" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <AdminLLMCosts />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Admin: Beta Monitoring Dashboard (overview metrics, usage, cost) */}
            <Route path="/admin/beta" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <AdminBetaPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Admin: Beta Invite Management (codes, waitlist, feedback) */}
            <Route path="/admin/beta/invites" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <AdminBetaDashboard />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Memory Health — admin/debug tool, moved to /admin/memory-health */}
            <Route path="/memory-health" element={<Navigate to="/admin/memory-health" replace />} />
            <Route path="/admin/memory-health" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <MemoryHealth />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Twin Eval Tool (internal) */}
            <Route path="/eval" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <EvalDashboard />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Desktop app downloads - Public, no auth required (beta users grab it before logging in) */}
            <Route path="/download" element={<DownloadPage />} />

            {/* Privacy Policy - Public, no auth required */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />

            {/* Terms of Service - Public, no auth required */}
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />

            {/* Legacy route redirects */}
            <Route path="/landing" element={<Navigate to="/" replace />} />
            <Route path="/portfolio" element={<Navigate to="/" replace />} />
            <Route path="/insights/web-browsing" element={<Navigate to="/insights/web" replace />} />


            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
                    </NavigationProvider>
                      </SidebarProvider>
        </BrowserRouter>
                  </TooltipProvider>
            </QueryClientProvider>
          </AnalyticsProvider>
        </LoadingProvider>
      </ErrorProvider>
    </ErrorBoundary>
    </div>
    </SunProvider>
    </BackgroundModeProvider>
    </ThemeProvider>
  );
};

const AppBackground: React.FC = () => {
  const { mode } = useBackgroundMode();
  return mode === 'natural' ? <DayNightBackground /> : <ClassicBackground />;
};

export default App;
