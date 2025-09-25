import { useEffect, useState } from 'react';
import { api } from '../api';
import { Card } from '../ui/Card';
import Button from '../ui/Button';
import Loader from '../ui/Loader';
import Toast from '../ui/Toast';

export default function ExitOutPage() {
  const [stack, setStack] = useState([]);
  const [stats, setStats] = useState({ totalTeams: 0, totalCards: 0 });
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch stack data
  const fetchStack = async () => {
    try {
      const response = await api('/exitout/stack');
      if (response.success) {
        setStack(response.stack || []);
        setStats(response.stats || { totalTeams: 0, totalCards: 0 });
      } else {
        console.error('Failed to fetch stack:', response.error);
        showToast('Failed to fetch stack data', 'error');
      }
    } catch (error) {
      console.error('Error fetching stack:', error);
      showToast('Error connecting to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Release all cards for a specific team
  const releaseTeam = async (registrationId) => {
    setReleasing(prev => new Set([...prev, registrationId]));
    
    try {
      const response = await api(`/exitout/release/${registrationId}`, { method: 'POST' });
      
      if (response.success) {
        showToast(
          `Successfully released ${response.result.released} cards for team ${registrationId}`,
          'success'
        );
        // Refresh stack after successful release
        await fetchStack();
      } else {
        console.error('Failed to release team:', response.error);
        showToast(`Failed to release team ${registrationId}: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Error releasing team:', error);
      showToast(`Error releasing team ${registrationId}`, 'error');
    } finally {
      setReleasing(prev => {
        const newSet = new Set(prev);
        newSet.delete(registrationId);
        return newSet;
      });
    }
  };

  // Clear entire stack (admin operation)
  const clearStack = async () => {
    if (!window.confirm('Are you sure you want to clear the entire stack? This will remove all stacked cards without processing them!')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await api('/exitout/clear', { method: 'POST' });
      
      if (response.success) {
        showToast('Stack cleared successfully', 'success');
        await fetchStack();
      } else {
        showToast(`Failed to clear stack: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Error clearing stack:', error);
      showToast('Error clearing stack', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchStack();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStack, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading && stack.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center text-white">
        <Loader />
        <span className="ml-4">Loading ExitOut Stack...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-4">ExitOut Stack Management</h1>
        
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.totalTeams}</div>
            <div className="text-sm text-white/70">Teams with Stacked Cards</div>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-green-400">{stats.totalCards}</div>
            <div className="text-sm text-white/70">Total Stacked Cards</div>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-purple-400">
              {stats.totalCards > 0 ? (stats.totalCards / stats.totalTeams).toFixed(1) : '0'}
            </div>
            <div className="text-sm text-white/70">Average Cards per Team</div>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-white">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <div className="flex gap-2">
            <Button
              onClick={fetchStack}
              disabled={loading}
              variant="outline"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              onClick={clearStack}
              disabled={loading || stats.totalCards === 0}
              variant="dark"
            >
              Clear All Stack
            </Button>
          </div>
        </div>
      </div>

      {/* Stack Content */}
      {stack.length === 0 ? (
        <Card className="text-center py-12">
          <div className="text-white/70">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold mb-2 text-white">No Cards in ExitOut Stack</h3>
            <p>All teams have been processed or no exitout taps have occurred.</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4">
            <h2 className="text-xl font-semibold text-white mb-4">Teams in Stack</h2>
            <div className="space-y-4">
              {stack.map((item) => (
                <div key={item.registrationId} className="border border-white/10 rounded p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-mono text-lg">{item.registrationId}</div>
                      <div className="text-white/70 text-sm">{item.cardCount} cards stacked</div>
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1">
                          {item.cards.slice(0, 3).map((cardId) => (
                            <span
                              key={cardId}
                              className="inline-block bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded font-mono"
                            >
                              {cardId}
                            </span>
                          ))}
                          {item.cards.length > 3 && (
                            <span className="inline-block bg-white/10 text-white/60 text-xs px-2 py-1 rounded">
                              +{item.cards.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => releaseTeam(item.registrationId)}
                      disabled={releasing.has(item.registrationId)}
                      variant="primary"
                    >
                      {releasing.has(item.registrationId) ? 'Releasing...' : 'Release All'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          text={toast.message}
          show={!!toast}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}