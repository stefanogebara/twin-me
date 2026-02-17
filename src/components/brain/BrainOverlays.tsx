import React from 'react';
import { Maximize2, Minimize2, Info } from 'lucide-react';
import { useBrainThemeColors } from './BrainTheme';

export const FullscreenToggle: React.FC<{
  isFullscreen: boolean;
  onToggle: () => void;
}> = ({ isFullscreen, onToggle }) => {
  const { textColor, subtleBg } = useBrainThemeColors();

  return (
    <button
      onClick={onToggle}
      className="absolute top-4 right-4 z-10 p-2 rounded-lg transition-all hover:scale-110"
      style={{ backgroundColor: subtleBg, color: textColor }}
      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
    </button>
  );
};

export const GraphInstructions: React.FC = () => {
  const { textMuted, subtleBg } = useBrainThemeColors();

  return (
    <div
      className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
      style={{ backgroundColor: subtleBg, color: textMuted }}
    >
      <Info className="w-3 h-3" />
      <span>Drag to rotate &bull; Scroll to zoom &bull; Click nodes for details</span>
    </div>
  );
};
