import React from 'react';
import { Outlet } from 'react-router-dom';
import '../sundust.css';

export const LandingLayout: React.FC = () => (
  <div className="sundust" style={{ minHeight: '100vh' }}>
    <Outlet />
  </div>
);
