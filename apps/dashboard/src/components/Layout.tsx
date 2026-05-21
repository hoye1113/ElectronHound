import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, ListTodo, Activity, MessageSquare, Settings } from 'lucide-react';

const navItems = [
  { to: '/', labelKey: 'nav.tasks', icon: ListTodo },
  { to: '/monitor', labelKey: 'nav.monitor', icon: Activity },
  { to: '/feedback', labelKey: 'nav.feedback', icon: MessageSquare },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export default function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5">
          <LayoutDashboard className="size-6 text-indigo-400" />
          <span className="text-lg font-bold tracking-tight">EATA</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`
              }
            >
              <Icon className="size-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-4 text-xs text-zinc-500">
          {t('layout.footer')}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
