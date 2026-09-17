import { useState } from 'react';
import { NearbyView } from '../../../components/discover/NearbyView';
import { EventsView } from '../../../components/discover/EventsView';
import { DiscoverSwitch, type DiscoverMode } from '../../../components/discover/DiscoverSwitch';

// Selection persists for the session (module scope survives the screen unmounting when the
// user navigates into an event and back), and resets to Nearby on cold start.
let sessionMode: DiscoverMode = 'nearby';

export default function Discover() {
  const [mode, setMode] = useState<DiscoverMode>(sessionMode);

  function change(next: DiscoverMode) {
    sessionMode = next;
    setMode(next);
  }

  const control = <DiscoverSwitch value={mode} onChange={change} />;
  return mode === 'nearby' ? <NearbyView control={control} /> : <EventsView control={control} />;
}
