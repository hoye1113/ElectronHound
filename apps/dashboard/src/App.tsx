import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import LiveMonitor from './pages/LiveMonitor';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TaskList />} />
          <Route path="/task/:id" element={<TaskDetail />} />
          <Route path="/monitor/:id" element={<LiveMonitor />} />
          <Route path="/monitor" element={<LiveMonitor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
