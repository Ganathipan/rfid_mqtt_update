import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function ClusterDisplay() {
  const { clusterLabel } = useParams();
  const [lastTap, setLastTap] = useState(null);
  const [cardResult, setCardResult] = useState(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [sseDown, setSseDown] = useState(false);
  const timerRef = useRef(null);
  const sseDownTimer = useRef(null);

  // Subscribe to SSE for this cluster
  useEffect(() => {
    setLastTap(null);
    setCardResult(null);
    setPopupVisible(false);
    setSseDown(false);

    const url = `/api/kiosk/cluster/${encodeURIComponent(clusterLabel)}/stream`;
    const es = new EventSource(url);

    const markDownSoon = () => {
      if (sseDownTimer.current) clearTimeout(sseDownTimer.current);
      sseDownTimer.current = setTimeout(() => setSseDown(true), 3000); // show badge if >3s down
    };

    es.addEventListener('hello', () => {
      setSseDown(false);
      if (sseDownTimer.current) { clearTimeout(sseDownTimer.current); sseDownTimer.current = null; }
    });

    es.addEventListener('tap', (evt) => {
      setSseDown(false);
      if (sseDownTimer.current) { clearTimeout(sseDownTimer.current); sseDownTimer.current = null; }
      try { setLastTap(JSON.parse(evt.data)); } catch {}
    });

    es.onerror = () => {
      markDownSoon();
      // EventSource auto-reconnects; we just surface a badge after 3s
    };

    return () => {
      es.close();
      if (sseDownTimer.current) clearTimeout(sseDownTimer.current);
    };
  }, [clusterLabel]);

  // On new tap -> fetch eligibility -> show popup for 4s
  useEffect(() => {
    if (!lastTap?.rfid_card_id) return;

    const rfid = encodeURIComponent(lastTap.rfid_card_id);
    fetch(`/api/kiosk/eligibility/by-card/${rfid}`)
      .then(r => r.json())
      .then((data) => {
        setCardResult(data);
        setPopupVisible(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setPopupVisible(false), 4000);
      })
      .catch(() => {
        setCardResult({ error: true });
        setPopupVisible(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setPopupVisible(false), 4000);
      });

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [lastTap?.rfid_card_id]);

  const eligible = cardResult?.eligible === true;
  const statusText = eligible
    ? '✅ Eligible to play!'
    : '❌ Not yet eligible. Try visiting other CLusters to earn the points';

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Fullscreen background video */}
      <video
        src="/kiosk-bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'brightness(0.6) saturate(0.9)',
          zIndex: 0
        }}
      />

      {/* Foreground content layer */}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#f8fafc' }}>
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <Link to="/kiosk" style={{ color: '#cbd5e1', textDecoration: 'none', background: 'rgba(0,0,0,0.35)', padding: '6px 10px', borderRadius: 8 }}>
            ← All Clusters
          </Link>
        </div>

        {/* SSE status badge */}
        {sseDown && (
          <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(127,29,29,0.7)', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
            reconnecting…
          </div>
        )}

        {/* Idle hint */}
        {!popupVisible && !cardResult && (
          <div style={{
            textAlign: 'center',
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: 24
          }}>
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>{clusterLabel} — ready</h1>
            <div style={{ opacity: 0.85 }}>Tap your card at this reader to check eligibility.</div>
          </div>
        )}

        {/* Popup card */}
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            transform: popupVisible ? 'scale(1)' : 'scale(0.98)',
            opacity: popupVisible ? 1 : 0,
            transition: 'opacity 220ms ease, transform 220ms ease',
            pointerEvents: 'auto',
            background: eligible ? 'rgba(6,78,59,0.92)' : 'rgba(127,29,29,0.92)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: 32,
            maxWidth: 900,
            width: 'min(92vw, 900px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 12 }}>
              {statusText}
            </div>

            {cardResult?.unknown && (
              <div>Unknown card · RFID: {cardResult.rfid_card_id}</div>
            )}

            {!cardResult?.unknown && cardResult && (
              <>
                <div style={{ fontSize: 18, opacity: 0.95 }}>
                  Team #{cardResult.registration_id} · Group {cardResult.group_size} · Score {cardResult.score}
                </div>
                {(cardResult.latest_label || cardResult.last_seen_at) && (
                  <div style={{ fontSize: 16, opacity: 0.8, marginTop: 8 }}>
                    Last: {cardResult.latest_label || '-'} · {cardResult.last_seen_at ? new Date(cardResult.last_seen_at).toLocaleString() : ''}
                  </div>
                )}
                <div style={{ fontSize: 14, opacity: 0.75, marginTop: 12 }}>
                  Thresholds — Group {cardResult.minGroupSize}–{cardResult.maxGroupSize}, Min points {cardResult.minPointsRequired}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
