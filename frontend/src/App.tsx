import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/modules/auth/contexts/AuthContext"
import { NotificationProvider } from "@/modules/auth/contexts/NotificationContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import Landing from "@/pages/Landing"
import NotFound from "@/pages/NotFound"
import ProjectsPage from "@/modules/auth/ProjectsPage"
import SupervisorDashboard from "@/modules/supervisor/SupervisorDashboard"
import DPRDashboard from "@/modules/supervisor/DPRDashboard"
import PMDashboard from "@/modules/sitepm/PMDashboard"
import PMAGDashboard from "@/modules/pmag/PMAGDashboard"
import SuperAdminDashboard from "@/modules/superadmin"
import { ProtectedRoute } from "@/modules/auth/components/ProtectedRoute"
import { ThemeProvider } from "@/components/ThemeProvider"
import AccessPending from "@/modules/auth/AccessPending"
import { ChartsPage } from "@/modules/charts"
import { InfiniteScrollDemoPage } from "@/pages/InfiniteScrollDemoPage"

const queryClient = new QueryClient()
const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter basename="/">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/access-pending" element={<AccessPending />} />
                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/supervisor"
                  element={
                    <ProtectedRoute requiredRole="supervisor">
                      <SupervisorDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dpr"
                  element={
                    <ProtectedRoute requiredRole="supervisor">
                      <DPRDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sitepm"
                  element={
                    <ProtectedRoute requiredRole="Site PM">
                      <PMDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pmag"
                  element={
                    <ProtectedRoute requiredRole="PMAG">
                      <PMAGDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/superadmin"
                  element={
                    <ProtectedRoute requiredRole="Super Admin">
                      <SuperAdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/charts"
                  element={
                    <ProtectedRoute>
                      <ChartsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/infinite-scroll-demo"
                  element={
                    <ProtectedRoute>
                      <InfiniteScrollDemoPage />
                    </ProtectedRoute>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

export default App