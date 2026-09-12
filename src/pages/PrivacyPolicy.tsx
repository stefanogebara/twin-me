import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useLenis } from "../hooks/useLenis";
import { PageHead } from "@/components/register";
import "../styles/legal.css";

/**
 * /privacy-policy, in the register (src/styles/legal.css): the kit's column and
 * title, each numbered section on the section heading so the long document keeps
 * its steps. The policy text itself is unchanged.
 */
const PrivacyPolicy = () => {
  const navigate = useNavigate();
  useLenis();

  return (
    // Standalone page (no SidebarLayout), so it provides the #main-content
    // landmark the App.tsx skip-link targets.
    <main id="main-content" className="lg">
      <div className="rg-page">
        <button
          type="button"
          aria-label="Go back to previous page"
          onClick={() => navigate(-1)}
          className="n-btn n-btn--ghost lg-back"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>

        <PageHead title="Privacy policy" line="Last updated: February 23, 2026" />

        <div className="lg-doc">
          <section>
            <h2>1. Introduction</h2>
            <p>
              Twin Me ("we", "our", "us") is a personality discovery platform that creates a digital
              twin from the patterns in your digital life. This Privacy Policy explains how we collect,
              use, store, and protect your data when you use our web application.
            </p>
          </section>

          <section>
            <h2>2. Data we collect</h2>

            <h3>Browser extension data</h3>
            <p>
              If you install the optional Twin Me Chrome extension, it collects the following data
              to build your Soul Signature. The extension never runs on sensitive sites (banking,
              healthcare, email, authentication pages) and never collects passwords, form data, or
              private messages.
            </p>
            <ul>
              <li><strong>Tab visit history:</strong> Domain, page title, and time spent on each page — tracked via the Chrome Tabs API in the background service worker. No page content is read.</li>
              <li><strong>Streaming platform activity:</strong> Watch sessions from YouTube, Twitch, Netflix, Hulu, HBO Max, Prime Video, and Disney+ — via content scripts on those specific domains only.</li>
              <li><strong>Past browsing history (optional, one-time import):</strong> Up to 7 days of past browsing history imported once via the Chrome History API when you click "Import History" in the extension popup.</li>
              <li><strong>On-demand page analysis (optional):</strong> Title, description, headings, and estimated reading time of the current page — only when you explicitly click "Analyze This Page" in the popup.</li>
            </ul>
            <p>
              All extension data is stored locally in your browser first and synced to your Twin Me
              account over HTTPS. You can disconnect the extension at any time via Settings.
            </p>

            <h3>Account data</h3>
            <p>When you sign up, we collect:</p>
            <ul>
              <li>Email address (via Google OAuth)</li>
              <li>Name and profile photo (from your Google account)</li>
            </ul>

            <h3>Email enrichment (onboarding)</h3>
            <p>
              During onboarding, we look up publicly available information associated with your email
              address to personalize your experience:
            </p>
            <ul>
              <li><strong>Gravatar:</strong> Public profile photo and display name</li>
              <li><strong>GitHub:</strong> Public bio, company, location, and repositories (if your email is linked to a GitHub account)</li>
            </ul>
            <p>
              This data is publicly available and accessed through official APIs. You can review, edit,
              or delete any enriched data during and after onboarding.
            </p>

            <h3>Platform data (via OAuth)</h3>
            <p>
              When you connect platforms, we access only the data you explicitly authorize through
              OAuth 2.0. We never see or store your platform passwords. Currently supported:
            </p>
            <ul>
              <li><strong>Spotify:</strong> Listening history, top artists, top tracks, playlists</li>
              <li><strong>Google Calendar:</strong> Event titles, times, and density (not event descriptions or attendees)</li>
              <li><strong>YouTube:</strong> Subscriptions, liked videos, watch history categories</li>
              <li><strong>Discord:</strong> Server memberships, activity patterns, community interests</li>
              <li><strong>LinkedIn:</strong> Career summary, skills, work history, and professional network size</li>
            </ul>

            <h3>Calibration Q&amp;A</h3>
            <p>
              During onboarding, our AI asks you 5 personality calibration questions. Your responses
              are stored to improve your soul signature and twin's personality.
            </p>

            <h3>Twin conversations</h3>
            <p>
              All messages you send to your digital twin are stored to maintain conversation history
              and improve your twin's understanding of you over time.
            </p>

            <h3>What we do not collect</h3>
            <ul>
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
            <h2>3. How we use your data</h2>
            <ul>
              <li>Building your Soul Signature (personality portrait from cross-platform patterns)</li>
              <li>Powering your digital twin's conversations and personality</li>
              <li>Generating insights about your interests, habits, and patterns</li>
              <li>Improving the accuracy of personality analysis over time</li>
              <li>Anonymous, aggregated analytics to improve the platform (via PostHog)</li>
            </ul>
          </section>

          <section>
            <h2>4. Third-party services</h2>
            <p>We use the following third-party services to operate Twin Me:</p>
            <ul>
              <li>
                <strong>Supabase</strong> (PostgreSQL database) - Stores all user data.
                Data is hosted in Supabase's cloud infrastructure with row-level security policies.
              </li>
              <li>
                <strong>OpenRouter</strong> (AI model gateway) - Routes AI requests
                to language models (Claude, DeepSeek, Gemini Flash) for personality analysis and twin
                conversations. Conversation content is sent to these models for processing but is not
                retained by the model providers for training purposes.
              </li>
              <li>
                <strong>Vercel</strong> (hosting) - Hosts our web application and
                API. Subject to Vercel's privacy policy.
              </li>
              <li>
                <strong>PostHog</strong> (analytics) - Collects anonymous usage
                analytics (page views, feature usage). Demo users are excluded. No personal data is
                sent to PostHog.
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Data storage and security</h2>
            <ul>
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Authentication uses JWT tokens with secure signing</li>
              <li>OAuth tokens for connected platforms are encrypted at rest</li>
              <li>Row-level security policies ensure users can only access their own data</li>
              <li>Database access requires service-role authentication</li>
              <li>Platform OAuth tokens are automatically refreshed and old tokens invalidated</li>
            </ul>
          </section>

          <section>
            <h2>6. Your rights and controls</h2>
            <p>You have full control over your data. All of these are available in Settings:</p>
            <ul>
              <li>
                <strong>Export your data:</strong> Download a complete JSON
                archive of all data we hold about you, including your profile, platform data, soul
                signature, conversations, memories, and personality analysis.
              </li>
              <li>
                <strong>Delete your account:</strong> Permanently and immediately
                delete your account and all associated data. This action cascades through all database
                tables and is irreversible.
              </li>
              <li>
                <strong>Disconnect platforms:</strong> Remove any connected
                platform at any time. This revokes our access to that platform's data.
              </li>
              <li>
                <strong>Edit enriched data:</strong> Correct or remove any
                information discovered during email enrichment.
              </li>
            </ul>
          </section>

          <section>
            <h2>7. Data sharing</h2>
            <p>
              We do <strong>not</strong> sell, rent, or share your personal
              data with third parties for marketing purposes. Your data is only shared with our AI
              processing providers (via OpenRouter) for the sole purpose of generating your personality
              insights and powering your digital twin. These providers process data under their
              respective data processing agreements and do not use your data for model training.
            </p>
          </section>

          <section>
            <h2>8. Data retention</h2>
            <p>
              We retain your data for as long as your account is active. When you delete your account:
            </p>
            <ul>
              <li>All personal data is deleted immediately (within seconds)</li>
              <li>Anonymous analytics data (page views, feature usage) is retained but cannot be linked back to you</li>
              <li>LLM usage logs are anonymized (user ID set to null) but cost data is retained for accounting</li>
            </ul>
          </section>

          <section>
            <h2>9. Children's privacy</h2>
            <p>
              Twin Me is not intended for users under the age of 13. We do not knowingly collect
              data from children under 13. If you believe a child under 13 has created an account,
              please contact us and we will delete it immediately.
            </p>
          </section>

          <section>
            <h2>10. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of
              significant changes through the application. The "Last updated" date at the top
              reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or your data, please contact us
              through the Settings page in the application, or email us at privacy@twinme.me.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};

export default PrivacyPolicy;
