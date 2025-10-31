import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';

const Step13PlatformGallery = () => {
  const navigate = useNavigate();

  const platformCategories = [
    {
      title: 'Communication',
      platforms: [
        {
          name: 'Gmail',
          color: '#EA4335',
          connected: true,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
            </svg>
          )
        },
        {
          name: 'Calendar',
          color: '#4285F4',
          connected: true,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3.01 4.9 3.01 6L3 20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z" fill="#4285F4"/>
            </svg>
          )
        },
        {
          name: 'Slack',
          color: '#4A154B',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M6 15C6 16.1046 5.10457 17 4 17C2.89543 17 2 16.1046 2 15C2 13.8954 2.89543 13 4 13H6V15Z" fill="#E01E5A"/>
              <path d="M7 15C7 13.8954 7.89543 13 9 13C10.1046 13 11 13.8954 11 15V20C11 21.1046 10.1046 22 9 22C7.89543 22 7 21.1046 7 20V15Z" fill="#E01E5A"/>
              <path d="M9 6C7.89543 6 7 5.10457 7 4C7 2.89543 7.89543 2 9 2C10.1046 2 11 2.89543 11 4V6H9Z" fill="#36C5F0"/>
              <path d="M9 7C10.1046 7 11 7.89543 11 9C11 10.1046 10.1046 11 9 11H4C2.89543 11 2 10.1046 2 9C2 7.89543 2.89543 7 4 7H9Z" fill="#36C5F0"/>
              <path d="M18 9C18 7.89543 18.8954 7 20 7C21.1046 7 22 7.89543 22 9C22 10.1046 21.1046 11 20 11H18V9Z" fill="#2EB67D"/>
              <path d="M17 9C17 10.1046 16.1046 11 15 11C13.8954 11 13 10.1046 13 9V4C13 2.89543 13.8954 2 15 2C16.1046 2 17 2.89543 17 4V9Z" fill="#2EB67D"/>
              <path d="M15 18C16.1046 18 17 18.8954 17 20C17 21.1046 16.1046 22 15 22C13.8954 22 13 21.1046 13 20V18H15Z" fill="#ECB22E"/>
              <path d="M15 17C13.8954 17 13 16.1046 13 15C13 13.8954 13.8954 13 15 13H20C21.1046 13 22 13.8954 22 15C22 16.1046 21.1046 17 20 17H15Z" fill="#ECB22E"/>
            </svg>
          )
        },
        {
          name: 'Discord',
          color: '#5865F2',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4C14.83 4.3 14.66 4.61 14.5 4.93C12.9 4.68 11.27 4.68 9.67 4.93C9.51 4.61 9.34 4.3 9.17 4C7.67 4.26 6.23 4.71 4.9 5.33C2.1 9.57 1.35 13.68 1.73 17.73C3.43 18.99 5.4 19.84 7.5 20.24C7.96 19.62 8.38 18.96 8.75 18.27C8.1 18.03 7.47 17.74 6.87 17.4C7.02 17.28 7.17 17.15 7.31 17.03C10.37 18.48 13.74 18.48 16.76 17.03C16.9 17.15 17.05 17.28 17.2 17.4C16.6 17.74 15.97 18.03 15.32 18.27C15.69 18.96 16.11 19.62 16.57 20.24C18.67 19.84 20.64 18.99 22.34 17.73C22.78 13.08 21.6 8.99 19.27 5.33Z" fill="#5865F2"/>
            </svg>
          )
        }
      ]
    },
    {
      title: 'Entertainment',
      platforms: [
        {
          name: 'Spotify',
          color: '#1DB954',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" fill="#1DB954"/>
              <path d="M16.5692 16.3231C16.3846 16.6154 16.0154 16.7077 15.7231 16.5231C13.2 14.9538 10.0308 14.6154 6.73077 15.4462C6.39231 15.5385 6.03077 15.3231 5.93846 15C5.84615 14.6615 6.06154 14.3 6.38462 14.2077C10.0308 13.2923 13.5231 13.6615 16.3385 15.4154C16.6308 15.5846 16.7231 15.9692 16.5692 16.3231Z" fill="white"/>
              <path d="M17.4462 13.7538C17.2308 14.1231 16.7692 14.2462 16.4 14.0308C14.2923 12.7385 11.2769 12.3692 8.40001 13.1385C7.98463 13.2462 7.56924 12.9846 7.46155 12.5692C7.35386 12.1538 7.61539 11.7385 8.03078 11.6308C11.2769 10.7692 14.6769 11.1846 17.1231 12.7077C17.4923 12.9231 17.6154 13.3846 17.4462 13.7538Z" fill="white"/>
              <path d="M17.5692 11.0769C15.0462 9.56923 9.78463 9.35385 6.78463 10.3385C6.29232 10.4769 5.76924 10.2 5.63078 9.70769C5.49232 9.21539 5.76924 8.69231 6.26155 8.55385C9.70001 7.43077 15.5385 7.67692 18.5385 9.43077C18.9846 9.69231 19.1385 10.2769 18.8769 10.7231C18.6154 11.1692 18.0154 11.3231 17.5692 11.0769Z" fill="white"/>
            </svg>
          )
        },
        {
          name: 'Netflix',
          color: '#E50914',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M5.398 0V24L12.6 22.1V1.9L5.398 0Z" fill="#E50914"/>
              <path d="M12.6 1.9L19.802 0V24L12.6 22.1V1.9Z" fill="#E50914" opacity="0.9"/>
              <path d="M5.398 0L12.6 5.5V11.4L5.398 6V0Z" fill="#B20710"/>
              <path d="M12.6 12.6V18.5L19.802 24V18L12.6 12.6Z" fill="#B20710"/>
            </svg>
          )
        },
        {
          name: 'YouTube',
          color: '#FF0000',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M21.582 7.186C21.352 6.324 20.676 5.648 19.814 5.418C18.254 5 12 5 12 5C12 5 5.746 5 4.186 5.418C3.324 5.648 2.648 6.324 2.418 7.186C2 8.746 2 12 2 12C2 12 2 15.254 2.418 16.814C2.648 17.676 3.324 18.352 4.186 18.582C5.746 19 12 19 12 19C12 19 18.254 19 19.814 18.582C20.676 18.352 21.352 17.676 21.582 16.814C22 15.254 22 12 22 12C22 12 22 8.746 21.582 7.186ZM10 15V9L15 12L10 15Z" fill="#FF0000"/>
            </svg>
          )
        },
        {
          name: 'Twitch',
          color: '#9146FF',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M11.571 4.714H14.857V9.714H11.571V4.714ZM16.857 4.714H20.143V9.714H16.857V4.714ZM5.714 2L2 5.714V20.571H7.714V24L11.429 20.571H14.857L22 13.429V2H5.714ZM20.143 12.571L16.857 15.857H13.571L10.714 18.714V15.857H7.714V3.857H20.143V12.571Z" fill="#9146FF"/>
            </svg>
          )
        }
      ]
    },
    {
      title: 'Professional',
      platforms: [
        {
          name: 'GitHub',
          color: '#171515',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.477 2 2 6.477 2 12C2 16.418 4.865 20.166 8.839 21.489C9.339 21.579 9.521 21.267 9.521 21.001C9.521 20.766 9.512 20.146 9.508 19.319C6.726 19.91 6.139 17.906 6.139 17.906C5.685 16.745 5.029 16.434 5.029 16.434C4.121 15.831 5.098 15.843 5.098 15.843C6.101 15.915 6.629 16.859 6.629 16.859C7.521 18.391 8.97 17.949 9.539 17.695C9.631 17.049 9.889 16.608 10.175 16.36C7.955 16.109 5.62 15.247 5.62 11.369C5.62 10.276 6.01 9.382 6.649 8.684C6.546 8.433 6.204 7.416 6.747 6.045C6.747 6.045 7.586 5.776 9.497 7.066C10.294 6.847 11.147 6.738 12 6.734C12.853 6.738 13.706 6.847 14.503 7.066C16.413 5.776 17.251 6.045 17.251 6.045C17.795 7.416 17.453 8.433 17.35 8.684C17.99 9.382 18.378 10.276 18.378 11.369C18.378 15.257 16.04 16.106 13.813 16.353C14.172 16.662 14.491 17.271 14.491 18.204C14.491 19.539 14.479 20.614 14.479 21.001C14.479 21.269 14.659 21.584 15.166 21.488C19.138 20.163 22 16.417 22 12C22 6.477 17.523 2 12 2Z" fill="#171515"/>
            </svg>
          )
        },
        {
          name: 'LinkedIn',
          color: '#0A66C2',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M20.447 20.452H16.893V14.883C16.893 13.555 16.866 11.846 15.041 11.846C13.188 11.846 12.905 13.291 12.905 14.785V20.452H9.351V9H12.765V10.561H12.811C13.288 9.661 14.448 8.711 16.181 8.711C19.782 8.711 20.448 11.081 20.448 14.166L20.447 20.452ZM5.337 7.433C4.193 7.433 3.274 6.507 3.274 5.368C3.274 4.23 4.194 3.305 5.337 3.305C6.477 3.305 7.401 4.23 7.401 5.368C7.401 6.507 6.476 7.433 5.337 7.433ZM7.119 20.452H3.555V9H7.119V20.452ZM22.225 0H1.771C0.792 0 0 0.774 0 1.729V22.271C0 23.227 0.792 24 1.771 24H22.222C23.2 24 24 23.227 24 22.271V1.729C24 0.774 23.2 0 22.222 0H22.225Z" fill="#0A66C2"/>
            </svg>
          )
        },
        {
          name: 'Pipedream',
          color: '#7C3AED',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#7C3AED"/>
              <path d="M2 17L12 22L22 17V12L12 17L2 12V17Z" fill="#7C3AED" opacity="0.7"/>
              <path d="M2 12L12 17L22 12" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )
        }
      ]
    },
    {
      title: 'Learning & Reading',
      platforms: [
        {
          name: 'Goodreads',
          color: '#553B08',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C10.8954 2 10 2.89543 10 4V5.5C8.61929 5.5 7.5 6.61929 7.5 8V12C7.5 14.2091 9.29086 16 11.5 16H12.5C14.7091 16 16.5 14.2091 16.5 12V8C16.5 6.61929 15.3807 5.5 14 5.5V4C14 2.89543 13.1046 2 12 2Z" fill="#553B08"/>
              <path d="M14 16V18C14 20.2091 12.2091 22 10 22C7.79086 22 6 20.2091 6 18V17.5H8V18C8 19.1046 8.89543 20 10 20C11.1046 20 12 19.1046 12 18V16H14Z" fill="#553B08"/>
              <path d="M11.5 7C10.3954 7 9.5 7.89543 9.5 9V11C9.5 12.1046 10.3954 13 11.5 13H12.5C13.6046 13 14.5 12.1046 14.5 11V9C14.5 7.89543 13.6046 7 12.5 7H11.5Z" fill="#F4F1EA"/>
            </svg>
          )
        },
        {
          name: 'Medium',
          color: '#00AB6C',
          connected: false,
          icon: (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M13.54 12C13.54 15.18 11.01 17.77 7.92 17.77C4.83 17.77 2.3 15.18 2.3 12C2.3 8.82 4.83 6.23 7.92 6.23C11.01 6.23 13.54 8.82 13.54 12ZM20.45 12C20.45 14.99 19.19 17.41 17.62 17.41C16.05 17.41 14.79 14.99 14.79 12C14.79 9.01 16.05 6.59 17.62 6.59C19.19 6.59 20.45 9.01 20.45 12ZM22.71 12C22.71 14.59 22.27 16.69 21.71 16.69C21.15 16.69 20.71 14.59 20.71 12C20.71 9.41 21.15 7.31 21.71 7.31C22.27 7.31 22.71 9.41 22.71 12Z" fill="#00AB6C"/>
            </svg>
          )
        }
      ]
    }
  ];

  const totalPlatforms = platformCategories.reduce((sum, cat) => sum + cat.platforms.length, 0);
  const connectedCount = platformCategories.reduce((sum, cat) =>
    sum + cat.platforms.filter(p => p.connected).length, 0
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <div className="w-full max-w-6xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 font-garamond">
            Connect your platforms
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            The more platforms you connect, the more accurate your Soul Signature becomes
          </p>
          <p className="text-sm text-stone-400">
            You can always add more platforms later
          </p>
        </div>

        <div className="space-y-8">
          {platformCategories.map((category, categoryIndex) => (
            <div key={categoryIndex}>
              <h2 className="text-lg font-medium text-stone-900 mb-4 px-2">
                {category.title}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {category.platforms.map((platform, platformIndex) => (
                  <button
                    key={platformIndex}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-900 bg-white border rounded-xl transition-all duration-200 hover:bg-stone-50 hover:shadow-md relative"
                    style={{
                      borderColor: platform.connected ? platform.color : '#E7E5E4',
                      borderWidth: platform.connected ? '2px' : '1px'
                    }}
                  >
                    {platform.connected && (
                      <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-green-500" />
                    )}
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${platform.color}15` }}
                      >
                        {platform.icon}
                      </div>
                      <span className="text-sm font-medium">{platform.name}</span>
                      {platform.connected && (
                        <span className="text-xs text-green-500">Connected</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-sm text-stone-600">
            Connect {connectedCount} platforms • {totalPlatforms - connectedCount} remaining
          </p>
        </div>
      </div>
    </div>
  );
};

export default Step13PlatformGallery;
