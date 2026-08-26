import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { RoleCard } from "@/components/RoleCard"
import { UserCog, Shield, CheckCircle2, Palette } from "lucide-react"
import { SmoothScrollHero as Login } from "@/modules/auth/Login"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { useAuth } from "@/modules/auth/contexts/AuthContext"
import { useEffect } from "react"

const Landing = () => {
  const navigate = useNavigate()
  const { isAuthenticated, user, isLoading } = useAuth()

  // Redirect if already authenticated
  useEffect(() => {
    if (isLoading) return;

    if (user && (user as any).Role === 'pending_approval') {
      navigate("/access-pending");
      return;
    }

    if (isAuthenticated && user) {
      if ((user as any).Role === 'Super Admin' || (user as any).role === 'Super Admin') {
        navigate("/superadmin");
      } else {
        navigate("/projects");
      }
    }
  }, [isAuthenticated, isLoading, user, navigate]);

  const roles = [
    {
      role: "Supervisor / Maker",
      icon: UserCog,
      description: "Daily data entry and sheet submission",
      path: "/supervisor",
    },
    {
      role: "Site PM / Checker 1",
      icon: Shield,
      description: "Review, modify, and approve workflows",
      path: "/sitepm",
    },
    {
      role: "PMAG / Checker 2",
      icon: CheckCircle2,
      description: "Advanced analytics and final approvals",
      path: "/pmag",
    },
  ]

  return (
    <div className="min-h-screen relative">    
      <Login />
      {/* <div className="fixed relative bottom-4 right-4">
        <Button 
          variant="outline" 
          onClick={() => navigate('/sso')}
          className="bg-black/50 border-white/20 text-white hover:bg-white/10"
        >
          SSO Login
        </Button>
      </div> */}
    </div>
  )
}

export default Landing