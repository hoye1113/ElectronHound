import { useParams } from 'react-router-dom';

export default function LiveMonitor() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-zinc-100">Live Monitor</h1>
      <p className="text-sm text-zinc-500">
        Monitoring task: <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-300">{id}</code>
      </p>
      <p className="text-sm text-zinc-600">Coming Soon</p>
    </div>
  );
}
