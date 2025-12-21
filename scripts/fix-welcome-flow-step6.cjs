const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'WelcomeFlow.tsx');

let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Add step 6 to URL detection in useEffect
content = content.replace(
  `    } else if (path.includes('/onboarding/platforms')) {
      setCurrentStep(5);
    }
  }, [location.pathname]);`,
  `    } else if (path.includes('/onboarding/platforms')) {
      setCurrentStep(5);
    } else if (path.includes('/onboarding/create-account')) {
      setCurrentStep(6);
    }
  }, [location.pathname]);`
);

// Fix 2: Add step 6 to stepRoutes mapping
content = content.replace(
  `    const stepRoutes = {
      1: '/onboarding/welcome',
      2: '/onboarding/about',
      3: '/onboarding/gmail',
      4: '/onboarding/analysis',
      5: '/onboarding/platforms'
    };`,
  `    const stepRoutes = {
      1: '/onboarding/welcome',
      2: '/onboarding/about',
      3: '/onboarding/gmail',
      4: '/onboarding/analysis',
      5: '/onboarding/platforms',
      6: '/onboarding/create-account'
    };`
);

// Fix 3: Add case 6 in the switch statement
content = content.replace(
  `      case 5:
        return <Step13PlatformGallery {...stepProps} />;
      default:
        return <Step1Welcome {...stepProps} />;`,
  `      case 5:
        return <Step13PlatformGallery {...stepProps} />;
      case 6:
        return <Step6CreateAccount {...stepProps} />;
      default:
        return <Step1Welcome {...stepProps} />;`
);

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ WelcomeFlow.tsx updated successfully!');
console.log('   - Added step 6 URL detection for /onboarding/create-account');
console.log('   - Added step 6 to stepRoutes mapping');
console.log('   - Added case 6 in switch statement to render Step6CreateAccount');
