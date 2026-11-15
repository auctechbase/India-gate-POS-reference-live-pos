import React, { Suspense } from 'react';
import {Provider} from 'react-redux';
import {store} from './store';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom'
// import './index.css';
import App from './App';
import Loader from "./components/layouts/Loader";
import { SearchProvider } from './contexts/SearchContext';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Suspense fallback={<Loader/>}>
    <Provider store={store}>
      <SearchProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </SearchProvider>
    </Provider>
  </Suspense>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
