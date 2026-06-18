import { useEffect, useState } from 'react';
import { getLanguage } from '../../lib/i18n';

export default function Header({ lang, setLang }) {
  const t = getLanguage(lang);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.setHeaderColor('#FFD700');
      window.Telegram.WebApp.setBackgroundColor('#ffffff');
      window.Telegram.WebApp.expand();
    }
  }, []);

  const toggleLang = () => {
    const next = lang === 'ru' ? 'kk' : lang === 'kk' ? 'en' : 'ru';
    setLang(next);
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
  };

  return (
    <div style={styles.header}>
      <div style={styles.logo}>{t.title}</div>
      <button onClick={toggleLang} style={styles.langBtn}>
        {lang.toUpperCase()}
      </button>
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#FFD700',
    fontWeight: 'bold',
    fontSize: '18px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  logo: { flex: 1 },
  langBtn: {
    background: 'white',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};
