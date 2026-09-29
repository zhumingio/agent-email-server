import { useEffect } from 'react';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import * as api from './api';
import { useApp } from './store';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './Login';
import MainLayout from './layout/MainLayout';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const authed = useApp((s) => s.authed);
  const checkingAuth = useApp((s) => s.checkingAuth);
  const setAuthed = useApp((s) => s.setAuthed);
  const refreshAccounts = useApp((s) => s.refreshAccounts);

  useEffect(() => {
    api.me()
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false))
      .finally(() => useApp.setState({ checkingAuth: false }));
  }, [setAuthed]);

  useEffect(() => {
    if (authed) refreshAccounts();
  }, [authed, refreshAccounts]);

  if (checkingAuth) {
    return (
      <div className="center-page">
        <Spin size="large" tip="加载中…" />
      </div>
    );
  }

  if (!authed) return <Login />;

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<MainLayout />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
