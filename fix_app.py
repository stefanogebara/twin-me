#!/usr/bin/env python3

content = '''import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "./contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { LoadingProvider } from "./contexts/LoadingContext";
import { ErrorProvider } from "./contexts/ErrorContext";
import { AnalyticsProvider } from "./contexts/AnalyticsContext";
import ErrorNotification from "./components/ui/ErrorNotification";
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
import Dashboard from "./pages/Dashboard";
import { useExtensionSync } from "./hooks/useExtensionSync";
import WelcomeFlow from "./pages/onboarding/WelcomeFlow";
import GmailCallback from "./pages/oauth/GmailCallback";
import DemoBanner from "./components/DemoBanner";
import RitualStart from "./pages/RitualStart";

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
            {/* Authentication */}
            <Route path="/auth" element={<CustomAuth />} />
            <Route path="/custom-auth" element={<CustomAuth />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/gmail/callback" element={<GmailCallback />} />

            {/* Landing */}
            <Route path="/" element={<Index />} />

            {/* Main Dashboard */}
            <Route path="/dashboard" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <Dashboard />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />

            {/* Platform Connection / Get Started */}
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
            <Route path="/connect" element={<Navigate to="/get-started" replace />} />

            {/* Ritual Start */}
            <Route path="/ritual/start" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <RitualStart />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />

            {/* Settings */}
            <Route path="/settings" element={
              <>
                <SignedIn>
                  <SidebarLayout>
                    <ErrorBoundary>
                      <Settings />
                    </ErrorBoundary>
                  </SidebarLayout>
                </SignedIn>
                <SignedOut>
                  <CustomAuth />
                </SignedOut>
              </>
            } />

            {/* Onboarding Flow */}
            <Route path="/welcome" element={<WelcomeFlow initialStep={1} />} />
            <Route path="/onboarding" element={<WelcomeFlow initialStep={1} />} />

            {/* Catch-all */}
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
'''

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed App.tsx - corrected all JSX closing tag misalignments")