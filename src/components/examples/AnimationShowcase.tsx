/**
 * Animation Showcase Component
 *
 * Demonstrates all available hover effects and micro-interactions.
 * Use this as a reference and testing playground.
 *
 * To view: Import this component into any page and render it.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  FadeIn,
  FadeInUp,
  ScaleIn,
  AnimatedCard,
  AnimatedButton,
  AnimatedIcon,
  StaggerContainer,
  StaggerItem,
  ScrollAnimation,
  PulseLoader,
  SpinLoader,
  SuccessCheckmark,
  ErrorShake,
} from '@/components/ui/AnimatedWrapper';
import {
  IconWithTooltip,
  IconButtonWithTooltip,
  IconBadgeWithTooltip,
  IconGroupWithTooltips,
  TruncatedTextWithTooltip,
  InfoTooltip,
} from '@/components/ui/IconWithTooltip';
import {
  Settings,
  Edit,
  Trash2,
  Bell,
  User,
  LogOut,
  CheckCircle,
  AlertCircle,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';

export function AnimationShowcase() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const triggerSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const triggerError = () => {
    setShowError(true);
    setTimeout(() => setShowError(false), 2000);
  };

  return (
    <div className="container-app py-12 space-y-12">
      {/* Header */}
      <FadeInUp>
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Animation Showcase</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Explore all available hover effects and micro-interactions in the Twin AI Learn platform.
            All animations respect accessibility preferences and are GPU-accelerated.
          </p>
        </div>
      </FadeInUp>

      {/* Button Variants */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Button Hover Effects</CardTitle>
            <CardDescription>All button variants with hover, active, and focus states</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Default Variants</h4>
              <div className="flex flex-wrap gap-4">
                <Button variant="default">Default Button</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link Button</Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Sizes</h4>
              <div className="flex items-center gap-4">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">With Icons</h4>
              <div className="flex flex-wrap gap-4">
                <Button>
                  <Plus className="w-4 h-4" />
                  Add New
                </Button>
                <Button variant="outline">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Card Hover Effects */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Card Hover Effects</CardTitle>
            <CardDescription>Cards lift and shadow increases on hover</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card hover>
                <CardHeader>
                  <CardTitle className="text-lg">Hoverable Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This card lifts on hover with shadow increase
                  </p>
                </CardContent>
              </Card>

              <AnimatedCard className="card">
                <CardHeader>
                  <CardTitle className="text-lg">Animated Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This card uses Framer Motion for smooth animations
                  </p>
                </CardContent>
              </AnimatedCard>

              <Card hover className="platform-card">
                <CardHeader>
                  <CardTitle className="text-lg">Platform Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Enhanced lift with scale and gradient overlay
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Icon Tooltips */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Icon Tooltips</CardTitle>
            <CardDescription>Icons with tooltips and hover animations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Basic Icons</h4>
              <div className="flex gap-6">
                <IconWithTooltip icon={<Settings className="w-5 h-5" />} tooltip="Settings" />
                <IconWithTooltip icon={<Edit className="w-5 h-5" />} tooltip="Edit" />
                <IconWithTooltip icon={<Trash2 className="w-5 h-5" />} tooltip="Delete" />
                <IconWithTooltip icon={<Download className="w-5 h-5" />} tooltip="Download" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Icon Buttons</h4>
              <div className="flex gap-4">
                <IconButtonWithTooltip
                  icon={<Settings className="w-5 h-5" />}
                  tooltip="Settings"
                  onClick={() => console.log('Settings')}
                />
                <IconButtonWithTooltip
                  icon={<Edit className="w-5 h-5" />}
                  tooltip="Edit"
                  onClick={() => console.log('Edit')}
                  variant="ghost"
                />
                <IconButtonWithTooltip
                  icon={<Trash2 className="w-5 h-5" />}
                  tooltip="Delete"
                  onClick={() => console.log('Delete')}
                  variant="destructive"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Icon with Badge</h4>
              <div className="flex gap-6">
                <IconBadgeWithTooltip
                  icon={<Bell className="w-5 h-5" />}
                  tooltip="Notifications"
                  badgeContent={5}
                  badgeVariant="error"
                />
                <IconBadgeWithTooltip
                  icon={<Bell className="w-5 h-5" />}
                  tooltip="Updates"
                  badgeContent={2}
                  badgeVariant="warning"
                />
                <IconBadgeWithTooltip
                  icon={<CheckCircle className="w-5 h-5" />}
                  tooltip="Completed"
                  badgeContent="✓"
                  badgeVariant="success"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Icon Group</h4>
              <IconGroupWithTooltips
                icons={[
                  { icon: <Settings className="w-5 h-5" />, tooltip: 'Settings' },
                  { icon: <User className="w-5 h-5" />, tooltip: 'Profile' },
                  { icon: <Bell className="w-5 h-5" />, tooltip: 'Notifications' },
                  { icon: <LogOut className="w-5 h-5" />, tooltip: 'Logout' },
                ]}
                spacing="normal"
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Info Tooltip</h4>
              <div className="flex items-center gap-2">
                <label>Privacy Level</label>
                <InfoTooltip content="Controls how much data is shared with your digital twin" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Truncated Text</h4>
              <TruncatedTextWithTooltip
                text="This is a very long platform name that will be truncated to save space"
                maxLength={30}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Entry Animations */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Entry Animations</CardTitle>
            <CardDescription>Different animation types for content appearance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FadeIn>
                <div className="p-6 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Fade In</h4>
                  <p className="text-sm text-muted-foreground">Simple fade animation</p>
                </div>
              </FadeIn>

              <FadeInUp>
                <div className="p-6 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Fade In Up</h4>
                  <p className="text-sm text-muted-foreground">Fades and slides up</p>
                </div>
              </FadeInUp>

              <ScaleIn>
                <div className="p-6 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Scale In</h4>
                  <p className="text-sm text-muted-foreground">Scales from 0.9 to 1</p>
                </div>
              </ScaleIn>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Stagger Animation */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Stagger Animation</CardTitle>
            <CardDescription>List items animate in sequence</CardDescription>
          </CardHeader>
          <CardContent>
            <StaggerContainer className="space-y-3">
              {['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'].map((item, index) => (
                <StaggerItem key={index}>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="font-medium">{item}</p>
                    <p className="text-sm text-muted-foreground">Staggered animation</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Loading States */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Loading States</CardTitle>
            <CardDescription>Skeleton shimmer, spinners, and pulse effects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Skeleton Shimmer</h4>
              <div className="space-y-3">
                <div className="skeleton w-full h-20 rounded-lg" />
                <div className="skeleton w-3/4 h-12 rounded-lg" />
                <div className="skeleton w-1/2 h-8 rounded-lg" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Spinners</h4>
              <div className="flex items-center gap-6">
                <SpinLoader className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                <SpinLoader className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
                <SpinLoader className="w-12 h-12 border-4 border-destructive border-t-transparent rounded-full" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Pulse Effect</h4>
              <div className="flex items-center gap-6">
                <PulseLoader className="w-20 h-20 bg-primary/20 rounded-lg" />
                <PulseLoader className="w-16 h-16 bg-destructive/20 rounded-full" />
                <PulseLoader className="w-24 h-12 bg-secondary/20 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Feedback Animations */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Feedback Animations</CardTitle>
            <CardDescription>Success and error state animations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4">
              <Button onClick={triggerSuccess}>Trigger Success</Button>
              <Button variant="destructive" onClick={triggerError}>
                Trigger Error
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-muted rounded-lg flex flex-col items-center justify-center min-h-[200px]">
                <h4 className="font-medium mb-4">Success Animation</h4>
                {showSuccess && (
                  <SuccessCheckmark className="w-20 h-20 text-green-500">
                    <CheckCircle className="w-20 h-20" />
                  </SuccessCheckmark>
                )}
                {!showSuccess && (
                  <div className="text-muted-foreground text-sm">Click "Trigger Success"</div>
                )}
              </div>

              <div className="p-6 bg-muted rounded-lg flex flex-col items-center justify-center min-h-[200px]">
                <h4 className="font-medium mb-4">Error Animation</h4>
                <ErrorShake trigger={showError}>
                  <div className="flex flex-col items-center">
                    {showError && (
                      <AlertCircle className="w-20 h-20 text-destructive mb-2" />
                    )}
                    {showError && (
                      <p className="text-destructive text-sm">Something went wrong!</p>
                    )}
                    {!showError && (
                      <div className="text-muted-foreground text-sm">Click "Trigger Error"</div>
                    )}
                  </div>
                </ErrorShake>
              </div>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* CSS Class Examples */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>CSS Utility Classes</CardTitle>
            <CardDescription>Direct CSS classes for quick styling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Icon Effects</h4>
              <div className="flex gap-8">
                <div className="icon icon-bounce cursor-pointer">
                  <RefreshCw className="w-8 h-8" />
                  <p className="text-xs mt-2">Bounce</p>
                </div>
                <div className="icon icon-rotate cursor-pointer">
                  <Settings className="w-8 h-8" />
                  <p className="text-xs mt-2">Rotate</p>
                </div>
                <div className="icon icon-spin cursor-pointer">
                  <RefreshCw className="w-8 h-8" />
                  <p className="text-xs mt-2">Spin</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Badge Effects</h4>
              <div className="flex gap-4">
                <span className="badge bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm">
                  Hoverable Badge
                </span>
                <span className="badge badge-interactive bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm cursor-pointer">
                  Clickable Badge
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimation>

      {/* Integration Example */}
      <ScrollAnimation>
        <Card>
          <CardHeader>
            <CardTitle>Real-World Example</CardTitle>
            <CardDescription>Complete platform connection card with all effects</CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatedCard>
              <Card hover className="platform-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-xl">S</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">Spotify</CardTitle>
                        <CardDescription>Music streaming platform</CardDescription>
                      </div>
                    </div>
                    <IconGroupWithTooltips
                      icons={[
                        { icon: <Settings className="w-5 h-5" />, tooltip: 'Settings' },
                        { icon: <RefreshCw className="w-5 h-5" />, tooltip: 'Sync' },
                      ]}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full w-3/4 progress-bar" />
                    </div>
                    <span className="text-sm text-muted-foreground">75%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-green-500 text-white px-2 py-1 rounded-full text-xs">
                        Connected
                      </span>
                      <InfoTooltip content="Last synced 2 hours ago" />
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4" />
                      Extract Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>
          </CardContent>
        </Card>
      </ScrollAnimation>
    </div>
  );
}

export default AnimationShowcase;
