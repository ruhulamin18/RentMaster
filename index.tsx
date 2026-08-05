
import React from 'react';
import ReactDOM from 'react-dom/client';
<<<<<<< HEAD
import App from './src/App';
=======
import App from './App';
>>>>>>> b03e7cf89a0d6ed08f1fe68090da275672b77ec9

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
