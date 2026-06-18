import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabase';
import { calculateTaxiPrice } from '../lib/priceCalculator';
import { searchAddress, isInServiceArea, isSuburbArea } from '../lib/geocode';
import { getLanguage } from '../lib/i18n';
import Header from '../components/Header';

const MapComponent = dynamic(() => import('../components/Map'), { ssr: false });
const DEFAULT_CENTER = { lat: 52.48945, lng: 78.16120 };
const CASH_TEMPLATES = [500, 1000, 2000, 5000, 10000];

export default function Home() {
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [fromAddr, setFromAddr] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [fromCoords, setFromCoords] = useState(DEFAULT_CENTER);
  const [toCoords, setToCoords] = useState(null);
  const [routeGeojson, setRouteGeojson] = useState(null);
  const [price, setPrice] = useState(0);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tariff, setTariff] = useState('economy');
  const [payment, setPayment] = useState('cash');
  const [cashAmount, setCashAmount] = useState(500);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchType, setSearchType] = useState('to');
  const [loading, setLoading] = useState(false);
  const [outOfZone, setOutOfZone] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [orderSaved, setOrderSaved] = useState(null);
  const [notificationStatus, setNotificationStatus] = useState('');
  const tg = useRef(null);
  const searchTimeout = useRef(null);

  const t = getLanguage(lang);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('batz-lang');
    if (stored) setLang(stored);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Telegram?.WebApp) return;
    tg.current = window.Telegram.WebApp;
    tg.current.ready();
    tg.current.expand();
    tg.current.enableClosingConfirmation();
    tg.current.setHeaderColor('#FFD700');
    tg.current.setBackgroundColor('#ffffff');

    if (tg.current.MainButton) {
      tg.current.MainButton.setText(t.find_driver);
      tg.current.MainButton.show();
    }

    const initData = tg.current.initDataUnsafe;
    const initLang = initData?.user?.language_code || lang;
    const locale = initLang?.startsWith('kk') ? 'kk' : initLang?.startsWith('en') ? 'en' : 'ru';
    setLang(locale);
    window.localStorage.setItem('batz-lang', locale);

    if (initData?.user) {
      setUser(initData.user);
      saveUser(initData.user);
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => handleLocationUpdate(coords.latitude, coords.longitude),
        () => {
          setFromCoords(DEFAULT_CENTER);
          fetchReverseGeocode(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng).then(addr => setFromAddr(addr));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setFromCoords(DEFAULT_CENTER);
      fetchReverseGeocode(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng).then(addr => setFromAddr(addr));
    }

    const onMainButton = () => handleOrder();
    tg.current.onEvent('mainButtonClicked', onMainButton);
    return () => tg.current?.offEvent?.('mainButtonClicked', onMainButton);
  }, []);

  useEffect(() => {
    if (!tg.current?.MainButton) return;
    const canOrder = fromAddr && toAddr && fromCoords && toCoords && !outOfZone;
    tg.current.MainButton.setText(canOrder ? t.find_driver : t.searching);
    canOrder ? tg.current.MainButton.show() : tg.current.MainButton.hide();
  }, [fromAddr, toAddr, fromCoords, toCoords, outOfZone, t.find_driver, t.searching]);

  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchAddress(searchQuery, lang);
      setSearchResults(results);
    }, 500);

    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery, lang]);

  const saveUser = async (tgUser) => {
    try {
      const { data, error } = await supabase.from('users').upsert({
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        username: tgUser.username,
        language: lang,
      }, { onConflict: 'telegram_id', returning: 'representation' });
      if (error) throw error;
      if (data?.[0]) setUserRow(data[0]);
    } catch (e) {
      console.error('DB Error', e);
    }
  };

  const fetchUserByTelegramId = async (telegramId) => {
    if (!telegramId) return null;
    const { data, error } = await supabase.from('users').select('*').eq('telegram_id', telegramId).limit(1).single();
    if (error) {
      console.error('User fetch error', error);
      return null;
    }
    setUserRow(data);
    return data;
  };

  const fetchOrderHistory = async (telegramId) => {
    if (!telegramId) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/order-history?telegram_id=${telegramId}`);
      const json = await response.json();
      setHistory(json.orders || []);
    } catch (e) {
      console.error('Order history error', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const notifyDriver = async (order) => {
    if (!order) return;
    try {
      const response = await fetch('/api/notify-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      const json = await response.json();
      if (response.ok) {
        setNotificationStatus(t.driver_notified);
      } else {
        setNotificationStatus(t.notify_failed);
        console.error('Notify driver failed', json);
      }
    } catch (e) {
      console.error('Notify driver error', e);
      setNotificationStatus(t.notify_failed);
    }
  };

  useEffect(() => {
    const telegramId = userRow?.telegram_id || user?.id;
    if (telegramId) {
      fetchOrderHistory(telegramId);
    }
  }, [userRow, user?.id]);

  const handleLocationUpdate = async (lat, lng) => {
    const coords = { lat, lng };
    setFromCoords(coords);
    const inZone = isInServiceArea(lat, lng);
    setOutOfZone(!inZone);
    if (!inZone) {
      setMessage(t.out_of_zone);
    }
    const addr = await fetchReverseGeocode(lat, lng);
    if (addr) setFromAddr(addr);
  };

  const fetchReverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=${lang}`);
      const data = await res.json();
      return data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (e) {
      console.error('Reverse geocode error', e);
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  };

  const handleSuggestionSelect = async (item, type) => {
    setSearchResults([]);
    if (type === 'from') {
      setFromAddr(item.display_name);
      setFromCoords({ lat: item.lat, lng: item.lon });
      setOutOfZone(!isInServiceArea(item.lat, item.lon));
    } else {
      setToAddr(item.display_name);
      setToCoords({ lat: item.lat, lng: item.lon });
      setOutOfZone(!isInServiceArea(item.lat, item.lon));
    }
    setSearchQuery('');
  };

  const handleMapSelect = async (coords) => {
    setToCoords(coords);
    const addr = await fetchReverseGeocode(coords.lat, coords.lng);
    setToAddr(addr);
    setOutOfZone(!isInServiceArea(coords.lat, coords.lng));
  };

  const calculateRoute = async () => {
    if (!fromCoords || !toCoords) return;
    const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=full&geometries=geojson&alternatives=false`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data?.routes?.[0]) {
        const route = data.routes[0];
        setDistance(route.distance);
        setDuration(route.duration);
        setRouteGeojson(route.geometry);
        setPrice(calculateTaxiPrice(route.distance, isSuburbArea(fromCoords, toCoords)));
      }
    } catch (e) {
      console.error('Route error', e);
    }
  };

  useEffect(() => {
    if (fromCoords && toCoords) calculateRoute();
  }, [fromCoords, toCoords]);

  const handleOrder = async () => {
    if (loading) return;
    if (!fromAddr || !toAddr || !fromCoords || !toCoords || outOfZone) {
      setMessage(t.out_of_zone);
      return;
    }

    setLoading(true);
    setMessage('');

    const currentUser = userRow || await fetchUserByTelegramId(user?.id);
    const orderPayload = {
      user_id: currentUser?.id,
      telegram_id: user?.id || currentUser?.telegram_id,
      from_address: fromAddr,
      to_address: toAddr,
      from_lat: fromCoords.lat,
      from_lng: fromCoords.lng,
      to_lat: toCoords.lat,
      to_lng: toCoords.lng,
      tariff,
      payment,
      cash_amount: payment === 'cash' ? cashAmount : null,
      price,
      distance_km: Number((distance / 1000).toFixed(2)),
      eta_minutes: Number((duration / 60).toFixed(0)),
      status: 'pending',
    };

    try {
      const { data, error } = await supabase.from('orders').insert(orderPayload).select().single();
      if (error) throw error;
      setOrderSaved(data || null);
      setMessage(t.order_saved);
      if (tg.current?.HapticFeedback) tg.current.HapticFeedback.notificationOccurred('success');
      await notifyDriver(data || orderPayload);
      await fetchOrderHistory(user?.id || currentUser?.telegram_id);
    } catch (e) {
      console.error('Order save error', e);
      setMessage(t.notify_failed);
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = (nextLang) => {
    setLang(nextLang);
    window.localStorage.setItem('batz-lang', nextLang);
  };

  const handlePaymentSelect = (method) => {
    setPayment(method);
    if (method === 'cash') setCashAmount(500);
  };

  const handleCashTemplate = (value) => {
    setCashAmount(value);
  };

  const showLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => handleLocationUpdate(coords.latitude, coords.longitude),
        () => setMessage('Невозможно определить местоположение'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const distanceText = distance ? `${(distance / 1000).toFixed(1)} км` : '—';
  const durationText = duration ? `${Math.ceil(duration / 60)} мин` : '—';
  const canOrder = fromAddr && toAddr && fromCoords && toCoords && !outOfZone;

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      <Header lang={lang} setLang={handleLanguageChange} />

      <div style={styles.page}>
        <div style={styles.mapWrapper}>
          <MapComponent
            center={fromCoords}
            from={fromCoords}
            to={toCoords}
            route={routeGeojson}
            onLocationSelect={handleMapSelect}
          />
        </div>

        <div style={styles.panel}>
          <div style={styles.fieldRow}>
            <button style={styles.locationButton} onClick={showLocation}>{t.my_location}</button>
          </div>

          <label style={styles.label}>{t.from}</label>
          <input
            style={styles.input}
            value={fromAddr}
            onChange={(e) => {
              setSearchType('from');
              setFromAddr(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder={t.from}
          />

          <label style={styles.label}>{t.to}</label>
          <input
            style={styles.input}
            value={toAddr}
            onChange={(e) => {
              setSearchType('to');
              setToAddr(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder={t.to}
          />

          {searchResults.length > 0 && (
            <div style={styles.suggestions}>
              {searchResults.map((result) => (
                <button
                  key={`${result.lat}-${result.lon}-${result.display_name}`}
                  style={styles.suggestionButton}
                  onClick={() => handleSuggestionSelect(result, searchType)}
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionTitle}>{t.economy}/{t.comfort}/{t.business}</div>
            <div style={styles.cardRow}>
              {['economy', 'comfort', 'business'].map((option) => (
                <button
                  key={option}
                  style={{
                    ...styles.card,
                    borderColor: tariff === option ? '#000' : '#ddd',
                    backgroundColor: tariff === option ? '#fff6d6' : '#fff',
                  }}
                  onClick={() => setTariff(option)}
                >
                  {t[option]}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>{t.payment}</div>
            <div style={styles.cardRow}>
              {['cash', 'kaspi', 'halyk'].map((method) => (
                <button
                  key={method}
                  style={{
                    ...styles.card,
                    borderColor: payment === method ? '#000' : '#ddd',
                    backgroundColor: payment === method ? '#fff6d6' : '#fff',
                  }}
                  onClick={() => handlePaymentSelect(method)}
                >
                  {t[method]}
                </button>
              ))}
            </div>
            {payment === 'cash' && (
              <div style={styles.cashBlock}>
                <div style={styles.sectionSubtitle}>Сдача с</div>
                <div style={styles.tagRow}>
                  {CASH_TEMPLATES.map((amount) => (
                    <button
                      key={amount}
                      style={{
                        ...styles.tag,
                        borderColor: cashAmount === amount ? '#000' : '#ddd',
                      }}
                      onClick={() => handleCashTemplate(amount)}
                    >
                      {amount} ₸
                    </button>
                  ))}
                </div>
                <input
                  style={styles.input}
                  type="number"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(Number(e.target.value))}
                  min={0}
                  placeholder="500"
                />
              </div>
            )}
          </div>

          <div style={styles.summaryBox}>
            <div style={styles.summaryRow}><span>Расстояние</span><strong>{distanceText}</strong></div>
            <div style={styles.summaryRow}><span>Время</span><strong>{durationText}</strong></div>
            <div style={styles.summaryRow}><span>{t.price}</span><strong>{price} ₸</strong></div>
          </div>

          {notificationStatus && <div style={styles.notification}>{notificationStatus}</div>}
          {message && <div style={styles.message}>{message}</div>}

          {orderSaved && (
            <div style={styles.orderCard}>
              <div style={styles.orderCardTitle}>{t.order_details}</div>
              <div style={styles.orderLine}><strong>{t.from}</strong> {orderSaved.from_address}</div>
              <div style={styles.orderLine}><strong>{t.to}</strong> {orderSaved.to_address}</div>
              <div style={styles.orderLine}><strong>{t.price}</strong> {orderSaved.price} ₸</div>
              <div style={styles.orderLine}><strong>{t.eta}</strong> {orderSaved.eta_minutes} мин</div>
            </div>
          )}

          <button style={styles.historyToggle} onClick={() => setHistoryOpen(!historyOpen)}>
            {t.order_history}
          </button>
          {historyOpen && (
            <div style={styles.historyPanel}>
              {historyLoading ? (
                <div style={styles.message}>{t.searching}</div>
              ) : history.length === 0 ? (
                <div style={styles.message}>{t.no_history}</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} style={styles.historyCard}>
                    <div style={styles.orderLine}><strong>{t.from}</strong> {item.from_address}</div>
                    <div style={styles.orderLine}><strong>{t.to}</strong> {item.to_address}</div>
                    <div style={styles.orderLine}><strong>{t.price}</strong> {item.price} ₸</div>
                    <div style={styles.orderLine}><strong>{t.eta}</strong> {item.eta_minutes} мин</div>
                    <div style={styles.orderLine}><strong>{t.payment_method}</strong> {t[item.payment] || item.payment}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {!tg.current?.MainButton && (
            <button style={styles.orderButton} onClick={handleOrder} disabled={!canOrder || loading}>
              {loading ? t.searching : t.find_driver}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F5F5F5',
  },
  mapWrapper: {
    height: '42vh',
    width: '100%',
  },
  panel: {
    padding: '16px',
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '12px',
  },
  locationButton: {
    border: '1px solid #ddd',
    borderRadius: '10px',
    padding: '10px 14px',
    background: '#fff',
    color: '#000',
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    padding: '14px',
    marginBottom: '12px',
    borderRadius: '12px',
    border: '1px solid #ddd',
    fontSize: '16px',
    background: '#fff',
  },
  suggestions: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: '12px',
    marginBottom: '14px',
    overflow: 'hidden',
  },
  suggestionButton: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    border: 'none',
    borderBottom: '1px solid #eee',
    background: 'white',
    cursor: 'pointer',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    marginBottom: '10px',
    fontWeight: '700',
  },
  sectionSubtitle: {
    marginBottom: '8px',
    color: '#555',
  },
  cardRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  card: {
    flex: 1,
    minWidth: '100px',
    border: '1px solid #ddd',
    borderRadius: '14px',
    padding: '14px 12px',
    cursor: 'pointer',
    background: '#fff',
    fontWeight: '600',
  },
  cashBlock: {
    marginTop: '10px',
  },
  tagRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  tag: {
    border: '1px solid #ddd',
    borderRadius: '999px',
    padding: '8px 12px',
    background: '#fff',
    cursor: 'pointer',
  },
  summaryBox: {
    background: '#fff',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #eee',
    marginBottom: '16px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    fontSize: '16px',
  },
  message: {
    marginBottom: '14px',
    padding: '12px 14px',
    background: '#fff3cd',
    borderRadius: '12px',
    border: '1px solid #ffeeba',
    color: '#856404',
  },
  notification: {
    marginBottom: '14px',
    padding: '12px 14px',
    background: '#d4edda',
    borderRadius: '12px',
    border: '1px solid #c3e6cb',
    color: '#155724',
  },
  orderCard: {
    marginBottom: '16px',
    padding: '16px',
    background: '#fff',
    borderRadius: '16px',
    border: '1px solid #eee',
  },
  orderCardTitle: {
    fontWeight: '700',
    marginBottom: '10px',
  },
  orderLine: {
    marginBottom: '8px',
    fontSize: '15px',
  },
  historyToggle: {
    width: '100%',
    padding: '14px',
    marginBottom: '14px',
    borderRadius: '16px',
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: '700',
  },
  historyPanel: {
    marginBottom: '16px',
  },
  historyCard: {
    marginBottom: '12px',
    padding: '14px',
    borderRadius: '14px',
    background: '#fff',
    border: '1px solid #eee',
  },
  orderButton: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#FFD700',
    border: 'none',
    borderRadius: '16px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};
