import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider, useAnalytics } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
import ProtectedRoute from "./components/ProtectedRoute";
import { DemoProvider } from "./contexts/DemoContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { useExtensionSync } from "./hooks/useExtensionSync";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SunProvider } from "./contexts/SunContext";
import DemoBanner from "./components/DemoBanner";

// Eager-loaded (critical path: landing, auth, 404)
import Index from "./pages/Index";
import CustomAuth from "./pages/CustomAuth";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages (code-split into separate chunks)
const DashboardV2 = lazy(() => import("./pages/DashboardV2"));
const Settings = lazy(() => import("./pages/Settings"));
const InstantTwinOnboarding = lazy(() => import("./pages/InstantTwinOnboarding"));
const BrainPage = lazy(() => import("./pages/BrainPage"));
const TalkToTwin = lazy(() => import("./pages/TalkToTwin"));
const AdminLLMCosts = lazy(() => import("./pages/AdminLLMCosts"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const NewDiscoverFlow = lazy(() => import("./pages/onboarding/NewDiscoverFlow"));
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const DiscoverLanding = lazy(() => import("./pages/DiscoverLanding"));
const GmailCallback = lazy(() => import("./pages/oauth/GmailCallback"));
const SpotifyInsightsPage = lazy(() => import("./pages/insights/SpotifyInsightsPage"));
const CalendarInsightsPage = lazy(() => import("./pages/insights/CalendarInsightsPage"));
const YouTubeInsightsPage = lazy(() => import("./pages/insights/YouTubeInsightsPage"));
const WebBrowsingInsightsPage = lazy(() => import("./pages/insights/WebBrowsingInsightsPage"));
const DiscordInsightsPage = lazy(() => import("./pages/insights/DiscordInsightsPage"));
const LinkedInInsightsPage = lazy(() => import("./pages/insights/LinkedInInsightsPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const PrivacySpectrumDashboard = lazy(() => import("./pages/PrivacySpectrumDashboard"));
const MemoryHealth = lazy(() => import("./pages/MemoryHealth"));
const EvalDashboard = lazy(() => import("./pages/EvalDashboard"));
const IdentityPage = lazy(() => import("./pages/IdentityPage"));
const InterviewPage = lazy(() => import("./pages/InterviewPage"));

// Prototype pages (Sundust design system)
const PrototypeLanding    = lazy(() => import('./prototype/pages/PrototypeLanding'));
const PrototypeDashboard  = lazy(() => import('./prototype/pages/PrototypeDashboard'));
const PrototypeChat       = lazy(() => import('./prototype/pages/PrototypeChat'));
const PrototypeSettings   = lazy(() => import('./prototype/pages/PrototypeSettings'));
const PrototypeIdentity   = lazy(() => import('./prototype/pages/PrototypeIdentity'));
const PrototypeGoals      = lazy(() => import('./prototype/pages/PrototypeGoals'));
const PrototypeBrain      = lazy(() => import('./prototype/pages/PrototypeBrain'));
const PrototypeLayout     = lazy(() => import('./prototype/layouts/PrototypeLayout').then(m => ({ default: m.PrototypeLayout })));

const queryClient = new QueryClient();

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

  return (
    <ThemeProvider defaultTheme="dark">
    <SunProvider>
    <DemoProvider>
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
                      <PostHogPageTracker />
                      <SidebarProvider>
                      <NavigationProvider>
                      <DemoBanner variant="top" />
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><img src="/images/backgrounds/flower-hero.png" alt="Loading" className="w-12 h-12 animate-pulse" /></div>}>
          <Routes>
            {/* Authentication */}
            <Route path="/auth" element={<CustomAuth />} />
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
            <Route path="/insights/linkedin" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <LinkedInInsightsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Soul Signature → redirect to Identity (canonical "Who You Are" page) */}
            <Route path="/soul-signature" element={<Navigate to="/identity" replace />} />

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


            {/* Platform Connection / Get Started */}
            <Route path="/get-started" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <InstantTwinOnboarding />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />
            <Route path="/connect" element={<Navigate to="/get-started" replace />} />


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

            {/* Goal Tracking */}
            <Route path="/goals" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <GoalsPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Privacy Spectrum Dashboard */}
            <Route path="/privacy-spectrum" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <PrivacySpectrumDashboard />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

            {/* Chat with Twin */}
            <Route path="/talk-to-twin" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <TalkToTwin />
                  </ErrorBoundary>
                </SidebarLayout>
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

            {/* Privacy Policy - Public, no auth required */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />

            {/* Terms of Service - Public, no auth required */}
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />

            {/* Legacy route redirects */}
            <Route path="/portfolio" element={<Navigate to="/" replace />} />
            <Route path="/insights/web-browsing" element={<Navigate to="/insights/web" replace />} />

            {/* Sundust Prototype */}
            <Route path="/prototype" element={<PrototypeLanding />} />
            <Route element={<PrototypeLayout />}>
              <Route path="/prototype/dashboard" element={<PrototypeDashboard />} />
              <Route path="/prototype/chat"      element={<PrototypeChat />} />
              <Route path="/prototype/settings"  element={<PrototypeSettings />} />
              <Route path="/prototype/identity"  element={<PrototypeIdentity />} />
              <Route path="/prototype/goals"     element={<PrototypeGoals />} />
              <Route path="/prototype/brain"     element={<PrototypeBrain />} />
            </Route>

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
    </DemoProvider>
    </SunProvider>
    </ThemeProvider>
  );
};

export default App;
