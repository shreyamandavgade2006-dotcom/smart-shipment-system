import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import StatusStepper from '../components/Stepper.jsx';
import TimelineFeed from '../components/TimelineFeed.jsx';
import { StatusBadge } from '../components/Badge.jsx';
import { fmtDateTime, SOURCE_LABELS, timeAgo } from '../utils/format.js';
import { IconTruck, IconSearch, IconAlert, IconPin } from '../components/Icons.jsx';

// PUBLIC page — no auth token required; uses a bare axios call so the 401
// interceptor never redirects customers.
export default function Track() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    const tid = id.trim();
    if (!tid) {
      setError('Please enter a tracking ID, e.g. SHP-MH109I');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/track/${encodeURIComponent(tid)}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Tracking lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="track-wrap">
      <div className="track-hero">
        <div className="brand-badge" style={{ margin: '0 auto', width: 52, height: 52, borderRadius: 15 }}><IconTruck size={27} /></div>
        <h1>Track your shipment</h1>
        <p>Enter your SmartShip tracking ID for live status and delivery timeline.</p>
      </div>
      <div className="track-card">
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <form className="track-search" onSubmit={search}>
            <div className="search-box" style={{ flex: 1 }}>
              <IconSearch size={16} />
              <input
                className="input"
                style={{ paddingTop: 11, paddingBottom: 11 }}
                placeholder="Tracking ID — e.g. SHP-MH109I"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ padding: '11px 22px' }}>
              {loading ? 'Locating…' : 'Track'}
            </button>
          </form>
          {error && <div className="error-banner" style={{ marginTop: 13, marginBottom: 0 }}><IconAlert size={15} style={{ flexShrink: 0 }} /> {error}</div>}
        </div>

        {result && (
          <div className="card card-pad">
            <div className="flex wrap" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{result.trackingId}</div>
                <div className="text-sm text-muted" style={{ marginTop: 3 }}>
                  {result.origin} → {result.destination}
                  {result.currentLocation ? ` · Last seen: ${result.currentLocation}` : ''}
                </div>
              </div>
              <StatusBadge status={result.status} />
            </div>
            <div className="divider" />
            <StatusStepper status={result.status} expectedDeliveryDate={result.expectedDeliveryDate} />
            <div className="kv-grid" style={{ marginTop: 16 }}>
              <div className="kv"><div className="k">Expected delivery</div><div className="v">{fmtDateTime(result.expectedDeliveryDate)}</div></div>
              <div className="kv"><div className="k"><IconPin size={11} style={{ verticalAlign: '-1px' }} /> Current location</div><div className="v">{result.currentLocation || result.origin}</div></div>
              <div className="kv"><div className="k">Carrier</div><div className="v">{result.carrier?.name || 'SmartShip Fleet'}</div></div>
              <div className="kv">
                <div className="k">Tracking source</div>
                <div className="v">{SOURCE_LABELS[result.trackingSource] || 'Manual update'}</div>
                <div className="text-sm text-muted">Last updated {timeAgo(result.lastLocationUpdateAt)}</div>
              </div>
            </div>
            <div className="divider" />
            <h4 className="card-title" style={{ marginBottom: 14 }}>Tracking history</h4>
            <TimelineFeed events={result.timeline} />
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#a5b4cd', fontSize: 13, marginTop: 22 }}>
          Operations staff? <Link to="/login" style={{ color: '#a5b4fc', fontWeight: 700 }}>Sign in to the console</Link>
        </p>
      </div>
    </div>
  );
}
