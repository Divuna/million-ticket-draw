// This page is deprecated - messages are now handled in the main Messages page
// Redirecting to main messages page
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const MessageDetail = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/messages');
  }, [navigate]);

  return null;
};

export default MessageDetail;
