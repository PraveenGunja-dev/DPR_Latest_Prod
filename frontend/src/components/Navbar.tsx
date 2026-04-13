import { motion, AnimatePresence } from "framer-motion"
import { Building2, User, LogOut, Users, FolderPlus, BarChart3, UserPlus, AlertCircle, Bell, Eye, FileText, Home, Settings } from "lucide-react"
import { Button } from "./ui/button"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/modules/auth/contexts/AuthContext"
import { useNotification } from "@/modules/auth/contexts/NotificationContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronRight, Circle, BellDot } from "lucide-react"
import { IssuesViewModal } from "@/components/IssuesViewModal"

interface NavbarProps {
  userName?: string
  userRole?: string
  projectName?: string
  projectId?: string | number
  projectP6Id?: string | number
  onAddUser?: () => void
  onAddProject?: () => void
  onAssignProject?: () => void
  onAddIssue?: () => void
}

export const Navbar = ({ userName, userRole, projectName, projectId, projectP6Id, onAddUser, onAddProject, onAssignProject, onAddIssue }: NavbarProps) => {
  // Note: User creation is role-based:
  // - PMAG can create Site PM and PMAG users
  // - Site PM can only create supervisors
  // - Supervisors cannot create users
  const navigate = useNavigate()
  const { logout, user, refreshUserProfile } = useAuth()
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotification()
  const displayRole = user?.role || user?.Role || userRole || "";
  const displayName = user?.name || user?.Name || userName || "User";

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isIssuesModalOpen, setIsIssuesModalOpen] = useState(false)
  const [newIssuesCount, setNewIssuesCount] = useState(0)
  // Track expanded state for each notification
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Fetch user profile on component mount
  useEffect(() => {
    if (!user) {
      refreshUserProfile()
    }
  }, [user, refreshUserProfile])

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  const handleAddUser = () => {
    if (onAddUser) {
      onAddUser()
    }
    // No default behavior - parent component should provide handler
  }

  const handleAddProject = () => {
    if (onAddProject) {
      onAddProject()
    }
    // No default behavior - parent component should provide handler
  }

  const handleAssignProject = () => {
    if (onAssignProject) {
      onAssignProject()
    }
    // No default behavior - parent component should provide handler
  }

  const handleAddIssue = () => {
    if (onAddIssue) {
      onAddIssue()
    } else {
      // Navigate to supervisor dashboard issues tab if no handler is provided
      navigate("/supervisor", { state: { openAddIssueModal: true, activeTab: "issues" } })
    }
  }

  const handleCharts = () => {
    // Navigate to charts page
    navigate("/charts")
  }

  const handleProjects = () => {
    // For Super Admins, navigate to the projects tab of their dashboard
    if (displayRole === "Super Admin") {
      navigate("/superadmin", { state: { activeTab: "projects" } });
    } else {
      navigate("/projects");
    }
  };

  const handleNotificationClick = (notification: any) => {
    // Mark notification as read
    markAsRead(notification.id);

    // Map sheet types to navigation paths and tab values
    const sheetTypeToTabMap: Record<string, string> = {
      'dp_qty': 'dp_qty',
      'dp_block': 'dp_block',
      'dp_vendor_idt': 'dp_vendor_idt',
      'mms_module_rfi': 'mms_module_rfi',
      'dp_vendor_block': 'dp_vendor_block',
      'manpower_details': 'manpower_details'
    };

    // If notification has a sheetType, navigate to the supervisor dashboard with that tab active
    if (notification.sheetType && sheetTypeToTabMap[notification.sheetType]) {
      const tab = sheetTypeToTabMap[notification.sheetType];

      // Navigate to supervisor dashboard with the specific tab activated
      // Pass projectId and entryId in state if available
      const state: any = { activeTab: tab };
      if (notification.projectId) {
        state.projectId = notification.projectId;
      }
      if (notification.entryId) {
        state.entryId = notification.entryId;
      }

      // Route based on user role
      if (displayRole === 'Site PM') {
        navigate("/sitepm", { state });
      } else if (displayRole === 'PMAG') {
        navigate("/pmag", { state });
      } else if (displayRole === 'Super Admin') {
        navigate("/superadmin", { state });
      } else {
        navigate("/supervisor", { state });
      }
    } else if (notification.projectId) {
      // If no sheetType but has projectId, navigate to projects page
      navigate("/projects");
    } else {
      // Default action - show alert for now
      alert(`Notification: ${notification.title}\n${notification.message}`);
    }

    // Close modal after navigation
    setIsModalOpen(false);
  }

  // Toggle expand/collapse for a notification
  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));

    // Mark as read when expanding
    if (!expandedItems[id]) {
      markAsRead(id);
    }
  };

  // Poll for issue stats for relevant roles
  useEffect(() => {
    // Only poll if there's an actively resolved user with a token
    if (user && (displayRole === "Site PM" || displayRole === "PMAG")) {
      let isMounted = true;
      const fetchIssues = async () => {
        try {
          const { getIssueStats } = await import("@/services/issuesService");
          const stats = await getIssueStats();
          const activeIssues = stats.open_count + stats.in_progress_count;

          const viewedCountStr = localStorage.getItem("viewedIssuesCount");
          const viewedCount = viewedCountStr ? parseInt(viewedCountStr, 10) : 0;

          if (isMounted) {
            if (activeIssues > viewedCount) {
              setNewIssuesCount(activeIssues - viewedCount);
            } else if (activeIssues < viewedCount) {
              // Update baseline if issues were resolved
              localStorage.setItem("viewedIssuesCount", activeIssues.toString());
              setNewIssuesCount(0);
            } else {
              setNewIssuesCount(0);
            }
          }
        } catch (error) {
          console.error("Failed to load issue stats", error);
        }
      };

      fetchIssues();
      const interval = setInterval(fetchIssues, 30000); // 30 seconds
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
  }, [displayRole, isIssuesModalOpen]); // Re-evaluate when modal state changes to catch updates after closing

  const handleOpenIssues = () => {
    setIsIssuesModalOpen(true);
    import("@/services/issuesService").then(({ getIssueStats }) => {
      getIssueStats().then(stats => {
        localStorage.setItem("viewedIssuesCount", (stats.open_count + stats.in_progress_count).toString());
        setNewIssuesCount(0);
      }).catch(err => console.error(err));
    });
  };

  // Notification Modal Component
  const NotificationModal = () => {
    if (!isModalOpen) return null;

    const getIcon = (type: string) => {
      switch (type) {
        case 'success': return <Circle className="w-3 h-3 fill-green-500 text-green-500" />;
        case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
        case 'warning': return <AlertCircle className="w-4 h-4 text-orange-500" />;
        default: return <Bell className="w-4 h-4 text-blue-500" />;
      }
    };

    return createPortal(
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-end"
          onClick={() => setIsModalOpen(false)}
        >
          {/* Slide-in Panel (Modern Industry Standard) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="bg-background border-l border-border w-full max-w-md h-full shadow-2xl flex flex-col pt-16 sm:pt-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Notifications
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {unreadCount > 0 ? `You have ${unreadCount} unread messages` : 'All caught up!'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-muted"
                onClick={() => setIsModalOpen(false)}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            </div>

            <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-background/50 text-xs">
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-primary font-semibold"
                onClick={markAllAsRead}
              >
                Mark all as read
              </Button>
              <span className="text-muted-foreground">Recent activity</span>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-grow px-2 py-4 space-y-2">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground/30">
                    <Bell className="w-8 h-8" />
                  </div>
                  <p className="text-muted-foreground">No notifications found.</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      !notification.read 
                        ? 'bg-primary/5 border-primary/20 shadow-sm' 
                        : 'bg-card border-border hover:border-border/80 hover:bg-muted/30'
                    }`}
                    onClick={() => toggleExpand(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex-shrink-0">
                        {getIcon(notification.type)}
                      </div>
                      
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`text-sm font-semibold truncate ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notification.title}
                          </h3>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        <p className={`text-xs mt-1 line-clamp-2 ${!notification.read ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                          {notification.message}
                        </p>
                        
                        {/* Expanded details */}
                        <AnimatePresence>
                          {expandedItems[notification.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 mt-3 border-t border-border/50">
                                <p className="text-xs text-muted-foreground italic mb-3">
                                  {new Date(notification.timestamp).toLocaleString()}
                                </p>
                                {notification.sheetType && (
                                  <Button
                                    size="sm"
                                    className="w-full text-xs font-semibold h-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNotificationClick(notification);
                                    }}
                                  >
                                    View Related Sheet
                                    <ChevronRight className="w-3 h-3 ml-2" />
                                  </Button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    {!notification.read && (
                      <div className="absolute top-4 right-2 w-2 h-2 rounded-full bg-primary" />
                    )}
                  </motion.div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Showing {notifications.length} recent alerts
              </span>
              <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={() => setIsModalOpen(false)}>
                Close Panel
              </Button>
            </div>
          </motion.div>
        </div>
      </>,
      document.body
    );
  };

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 15,
          duration: 0.5
        }}
        className="sticky top-0 z-50 w-full border-b border-border glass-effect"
      >
        <div className="w-full px-2 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Adani Logo"
                className="h-6 sm:h-8 w-auto"
                onError={(e) => {
                  // Fallback to text if image doesn't load
                  e.currentTarget.onerror = null
                  e.currentTarget.style.display = 'none'
                  const textElement = document.createElement('span')
                  textElement.className = 'text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent'
                  textElement.textContent = 'Adani'
                  e.currentTarget.parentElement?.appendChild(textElement)
                }}
              />
            </div>
            {projectName && (
              <div className="hidden sm:flex items-center space-x-2 pl-2 sm:pl-4 border-l border-border">
                <span className="text-xs sm:text-sm text-muted-foreground hidden md:inline">Project:</span>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{projectName}</span>
                  {projectP6Id && (
                    <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700 font-mono tracking-tight uppercase shrink-0">
                      ID: {projectP6Id}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-4">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notification Bell */}
            <Button
              variant="ghost"
              size="icon"
              className="relative rounded-full"
              onClick={() => setIsModalOpen(true)}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </Button>

            {/* Issues Bell */}
            {(displayRole === "Site PM" || displayRole === "PMAG") && (
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full"
                onClick={handleOpenIssues}
              >
                <AlertCircle className="w-5 h-5" />
                {newIssuesCount > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-orange-500 rounded-full">
                    {newIssuesCount}
                  </span>
                )}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName}</p>
                      <p className="text-xs leading-none text-muted-foreground">{displayRole}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>

                    {displayRole === "Site PM" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/sitepm", { state: { projectId: projectId, projectName: projectName } })}>
                          <Home className="mr-2 h-4 w-4" />
                          <span>Home</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/supervisor", { state: { projectId: projectId, projectName: projectName } })}>
                          <FileText className="mr-2 h-4 w-4" />
                          <span>Live Sheets</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsIssuesModalOpen(true)}>
                          <Eye className="mr-2 h-4 w-4" />
                          <span>View Issues</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {displayRole === "PMAG" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/pmag", { state: { projectId: projectId, projectName: projectName } })}>
                          <Home className="mr-2 h-4 w-4" />
                          <span>Home</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/pmag", { state: { activeTab: "history" } })}>
                          <BarChart3 className="mr-2 h-4 w-4" />
                          <span>History</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/supervisor", { state: { projectId: projectId, projectName: projectName } })}>
                          <FileText className="mr-2 h-4 w-4" />
                          <span>Live Sheets</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsIssuesModalOpen(true)}>
                          <Eye className="mr-2 h-4 w-4" />
                          <span>View Issues</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {displayRole === "supervisor" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/supervisor", { state: { projectId: projectId, projectName: projectName } })}>
                          <Home className="mr-2 h-4 w-4" />
                          <span>Home</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAddIssue}>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          <span>Add Issue</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {displayRole === "Super Admin" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/superadmin")}>
                          <User className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/superadmin", { state: { openSnapshotFilter: true } })}>
                          <BarChart3 className="mr-2 h-4 w-4" />
                          <span>Snapshot Filter</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {(displayRole === "Super Admin" || displayRole === "PMAG") && (
                      <DropdownMenuItem onClick={() => navigate("/superadmin", { state: { activeTab: "projects" } })}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Manage Projects</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleProjects}>
                      <FolderPlus className="mr-2 h-4 w-4" />
                      <span>Projects</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </motion.div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.nav>

      {/* Notification Modal Portal */}
      <NotificationModal />

      {/* Issues View Modal */}
      <IssuesViewModal
        isOpen={isIssuesModalOpen}
        onClose={() => setIsIssuesModalOpen(false)}
      />
    </>
  )
}