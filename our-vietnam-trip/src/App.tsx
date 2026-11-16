import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Banners } from './components/Banners';
import { Overview } from './pages/Overview';
import { DayPage, DayRedirect } from './pages/DayPage';
import { MapPage } from './pages/MapPage';
import { Reservations } from './pages/Reservations';
import { OfflineProvider } from './state/offline';
import { PrivateProvider } from './state/privateData';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!pathname.startsWith('/day/')) window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <OfflineProvider>
        <PrivateProvider>
          <ScrollTop />
          <Banners />
          <main className="mx-auto min-h-dvh max-w-xl pb-[calc(76px+env(safe-area-inset-bottom))]">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/day" element={<DayRedirect />} />
              <Route path="/day/:date" element={<DayPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/reservations" element={<Reservations />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <BottomNav />
        </PrivateProvider>
      </OfflineProvider>
    </BrowserRouter>
  );
}
