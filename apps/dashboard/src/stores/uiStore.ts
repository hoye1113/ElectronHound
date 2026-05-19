import { create } from 'zustand';

interface UIStore {
  currentPage: 'tasks' | 'monitor' | 'detail' | 'feedback';
  selectedTaskId: string | null;
  sidebarOpen: boolean;
  navigate: (page: UIStore['currentPage'], taskId?: string) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentPage: 'tasks',
  selectedTaskId: null,
  sidebarOpen: true,
  navigate: (page, taskId) => set({ currentPage: page, selectedTaskId: taskId ?? null }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
