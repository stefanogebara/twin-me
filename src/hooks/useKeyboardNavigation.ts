import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigationHistory } from './useNavigationHistory';

interface KeyboardNavigationOptions {
  enableEscape?: boolean;
  enableCtrlH?: boolean;
  enableAltLeft?: boolean;
  onEscape?: () => void;
  onCtrlH?: () => void;
  onAltLeft?: () => void;
  disabled?: boolean;
}

/**
 * Custom hook for keyboard navigation
 *
 * Keyboard shortcuts:
 * - ESC: Go back to previous page
 * - Ctrl+H: Go to home
 * - Alt+Left: Browser back
 *
 * Usage:
 * useKeyboardNavigation({
 *   enableEscape: true,
 *   onEscape: () => console.log('Escape pressed')
 * })
 */
export const useKeyboardNavigation = (options: KeyboardNavigationOptions = {}) => {
  const {
    enableEscape = true,
    enableCtrlH = true,
    enableAltLeft = true,
    onEscape,
    onCtrlH,
    onAltLeft,
    disabled = false
  } = options;

  const navigate = useNavigate();
  const { goBack, goHome } = useNavigationHistory();

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputField) return;

      // ESC - Go back
      if (enableEscape && event.key === 'Escape') {
        event.preventDefault();
        if (onEscape) {
          onEscape();
        } else {
          goBack();
        }
      }

      // Ctrl+H - Go home
      if (enableCtrlH && event.ctrlKey && event.key === 'h') {
        event.preventDefault();
        if (onCtrlH) {
          onCtrlH();
        } else {
          goHome();
        }
      }

      // Alt+Left - Browser back
      if (enableAltLeft && event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        if (onAltLeft) {
          onAltLeft();
        } else {
          navigate(-1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    disabled,
    enableEscape,
    enableCtrlH,
    enableAltLeft,
    onEscape,
    onCtrlH,
    onAltLeft,
    goBack,
    goHome,
    navigate
  ]);
};
