import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fcf6ef', color: '#000000' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 text-sm flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: '#8A857D', fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h1
          className="heading-serif text-3xl mb-2"
        >
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: '#8A857D' }}>
          Last updated: February 23, 2026
        </p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          <section>
            <h2 className="heading-serif text-lg mb-3">1. Introduction</h2>
            <p style={{ color: '#000000' }}>
              Twin Me ("we", "our", "us") is a personality discovery platform that creates a digital
              twin from the patterns in your digital life. This Privacy Policy explains how we collect,
              use, store, and protect your data when you use our web application.
            </p>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">2. Data We Collect</h2>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Browser Extension Data</h3>
            <p className="mb-3" style={{ color: '#000000' }}>
              If you install the optional Twin Me Chrome extension, it collects the following data
              to build your Soul Signature. The extension never runs on sensitive sites (banking,
              healthcare, email, authentication pages) and never collects passwords, form data, or
              private messages.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-3" style={{ color: '#000000' }}>
              <li><strong>Tab visit history:</strong> Domain, page title, and time spent on each page — tracked via the Chrome Tabs API in the background service worker. No page content is read.</li>
              <li><strong>Streaming platform activity:</strong> Watch sessions from YouTube, Twitch, Netflix, Hulu, HBO Max, Prime Video, and Disney+ — via content scripts on those specific domains only.</li>
              <li><strong>Past browsing history (optional, one-time import):</strong> Up to 7 days of past browsing history imported once via the Chrome History API when you click "Import History" in the extension popup.</li>
              <li><strong>On-demand page analysis (optional):</strong> Title, description, headings, and estimated reading time of the current page — only when you explicitly click "Analyze This Page" in the popup.</li>
            </ul>
            <p className="mb-4" style={{ color: '#000000' }}>
              All extension data is stored locally in your browser first and synced to your Twin Me
              account over HTTPS. You can disconnect the extension at any time via Settings.
            </p>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Account Data</h3>
            <p className="mb-3" style={{ color: '#000000' }}>When you sign up, we collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4" style={{ color: '#000000' }}>
              <li>Email address (via Google OAuth)</li>
              <li>Name and profile photo (from your Google account)</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Email Enrichment (Onboarding)</h3>
            <p className="mb-3" style={{ color: '#000000' }}>
              During onboarding, we look up publicly available information associated with your email
              address to personalize your experience:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4" style={{ color: '#000000' }}>
              <li><strong style={{ color: '#000000' }}>Gravatar:</strong> Public profile photo and display name</li>
              <li><strong style={{ color: '#000000' }}>GitHub:</strong> Public bio, company, location, and repositories (if your email is linked to a GitHub account)</li>
            </ul>
            <p className="mb-4" style={{ color: '#000000' }}>
              This data is publicly available and accessed through official APIs. You can review, edit,
              or delete any enriched data during and after onboarding.
            </p>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Platform Data (via OAuth)</h3>
            <p className="mb-3" style={{ color: '#000000' }}>
              When you connect platforms, we access only the data you explicitly authorize through
              OAuth 2.0. We never see or store your platform passwords. Currently supported:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4" style={{ color: '#000000' }}>
              <li><strong style={{ color: '#000000' }}>Spotify:</strong> Listening history, top artists, top tracks, playlists</li>
              <li><strong style={{ color: '#000000' }}>Google Calendar:</strong> Event titles, times, and density (not event descriptions or attendees)</li>
              <li><strong style={{ color: '#000000' }}>YouTube:</strong> Subscriptions, liked videos, watch history categories</li>
              <li><strong style={{ color: '#000000' }}>Discord:</strong> Server memberships, activity patterns, community interests</li>
              <li><strong style={{ color: '#000000' }}>LinkedIn:</strong> Career summary, skills, work history, and professional network size</li>
            </ul>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Calibration Q&A</h3>
            <p className="mb-3" style={{ color: '#000000' }}>
              During onboarding, our AI asks you 5 personality calibration questions. Your responses
              are stored to improve your soul signature and twin's personality.
            </p>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>Twin Conversations</h3>
            <p className="mb-3" style={{ color: '#000000' }}>
              All messages you send to your digital twin are stored to maintain conversation history
              and improve your twin's understanding of you over time.
            </p>

            <h3 className="font-medium mb-2" style={{ color: '#000000' }}>What We Do NOT Collect</h3>
            <ul className="list-disc list-inside space-y-1 ml-2 mb-4" style={{ color: '#000000' }}>
              <li>Passwords to any platform</li>
              <li>Financial or banking information</li>
              <li>Private messages or email content</li>
              <li>Detailed health records or biometric data</li>
              <li>Page content, form inputs, or passwords from any site</li>
              <li>Browsing activity on banking, healthcare, email, or authentication sites</li>
              <li>Cookies or browser storage from any site</li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: '#000000' }}>
              <li>Building your Soul Signature (personality portrait from cross-platform patterns)</li>
              <li>Powering your digital twin's conversations and personality</li>
              <li>Generating insights about your interests, habits, and patterns</li>
              <li>Improving the accuracy of personality analysis over time</li>
              <li>Anonymous, aggregated analytics to improve the platform (via PostHog)</li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">4. Third-Party Services</h2>
            <p className="mb-3" style={{ color: '#000000' }}>We use the following third-party services to operate Twin Me:</p>
            <ul className="list-disc list-inside space-y-2 ml-2" style={{ color: '#000000' }}>
              <li>
                <strong style={{ color: '#000000' }}>Supabase</strong> (PostgreSQL database) - Stores all user data.
                Data is hosted in Supabase's cloud infrastructure with row-level security policies.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>OpenRouter</strong> (AI model gateway) - Routes AI requests
                to language models (Claude, DeepSeek, Gemini Flash) for personality analysis and twin
                conversations. Conversation content is sent to these models for processing but is not
                retained by the model providers for training purposes.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>Vercel</strong> (hosting) - Hosts our web application and
                API. Subject to Vercel's privacy policy.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>PostHog</strong> (analytics) - Collects anonymous usage
                analytics (page views, feature usage). Demo users are excluded. No personal data is
                sent to PostHog.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">5. Data Storage & Security</h2>
            <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: '#000000' }}>
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Authentication uses JWT tokens with secure signing</li>
              <li>OAuth tokens for connected platforms are encrypted at rest</li>
              <li>Row-level security policies ensure users can only access their own data</li>
              <li>Database access requires service-role authentication</li>
              <li>Platform OAuth tokens are automatically refreshed and old tokens invalidated</li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">6. Your Rights & Controls</h2>
            <p className="mb-3" style={{ color: '#000000' }}>You have full control over your data. All of these are available in Settings:</p>
            <ul className="list-disc list-inside space-y-2 ml-2" style={{ color: '#000000' }}>
              <li>
                <strong style={{ color: '#000000' }}>Export your data:</strong> Download a complete JSON
                archive of all data we hold about you, including your profile, platform data, soul
                signature, conversations, memories, and personality analysis.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>Delete your account:</strong> Permanently and immediately
                delete your account and all associated data. This action cascades through all database
                tables and is irreversible.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>Disconnect platforms:</strong> Remove any connected
                platform at any time. This revokes our access to that platform's data.
              </li>
              <li>
                <strong style={{ color: '#000000' }}>Edit enriched data:</strong> Correct or remove any
                information discovered during email enrichment.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">7. Data Sharing</h2>
            <p style={{ color: '#000000' }}>
              We do <strong style={{ color: '#000000' }}>not</strong> sell, rent, or share your personal
              data with third parties for marketing purposes. Your data is only shared with our AI
              processing providers (via OpenRouter) for the sole purpose of generating your personality
              insights and powering your digital twin. These providers process data under their
              respective data processing agreements and do not use your data for model training.
            </p>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">8. Data Retention</h2>
            <p className="mb-3" style={{ color: '#000000' }}>
              We retain your data for as long as your account is active. When you delete your account:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: '#000000' }}>
              <li>All personal data is deleted immediately (within seconds)</li>
              <li>Anonymous analytics data (page views, feature usage) is retained but cannot be linked back to you</li>
              <li>LLM usage logs are anonymized (user ID set to null) but cost data is retained for accounting</li>
            </ul>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">9. Children's Privacy</h2>
            <p style={{ color: '#000000' }}>
              Twin Me is not intended for users under the age of 13. We do not knowingly collect
              data from children under 13. If you believe a child under 13 has created an account,
              please contact us and we will delete it immediately.
            </p>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">10. Changes to This Policy</h2>
            <p style={{ color: '#000000' }}>
              We may update this Privacy Policy from time to time. We will notify users of
              significant changes through the application. The "Last updated" date at the top
              reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="heading-serif text-lg mb-3">11. Contact</h2>
            <p style={{ color: '#000000' }}>
              If you have questions about this Privacy Policy or your data, please contact us
              through the Settings page in the application, or email us at privacy@twinme.ai.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
