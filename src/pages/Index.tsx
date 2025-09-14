import React from 'react';
import { Header } from '@/components/Header';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">OneMil</h1>
          <p className="text-xl text-muted-foreground">Vítejte v aplikaci OneMil!</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
