import { ReactLenis } from "lenis/react";
import {
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
  AnimatePresence
} from "framer-motion";
import { FiArrowRight, FiMail, FiArrowLeft } from "react-icons/fi";
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadFull } from "tsparticles";
import { ThemeToggle } from "@/components/ThemeToggle";
// No longer using msal-browser in the frontend as we switched to Python Web App flow
const msalInstance = null;

const AdaniIcon = () => (
  <img
    src={`${import.meta.env.BASE_URL}logo.png`}
    alt="Adani"
    className="w-20 h-10 object-contain"
  />
);

const LoginForm = () => {
  const navigate = useNavigate();
  const { login, ssoLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [msalReady, setMsalReady] = useState(false);
  const [loginMode, setLoginMode] = useState<'selection' | 'credentials'>('selection');

  const handleSSOLogin = () => {
    setSsoLoading(true);
    setError(null);
    console.log('[LoginForm] Redirecting to SSO login...');
    // Redirect to the Python backend SSO login route
    window.location.href = `${window.location.origin}/api/sso/login`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await login(email, password);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.Role === 'Super Admin') {
          navigate("/superadmin");
        } else {
          navigate("/projects");
        }
      } else {
        navigate("/projects");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full relative min-h-[220px]">
      <AnimatePresence mode="wait">
        {loginMode === 'selection' ? (
          <motion.div
            key="selection"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-5 items-center w-full"
          >
            {/* SSO Login Button */}
            <Button
              type="button"
              onClick={handleSSOLogin}
              disabled={ssoLoading}
              variant="outline"
              className="group relative w-full max-w-sm h-16 border-[#0B74B0]/30 bg-[#0B74B0]/5 hover:bg-[#0B74B0]/10 hover:border-[#0B74B0]/60 transition-all duration-300 rounded-2xl shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-center gap-8 w-full">
                {ssoLoading ? (
                  <div className="flex items-center gap-3 text-[#0B74B0] dark:text-white font-bold tracking-widest text-xs">
                    <div className="h-4 w-4 rounded-full border-2 border-[#0B74B0] border-t-transparent animate-spin"></div>
                    CONNECTING...
                  </div>
                ) : (
                  <>
                    {/* <AdaniIcon /> */}
                    <span className="text-[#0B74B0] dark:text-white font-bold tracking-[0.15em] text-lg uppercase">SSO Login</span>
                  </>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </Button>

            {/* Email Login Button */}
            <Button
              type="button"
              onClick={() => setLoginMode('credentials')}
              variant="outline"
              className="group relative w-full max-w-sm h-16 border-zinc-200 dark:border-white/10 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/30 hover:border-zinc-400 dark:hover:border-white/30 transition-all duration-300 rounded-2xl shadow-sm"
            >
              <div className="flex items-center justify-center gap-4 w-full">
                <FiMail className="w-8 h-8 text-zinc-600 dark:text-zinc-400 group-hover:text-primary transition-colors" />
                <span className="text-zinc-700 dark:text-zinc-200 font-bold tracking-[0.15em] text-lg uppercase group-hover:text-primary transition-colors">Email Access</span>
              </div>
            </Button>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm mt-4 text-center w-full max-w-xs rounded-lg"
              >
                {error}
              </motion.div>
            )}

          </motion.div>
        ) : (
          <motion.form
            key="credentials"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="space-y-5 p-8 w-full max-w-sm mx-auto rounded-3xl glass-effect border border-white/20 dark:border-white/10"
            onSubmit={handleLogin}
          >
            <div>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full px-5 py-4 bg-background border border-input text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-widest text-sm rounded-2xl"
                placeholder="EMAIL ADDRESS"
                required
              />
            </div>
            <div>
              <input
                type="password"
                id="password"
                name="password"
                className="w-full px-5 py-4 bg-background border border-input text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-widest text-sm rounded-2xl"
                placeholder="PASSWORD"
                required
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-destructive text-sm text-center bg-destructive/10 py-2 rounded"
              >
                {error}
              </motion.div>
            )}

            <div className="pt-2 flex flex-col items-center gap-6">
              <Button
                type="submit"
                disabled={loading}
                className="w-full py-7 bg-primary border-primary hover:bg-primary/90 text-white font-bold transition-all duration-300 uppercase tracking-[0.2em] rounded-2xl shadow-md"
              >
                <span className="ml-[0.2em]">{loading ? "AUTHENTICATING..." : "LOGIN"}</span>
              </Button>
              <button
                type="button"
                onClick={() => { setLoginMode('selection'); setError(null); }}
                className="text-muted-foreground hover:text-primary transition-colors text-xs uppercase tracking-[0.1em] ml-[0.1em] flex items-center"
              >
                <FiArrowLeft className="mr-2" /> GO BACK
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};



export default LoginForm;

export const SmoothScrollHero = () => {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadFull(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const particlesOptions: any = {
    autoPlay: true,
    background: {
      color: { value: "transparent" },
    },
    particles: {
      color: {
        value: ["#0B74B0", "#75479C", "#BD3861"] // Adani Primary, Secondary, Accent
      },
      links: {
        color: "#0B74B0",
        distance: 120,
        enable: true,
        opacity: 0.2,
        width: 1,
      },
      move: {
        direction: "none",
        enable: true,
        outModes: "bounce",
        speed: 0.5,
      },
      number: {
        limit: {
          value: 120,
        },
        value: 80,
      },
      opacity: {
        animation: {
          enable: true,
          speed: 1,
          sync: false,
        },
        value: { min: 0.1, max: 0.6 },
      },
      shape: {
        type: "circle",
      },
      size: {
        value: { min: 0.5, max: 2 },
      },
    },
    interactivity: {
      events: {
        onHover: {
          enable: true,
          mode: "grab",
        },
      },
      modes: {
        grab: {
          distance: 140,
          links: { opacity: 0.3 }
        },
      },
    },
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden text-foreground" style={{ fontFamily: 'Adani, sans-serif' }}>
      {/* Tsparticles & Grid Background */}
      <div className="fixed inset-0 z-0 bg-grid">
        {init && (
          <Particles
            id="tsparticles"
            options={particlesOptions}
            className="absolute inset-0 w-full h-full"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background/90 z-0 pointer-events-none"></div>
      </div>

      {/* Content layered on top */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Top Right Actions */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        {/* Main Content Area */}
        <main className="w-full max-w-5xl flex flex-col items-center">

          {/* Top Logo & Branding */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-center mb-10 mt-8 md:mt-0"
          >
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani Logo" className="h-10 md:h-12 w-auto object-contain" />
            <div className="h-8 w-px bg-border mx-5"></div>
            <span className="text-muted-foreground text-lg md:text-xl font-light tracking-[0.1em] ml-[0.1em]">Renewables</span>
          </motion.div>

          {/* Grand Futuristic Title */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent tracking-[0.2em] ml-[0.2em] mb-6 uppercase text-center leading-tight drop-shadow-md dark:drop-shadow-xl"
          >
            Digitalized DPR
          </motion.h1>

          {/* Subtitle with Tracking & Borders */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="w-full max-w-3xl border-t border-b border-border py-4 mb-20 text-center flex justify-center"
          >
            <p className="text-muted-foreground text-xs sm:text-sm md:text-base tracking-[0.4em] ml-[0.4em] font-light uppercase">
              Integrated Project Management System
            </p>
          </motion.div>

          {/* Centered Login Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="w-full max-w-md flex flex-col items-center"
          >
            <LoginForm />
          </motion.div>
        </main>
      </div>

      <style>{`
        .bg-grid {
          background-image: 
            linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .dark .bg-grid {
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        }
      `}</style>
    </div>
  );
};
