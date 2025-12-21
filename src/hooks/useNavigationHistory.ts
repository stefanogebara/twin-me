import { useNavigation } from '../contexts/NavigationContext';

/**
 * Custom hook for navigation history management
 *
 * Features:
 * - Access navigation history
 * - Smart back navigation
 * - History tracking
 */
export const useNavigationHistory = () => {
  const { history, canGoBack, goBack, goHome, clearHistory, addToHistory } = useNavigation();

  return {
    history,
    canGoBack,
    goBack,
    goHome,
    clearHistory,
    addToHistory,
    // Computed values
    previousPage: history.length > 1 ? history[history.length - 2] : null,
    currentPage: history.length > 0 ? history[history.length - 1] : null,
  };
};
