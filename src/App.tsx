import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import Chat from "./pages/Chat";
import GetStarted from "./pages/GetStarted";
import VoiceSettings from "./pages/VoiceSettings";
import Settings from "./pages/Settings";
import TwinBuilder from "./pages/TwinBuilder";
import ConversationalTwinBuilder from "./pages/ConversationalTwinBuilder";
import { TwinActivation } from "./pages/TwinActivation";
import WatchDemo from "./pages/WatchDemo";
import Contact from "./pages/Contact";
import ProfessorDashboard from "./pages/ProfessorDashboard";
import PersonalTwinBuilder from "./pages/PersonalTwinBuilder";
import StudentDashboard from "./pages/StudentDashboard";
import InstantTwinOnboarding from "./pages/InstantTwinOnboarding";
import TwinDashboard from "./pages/TwinDashboard";
import OAuthCallback from "./pages/OAuthCallback";
import CustomAuth from "./pages/CustomAuth";
import ChooseMode from "./pages/ChooseMode";
import ChooseTwinType from "./pages/ChooseTwinType";
import SoulSignatureDashboard from "./pages/SoulSignatureDashboard";
import PrivacySpectrumDashboard from "./components/PrivacySpectrumDashboard";
import TwinProfilePreview from "./components/TwinProfilePreview";
import { ThemeProvider } from "./contexts/ThemeContext";

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/chat/:twinId" element={
              <>
                <SignedIn>
                  <Chat />
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
                  <TwinProfilePreview
                    onActivate={() => window.location.href = '/twin-activation'}
                    onEdit={() => window.location.href = '/soul-signature'}
                  />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/legacy-get-started" element={
              <>
                <SignedIn>
                  <GetStarted />
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />
            <Route path="/original-get-started" element={
              <>
                <SignedIn>
                  <GetStarted />
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
                  <Settings />
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
            <Route path="/twin-activation" element={
              <>
                <SignedIn>
                  <TwinActivation />
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
            <Route path="/professor-dashboard" element={
              <>
                <SignedIn>
                  <ProfessorDashboard />
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
            <Route path="/student-dashboard" element={
              <>
                <SignedIn>
                  <StudentDashboard />
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

export default App;