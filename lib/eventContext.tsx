// Which event the user is currently inside, if any. The event screen registers itself while
// focused; the tab bar reads it to decide whether the Connections tab should raise the event's
// connections sheet (in an event) or switch to the global Connections screen (anywhere else).
import { createContext, useContext, useState, type ReactNode } from 'react';

export type ActiveEvent = { id: string; name: string | null };

const EventContext = createContext<{
  activeEvent: ActiveEvent | null;
  setActiveEvent: (event: ActiveEvent | null) => void;
}>({ activeEvent: null, setActiveEvent: () => {} });

export function ActiveEventProvider({ children }: { children: ReactNode }) {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  return <EventContext.Provider value={{ activeEvent, setActiveEvent }}>{children}</EventContext.Provider>;
}

export function useActiveEvent() {
  return useContext(EventContext);
}
