import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import { api } from './api';
import PortalSelection from './pages/PortalSelection';
import RegistrationFlow from './pages/RegistrationFlow';
import TagAssignment from './pages/TagAssignment';
import AdminPortal from './pages/AdminPortal';
import GameLiteAdmin from './pages/admin/GameLiteAdmin';
import ClusterDirectory from './pages/kiosk/ClusterDirectory';
import ClusterDisplay from './pages/kiosk/ClusterDisplay';
import ExitOutPage from './pages/ExitOutPage';
import AppShell from './layouts/AppShell.jsx';


export default function App() {
  const [health, setHealth] = useState('checking…');
  const [currentView, setCurrentView] = useState('portal-selection');
  const [selectedPortal, setSelectedPortal] = useState(localStorage.getItem('portal') || '');
  const [registrationData, setRegistrationData] = useState(null);
  const [showPortalSelection, setShowPortalSelection] = useState(true);

  // --- handlers ---
  const handlePortalSelect = (portal) => {
    setSelectedPortal(portal);
    localStorage.setItem('portal', portal);
    setShowPortalSelection(false);
    setCurrentView('registration');
  };

  const handleRegistrationComplete = (data) => {
    setRegistrationData(data);
    setCurrentView('tag-assignment');
  };

  // Dedicated handler to redirect to registration portal after tag assignment
  const handleTagAssignmentComplete = () => {
    setRegistrationData(null);
    setCurrentView('registration');
  };

  const handleBackToPortalSelection = () => {
    setSelectedPortal('');
    setRegistrationData(null);
    setShowPortalSelection(true);
    setCurrentView('portal-selection');
  };

  async function refreshHealth() {
    try {
      const d = await api('/health');
      setHealth(d.status || 'ok');
    } catch (err) {
      setHealth('error');
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'portal-selection':
        return <PortalSelection onPortalSelect={handlePortalSelect} />;
      case 'registration':
        return (
          <RegistrationFlow
            selectedPortal={selectedPortal}
            onRegistrationComplete={handleRegistrationComplete}
            onBack={handleBackToPortalSelection}
          />
        );
      case 'tag-assignment':
        return (
          <TagAssignment
            registrationData={registrationData}
            selectedPortal={selectedPortal}
            onComplete={handleTagAssignmentComplete}
            onBack={handleBackToPortalSelection}
          />
        );
      case 'admin':
        return <AdminDashboard onBack={handleBackToPortalSelection} />;
      default:
        return <PortalSelection onPortalSelect={handlePortalSelect} />;
    }
  };

  function RootFlow() {
    return (
      <>
        <header className="mb-4">
          <h1 className="text-xl font-semibold">RFID Registration System</h1>
          <div className="pill">
            <span className="small">Health: {health}</span>
          </div>
        </header>
        <section className="card">{renderCurrentView()}</section>
        <footer className="mt-6 opacity-80 text-sm">
          Frontend <span className="mono">{import.meta.env.VITE_API_BASE}</span>
        </footer>
      </>
    );
  }

  // If we’re using Router, expose GameLiteAdmin at /admin/game-lite and AdminPortal at /admin
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<RootFlow />} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/admin/game-lite" element={<GameLiteAdmin />} />
          <Route path="/admin/exitout" element={<ExitOutPage />} />
          <Route path="/kiosk" element={<ClusterDirectory />} />
          <Route path="/kiosk/cluster/:clusterLabel" element={<ClusterDisplay />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
