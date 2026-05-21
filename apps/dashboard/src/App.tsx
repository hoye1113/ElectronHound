import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import LiveMonitor from './pages/LiveMonitor';
import FeedbackLoop from './pages/FeedbackLoop';
import FewShotPage from './pages/FewShotPage';
import SettingsPage from './pages/Settings';
import './i18n/config';
import NotFound from './pages/NotFound';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TaskList />} />
          <Route path="/task/:id" element={<TaskDetail />} />
          <Route path="/monitor/:id" element={<LiveMonitor />} />
          <Route path="/monitor" element={<LiveMonitor />} />
          <Route path="/feedback" element={<FeedbackLoop />} />
          <Route path="/few-shot" element={<FewShotPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

