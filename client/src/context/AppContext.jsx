import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket, setInitData } from '../socket/socketClient';
import api from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [pageParams, setPageParams] = useState({});
  const [initData, setInitDataState] = useState(null);

  const navigate = useCallback((page, params = {}) => {
    setCurrentPage(page);
    setPageParams(params);
    window.scrollTo(0, 0);
  }, []);

  const initTelegram = useCallback(async () => {
    try {
      let tgInitData = '';
      
      // Initialize Telegram WebApp SDK
      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        try {
          tg.ready();
          tg.expand();
          if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
          }
        } catch (e) {
          console.warn('Telegram WebApp ready/expand note:', e.message);
        }
        tgInitData = tg.initData || '';
      }

      // Fallback for regular browser access (visiting directly outside Telegram)
      if (!tgInitData) {
        let guestId = '';
        try {
          guestId = localStorage.getItem('ludo_guest_id');
          if (!guestId) {
            guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('ludo_guest_id', guestId);
          }
        } catch (e) {
          guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
        }
        tgInitData = `browser_guest:${guestId}`;
      }

      setInitDataState(tgInitData);
      api.setInitData(tgInitData);
      setInitData(tgInitData);

      const sock = connectSocket(tgInitData);
      setSocket(sock);

      // Login / fetch user via Telegram initData
      try {
        const data = await api.login();
        setUser(data.user);

        // Deep linking / start parameter routing
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        
        // Extract start parameter from all possible Telegram delivery mechanisms
        const rawStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
                              urlParams.get('startapp') ||
                              urlParams.get('tgWebAppStartParam') ||
                              hashParams.get('tgWebAppStartParam') ||
                              hashParams.get('startapp') ||
                              urlParams.get('matchId') ||
                              urlParams.get('join') || '';

        // Extract path-based route fallback (e.g. /match/:id or /game/:id)
        let pathParam = '';
        const pathname = window.location.pathname || '';
        if (pathname.startsWith('/match/') || pathname.startsWith('/game/')) {
          pathParam = pathname.split('/')[2] || '';
        }

        const targetPage = urlParams.get('page');

        if (targetPage) {
          setCurrentPage(targetPage);
        } else if (rawStartParam || pathParam) {
          const matchIdentifier = String(rawStartParam || pathParam).replace(/^match_/, '').trim();
          if (matchIdentifier) {
            try {
              let matchData = null;
              try {
                const res = await api.getMatch(matchIdentifier);
                matchData = res?.match;
              } catch (e) {
                const res = await api.findByRoomCode(matchIdentifier.toUpperCase());
                matchData = res?.match;
              }

              if (matchData) {
                const isPlayer = Boolean(
                  data.user?.id &&
                  matchData.players &&
                  matchData.players.some(p => p.userId === data.user.id)
                );

                if (matchData.status === 'playing' || matchData.status === 'completed') {
                  setCurrentPage('game');
                  setPageParams({
                    matchId: matchData.id,
                    spectating: !isPlayer
                  });
                } else if (matchData.status === 'waiting') {
                  setCurrentPage('lobby');
                  setPageParams({
                    matchId: matchData.id,
                    spectating: !isPlayer
                  });
                } else {
                  setCurrentPage('home');
                }
              } else {
                // Show proper Match Not Found screen
                setCurrentPage('match-not-found');
                setPageParams({ requestedId: matchIdentifier });
              }
            } catch (navErr) {
              console.warn('Auto match routing note:', navErr.message);
              setCurrentPage('match-not-found');
              setPageParams({ requestedId: matchIdentifier });
            }
          }
        }
      } catch (err) {
        console.error('Login failed:', err);
        setError(err.message);
      }
    } catch (err) {
      console.error('Telegram init failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegram();

    return () => {
      disconnectSocket();
    };
  }, [initTelegram]);

  return (
    <AppContext.Provider value={{
      user,
      setUser,
      loading,
      error,
      socket,
      currentPage,
      pageParams,
      navigate,
      initData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
