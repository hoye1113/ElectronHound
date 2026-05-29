import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import './i18n/config';

const TaskList = React.lazy(() => import('./pages/TaskList'));
const TaskDetail = React.lazy(() => import('./pages/TaskDetail'));
const LiveMonitor = React.lazy(() => import('./pages/LiveMonitor'));
const FeedbackLoop = React.lazy(() => import('./pages/FeedbackLoop'));
const SettingsPage = React.lazy(() => import('./pages/Settings'));
const Templates = React.lazy(() => import('./pages/Templates'));
const SystemHealth = React.lazy(() => import('./pages/SystemHealth'));
const BatchList = React.lazy(() => import('./pages/BatchList'));
const CompareView = React.lazy(() => import('./pages/CompareView'));
const ReportTemplates = React.lazy(() => import('./pages/ReportTemplates'));
const ScheduleList = React.lazy(() => import('./pages/ScheduleList'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const NotFound = React.lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<TaskList />} />
              <Route path="/task/:id" element={<TaskDetail />} />
              <Route path="/monitor/:id" element={<LiveMonitor />} />
              <Route path="/monitor" element={<LiveMonitor />} />
              <Route path="/feedback" element={<FeedbackLoop />} />
              <Route path="/batches" element={<BatchList />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/health" element={<SystemHealth />} />
              <Route path="/compare" element={<CompareView />} />
              <Route path="/report-templates" element={<ReportTemplates />} />
              <Route path="/schedules" element={<ScheduleList />} />
              <Route path="/notifications" element={<NotificationSettings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

