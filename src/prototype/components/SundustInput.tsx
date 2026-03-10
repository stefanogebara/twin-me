import React from 'react';

interface SundustInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  disabled?: boolean;
  className?: string;
}

export const SundustInput: React.FC<SundustInputProps> = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled,
  className = '',
}) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="sd-label">{label}</label>}
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="sd-input"
      style={{ opacity: disabled ? 0.5 : 1 }}
    />
  </div>
);
