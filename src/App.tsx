import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
import Index from "./pages/Index";
import AnthropicIndex from "./pages/AnthropicIndex";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import TalkToTwin from "./pages/TalkToTwin";
import EnhancedTalkToTwin from "./pages/EnhancedTalkToTwin";
import Chat from "./pages/Chat";
import EnhancedChat from "./pages/EnhancedChat";
import GetStarted from "./pages/GetStarted";
import AnthropicGetStarted from "./pages/AnthropicGetStarted";
import VoiceSettings from "./pages/VoiceSettings";
import TwinBuilder from "./pages/TwinBuilder";
import ConversationalTwinBuilder from "./pages/ConversationalTwinBuilder";
import AnthropicTwinBuilder from "./pages/AnthropicTwinBuilder";
import { TwinActivation } from "./pages/TwinActivation";
import WatchDemo from "./pages/WatchDemo";
import Contact from "./pages/Contact";
import ProfessorDashboard from "./pages/ProfessorDashboard";
import PersonalTwinBuilder from "./pages/PersonalTwinBuilder";
import StudentDashboard from "./pages/StudentDashboard";
import InstantTwinOnboarding from "./pages/InstantTwinOnboarding";
import TwinDashboard from "./pages/TwinDashboard";

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<AnthropicIndex />} />
            <Route path="/legacy" element={<Index />} />
            <Route path="/talk-to-twin" element={
              <>
                <SignedIn>
                  <EnhancedTalkToTwin />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/chat/:twinId" element={
              <>
                <SignedIn>
                  <EnhancedChat />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/get-started" element={
              <>
                <SignedIn>
                  <InstantTwinOnboarding />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/legacy-get-started" element={
              <>
                <SignedIn>
                  <AnthropicGetStarted />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/original-get-started" element={
              <>
                <SignedIn>
                  <GetStarted />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/voice-settings" element={
              <>
                <SignedIn>
                  <VoiceSettings />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-builder" element={
              <>
                <SignedIn>
                  <AnthropicTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/legacy-twin-builder" element={
              <>
                <SignedIn>
                  <TwinBuilder />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/anthropic-twin-builder" element={
              <>
                <SignedIn>
                  <AnthropicTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-activation" element={
              <>
                <SignedIn>
                  <TwinActivation />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/watch-demo" element={
              <>
                <SignedIn>
                  <WatchDemo />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/contact" element={
              <>
                <SignedIn>
                  <Contact />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/professor-dashboard" element={
              <>
                <SignedIn>
                  <ProfessorDashboard />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/personal-twin-builder" element={
              <>
                <SignedIn>
                  <PersonalTwinBuilder />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/student-dashboard" element={
              <>
                <SignedIn>
                  <StudentDashboard />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            <Route path="/twin-dashboard/:twinId" element={
              <>
                <SignedIn>
                  <TwinDashboard />
                </SignedIn>
                <SignedOut>
                  <Auth />
                </SignedOut>
              </>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
            </TooltipProvider>
          </QueryClientProvider>
        </AnalyticsProvider>
      </LoadingProvider>
    </ErrorProvider>
  </ErrorBoundary>
);

export default App;