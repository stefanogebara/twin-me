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
          Last updated: February 13, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>1. Introduction</h2>
            <p>
              Twin Me ("we", "our", "us") is a personality discovery platform that creates a digital
              twin from the patterns in your digital life. This Privacy Policy explains how we collect,
              use, store, and protect your data when you use our web application.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>2. Data We Collect</h2>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Account Data</h3>
            <p className="mb-3">When you sign up, we collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li>Email address (via Google OAuth)</li>
              <li>Name and profile photo (from your Google account)</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Email Enrichment (Onboarding)</h3>
            <p className="mb-3">
              During onboarding, we look up publicly available information associated with your email
              address to personalize your experience:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li><strong style={{ color: strongColor }}>Gravatar:</strong> Public profile photo and display name</li>
              <li><strong style={{ color: strongColor }}>GitHub:</strong> Public bio, company, location, and repositories (if your email is linked to a GitHub account)</li>
            </ul>
            <p className="mb-4">
              This data is publicly available and accessed through official APIs. You can review, edit,
              or delete any enriched data during and after onboarding.
            </p>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Platform Data (via OAuth)</h3>
            <p className="mb-3">
              When you connect platforms, we access only the data you explicitly authorize through
              OAuth 2.0. We never see or store your platform passwords. Currently supported:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li><strong style={{ color: strongColor }}>Spotify:</strong> Listening history, top artists, top tracks, playlists</li>
              <li><strong style={{ color: strongColor }}>Google Calendar:</strong> Event titles, times, and density (not event descriptions or attendees)</li>
              <li><strong style={{ color: strongColor }}>Whoop:</strong> Recovery scores, strain, sleep metrics, HRV</li>
              <li><strong style={{ color: strongColor }}>YouTube:</strong> Subscriptions, liked videos, watch history categories</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Calibration Q&A</h3>
            <p className="mb-3">
              During onboarding, our AI asks you 5 personality calibration questions. Your responses
              are stored to improve your soul signature and twin's personality.
            </p>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>Twin Conversations</h3>
            <p className="mb-3">
              All messages you send to your digital twin are stored to maintain conversation history
              and improve your twin's understanding of you over time.
            </p>

            <h3 className="font-medium mb-2" style={{ color: headingColor }}>What We Do NOT Collect</h3>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4">
              <li>Passwords to any platform</li>
              <li>Financial or banking information</li>
              <li>Private messages or email content</li>
              <li>Health records beyond Whoop fitness metrics</li>
              <li>Browsing history or cookies from other sites</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Building your Soul Signature (personality portrait from cross-platform patterns)</li>
              <li>Powering your digital twin's conversations and personality</li>
              <li>Generating insights about your interests, habits, and patterns</li>
              <li>Improving the accuracy of personality analysis over time</li>
              <li>Anonymous, aggregated analytics to improve the platform (via PostHog)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>4. Third-Party Services</h2>
            <p className="mb-3">We use the following third-party services to operate Twin Me:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong style={{ color: strongColor }}>Supabase</strong> (PostgreSQL database) - Stores all user data.
                Data is hosted in Supabase's cloud infrastructure with row-level security policies.
              </li>
              <li>
                <strong style={{ color: strongColor }}>OpenRouter</strong> (AI model gateway) - Routes AI requests
                to language models (Claude, DeepSeek, Gemini Flash) for personality analysis and twin
                conversations. Conversation content is sent to these models for processing but is not
                retained by the model providers for training purposes.
              </li>
              <li>
                <strong style={{ color: strongColor }}>Vercel</strong> (hosting) - Hosts our web application and
                API. Subject to Vercel's privacy policy.
              </li>
              <li>
                <strong style={{ color: strongColor }}>PostHog</strong> (analytics) - Collects anonymous usage
                analytics (page views, feature usage). Demo users are excluded. No personal data is
                sent to PostHog.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>5. Data Storage & Security</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Authentication uses JWT tokens with secure signing</li>
              <li>OAuth tokens for connected platforms are encrypted at rest</li>
              <li>Row-level security policies ensure users can only access their own data</li>
              <li>Database access requires service-role authentication</li>
              <li>Platform OAuth tokens are automatically refreshed and old tokens invalidated</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>6. Your Rights & Controls</h2>
            <p className="mb-3">You have full control over your data. All of these are available in Settings:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong style={{ color: strongColor }}>Export your data:</strong> Download a complete JSON
                archive of all data we hold about you, including your profile, platform data, soul
                signature, conversations, memories, and personality analysis.
              </li>
              <li>
                <strong style={{ color: strongColor }}>Delete your account:</strong> Permanently and immediately
                delete your account and all associated data. This action cascades through all database
                tables and is irreversible.
              </li>
              <li>
                <strong style={{ color: strongColor }}>Disconnect platforms:</strong> Remove any connected
                platform at any time. This revokes our access to that platform's data.
              </li>
              <li>
                <strong style={{ color: strongColor }}>Edit enriched data:</strong> Correct or remove any
                information discovered during email enrichment.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>7. Data Sharing</h2>
            <p>
              We do <strong style={{ color: strongColor }}>not</strong> sell, rent, or share your personal
              data with third parties for marketing purposes. Your data is only shared with our AI
              processing providers (via OpenRouter) for the sole purpose of generating your personality
              insights and powering your digital twin. These providers process data under their
              respective data processing agreements and do not use your data for model training.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>8. Data Retention</h2>
            <p className="mb-3">
              We retain your data for as long as your account is active. When you delete your account:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All personal data is deleted immediately (within seconds)</li>
              <li>Anonymous analytics data (page views, feature usage) is retained but cannot be linked back to you</li>
              <li>LLM usage logs are anonymized (user ID set to null) but cost data is retained for accounting</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>9. Children's Privacy</h2>
            <p>
              Twin Me is not intended for users under the age of 13. We do not knowingly collect
              data from children under 13. If you believe a child under 13 has created an account,
              please contact us and we will delete it immediately.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of
              significant changes through the application. The "Last updated" date at the top
              reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-lg mb-3" style={{ color: headingColor, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>11. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or your data, please contact us
              through the Settings page in the application, or email us at privacy@twinme.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
