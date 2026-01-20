import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
import ProtectedRoute from "./components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import InstantTwinOnboarding from "./pages/InstantTwinOnboarding";
import OAuthCallback from "./pages/OAuthCallback";
import CustomAuth from "./pages/CustomAuth";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DemoProvider } from "./contexts/DemoContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { PipedreamProvider } from "./contexts/PipedreamContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import Dashboard from "./pages/Dashboard";
import DashboardDemo from "./pages/DashboardDemo";
import { useExtensionSync } from "./hooks/useExtensionSync";
import WelcomeFlow from "./pages/onboarding/WelcomeFlow";
import GmailCallback from "./pages/oauth/GmailCallback";
import DemoBanner from "./components/DemoBanner";
import { SpotifyInsightsPage, WhoopInsightsPage, CalendarInsightsPage } from "./pages/insights";
import SoulSignatureDashboard from "./pages/SoulSignatureDashboard";
import SoulSignatureOnboarding from "./pages/onboarding/SoulSignatureOnboarding";
import PersonalityAssessment from "./pages/PersonalityAssessment";
import BigFiveAssessment from "./pages/BigFiveAssessment";
import TalkToTwin from "./pages/TalkToTwin";

const queryClient = new QueryClient();

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
                      <SidebarProvider>
                      <NavigationProvider>
                      <DemoBanner variant="top" />
          <Routes>
            {/* Authentication */}
            <Route path="/auth" element={<CustomAuth />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
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
            <Route path="/insights/whoop" element={
              <ProtectedRoute>
                <SidebarLayout>
                  <ErrorBoundary>
                    <WhoopInsightsPage />
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

            {/* Personality Assessment - Full-screen focused onboarding experience */}
            <Route path="/personality" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <PersonalityAssessment />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Big Five Assessment - IPIP-NEO-120 scientific assessment */}
            <Route path="/big-five" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <BigFiveAssessment />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Dashboard Demo - No Auth Required */}
            <Route path="/dashboard-demo" element={
              <SidebarLayout>
                <ErrorBoundary>
                  <DashboardDemo />
                </ErrorBoundary>
              </SidebarLayout>
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

            {/* Onboarding Flow */}
            <Route path="/welcome" element={<WelcomeFlow initialStep={1} />} />
            <Route path="/onboarding" element={<WelcomeFlow initialStep={1} />} />

            {/* Soul Signature Onboarding - Works in Demo Mode */}
            <Route path="/soul-onboarding" element={
              <ErrorBoundary>
                <SoulSignatureOnboarding />
              </ErrorBoundary>
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

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
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
