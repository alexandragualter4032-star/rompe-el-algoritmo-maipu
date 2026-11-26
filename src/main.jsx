import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './react/App.jsx';
import './styles/main.css';
import './styles/themes.css';

createRoot(document.getElementById('app')).render(<App />);
