import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabase';
import { calculateTaxiPrice } from '../lib/priceCalculator';
import { searchAddress, isInServiceArea } from '../lib/geocode';
import { getLanguage } from '../lib/i18n';
import Header from '../components/Header';

// Динамический импорт карты (только клиент)
const MapComponent = dynamic(() => import('../components/Map'), { ssr: false });

export default function Home() {
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState(null);
  const [fromAddr, setFromAddr] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [tariff, setTariff] = useState('economy');
  const [payment, setPayment] = useState('cash');
  const [price, setPrice] = useState(0);
  const [distance, setDistance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [outOfZone, setOutOfZone] = useState(false);
  const tg = useRef(null);

  const t = getLanguage(lang);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram) {
      tg.current = window.Telegram.WebApp;
      tg.current.ready();
      tg.current.expand();
      
      const initDataUnsafe = tg.current.initDataUnsafe;
      if (initDataUnsafe?.user) {
        setUser(initDataUnsafe.user);
        setLang(initDataUnsafe.user.language_code || 'ru');
        
        // Сохранение пользователя в БД
        saveUser(initDataUnsafe.user);
      }
      
      // Запрос геолокации
      tg.current.LocationManager.requestLocation((location) => {
        handleLocationUpdate(location.latitude, location.longitude);
      }, (err) => {
        console.warn('Geo denied or error', err);
        // Центрируем на Шарбакты по умолчанию
        setFromCoords({ lat: 52.48945, lng: 78.16120 });
      });
    }
  }, []);

  const saveUser = async (tgUser) => {
    try {
      await supabase.from('users').upsert({
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        username: tgUser.username,
        language: tgUser.language_code || 'ru',
      }, { onConflict: 'telegram_id' });
    } catch (e) {
      console.error('DB Error', e);
    }
  };

  const handleLocationUpdate = (lat, lng) => {
    const coords = { lat, lng };
    setFromCoords(coords);
    
    if (!isInServiceArea(lat, lng)) {
      setOutOfZone(true);
    } else {
      setOutOfZone(false);
      // Обратный геокодинг для "Откуда"
      fetchReverseGeocode(lat, lng).then(addr => {
        if (addr) setFromAddr(addr);
      });
    }
  };

  const fetchReverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch();
      const data = await res.json();
      return data.display_name;
    } catch { return null; }
  };

  const handleSearch = async (query, type) => {
    if (!query) return;
    const results = await searchAddress(query, fromCoords?.lat, fromCoords?.lng);
    // Логика обработки результатов (упрощено)
    if (results.length > 0 && type === 'to') {
       // При выборе из подсказок обновляем toCoords
    }
  };

  const calculateRoute = async () => {
    if (!fromCoords || !toCoords) return;
    
    // Используем OSRM для расчета дистанции
    const url = ;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const distMeters = data.routes[0].distance;
        setDistance(distMeters);
        setPrice(calculateTaxiPrice(distMeters));
      }
    } catch (e) {
      console.error('Route error', e);
    }
  };

  useEffect(() => {
    if (fromCoords && toCoords) {
      calculateRoute();
    }
  }, [fromCoords, toCoords]);

  const handleOrder = () => {
    if (tg.current) tg.current.HapticFeedback.notificationOccurred('success');
    alert();
    // Здесь логика сохранения заказа в Supabase
  };

  if (outOfZone) {
    return (
      <div style={{padding: 20, textAlign: 'center'}}>
        <h1>⚠️</h1>
        <p>{t.out_of_zone}</p>
        <button onClick={() => setOutOfZone(false)}>Попробовать снова</button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Такси БАЦ</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      
      <Header lang={lang} setLang={setLang} />
      
      <div style={{height: '40vh', width: '100%'}}>
        <MapComponent 
          center={fromCoords || {lat: 52.48945, lng: 78.16120}} 
          from={fromCoords} 
          to={toCoords}
          onLocationSelect={(coords) => {
             setToCoords(coords);
             // Тут нужно запустить геокодинг для адреса
          }}
        />
      </div>

      <div style={{padding: 16}}>
        <input 
          style={styles.input} 
          placeholder={t.from} 
          value={fromAddr} 
          onChange={(e) => setFromAddr(e.target.value)}
        />
        <input 
          style={styles.input} 
          placeholder={t.to} 
          value={toAddr} 
          onChange={(e) => {
            setToAddr(e.target.value);
            handleSearch(e.target.value, 'to');
          }}
        />
        
        <div style={styles.priceBox}>
          <span>{t.price}: </span>
          <strong>{price} ₸</strong>
        </div>

        <button style={styles.mainButton} onClick={handleOrder}>
          {loading ? t.searching : t.find_driver}
        </button>
      </div>
    </>
  );
}

const styles = {
  input: {
    width: '100%',
    padding: '12px',
    marginBottom: '10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '16px',
    boxSizing: 'border-box',
  },
  priceBox: {
    fontSize: '20px',
    marginBottom: '16px',
    textAlign: 'right',
  },
  mainButton: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#FFD700',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
  }
};
