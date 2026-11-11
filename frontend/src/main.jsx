import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App.jsx';
import './App.css';
import { BrowserRouter } from 'react-router-dom';

// Without this, a slow/stuck backend request (e.g. one waiting on a database
// lock) just hangs forever in the browser — no error, no toast, the events
// list (or whatever was loading) simply never appears. That silence is
// exactly what reads as "the site can't connect to the backend" even though
// the request did go out. A timeout turns that into a visible, catchable
// error instead of an indefinite hang.
axios.defaults.timeout = 20000;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);