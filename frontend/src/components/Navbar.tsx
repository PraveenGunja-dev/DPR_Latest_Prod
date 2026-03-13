import { motion } from "framer-motion"
import { Building2, User, LogOut, Users, FolderPlus, BarChart3, UserPlus, AlertCircle, Bell, Eye } from "lucide-react"
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
import { ChevronDown, ChevronRight, Circle } from "lucide-react"
import { IssuesViewModal } from "@/components/IssuesViewModal"

interface NavbarProps {
  userName?: string
  userRole?: string
  projectName?: string
  onAddUser?: () => void
  onAddProject?: () => void
  onAssignProject?: () => void
  onAddIssue?: () => void
}

export const Navbar = ({ userName, userRole, projectName, onAddUser, onAddProject, onAssignProject, onAddIssue }: NavbarProps) => {
  // Note: User creation is role-based:
  // - PMAG can create Site PM and PMAG users
  // - Site PM can only create supervisors
  // - Supervisors cannot create users
  const navigate = useNavigate()
  const { logout, user, refreshUserProfile } = useAuth()
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotification()

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

  // Use the user data from context if available, otherwise use props
  const displayName = user?.Name || userName || "User"
  const displayRole = user?.Role || userRole || "Role"

  // Poll for issue stats for relevant roles
  useEffect(() => {
    if (displayRole === "Site PM" || displayRole === "PMAG") {
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

    return createPortal(
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          {/* Modal Container */}
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-border"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}>
                    Mark all as read
                  </Button>
                )}
                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setIsModalOpen(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Button>
              </div>
            </div>

            {/* Notifications List - Fixed height with scroll */}
            <div className="overflow-y-auto flex-grow" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No notifications
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 ${!notification.read ? 'bg-muted/50' : ''}`}
                    >
                      {/* Notification Item Header */}
                      <div
                        className="flex items-start gap-3 cursor-pointer"
                        onClick={() => toggleExpand(notification.id)}
                      >
                        {/* Read/Unread Indicator */}
                        <div className="mt-1">
                          {notification.read ? (
                            <Circle className="w-2 h-2 fill-current text-muted" />
                          ) : (
                            <Circle className="w-2 h-2 fill-current text-blue-500" />
                          )}
                        </div>

                        {/* Type Icon - using Bell as default, could be customized based on type */}
                        <div className="mt-0.5">
                          <Bell className="w-4 h-4 text-muted-foreground" />
                        </div>

                        {/* Content */}
                        <div className="flex-grow">
                          <div className="flex items-start justify-between">
                            <div className="font-medium">{notification.title}</div>
                            <div className="flex items-center gap-2">
                              {/* Status Tag - simplified for now */}
                              <span className="text-xs px-2 py-1 bg-muted rounded-full">
                                {notification.type}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {notification.message}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(notification.timestamp).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Expand/Collapse Arrow */}
                        <div className="self-center">
                          {expandedItems[notification.id] ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {expandedItems[notification.id] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-10 pr-5 pt-3 pb-2 border-t border-border mt-3">
                            <div className="font-medium mb-2">Remarks</div>
                            <div className="text-sm mb-3">{notification.message}</div>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notification);
                              }}
                            >
                              Go to DP IDT
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border text-center text-sm text-muted-foreground flex-shrink-0">
              {notifications.length > 0
                ? `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`
                : 'No notifications'}
            </div>
          </div>
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
                <span className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{projectName}</span>
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

                        <DropdownMenuItem onClick={() => setIsIssuesModalOpen(true)}>
                          <Eye className="mr-2 h-4 w-4" />
                          <span>View Issues</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {displayRole === "PMAG" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/pmag", { state: { activeTab: "history" } })}>
                          <BarChart3 className="mr-2 h-4 w-4" />
                          <span>History</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsIssuesModalOpen(true)}>
                          <Eye className="mr-2 h-4 w-4" />
                          <span>View Issues</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {displayRole === "supervisor" && (
                      <DropdownMenuItem onClick={handleAddIssue}>
                        <AlertCircle className="mr-2 h-4 w-4" />
                        <span>Add Issue</span>
                      </DropdownMenuItem>
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