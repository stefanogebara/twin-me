/**
 * A page of the retired twin, while the twin is parked: one heading, one grey line, the way
 * to the product. The register, nothing else (2026-09-22).
 */
import { Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import '../styles/money-v2.css';

export default function Parked() {
  const t = useT();
  useDocumentTitle(t('This part of TwinMe is retired.'));
  return (
    <main id="main-content" className="mv" style={{ minHeight: '100vh' }}>
      <div className="mv-col" style={{ maxWidth: 820, margin: '0 auto', padding: '120px 24px 0' }}>
        <h1>{t('This part of TwinMe is retired.')}</h1>
        <p className="mv-sub">{t('The product is your money. Everything you can do is there.')}</p>
        <div className="mv-ctas">
          <Link to="/money" className="mv-pill">{t('Go to your money')}</Link>
        </div>
      </div>
    </main>
  );
}
