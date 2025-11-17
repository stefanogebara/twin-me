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
import SoulChat from "./pages/SoulChat";
import PlatformHub from "./pages/PlatformHub";
import PrivacySpectrumDashboard from "./pages/PrivacySpectrumDashboard";
import TwinProfilePreview from "./pages/TwinProfilePreview";
import SoulMatching from "./pages/SoulMatching";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DemoProvider } from "./contexts/DemoContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { PipedreamProvider } from "./contexts/PipedreamContext";
import Dashboard from "./pages/Dashboard";
import Training from "./pages/Training";
import Help from "./pages/Help";
import InsightsV2 from "./pages/InsightsV2";
import { useExtensionSync } from "./hooks/useExtensionSync";
import WelcomeFlow from "./pages/onboarding/WelcomeFlow";
import GmailCallback from "./pages/oauth/GmailCallback";
import MemoryDashboard from "./pages/MemoryDashboard";
import DemoBanner from "./components/DemoBanner";
import PlatformStatus from "./pages/PlatformStatus";
import NetflixDemo from "./pages/NetflixDemo";
import HeroShowcase from "./pages/HeroShowcase";
import CofounderHeroPage from "./pages/CofounderHeroPage";
import AdvancedHeroPage from "./pages/AdvancedHeroPage";
import { ShowcaseDemo } from "./pages/ShowcaseDemo";
import { ShowcaseSoulSignature } from "./pages/ShowcaseSoulSignature";
import { ShowcasePrivacy } from "./pages/ShowcasePrivacy";
import { ShowcasePlatforms } from "./pages/ShowcasePlatforms";
import HeroLanding from "./pages/HeroLanding";
import { AdminMetricsDashboard } from "./pages/AdminMetricsDashboard";
import BehavioralPatterns from "./pages/BehavioralPatterns";

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
                    <BrowserRouter>
                      <NavigationProvider>
                      <DemoBanner variant="top" />
          <Routes>
            <Route path="/auth" element={<CustomAuth />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/" element={<Index />} />
            <Route path="/hero" element={<HeroLanding />} />
            <Route path="/hero-showcase" element={<HeroShowcase />} />
            <Route path="/cofounder-hero" element={<CofounderHeroPage />} />
            <Route path="/advanced-hero" element={<AdvancedHeroPage />} />
            <Route path="/showcase" element={<ShowcaseDemo />} />
            <Route path="/showcase/soul" element={<ShowcaseSoulSignature />} />
            <Route path="/showcase/privacy" element={<ShowcasePrivacy />} />
            <Route path="/showcase/platforms" element={<ShowcasePlatforms />} />
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
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/training" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <Training />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/talk-to-twin" element={
              <>
                <SignedIn>
                  <TalkToTwin />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/get-started" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <InstantTwinOnboarding />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/soul-signature" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <SoulSignatureDashboard />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/insights" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <InsightsV2 />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/soul-chat" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <SoulChat />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/behavioral-patterns" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <BehavioralPatterns />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/platform-hub" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <PlatformHub />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/platform-status" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <PlatformStatus />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/privacy" element={<Navigate to="/privacy-spectrum" replace />} />
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
            <Route path="/soul-matching" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <SoulMatching />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/memory-dashboard" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <MemoryDashboard />
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
                  <TwinProfilePreview />
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
                  <ErrorBoundary>
                    <Settings />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/help" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <Help />
                  </ErrorBoundary>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/admin/metrics" element={
              <>
                <SignedIn>
                  <ErrorBoundary>
                    <AdminMetricsDashboard />
                  </ErrorBoundary>
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
                  <Dashboard />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            {/* Twin Dashboard (without ID) - Redirect to dashboard */}
            {/* Streamlined 4-step Onboarding Flow */}
            <Route path="/welcome" element={<WelcomeFlow initialStep={1} />} />
            <Route path="/oauth/gmail/callback" element={<GmailCallback />} />
            <Route path="/onboarding" element={<WelcomeFlow initialStep={1} />} />
            <Route path="/onboarding/welcome" element={<WelcomeFlow initialStep={1} />} />
            <Route path="/onboarding/about" element={<WelcomeFlow initialStep={2} />} />
            <Route path="/onboarding/gmail" element={<WelcomeFlow initialStep={3} />} />
            <Route path="/onboarding/platforms" element={<WelcomeFlow initialStep={4} />} />
            <Route path="/twin-dashboard" element={<Navigate to="/dashboard" replace />} />
            {/* Demo Pages */}
            <Route path="/netflix-demo" element={<NetflixDemo />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
                    </NavigationProvider>
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