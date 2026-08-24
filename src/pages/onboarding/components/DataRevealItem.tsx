import React from 'react';
import {
  User, Building2, MapPin, FileText, Github, Twitter, GraduationCap, Briefcase, Award,
} from 'lucide-react';

interface DataRevealItemProps {
  icon: string;
  label: string;
  value: string;
}

const iconMap: Record<string, React.ReactNode> = {
  name: <User className="w-4 h-4" />,
  company: <Building2 className="w-4 h-4" />,
  title: <Briefcase className="w-4 h-4" />,
  location: <MapPin className="w-4 h-4" />,
  bio: <FileText className="w-4 h-4" />,
  github: <Github className="w-4 h-4" />,
  twitter: <Twitter className="w-4 h-4" />,
  education: <GraduationCap className="w-4 h-4" />,
  career: <Briefcase className="w-4 h-4" />,
  skills: <Award className="w-4 h-4" />,
  photo: <User className="w-4 h-4" />,
};

const DataRevealItem: React.FC<DataRevealItemProps> = ({ icon, label, value }) => {
  const iconElement = iconMap[icon] || <FileText className="w-4 h-4" />;

  return (
    <div
      className="flex items-center gap-3 py-2"
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
        }}
      >
        {iconElement}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className="text-xs uppercase tracking-wider block"
          style={{
            color: 'var(--text-muted)',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
        <span
          className="text-sm block"
          style={{
            color: 'var(--text-narrative)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
};

export default DataRevealItem;

// Staggered container variants kept for API compat (no-op without framer-motion)
export const dataRevealContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};
