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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
