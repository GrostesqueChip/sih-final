import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';
import LoadingSpinner from './components/shared/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';

// Eager load critical entry pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

// Lazy load secondary/heavy test & report pages
const InstrumentListPage = lazy(() => import('./pages/instruments/InstrumentListPage'));
const InstrumentFormPage = lazy(() => import('./pages/instruments/InstrumentFormPage'));
const InstrumentDetailPage = lazy(() => import('./pages/instruments/InstrumentDetailPage'));
const TestSessionListPage = lazy(() => import('./pages/tests/TestSessionListPage'));
const NewTestSessionPage = lazy(() => import('./pages/tests/NewTestSessionPage'));
const TestSessionDetailPage = lazy(() => import('./pages/tests/TestSessionDetailPage'));
const TestDataEntryPage = lazy(() => import('./pages/tests/TestDataEntryPage'));
const ReportsHubPage = lazy(() => import('./pages/reports/ReportsHubPage'));
const ReportPage = lazy(() => import('./pages/reports/ReportPage'));
const UserManagementPage = lazy(() => import('./pages/users/UserManagementPage'));
const AuditLogPage = lazy(() => import('./pages/audit/AuditLogPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PublicVerificationPage = lazy(() => import('./pages/public/PublicVerificationPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center p-12 min-h-[300px]">
    <LoadingSpinner message="Loading…" size="lg" />
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<PublicVerificationPage />} />
          <Route path="/verify/:certificateNo" element={<PublicVerificationPage />} />

          {/* Protected App Routes inside AppLayout */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Instruments */}
            <Route path="/instruments" element={<InstrumentListPage />} />
            <Route
              path="/instruments/new"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'INSPECTOR']}>
                  <InstrumentFormPage />
                </ProtectedRoute>
              }
            />
            <Route path="/instruments/:id" element={<InstrumentDetailPage />} />
            <Route
              path="/instruments/:id/edit"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'INSPECTOR']}>
                  <InstrumentFormPage />
                </ProtectedRoute>
              }
            />

            {/* Test Sessions */}
            <Route path="/tests" element={<TestSessionListPage />} />
            <Route
              path="/tests/new"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'INSPECTOR']}>
                  <NewTestSessionPage />
                </ProtectedRoute>
              }
            />
            <Route path="/tests/:id" element={<TestSessionDetailPage />} />
            <Route
              path="/tests/:id/:testType"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'INSPECTOR']}>
                  <TestDataEntryPage />
                </ProtectedRoute>
              }
            />

            {/* Reports */}
            <Route path="/reports" element={<ReportsHubPage />} />
            <Route path="/reports/:sessionId" element={<ReportPage />} />

            {/* Admin & Inspector Management */}
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'INSPECTOR', 'VIEWER']}>
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
