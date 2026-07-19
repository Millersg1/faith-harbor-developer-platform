import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import AuthGate, {
  useAuth,
} from "./components/AuthGate";
import AccountingPage from "./pages/AccountingPage";
import AIWorkspacePage from "./pages/AIWorkspacePage";
import ClientsPage from "./pages/ClientsPage";
import CommunicationsPage from "./pages/CommunicationsPage";
import DashboardPage from "./pages/DashboardPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import EngineeringPage from "./pages/EngineeringPage";
import HostingPage from "./pages/HostingPage";
import MarketingPage from "./pages/MarketingPage";
import MinistryPage from "./pages/MinistryPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProposalsPage from "./pages/ProposalsPage";
import PublishingPage from "./pages/PublishingPage";
import ReportsPage from "./pages/ReportsPage";
import SalesPage from "./pages/SalesPage";
import SettingsPage from "./pages/SettingsPage";
import SupportPage from "./pages/SupportPage";

type NavigationItem = {
  label: string;
  path: string;
  eyebrow: string;
};

type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Command",
    items: [
      {
        label: "Command Center",
        path: "/dashboard",
        eyebrow: "Faith Harbor OS",
      },
      {
        label: "Departments",
        path: "/departments",
        eyebrow: "Faith Harbor LLC",
      },
    ],
  },
  {
    label: "Client Services",
    items: [
      {
        label: "Sales",
        path: "/sales",
        eyebrow: "Sales Pipeline",
      },
      {
        label: "Clients",
        path: "/clients",
        eyebrow: "Client Services",
      },
      {
        label: "Proposals",
        path: "/proposals",
        eyebrow: "Client Services",
      },
      {
        label: "Projects",
        path: "/projects",
        eyebrow: "Client Services",
      },
      {
        label: "Support",
        path: "/support",
        eyebrow: "Client Services",
      },
      {
        label: "Communications",
        path: "/communications",
        eyebrow: "Communications",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Accounting",
        path: "/accounting",
        eyebrow: "Accounting",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Hosting",
        path: "/hosting",
        eyebrow: "Hosting Operations",
      },
      {
        label: "Engineering",
        path: "/engineering",
        eyebrow: "Engineering",
      },
    ],
  },
  {
    label: "Publishing",
    items: [
      {
        label: "Books",
        path: "/publishing",
        eyebrow: "Faith Harbor Publishing",
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        label: "Campaigns",
        path: "/marketing",
        eyebrow: "Marketing & Social",
      },
    ],
  },
  {
    label: "Ministry",
    items: [
      {
        label: "Programs",
        path: "/ministry",
        eyebrow: "Faith Harbor Ministry",
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        label: "AI Workspace",
        path: "/ai-console",
        eyebrow: "Faith Harbor Intelligence",
      },
      {
        label: "Reports",
        path: "/reports",
        eyebrow: "Business Intelligence",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Settings",
        path: "/settings",
        eyebrow: "System Administration",
      },
    ],
  },
];

const navigationItems =
  navigationGroups.flatMap(
    (group) => group.items,
  );

function App() {
  return (
    <AuthGate>
      <div className="app-shell">
        <Sidebar />

      <div className="application">
        <Topbar />

        <main className="workspace-container">
          <Routes>
            <Route
              path="/"
              element={
                <Navigate
                  to="/dashboard"
                  replace
                />
              }
            />

            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />

            <Route
              path="/departments"
              element={<DepartmentsPage />}
            />

            <Route
              path="/sales"
              element={<SalesPage />}
            />

            <Route
              path="/clients"
              element={<ClientsPage />}
            />

            <Route
              path="/proposals"
              element={<ProposalsPage />}
            />

            <Route
              path="/projects"
              element={<ProjectsPage />}
            />

            <Route
              path="/accounting"
              element={<AccountingPage />}
            />

            <Route
              path="/support"
              element={<SupportPage />}
            />

            <Route
              path="/communications"
              element={<CommunicationsPage />}
            />

            <Route
              path="/hosting"
              element={<HostingPage />}
            />

            <Route
              path="/engineering"
              element={<EngineeringPage />}
            />

            <Route
              path="/publishing"
              element={<PublishingPage />}
            />

            <Route
              path="/marketing"
              element={<MarketingPage />}
            />

            <Route
              path="/ministry"
              element={<MinistryPage />}
            />

            <Route
              path="/ai-console"
              element={<AIWorkspacePage />}
            />

            <Route
              path="/reports"
              element={<ReportsPage />}
            />

            <Route
              path="/settings"
              element={<SettingsPage />}
            />

            <Route
              path="*"
              element={
                <Navigate
                  to="/dashboard"
                  replace
                />
              }
            />
          </Routes>
        </main>

        <StatusBar />
      </div>
      </div>
    </AuthGate>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <p className="eyebrow">
          Faith Harbor LLC
        </p>

        <h1>Faith Harbor OS</h1>

        <p className="brand-mission">
          Technology is our tool.
          <br />
          People are our purpose.
          <br />
          Christ is our foundation.
        </p>
      </div>

      <nav
        className="navigation"
        aria-label="Faith Harbor OS navigation"
      >
        {navigationGroups.map(
          (group) => (
            <section
              className="navigation-group"
              key={group.label}
              aria-labelledby={`navigation-${group.label
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
              <h2
                className="navigation-group-label"
                id={`navigation-${group.label
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {group.label}
              </h2>

              <div className="navigation-group-links">
                {group.items.map(
                  (item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({
                        isActive,
                      }) =>
                        isActive
                          ? "nav-button active"
                          : "nav-button"
                      }
                    >
                      {item.label}
                    </NavLink>
                  ),
                )}
              </div>
            </section>
          ),
        )}
      </nav>

      <div className="sidebar-footer">
        <span
          className="connection-dot"
          aria-hidden="true"
        />

        <span>
          Faith Harbor OS Online
        </span>
      </div>

      <SidebarSession />
    </aside>
  );
}

function SidebarSession() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="sidebar-session">
      <span className="sidebar-session-email">
        {user.email}
      </span>

      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          void logout()
        }
      >
        Sign Out
      </button>
    </div>
  );
}

function Topbar() {
  const location = useLocation();

  const currentItem =
    navigationItems.find(
      (item) =>
        item.path ===
        location.pathname,
    ) ?? navigationItems[0];

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">
          {currentItem.eyebrow}
        </p>

        <h2>{currentItem.label}</h2>
      </div>

      <div className="user-summary">
        <span>
          Pastor Shawn Miller
        </span>

        <span className="user-role">
          Founder and Director
        </span>
      </div>
    </header>
  );
}

function StatusBar() {
  return (
    <footer className="statusbar">
      <span>
        Backend Connected
      </span>

      <span>
        React Frontend
      </span>

      <span>
        SQLite Storage
      </span>

      <span>
        Human Approval Required
      </span>
    </footer>
  );
}

export default App;