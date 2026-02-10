import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1a1a18' : '#FAFAFA';
  const textColor = isDark ? '#C1C0B6' : '#44403c';
  const headingColor = isDark ? '#e5e5e0' : '#0c0a09';
  const mutedColor = isDark ? 'rgba(193, 192, 182, 0.5)' : '#78716c';
  const strongColor = headingColor;
  const linkColor = isDark ? '#C1C0B6' : '#44403c';

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 text-sm flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: linkColor, fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h1
          className="text-3xl mb-2"
          style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 400 }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: mutedColor }}>
          Last updated: February 9, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>1. Introduction</h2>
            <p>
              Soul Signature ("we", "our", "us") is a digital twin platform that helps you discover
              your authentic self through the patterns in your digital life. This Privacy Policy
              explains how we collect, use, and protect your data when you use our web application
              and browser extension.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>2. Data We Collect</h2>
            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Browser Extension</h3>
            <p className="mb-3">
              When you install and enable the Soul Signature browser extension, it collects the
              following metadata about your browsing activity:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li>Page titles and website domains (not full URLs)</li>
              <li>Browsing categories (e.g., Learning, News, Entertainment)</li>
              <li>Search queries from major search engines</li>
              <li>Time spent on pages and scroll depth</li>
              <li>Streaming platform viewing activity (Netflix, YouTube, Twitch, etc.)</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>What We Do NOT Collect</h3>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li>Passwords or form input data</li>
              <li>Full page content or screenshots</li>
              <li>Banking, healthcare, or government site activity</li>
              <li>Email content or private messages</li>
              <li>Activity in incognito/private browsing mode</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Platform Connections</h3>
            <p>
              When you connect platforms like Spotify, Google Calendar, or others via OAuth, we
              access only the data you explicitly authorize. We never store your platform passwords.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Building your personalized Soul Signature profile</li>
              <li>Generating insights about your interests and patterns</li>
              <li>Providing personalized recommendations</li>
              <li>Improving our AI analysis and platform experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>4. Data Storage & Security</h2>
            <p className="mb-3">
              Your data is stored securely in our database hosted on Supabase (PostgreSQL). We
              implement the following security measures:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Authentication tokens are securely stored and regularly refreshed</li>
              <li>Sensitive domains (banking, healthcare, government) are automatically blocked from collection</li>
              <li>URLs are sanitized to remove tracking parameters before storage</li>
              <li>Row-level security policies protect your data from other users</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>5. Your Rights & Controls</h2>
            <p className="mb-3">You have full control over your data:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong style={{ color: strongColor }}>Toggle collection:</strong> Enable or disable the browser extension's Soul Observer mode at any time</li>
              <li><strong style={{ color: strongColor }}>Disconnect platforms:</strong> Remove any connected platform from your Settings page</li>
              <li><strong style={{ color: strongColor }}>Delete data:</strong> Request deletion of your collected data at any time</li>
              <li><strong style={{ color: strongColor }}>Export data:</strong> Request a copy of all data we hold about you</li>
              <li><strong style={{ color: strongColor }}>Delete account:</strong> Request full account deletion, which removes all associated data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>6. Data Sharing</h2>
            <p>
              We do <strong style={{ color: strongColor }}>not</strong> sell, rent, or share your
              personal data with third parties for marketing purposes. Your data may be processed
              by our AI service providers (Anthropic, OpenAI) solely for generating your Soul
              Signature insights. These providers process data under strict data processing
              agreements and do not retain your data for their own purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>7. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. Browsing data older than
              12 months may be automatically aggregated into summary insights and the raw data
              deleted. When you delete your account, all associated data is permanently removed
              within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>8. Children's Privacy</h2>
            <p>
              Soul Signature is not intended for users under the age of 13. We do not knowingly
              collect data from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of
              significant changes through the application or by email.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>10. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or your data, please contact us
              through the application's Settings page or by opening an issue on our GitHub
              repository.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
