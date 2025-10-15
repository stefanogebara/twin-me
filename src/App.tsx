import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "./contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import TalkToTwin from "./pages/TalkToTwin";
import VoiceSettings from "./pages/VoiceSettings";
import Settings from "./pages/Settings";
import TwinBuilder from "./pages/TwinBuilder";
import ConversationalTwinBuilder from "./pages/ConversationalTwinBuilder";
import WatchDemo from "./pages/WatchDemo";
import Contact from "./pages/Contact";
import PersonalTwinBuilder from "./pages/PersonalTwinBuilder";
import InstantTwinOnboarding from "./pages/InstantTwinOnboarding";
import TwinDashboard from "./pages/TwinDashboard";
import OAuthCallback from "./pages/OAuthCallback";
import CustomAuth from "./pages/CustomAuth";
import ChooseMode from "./pages/ChooseMode";
import ChooseTwinType from "./pages/ChooseTwinType";
import SoulSignatureDashboard from "./pages/SoulSignatureDashboard";
import SoulChatPage from "./pages/SoulChatPage";
import PlatformHub from "./pages/PlatformHub";
import PrivacySpectrumDashboard from "./components/PrivacySpectrumDashboard";
import TwinProfilePreviewPage from "./pages/TwinProfilePreviewPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Training from "./pages/Training";
import Help from "./pages/Help";
import { useExtensionSync } from "./hooks/useExtensionSync";

const queryClient = new QueryClient();

const App = () => {
  // Automatically sync auth tokens to browser extension
  useExtensionSync();

  return (
  <ThemeProvider>
    <ErrorBoundary showHomeButton>
      <ErrorProvider>
        <LoadingProvider>
          <AnalyticsProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <ErrorNotification />
                <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<CustomAuth />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/" element={<Index />} />
            <Route path="/choose-mode" element={
              <>
                <SignedIn>
                  <ChooseMode />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/choose-twin-type" element={
              <>
                <SignedIn>
                  <ChooseTwinType />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/legacy" element={<Index />} />
            {/* Redirect legacy /soul-dashboard to /dashboard */}
            <Route path="/soul-dashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <Dashboard />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/training" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <Training />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/talk-to-twin" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <TalkToTwin />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/get-started" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <InstantTwinOnboarding />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/soul-signature" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <SoulSignatureDashboard />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/soul-chat" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <SoulChatPage />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/platform-hub" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <PlatformHub />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/privacy-spectrum" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <PrivacySpectrumDashboard />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-profile-preview" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <TwinProfilePreviewPage />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/voice-settings" element={
              <>
                <SignedIn>
                  <VoiceSettings />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/settings" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <Settings />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/help" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <Help />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-builder" element={
              <>
                <SignedIn>
                  <ConversationalTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/legacy-twin-builder" element={
              <>
                <SignedIn>
                  <TwinBuilder />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/anthropic-twin-builder" element={
              <>
                <SignedIn>
                  <ConversationalTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/watch-demo" element={
              <>
                <SignedIn>
                  <WatchDemo />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/contact" element={
              <>
                <SignedIn>
                  <Contact />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/personal-twin-builder" element={
              <>
                <SignedIn>
                  <PersonalTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-dashboard/:twinId" element={
              <>
                <SignedIn>
                  <TwinDashboard />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            {/* Student Dashboard - Educational twin management */}
            <Route path="/student-dashboard" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <Dashboard />
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            {/* Twin Dashboard (without ID) - Redirect to dashboard */}
            <Route path="/twin-dashboard" element={<Navigate to="/dashboard" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
              </TooltipProvider>
            </QueryClientProvider>
          </AnalyticsProvider>
        </LoadingProvider>
      </ErrorProvider>
    </ErrorBoundary>
  </ThemeProvider>
  );
};

export default App;