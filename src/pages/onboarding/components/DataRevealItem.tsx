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
  name: <User />,
  company: <Building2 />,
  title: <Briefcase />,
  location: <MapPin />,
  bio: <FileText />,
  github: <Github />,
  twitter: <Twitter />,
  education: <GraduationCap />,
  career: <Briefcase />,
  skills: <Award />,
  photo: <User />,
};

/**
 * One found fact as a compact row of the page kit: render inside a List.
 * The value is the title; the label (sentence case) is its grey line.
 */
const DataRevealItem: React.FC<DataRevealItemProps> = ({ icon, label, value }) => {
  const iconElement = iconMap[icon] || <FileText />;

  return (
    <li className="rg-row">
      <span className="rg-row-icon" aria-hidden="true">{iconElement}</span>
      <span className="rg-row-text">
        <span className="rg-row-title">{value}</span>
        <span className="rg-row-line">{label}</span>
      </span>
      <span />
    </li>
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
