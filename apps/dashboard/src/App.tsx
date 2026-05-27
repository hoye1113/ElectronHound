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
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

