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

        <PageHead title="Privacy policy" line="Last updated: September 12, 2026" />

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

            <h3>Account data</h3>
            <p>When you sign up, we collect:</p>
            <ul>
              <li>Your email address — from Google sign-in, or from the sign-in link you ask us to email you</li>
              <li>Your name and profile photo, if you sign in with Google</li>
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

            <h3>Platforms you connect</h3>
            <p>
              When you connect a platform, we read only what you authorize through OAuth 2.0. We
              never see or store your platform passwords, and you can disconnect any platform in
              Settings. These nine can be connected today:
            </p>
            <ul>
              <li><strong>Spotify:</strong> Recent plays, top artists, saved music, playlists</li>
              <li><strong>Google Calendar:</strong> Your events — titles, times, and how full your days are</li>
              <li><strong>YouTube:</strong> Subscriptions, liked videos and their titles, your playlists</li>
              <li><strong>Gmail:</strong> Who you write to and hear from, subjects, and dates. Routine reading stops at those headers. The inbox brief goes further: it reads the text of recent emails to draft a reply for you.</li>
              <li><strong>Outlook:</strong> How many messages sit in each folder, and how many contacts you have. Never the messages themselves.</li>
              <li><strong>Discord:</strong> Your profile and the servers you are in. Not your messages — we have no way to read them.</li>
              <li><strong>GitHub:</strong> Your public activity, repositories and languages, and the first line of recent commit messages</li>
              <li><strong>Whoop:</strong> Recovery, resting heart rate, heart-rate variability, blood oxygen, skin temperature, sleep length and stages, workouts and strain</li>
              <li><strong>Instagram:</strong> Through the browser extension — your posts and saved posts with their captions, who you follow, your bio and counts</li>
            </ul>
            <p>
              Reddit, Twitch, LinkedIn, Slack, TikTok, Strava, Notion, Pinterest, SoundCloud,
              Fitbit, Steam and Apple Music can no longer be connected. Data collected from them
              before we retired them is still yours to export or delete in Settings.
            </p>

            <h3>Files you upload</h3>
            <p>
              You can hand us a file instead of a connection. We read it once, learn from it, and
              delete the file itself:
            </p>
            <ul>
              <li><strong>Platform exports</strong> (the archive a platform gives you when you ask for your data): Discord, LinkedIn, Instagram, Reddit, TikTok, Apple Music, SoundCloud, Netflix, X, Letterboxd, Goodreads, Whoop, Apple Health, Android health and usage, Google search history, Spotify, YouTube</li>
              <li><strong>Chat histories</strong> from WhatsApp or Telegram, with the label you give the relationship</li>
            </ul>

            <h3>Money</h3>
            <p>If you use Money, we collect what it takes to read your spending:</p>
            <ul>
              <li><strong>Your bank,</strong> through Enable Banking, a licensed European account provider. You approve the connection at your own bank and we never see your bank login. We read balances and transactions: the amount, the date, the name and text the bank sends, the last four digits of the card, and the account name and IBAN. The connection is read-only — we cannot move money.</li>
              <li><strong>Statements you upload</strong> (CSV, Excel or OFX)</li>
              <li><strong>Bank notifications you forward</strong> from your phone, as the text your bank wrote</li>
            </ul>
            <p>
              To place a purchase on a map, we send the merchant name and city — never the amount,
              your name, or your account — to Google Places and OpenStreetMap.
            </p>

            <h3>Voice and audio</h3>
            <ul>
              <li>A voice note or recording you send for transcription is deleted from our servers once it has been transcribed. We keep the transcript.</li>
              <li>A recording you give us to build your twin's voice is sent to ElevenLabs, which makes and holds that voice.</li>
              <li>Audio your twin speaks is saved as a file so it can be played back.</li>
            </ul>

            <h3>Browser extension (optional)</h3>
            <p>
              If you install the Twin Me Chrome extension, it collects the following to build your
              Soul Signature. It never runs on sensitive sites (banking, healthcare, email,
              authentication pages) or in incognito windows, and it never collects passwords, form
              data, or private messages.
            </p>
            <ul>
              <li><strong>Tab visit history:</strong> Domain, page title, and time spent on each page. No page content is read.</li>
              <li><strong>Activity on a few sites:</strong> What you watch on YouTube, Twitch and Netflix, and what you do on Instagram, Discord, LinkedIn and a handful of shopping sites — through scripts that run on those domains only.</li>
              <li><strong>Past browsing history (optional, one-time import):</strong> Up to 7 days of past browsing history, imported once when you click "Import History" in the extension popup.</li>
              <li><strong>On-demand page analysis (optional):</strong> Title, description, headings, and estimated reading time of the current page — only when you click "Analyze This Page" in the popup.</li>
            </ul>
            <p>
              All extension data is stored locally in your browser first and synced to your Twin Me
              account over HTTPS. You can disconnect the extension at any time via Settings.
            </p>

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
              <li>Passwords — to any platform, or to your bank</li>
              <li>Full card numbers. Your bank sends us the last four digits, and nothing more.</li>
              <li>Medical records, diagnoses, or identity biometrics such as fingerprints and face scans</li>
              <li>Your direct messages on Discord, Instagram or Outlook</li>
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
              <li>Usage analytics to improve the platform (via PostHog, tied to your account — see below)</li>
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
                <strong>PostHog</strong> (analytics) - Collects usage analytics (page views,
                feature usage) and records sessions in the app so we can see where it breaks.
                Once you sign in, this is tied to your account, and your email and name are sent
                to PostHog with it. Demo users are excluded.
              </li>
              <li>
                <strong>OpenAI</strong> - Turns your text into the numbers that power search
                across your memory, and transcribes audio you send.
              </li>
              <li>
                <strong>Resend</strong> (email) - Sends your sign-in links and the emails the
                product sends you.
              </li>
              <li>
                <strong>Enable Banking</strong> (open banking) - A licensed European account
                provider. It holds the connection to your bank and passes us balances and
                transactions, read-only. Only if you use Money.
              </li>
              <li>
                <strong>ElevenLabs</strong> (voice) - Makes and holds your twin's voice, if you
                build one.
              </li>
              <li>
                <strong>Stripe</strong> (payments) - Takes payment if you subscribe. Card details
                go to Stripe, never to us.
              </li>
              <li>
                <strong>Upstash</strong> (Redis) - Short-lived cache and rate limiting.
              </li>
              <li>
                <strong>Nango</strong> (connections) - Holds some platform connections, such as
                Outlook, and passes the data through.
              </li>
              <li>
                <strong>Google Places and OpenStreetMap</strong> - Turn a merchant name and city
                into a point on a map, if you use Money.
              </li>
              <li>
                <strong>WhatsApp providers</strong> - Carry messages between you and your twin on
                WhatsApp, if you connect it.
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
              We do <strong>not</strong> sell, rent, or share your personal data with third parties
              for marketing purposes. It goes only to the services listed above, and only for the
              job each one does: reading your data, running your twin, sending your email, taking
              your payment. The AI providers process data under their data processing agreements
              and do not use your data to train their models.
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
