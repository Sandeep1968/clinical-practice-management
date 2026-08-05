import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import DemoBanner from './DemoBanner.jsx';
import './styles.css';
import './landing.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoBanner />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
