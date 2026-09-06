import { MapView } from '@/components/MapView';
import { RiverChart } from '@/components/RiverChart';
import { Sidebar } from '@/components/Sidebar';
import { useTelemetry } from '@/useTelemetry';

function App() {
  const { nodes, links, levelHistory, logs, connected, source } = useTelemetry();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ash-950 text-ash-100">
      {/* Left sidebar ~25% */}
      <aside className="h-full w-[25%] min-w-[280px] max-w-[380px] shrink-0 border-r border-ash-700/60 bg-ash-900/60">
        <Sidebar nodes={nodes} logs={logs} connected={connected} source={source} />
      </aside>

      {/* Right column — maximise map + chart space */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top right — map (maximised) */}
        <section className="relative h-[62%] min-h-0 border-b border-ash-700/60">
          <MapView nodes={nodes} links={links} />
        </section>

        {/* Bottom right — chart (maximised) */}
        <section className="h-[38%] min-h-0 bg-ash-900/40">
          <RiverChart live={levelHistory} />
        </section>
      </main>
    </div>
  );
}

export default App;
