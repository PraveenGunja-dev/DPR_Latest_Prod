import { ReactLenis } from "lenis/react";
import {
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { Button } from "@/components/ui/button";

const LoginForm = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Get form data
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    try {
      await login(email, password);
      // Navigate directly to projects page instead of dashboard selection
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleLogin}>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          placeholder="Enter your email"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
          Password
        </label>
        <input
          type="password"
          id="password"
          name="password"
          className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          placeholder="Enter your password"
          required
        />
      </div>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm"
        >
          {error}
        </motion.div>
      )}
      <Button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-medium rounded-lg transition-all duration-300 transform hover:scale-[1.02]"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></span>
            Signing in...
          </span>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  );
};

export default LoginForm;

export const SmoothScrollHero = () => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);
  const [currentVideo, setCurrentVideo] = useState(1);

  useEffect(() => {
    const video1 = videoRef1.current;
    const video2 = videoRef2.current;
    
    if (!video1 || !video2) return;

    // Configure both videos
    const configureVideo = (video: HTMLVideoElement) => {
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.loop = false; // We'll handle looping manually
    };

    configureVideo(video1);
    configureVideo(video2);

    // Start with video 1
    video1.style.opacity = "1";
    video2.style.opacity = "0";

    const startVideos = async () => {
      try {
        await video1.play();
        // Start video2 but keep it hidden
        video2.currentTime = 0;
      } catch (err) {
        console.log("Autoplay prevented:", err);
      }
    };

    // Handle seamless transition
    const handleVideoEnd = () => {
      if (currentVideo === 1) {
        // Fade to video 2
        video2.currentTime = 0;
        video2.play().then(() => {
          video1.style.opacity = "0";
          video2.style.opacity = "1";
          setCurrentVideo(2);
        }).catch(err => console.log("Video 2 play error:", err));
      } else {
        // Fade to video 1
        video1.currentTime = 0;
        video1.play().then(() => {
          video2.style.opacity = "0";
          video1.style.opacity = "1";
          setCurrentVideo(1);
        }).catch(err => console.log("Video 1 play error:", err));
      }
    };

    video1.addEventListener('ended', handleVideoEnd);
    video2.addEventListener('ended', handleVideoEnd);

    // Start videos after a short delay to ensure loading
    const initTimeout = setTimeout(startVideos, 100);

    return () => {
      clearTimeout(initTimeout);
      video1.removeEventListener('ended', handleVideoEnd);
      video2.removeEventListener('ended', handleVideoEnd);
    };
  }, [currentVideo]);

  return (
    <div className="min-h-screen bg-black relative overflow-hidden" style={{ fontFamily: 'Adani, sans-serif' }}>
      {/* Fixed Video Background with Zoom Effect */}
      <div className="fixed inset-0 z-0">
        <div className="relative w-full h-full overflow-hidden">
          <video 
            ref={videoRef1}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-1000 scale-110"
            style={{ opacity: currentVideo === 1 ? 1 : 0, objectFit: 'cover', animation: 'zoomEffect 30s infinite alternate' }}
          >
            <source src="/Wind.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <video 
            ref={videoRef2}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-1000 scale-110"
            style={{ opacity: currentVideo === 2 ? 1 : 0, objectFit: 'cover', animation: 'zoomEffect 30s infinite alternate' }}
          >
            <source src="/Wind.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
      
      {/* Content layered on top */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header with Logo */}
        <header className="pt-8 px-8">
          <img src="/logo.png" alt="Adani Logo" className="h-16 w-auto" />
        </header>
        
        {/* Main Content - Centered Login Form */}
        <main className="flex-grow flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 glass-effect backdrop-blur-sm">
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  DPR Project
                </h1>
                <p className="text-muted-foreground">Login to access your dashboard</p>
              </div>
              <LoginForm />
            </div>
          </div>
        </main>
      </div>
      
      {/* Add keyframes for zoom animation */}
      <style>{`
        @keyframes zoomEffect {
          0% { transform: scale(1.1); }
          100% { transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};
