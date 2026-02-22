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
import { ThemeProvider } from "./contexts/ThemeContext";
import { DemoProvider } from "./contexts/DemoContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { PipedreamProvider } from "./contexts/PipedreamContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { useExtensionSync } from "./hooks/useExtensionSync";
import DemoBanner from "./components/DemoBanner";

// Eager-loaded (critical path: landing, auth, 404)
import Index from "./pages/Index";
import CustomAuth from "./pages/CustomAuth";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages (code-split into separate chunks)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const InstantTwinOnboarding = lazy(() => import("./pages/InstantTwinOnboarding"));
const SoulSignatureDashboard = lazy(() => import("./pages/SoulSignatureDashboard"));
const BrainPage = lazy(() => import("./pages/BrainPage"));
const BigFiveAssessment = lazy(() => import("./pages/BigFiveAssessment"));
const TalkToTwin = lazy(() => import("./pages/TalkToTwin"));
const JournalPage = lazy(() => import("./pages/JournalPage"));
const AdminLLMCosts = lazy(() => import("./pages/AdminLLMCosts"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const NewDiscoverFlow = lazy(() => import("./pages/onboarding/NewDiscoverFlow"));
const GmailCallback = lazy(() => import("./pages/oauth/GmailCallback"));
const SpotifyInsightsPage = lazy(() => import("./pages/insights/SpotifyInsightsPage"));
const CalendarInsightsPage = lazy(() => import("./pages/insights/CalendarInsightsPage"));
const YouTubeInsightsPage = lazy(() => import("./pages/insights/YouTubeInsightsPage"));
const WebBrowsingInsightsPage = lazy(() => import("./pages/insights/WebBrowsingInsightsPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));

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
  <ThemeProvider>
    <DemoProvider>
      <ErrorBoundary showHomeButton>
        <ErrorProvider>
          <LoadingProvider>
            <AnalyticsProvider>
              <QueryClientProvider client={queryClient}>
                <PipedreamProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <ErrorNotification />
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                      <PostHogPageTracker />
                      <SidebarProvider>
                      <NavigationProvider>
                      <DemoBanner variant="top" />
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" /></div>}>
          <Routes>
            {/* Authentication */}
            <Route path="/auth" element={<CustomAuth />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/gmail/callback" element={<GmailCallback />} />

            {/* Landing */}
            <Route path="/" element={<Index />} />

            {/* Main Dashboard */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <Dashboard />
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

            {/* Soul Signature Dashboard */}
            <Route path="/soul-signature" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <SoulSignatureDashboard />
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

            {/* Big Five Assessment - IPIP-NEO-120 scientific assessment (allows anonymous preview) */}
            <Route path="/big-five" element={
              <ErrorBoundary>
                <BigFiveAssessment />
              </ErrorBoundary>
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

            {/* Legacy onboarding routes → redirect to enriched flow */}
            <Route path="/welcome" element={<Navigate to="/discover" replace />} />
            <Route path="/onboarding" element={<Navigate to="/discover" replace />} />

            {/* Cinematic Discover - "The Reveal" flow */}
            <Route path="/discover" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <NewDiscoverFlow />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Legacy onboarding routes → primary flow */}
            <Route path="/discover-legacy" element={<Navigate to="/discover" replace />} />
            <Route path="/soul-onboarding" element={<Navigate to="/discover" replace />} />

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
            <Route path="/journal" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <JournalPage />
                  </ErrorBoundary>
                </SidebarLayout>
              </ProtectedRoute>
            } />

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

            {/* Privacy Policy - Public, no auth required */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
                    </NavigationProvider>
                      </SidebarProvider>
        </BrowserRouter>
                  </TooltipProvider>
                </PipedreamProvider>
            </QueryClientProvider>
          </AnalyticsProvider>
        </LoadingProvider>
      </ErrorProvider>
    </ErrorBoundary>
    </DemoProvider>
  </ThemeProvider>
  );
};

export default App;
