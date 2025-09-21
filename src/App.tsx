import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import TalkToTwin from "./pages/TalkToTwin";
import Chat from "./pages/Chat";
import GetStarted from "./pages/GetStarted";
import VoiceSettings from "./pages/VoiceSettings";
import TwinBuilder from "./pages/TwinBuilder";
import { TwinActivation } from "./pages/TwinActivation";
import WatchDemo from "./pages/WatchDemo";
import Contact from "./pages/Contact";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={
            <>
              <SignedIn>
                <Index />
              </SignedIn>
              <SignedOut>
                <Auth />
              </SignedOut>
            </>
          } />
          <Route path="/talk-to-twin" element={
            <>
              <SignedIn>
                <TalkToTwin />
              </SignedIn>
              <SignedOut>
                <Auth />
              </SignedOut>
            </>
          } />
          <Route path="/chat/:professorId" element={
            <>
              <SignedIn>
                <Chat />
              </SignedIn>
              <SignedOut>
                <Auth />
              </SignedOut>
            </>
          } />
          <Route path="/get-started" element={
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
                <TwinBuilder />
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
