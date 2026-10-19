import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Track from './pages/Track.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shipments from './pages/Shipments.jsx';
import ShipmentDetail from './pages/ShipmentDetail.jsx';
import Exceptions from './pages/Exceptions.jsx';
import ExceptionDetail from './pages/ExceptionDetail.jsx';
import Users from './pages/Users.jsx';
import AuditLogs from './pages/AuditLogs.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/track" element={<Track />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/shipments/:id" element={<ShipmentDetail />} />
        <Route path="/exceptions" element={<Exceptions />} />
        <Route path="/exceptions/:id" element={<ExceptionDetail />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit" element={<AuditLogs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
