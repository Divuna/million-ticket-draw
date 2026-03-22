import React from 'react';
import { Navigate } from 'react-router-dom';

const TestLogin: React.FC = () => {
  return <Navigate to="/login" replace />;
};

export default TestLogin;
